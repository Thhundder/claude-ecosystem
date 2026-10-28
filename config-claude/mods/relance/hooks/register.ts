import type { EngineInterface as Engine, Register } from 'claude-code'

import { MODELE, REDACTION, RELECTURE, avecMotif, avecTranscription, condenser, dossierDeTravail, condenserRelecture, demande, fichierPrompt, relecture, sansTableau } from './lire'

const dossierProjet = (racine: string) => racine.replace(/[^A-Za-z0-9]/g, '-')

async function transcription($: Engine, home: string, session: string) {
  const projets = `${home}/.claude/projects`
  const directe = `${projets}/${dossierProjet(await $.session.root())}/${session}.jsonl`
  if (await $.fs.exists(directe)) return directe
  for (const d of await $.fs.list(projets)) {
    const p = `${projets}/${d.name}/${session}.jsonl`
    if (d.kind === 'dir' && (await $.fs.exists(p))) return p
  }
  return null
}

async function contexteDepot($: Engine, dossier: string) {
  const git = await $.process.run(['git', 'rev-parse', '--show-toplevel'], { cwd: dossier, timeoutMs: 5000 })
  const racine = git.exitCode === 0 ? git.stdout.trim() : dossier
  const pieces: { titre: string; texte: string }[] = []
  for (const nom of ['CAHIER-DES-CHARGES.txt', 'JOURNAL.md']) {
    const chemin = `${racine}/evan/${nom}`
    if (await $.fs.exists(chemin)) pieces.push({ titre: `evan/${nom}`, texte: (await $.fs.read(chemin)).slice(0, 40000) })
  }
  return { racine, pieces }
}

// Vide cette conversation (/clear) puis y dépose le prompt comme premier message, une fois la commande rendue.
async function viderEtDeposer($: Engine, texte: string) {
  try {
    await $.command.run({ command: 'clear' })
    await $.prompt.submit({ text: texte, asUser: true })
  } catch (err) {
    $.ui.log(`relance : vidage ou dépôt refusé : ${String(err).slice(0, 300)}`)
    $.ui.toast('relance : la session n\'a pas pu être vidée ou le prompt déposé, voir le journal du mod.', { timeoutMs: 10000 })
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({ name: 'relance', description: "Session partie de travers : Opus relit tout, écrit un prompt de reprise, vide la conversation et repart dessus", argumentHint: '<ce qui ne va pas>' })
    return started
  })

  on('command.run', { command: 'relance' }, async ($, e) => {
    const motif = e.args.trim()
    if (!motif) return { text: 'Usage : /relance <ce qui ne va pas>' }
    const home = (await $.env.get('HOME')) ?? ''
    const session = await $.session.id()
    const chemin = await transcription($, home, session)
    if (!chemin) return { text: `relance : transcription de ${session} introuvable sous ~/.claude/projects.` }
    const jsonl = await $.fs.read(chemin)
    const dossier = dossierDeTravail(jsonl) ?? (await $.session.cwd())
    const depot = await contexteDepot($, dossier)
    const lu = condenser(jsonl)
    $.ui.toast(`relance : Opus relit la session (${lu.evan.length} messages d'Evan)…`)
    const r = await $.model.complete({
      model: MODELE,
      system: REDACTION,
      prompt: demande({ motif, session, dossier, transcription: chemin, condense: lu.texte, contexte: depot.pieces, niveau: lu.niveau, tronque: lu.tronque }),
      maxTokens: 16000,
      effort: 'high',
      timeoutMs: 9 * 60_000,
    })
    if (!r.isAnswered) return { text: `relance : pas de prompt, le modèle n'a pas répondu (${r.reason}).` }
    const brouillon = sansTableau(r.text.trim())
    $.ui.toast('relance : Opus relit le prompt contre la transcription…')
    const relu = condenserRelecture(jsonl)
    const v = await $.model.complete({
      model: MODELE,
      system: RELECTURE,
      prompt: relecture({ motif, brouillon, condense: relu.texte, contexte: depot.pieces, session, niveau: relu.niveau, tronque: relu.tronque }),
      maxTokens: 16000,
      effort: 'high',
      timeoutMs: 9 * 60_000,
    })
    const prompt = avecMotif(v.isAnswered && v.text.trim() ? sansTableau(v.text.trim()) : brouillon, motif)
    const sortie = fichierPrompt(home, session)
    await $.process.run(['mkdir', '-p', sortie.slice(0, sortie.lastIndexOf('/'))], { timeoutMs: 5000 })
    await $.fs.write(sortie, `${prompt}\n`)
    $.clock.after(0, () => void viderEtDeposer($, avecTranscription(prompt, chemin)))
    const lus = (u: typeof r.usage) => u.cache_read_input_tokens + u.cache_creation_input_tokens + u.input_tokens
    const usages = v.isAnswered ? [r.usage, v.usage] : [r.usage]
    return {
      text:
        `Prompt de reprise écrit dans ${sortie.replace(home, '~')} (lecture : ${usages.reduce((s, u) => s + lus(u), 0)} jetons, produits : ${usages.reduce((s, u) => s + u.output_tokens, 0)}).\n` +
        (v.isAnswered ? '' : `Relecture non faite (${v.reason}) : c'est le premier jet, faits d'état non revérifiés.\n`) +
        `Vidage de cette conversation, puis dépôt du prompt comme premier message.`,
    }
  })
}
