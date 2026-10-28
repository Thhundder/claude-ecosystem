import type { EngineInterface as Engine, Register } from 'claude-code'

import { CONSIGNE, declencher, libre, refus, relance, retenir, SEUIL } from './file'
import type { Retenu } from './file'

const ACTIFS = new Set(['pending', 'running', 'waiting'])
const etat = { attente: false, tour: false, resume: false, seuil: SEUIL, apres: null as number | null, mesurer: false, file: [] as Retenu[] }

async function noter($: Engine, ligne: string) {
  const chemin = `${await $.env.get('HOME')}/.claude/cache/resume-auto/journal.log`
  const avant = (await $.fs.exists(chemin)) ? await $.fs.read(chemin) : ''
  const quand = new Date(await $.clock.now()).toISOString()
  await $.fs.write(chemin, [...avant.split('\n').filter(Boolean).slice(-499), `${quand} ${(await $.session.id()).slice(0, 8)} ${ligne}`].join('\n') + '\n')
}

async function statutSession($: Engine) {
  const id = await $.session.id()
  const dossier = `${await $.env.get('HOME')}/.claude/sessions`
  for (const f of await $.fs.list(dossier)) {
    if (!f.name.endsWith('.json')) continue
    const texte = await $.fs.read(`${dossier}/${f.name}`)
    if (!texte.includes(id)) continue
    const fiche = JSON.parse(texte) as { sessionId?: string; status?: string }
    if (fiche.sessionId === id) return fiche.status ?? null
  }
  return null
}

async function lireSeuil($: Engine) {
  const essai = `${await $.session.cwd()}/.resume-auto-seuil`
  const valeur = (await $.fs.exists(essai)) ? Number((await $.fs.read(essai)).trim()) : NaN
  etat.seuil = Number.isFinite(valeur) && valeur > 0 ? valeur : SEUIL
}

async function essayer($: Engine) {
  if (!etat.attente || etat.resume) return
  const [statut, agents] = await Promise.all([statutSession($), $.agent.list()])
  const actifs = agents.filter(a => ACTIFS.has(a.status)).length
  if (!libre(statut, etat.tour)) return
  etat.resume = true
  await noter($, `résumé lancé (statut ${statut}, agents ${actifs}, file ${etat.file.length})`)
  try {
    const r = await $.session.compact({ instructions: CONSIGNE })
    await noter($, 'skip' in r && r.skip ? `résumé sauté : ${r.skip}` : 'résumé fait')
  } catch (err) {
    await noter($, `résumé refusé : ${String(err).slice(0, 200)}`)
    etat.resume = false
    return
  }
  etat.attente = false
  etat.resume = false
  etat.mesurer = true
  const file = etat.file.splice(0)
  if (file.length > 0) {
    await noter($, `relance de ${file.length} lancement(s)`)
    void $.prompt.submit({ text: relance(file) })
  }
}

const sansEchec = ($: Engine, travail: () => Promise<unknown>) => () =>
  void travail().catch(err => $.ui.log(`resume-auto: ${String(err).slice(0, 160)}`))

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    etat.attente = false
    etat.resume = false
    etat.tour = false
    etat.file = []
    etat.apres = null
    etat.mesurer = false
    sansEchec($, () => lireSeuil($))()
    $.clock.every(10_000, sansEchec($, () => essayer($)))
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const fin = await next(e)
    if (e.agentId !== undefined) return fin
    etat.tour = false
    const tokens = (await $.session.usage()).context.tokens ?? 0
    if (etat.mesurer) {
      etat.mesurer = false
      etat.apres = tokens
      sansEchec($, () => noter($, `contexte après résumé : ${tokens} jetons`))()
      return fin
    }
    if (!etat.attente && declencher(tokens, etat.seuil, etat.apres)) {
      etat.attente = true
      $.ui.toast(`Résumé automatique dès que tout est fini (contexte ${Math.round(tokens / 1000)} k)`)
      sansEchec($, () => noter($, `seuil atteint : ${tokens} jetons, attente`))()
    }
    sansEchec($, () => essayer($))()
    return fin
  })

  on('tool.call', async ($, e, next) => {
    if (!etat.attente) return next(e)
    const r = retenir(e.tool, e as unknown as Record<string, unknown>)
    if (r === null) return next(e)
    etat.file.push(r)
    sansEchec($, () => noter($, `mis en file : ${r.outil} ${r.quoi.slice(0, 80)}`))()
    return { deny: refus(r) }
  }).catch(($, e, next) => next(e))
}
