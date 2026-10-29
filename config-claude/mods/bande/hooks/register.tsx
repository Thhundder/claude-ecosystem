import { atom, read, update } from 'claude-code'
import type { EngineInterface as Engine, ModelUsage, Register, SessionRateLimit } from 'claude-code'

import type { Mesure, Plan, Quota } from '../types'
import { disponibleGo, juger, SEUIL_GO } from './memoire'
import { cheminEcrit, estPlan, garderPlan, planGarde } from './projet'

const mesure = atom({ plugin: 'bande', key: 'mesure' } as const, null)
const agents = atom({ plugin: 'bande', key: 'agents' } as const, { actifs: 0, anomalies: [] })
const signalees = atom({ plugin: 'bande', key: 'signalees' } as const, [])
const tour = atom({ plugin: 'bande', key: 'tour' } as const, { lus: 0, relus: 0, ecrits: 0 })
const plan = atom({ plugin: 'bande', key: 'plan' } as const, null)
const memoire = atom({ plugin: 'bande', key: 'memoire' } as const, null)
const muet = atom({ plugin: 'bande', key: 'muet' } as const, null)
const cede = atom({ plugin: 'bande', key: 'cede' } as const, false)
const planEcrit = atom({ plugin: 'bande', key: 'planEcrit' } as const, null)

const VEILLE = '.claude/bin/veille-wf.py'
const ANOMALIE = /agent gelé|arrêté|agent seul muet/
const ACTIFS = new Set(['pending', 'running', 'waiting'])
const GO = 1024 ** 3
const NOMS_QUOTA: Record<string, string> = { five_hour: '5 h', seven_day: 'semaine' }

export const kilo = (tokens: number) =>
  tokens >= 1_000_000 ? `${(tokens / 1_000_000).toFixed(1).replace('.', ',')} M` : `${Math.round(tokens / 1000)} k`

export const lignesAnomalies = (sortie: string) =>
  sortie
    .split('\n')
    .filter(ligne => ANOMALIE.test(ligne))
    .map(ligne => {
      const [cles = ligne, texte = ligne] = ligne.includes('\t') ? ligne.split('\t', 2) : [ligne, ligne]
      return { cles: [cles.trim()], texte: texte.trim().replace(/\s{2,}/g, ' ') }
    })

export const quotas = (limites: readonly SessionRateLimit[]): Quota[] =>
  limites.filter(l => l.kind in NOMS_QUOTA).map(l => ({ kind: l.kind, pct: l.percentUsed }))

export const compterPlan = (nom: string, texte: string): Plan | null => {
  const faits = (texte.match(/^\s*[-*] \[[xX]\]/gm) ?? []).length
  const restants = (texte.match(/^\s*[-*] \[ \]/gm) ?? []).length
  return faits + restants === 0 ? null : { nom, faits, total: faits + restants }
}

export const barre = (faits: number, total: number, largeur = 10) => {
  const pleins = Math.round((faits / total) * largeur)
  return '▓'.repeat(pleins) + '░'.repeat(largeur - pleins)
}

export const disponible = (meminfo: string) => {
  const m = meminfo.match(/^MemAvailable:\s+(\d+) kB/m)
  return m ? (Number(m[1]) * 1024) / GO : null
}

const ajouterUsage = async ($: Engine, u: ModelUsage) => {
  await update($, tour, t => ({
    lus: t.lus + u.input_tokens + u.cache_creation_input_tokens,
    relus: t.relus + u.cache_read_input_tokens,
    ecrits: t.ecrits + u.output_tokens,
  }))
}

const mesurer = async ($: Engine) => {
  const usage = await $.session.usage()
  const valeur: Mesure = {
    tokens: usage.context.tokens ?? null,
    fenetre: usage.context.window,
    quotas: quotas(usage.rateLimits),
  }
  await update($, mesure, () => valeur)
  if (valeur.quotas.length > 0)
    await $.fs.write(`${await $.env.get('HOME')}/.claude/cache/quotas.json`, JSON.stringify({ quand: await $.clock.now(), quotas: valeur.quotas }))
}

async function planLie($: Engine) {
  const ici = await read($, planEcrit)
  if (ici !== null) return ici
  const garde = await planGarde($)
  if (garde !== null) await update($, planEcrit, () => garde)
  return garde
}

const lirePlan = async ($: Engine) => {
  const chemin = await planLie($)
  if (chemin === null || !(await $.fs.exists(chemin))) return update($, plan, () => null)
  const valeur = compterPlan(chemin.slice(chemin.lastIndexOf('/') + 1).replace(/^PLAN-?|\.md$/g, '') || 'plan', await $.fs.read(chemin))
  await update($, plan, () => valeur)
}

// Seul un plan écrit par la session la lie ; plus de dépôt suivi (29/10).
async function suivreEcriture($: Engine, chemin: string) {
  if (!estPlan(chemin)) return
  if (chemin !== (await read($, planEcrit))) {
    await update($, planEcrit, () => chemin)
    await garderPlan($, chemin)
  }
  await lirePlan($)
}

