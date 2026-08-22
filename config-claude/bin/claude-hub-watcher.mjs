#!/usr/bin/env bun
// Watcher des sessions Claude Code -> hub.koios-ai.com.
//
// Deux sources, complémentaires :
//   1. ~/.claude/sessions/<pid>.json  : le champ `status` (busy|shell|idle|waiting) donne la
//      fin de tour. Il reste `busy` tant qu'un workflow tourne en fond, là où le `end_turn`
//      du transcript, lui, retomberait trop tôt.
//   2. le transcript de la session     : les blocs <task-notification> signalent la fin des
//      tâches lancées en arrière-plan (workflows, agents).
//
// Le watcher ne décide RIEN : il rapporte la photo, le serveur calcule les transitions.
import { readFileSync, readdirSync, writeFileSync, openSync, readSync, closeSync, fstatSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const HOME = homedir()
const SESSIONS_DIR = join(HOME, '.claude', 'sessions')
const PROJECTS_DIR = join(HOME, '.claude', 'projects')
const CONFIG_FILE = join(HOME, '.claude', '.hub-notify.json')
const STATE_FILE = join(HOME, '.claude', '.hub-watcher-state.json')

const POLL_MS = 2000
const HEARTBEAT_MS = 30000

const config = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'))
if (!config.url || !config.token) throw new Error(`${CONFIG_FILE} : "url" et "token" sont requis`)
const HOST = config.host || process.env.HOSTNAME || 'laptop'

let offsets = {} // sessionId -> octets déjà lus du transcript
try {
  offsets = JSON.parse(readFileSync(STATE_FILE, 'utf8')).offsets || {}
} catch (e) {
  if (e.code !== 'ENOENT') console.error('[watcher] état illisible, repart à vide:', e.message)
}
const saveState = () => writeFileSync(STATE_FILE, JSON.stringify({ offsets }))

const remainders = new Map() // sessionId -> ligne incomplète en attente

// Le PID seul ne suffit pas (réutilisation) : on compare l'heure de démarrage du process,
// que Claude Code enregistre dans le fichier de session.
function procAlive(pid, procStart) {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
    if (!procStart) return true
    const after = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
    return after[19] === String(procStart)
  } catch {
    return false
  }
}

function liveSessions() {
  let files = []
  try {
    files = readdirSync(SESSIONS_DIR).filter((f) => f.endsWith('.json'))
  } catch (e) {
    console.error('[watcher] dossier des sessions illisible:', e.message)
    return []
  }
  const out = []
  for (const f of files) {
    let s
    try {
      s = JSON.parse(readFileSync(join(SESSIONS_DIR, f), 'utf8'))
    } catch {
      continue // fichier en cours d'écriture : on réessaiera au prochain tour
    }
    if (!s.sessionId || !procAlive(s.pid, s.procStart)) continue
    out.push(s)
  }
  return out
}

const exists = (p) => {
  try {
    closeSync(openSync(p, 'r'))
    return true
  } catch {
    return false
  }
}

const pathCache = new Map() // sessionId -> chemin du transcript
const missCache = new Map() // sessionId -> instant du dernier échec (on retente périodiquement)
const MISS_RETRY_MS = 60000

