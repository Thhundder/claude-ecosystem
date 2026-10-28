import { atom, read, update } from 'claude-code'
import type { EngineInterface as Engine, Register } from 'claude-code'

import { ENTETE, FICHIER, dossierProjet, entree, estConfig } from './bof'

const noteDonnee = atom({ plugin: 'bof', key: 'noteDonnee' } as const, false)
const ECRITURE = new Set(['Write', 'Edit', 'NotebookEdit'])

async function transcription($: Engine, home: string, session: string) {
  const projets = `${home}/.claude/projects`
  const directe = `${projets}/${dossierProjet(await $.session.root())}/${session}.jsonl`
  if (await $.fs.exists(directe)) return directe
  for (const d of await $.fs.list(projets)) {
    const p = `${projets}/${d.name}/${session}.jsonl`
    if (d.kind === 'dir' && (await $.fs.exists(p))) return p
  }
  return '(introuvable)'
}

async function nombreRetours($: Engine, chemin: string) {
  const run = await $.process.run(['grep', '-c', `^${ENTETE}`, chemin], { timeoutMs: 5000 })
  return run.exitCode === 0 ? Number(run.stdout.trim()) || 0 : 0
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({ name: 'bof', description: "Noter ce qui ne va pas : texte + 10 derniers échanges, à la fin de ~/.claude/retours/RETOURS.txt", argumentHint: '<ce qui ne va pas>' })
    return started
  })

  on('command.run', { command: 'bof' }, async ($, e) => {
    const home = (await $.env.get('HOME')) ?? ''
    const chemin = `${home}/${FICHIER}`
    const session = await $.session.id()
    const [messages, dossier, transcrit] = await Promise.all([$.session.messages(), $.session.cwd(), transcription($, home, session)])
    const texte = entree({ quand: new Date(), texte: e.args, session, transcription: transcrit, dossier, messages })
    const run = await $.process.run(['sh', '-c', 'mkdir -p "$(dirname "$1")" && cat >> "$1"', 'bof', chemin], { stdin: texte, timeoutMs: 10000 })
    if (run.exitCode !== 0) return { text: `bof : écriture refusée (${run.stderr.trim() || run.exitCode})` }
    return { text: `Noté à la fin de ~/${FICHIER}.` }
  })

  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    return noter($, e, result).catch(() => result)
  })
}

async function noter<R extends { context?: readonly string[]; deny?: string }>($: Engine, e: { tool: string; file_path?: unknown; notebook_path?: unknown }, result: R): Promise<R> {
  const chemin = e.tool === 'NotebookEdit' ? e.notebook_path : ECRITURE.has(e.tool) ? e.file_path : undefined
  if (typeof chemin !== 'string' || result.deny !== undefined) return result
  const home = (await $.env.get('HOME')) ?? ''
  if (!estConfig(chemin, home) || (await read($, noteDonnee))) return result
  await update($, noteDonnee, () => true)
  const n = await nombreRetours($, `${home}/${FICHIER}`)
  if (!n) return result
  return { ...result, context: [...(result.context ?? []), `${n} retours dans ~/${FICHIER} : lis-les avant de modifier la configuration.`] }
}