const lireMemoire = async ($: Engine) => {
  const run = await $.process.run(['cat', '/proc/meminfo'], { timeoutMs: 2000 })
  const go = disponible(run.stdout)
  const avant = await read($, memoire)
  if (go === null || avant === null || Math.abs(go - avant) >= 0.1) await update($, memoire, () => go)
}

const sessionsAgents = async ($: Engine) => {
  const [sid, home] = await Promise.all([$.session.id(), $.env.get('HOME')])
  const dossier = `${home}/.claude/cache/agents-sessions`
  if (!(await $.fs.exists(dossier))) return 0
  let n = 0
  for (const f of await $.fs.list(dossier)) {
    if (!f.name.endsWith('.json')) continue
    const x = JSON.parse(await $.fs.read(`${dossier}/${f.name}`)) as { etat?: string; principale?: string; pid?: number }
    if (x.etat === 'en cours' && x.principale === sid && x.pid !== undefined && (await $.fs.exists(`/proc/${x.pid}`))) n += 1
  }
  return n
}

const compter = async ($: Engine) => {
  const [liste, enSession] = await Promise.all([$.agent.list(), sessionsAgents($)])
  const actifs = liste.filter(a => ACTIFS.has(a.status)).length + enSession
  const avant = await read($, agents)
  if (avant.actifs !== actifs) await update($, agents, a => ({ ...a, actifs }))
}

const veiller = async ($: Engine) => {
  const [cwd, sid, home] = await Promise.all([$.session.cwd(), $.session.id(), $.env.get('HOME')])
  const projet = cwd.replace(/[/.]/g, '-')
  let anomalies: { cles: string[]; texte: string }[] = []
  try {
    const run = await $.process.run(
      ['python3', `${home}/${VEILLE}`, '--projet', projet, '--session', sid, '--cles'],
      { timeoutMs: 10000 },
    )
    anomalies = lignesAnomalies(run.stdout)
  } catch (erreur) {
    $.ui.log(`bande: veille impossible (${String(erreur).slice(0, 120)})`)
  }
  await update($, agents, a => ({ ...a, anomalies: anomalies.map(x => x.texte) }))
  await compter($)

  const deja = await read($, signalees)
  const neuves = anomalies.filter(a => a.cles.some(c => !deja.includes(c)))
  if (neuves.length === 0) return
  await update($, signalees, l => [...l, ...neuves.flatMap(a => a.cles)])
  $.ui.toast(`Veille : ${neuves.map(a => a.texte).join(' ; ')}`, { timeoutMs: 20000 })
}

const lireEcran = async ($: Engine) => {
  const chemin = `${await $.env.get('HOME')}/.claude/cache/ecran/config`
  const allume = (await $.fs.exists(chemin)) && /^[1-9]/.test((await $.fs.read(chemin)).trim())
  if (allume !== (await read($, cede))) await update($, cede, () => allume)
}

const sansEchec = ($: Engine, travail: () => Promise<unknown>) => () =>
  void travail().catch(err => $.ui.log(`bande: ${String(err).slice(0, 160)}`))

export const depuis = (s: number) => (s < 60 ? `${s} s` : `${Math.round(s / 60)} min`)

export const silences = <T extends { dernier: number }>(appels: T[], maintenant: number, seuilMs: number) =>
  appels.filter(a => maintenant - a.dernier >= seuilMs)

type Appel = { dernier: number; agent: string; signale: boolean }
const enCours = new Map<string, Appel>()
const reglage = { seuilMs: 300_000 }

const surveiller = async ($: Engine) => {
  const t = await $.clock.now()
  const muets = silences([...enCours.values()], t, reglage.seuilMs)
  const pire = [...muets].sort((a, b) => a.dernier - b.dernier)[0]
  const valeur = pire ? { agent: pire.agent, s: Math.round((t - pire.dernier) / 1000) } : null
  const avant = await read($, muet)
  if (JSON.stringify(avant) !== JSON.stringify(valeur)) await update($, muet, () => valeur)
  for (const a of muets) {
    if (a.signale) continue
    a.signale = true
    $.ui.toast(`Appel au modèle muet depuis ${depuis(Math.round((t - a.dernier) / 1000))} (${a.agent}) : bloqué ?`, { timeoutMs: 30000 })
  }
}

const libre = { go: null as number | null, quand: 0, seuil: SEUIL_GO }

async function memoireLibre($: Engine) {
  const maintenant = await $.clock.now()
  if (maintenant - libre.quand < 1000 && libre.go !== null) return libre.go
  const run = await $.process.run(['cat', '/proc/meminfo'], { timeoutMs: 2000 })
  libre.go = disponibleGo(run.stdout)
  libre.quand = maintenant
  const essai = `${await $.session.cwd()}/.garde-memoire-seuil-essai`
  const valeur = (await $.fs.exists(essai)) ? Number((await $.fs.read(essai)).trim()) : NaN
  libre.seuil = Number.isFinite(valeur) && valeur > 0 ? valeur : SEUIL_GO
  return libre.go
}