function transcriptPath(sessionId, cwd) {
  if (pathCache.has(sessionId)) return pathCache.get(sessionId)
  if (Date.now() - (missCache.get(sessionId) || 0) < MISS_RETRY_MS) return null

  const slug = String(cwd || '').replace(/\//g, '-')
  const direct = join(PROJECTS_DIR, slug, `${sessionId}.jsonl`)
  let found = exists(direct) ? direct : null

  if (!found) {
    try {
      for (const d of readdirSync(PROJECTS_DIR)) {
        const p = join(PROJECTS_DIR, d, `${sessionId}.jsonl`)
        if (exists(p)) {
          found = p
          break
        }
      }
    } catch (e) {
      console.error('[watcher] projets illisibles:', e.message)
    }
  }

  if (found) {
    pathCache.set(sessionId, found)
    missCache.delete(sessionId)
  } else {
    missCache.set(sessionId, Date.now())
  }
  return found
}

// Lit les octets ajoutés depuis le dernier passage. Première vision d'une session :
// on se cale sur la fin du fichier pour ne pas rejouer tout l'historique.
function readNew(sessionId, path) {
  let fd
  try {
    fd = openSync(path, 'r')
  } catch {
    return ''
  }
  try {
    const size = fstatSync(fd).size
    let from = offsets[sessionId]
    if (from === undefined || from > size) from = size
    if (from === size) {
      offsets[sessionId] = size
      return ''
    }
    const buf = Buffer.allocUnsafe(size - from)
    const read = readSync(fd, buf, 0, buf.length, from)
    offsets[sessionId] = from + read
    return buf.subarray(0, read).toString('utf8')
  } finally {
    closeSync(fd)
  }
}

const pick = (block, tag) => {
  const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))
  return m ? m[1].trim() : ''
}

function tasksFrom(sessionId, cwd) {
  const path = transcriptPath(sessionId, cwd)
  if (!path) return []

  const chunk = (remainders.get(sessionId) || '') + readNew(sessionId, path)
  const lines = chunk.split('\n')
  remainders.set(sessionId, lines.pop() ?? '')

  const tasks = []
  for (const line of lines) {
    if (!line.includes('<task-notification>')) continue
    let entry
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }
    const content = entry?.message?.content
    if (typeof content !== 'string' || !content.startsWith('<task-notification>')) continue
    const id = pick(content, 'task-id')
    if (!id) continue
    tasks.push({ id, status: pick(content, 'status') || 'completed', summary: pick(content, 'summary') })
  }
  return tasks
}

async function report(sessions) {
  const res = await fetch(`${config.url}/claude/state`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + config.token },
    body: JSON.stringify({ host: HOST, sessions })
  })
  if (!res.ok) throw new Error('HTTP ' + res.status)
  return res.json()
}

let lastSignature = ''
let lastSentAt = 0

// Le process d'arrière-plan de l'extension VSCode s'enregistre comme une session mais n'écrit
// ni `status` ni transcript tant qu'on n'y a rien tapé : il ne peut donc rien notifier.
// Le jour où il sert vraiment, il gagne un transcript et réapparaît tout seul.
const reportable = (s) => Boolean(s.status) || transcriptPath(s.sessionId, s.cwd)

async function tick() {
  const sessions = liveSessions()
    .filter(reportable)
    .map((s) => ({
      id: s.sessionId,
      pid: s.pid,
      name: s.name || null,
      cwd: s.cwd || null,
      kind: s.kind || null,
      entrypoint: s.entrypoint || null,
      status: s.status || null,
      statusUpdatedAt: s.statusUpdatedAt || null,
      waitingFor: s.waitingFor || null,
      startedAt: s.startedAt || null,
      tasks: tasksFrom(s.sessionId, s.cwd)
    }))

  const signature = JSON.stringify(sessions.map((s) => [s.id, s.status, s.statusUpdatedAt]))
  const hasTasks = sessions.some((s) => s.tasks.length)
  const stale = Date.now() - lastSentAt > HEARTBEAT_MS

  if (signature === lastSignature && !hasTasks && !stale) return

  const r = await report(sessions)
  lastSignature = signature
  lastSentAt = Date.now()
  saveState()
  if (r.notified) console.log(`[watcher] ${r.notified} notification(s) envoyée(s)`)
}

console.log(`[watcher] démarré — ${config.url}, hôte « ${HOST} »`)
for (;;) {
  try {
    await tick()
  } catch (e) {
    console.error('[watcher] cycle en échec:', e.message)
  }
  await new Promise((r) => setTimeout(r, POLL_MS))
}