async function noterRefus($: Engine, ligne: string) {
  const chemin = `${await $.env.get('HOME')}/.claude/cache/memoire/mod-garde.log`
  const avant = (await $.fs.exists(chemin)) ? await $.fs.read(chemin) : ''
  const quand = new Date(await $.clock.now()).toISOString()
  await $.fs.write(chemin, [...avant.split('\n').filter(Boolean).slice(-199), `${quand} ${ligne}`].join('\n') + '\n')
}

export const register: Register = on => {
  on('tool.call', async ($, e, next) => {
    const dispo = await memoireLibre($)
    const refus = dispo === null ? null : juger(e.tool, e.tool === 'Bash' ? e.command : undefined, dispo, libre.seuil)
    if (dispo === null || refus === null) {
      const r = await next(e)
      const chemin = e.agentId === undefined && !('deny' in r) && r.isError !== true ? cheminEcrit(e) : null
      if (chemin !== null) sansEchec($, () => suivreEcriture($, chemin))()
      return r
    }
    sansEchec($, () => noterRefus($, `${e.agentId ?? 'principal'} ${e.tool} ${dispo.toFixed(2)} Go ${e.tool === 'Bash' ? e.command.slice(0, 120) : ''}`))()
    $.ui.toast(`Garde mémoire : ${e.tool} refusé, ${dispo.toFixed(1).replace('.', ',')} Go libres`)
    return { deny: refus }
  }).catch(($, e, next) => next(e))

  on('session.start', async ($, e, next) => {
    reglage.seuilMs = Number((await $.env.get('BANDE_SILENCE_S')) ?? 300) * 1000
    $.clock.every(5_000, sansEchec($, () => surveiller($)))
    $.clock.every(60_000, sansEchec($, () => veiller($)))
    $.clock.every(30_000, sansEchec($, () => lirePlan($)))
    $.clock.every(5_000, sansEchec($, () => compter($)))
    $.clock.every(5_000, sansEchec($, () => lireMemoire($)))
    sansEchec($, () => lireEcran($))()
    $.clock.every(1_000, sansEchec($, () => lireEcran($)))
    sansEchec($, () => veiller($))()
    sansEchec($, () => mesurer($))()
    sansEchec($, () => lirePlan($))()
    sansEchec($, () => lireMemoire($))()
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind === 'composer' || e.origin.kind === 'bridge') {
      await update($, tour, () => ({ lus: 0, relus: 0, ecrits: 0 }))
    }
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const cle = `${e.turnId}:${e.index}:${e.agentId ?? ''}`
    const appel = { dernier: await $.clock.now(), agent: e.agentId ? `agent ${e.agentId.slice(0, 9)}` : 'session principale', signale: false }
    enCours.set(cle, appel)
    try {
      const flux = next(e)
      let pas = await flux.next()
      while (!pas.done) {
        appel.dernier = await $.clock.now()
        appel.signale = false
        yield pas.value
        pas = await flux.next()
      }
      if (pas.value.usage) await ajouterUsage($, pas.value.usage)
      return pas.value
    } finally {
      enCours.delete(cle)
    }
  })

  on('session.measure', async ($, e, next) => {
    await update($, mesure, () => ({
      tokens: e.context.tokens ?? null,
      fenetre: e.context.window,
      quotas: quotas(e.rateLimits),
    }))
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    sansEchec($, () => veiller($))()
    sansEchec($, () => lirePlan($))()
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, cede))) return next(e)
    const [m, a, t, p, go, silence] = await Promise.all([
      read($, mesure), read($, agents), read($, tour), read($, plan), read($, memoire), read($, muet),
    ])
    if (m === null) return next(e)
    const { Box, Text } = $.ui.resolve(e)

    const pct = m.tokens === null ? null : Math.round((m.tokens / m.fenetre) * 100)
    const contexte = m.tokens === null ? 'contexte —' : `contexte ${kilo(m.tokens)} (${pct} %)`
    const lourd = m.tokens !== null && m.tokens >= 600_000
    const gel = a.anomalies.length
    const basse = go !== null && go < 3

    return (
      <Box>
        <Text color={lourd ? 'warning' : undefined} dimColor={!lourd}>{contexte}</Text>
        {m.quotas.map(q => (
          <Text key={q.kind} color={q.pct >= 80 ? 'warning' : undefined} dimColor={q.pct < 80}>
            {' · '}quota {NOMS_QUOTA[q.kind]} {Math.round(q.pct)} %
          </Text>
        ))}
        {t.relus + t.lus > 0 && (
          <Text dimColor> · tour {kilo(t.relus)} relus, {kilo(t.lus)} lus, {kilo(t.ecrits)} écrits</Text>
        )}
        {p !== null && <Text dimColor> · plan {p.faits}/{p.total} {barre(p.faits, p.total)}</Text>}
        {gel > 0 && <Text color="error"> · {gel} en panne</Text>}
        {silence !== null && <Text color="error"> · appel muet depuis {depuis(silence.s)} ({silence.agent})</Text>}
        {go !== null && (
          <Text color={basse ? 'error' : undefined} dimColor={!basse}> · mémoire {go.toFixed(1).replace('.', ',')} Go</Text>
        )}
      </Box>
    )
  })
}
