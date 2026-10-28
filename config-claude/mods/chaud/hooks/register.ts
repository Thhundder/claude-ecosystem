import type { EngineInterface as Engine, Register } from 'claude-code'

import { decider, DELAI_MS, MESSAGE, SEUIL_JETONS } from './regle'

const ACTIFS = new Set(['pending', 'running', 'waiting'])
const etat = { dernierAppel: null as number | null, tour: false, raison: '', delaiMs: DELAI_MS, seuil: SEUIL_JETONS, envoi: false }

async function noter($: Engine, ligne: string) {
  const chemin = `${await $.env.get('HOME')}/.claude/cache/chaud/journal.log`
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

async function lireDelai($: Engine) {
  const essai = `${await $.session.cwd()}/.chaud-delai`
  const [secondes, seuil] = ((await $.fs.exists(essai)) ? (await $.fs.read(essai)).trim().split(/\s+/) : []).map(Number)
  etat.delaiMs = secondes !== undefined && Number.isFinite(secondes) && secondes > 0 ? secondes * 1000 : DELAI_MS
  etat.seuil = seuil !== undefined && Number.isFinite(seuil) && seuil >= 0 ? seuil : SEUIL_JETONS
  if (etat.delaiMs !== DELAI_MS || etat.seuil !== SEUIL_JETONS) await noter($, `réglage d'essai : délai ${etat.delaiMs / 1000} s, seuil ${etat.seuil} jetons`)
}

async function veiller($: Engine) {
  if (etat.envoi) return
  const [statut, agents, usage, maintenant] = await Promise.all([statutSession($), $.agent.list(), $.session.usage(), $.clock.now()])
  const d = decider({
    maintenant,
    dernierAppel: etat.dernierAppel,
    delaiMs: etat.delaiMs,
    seuil: etat.seuil,
    jetons: usage.context.tokens ?? 0,
    statut,
    agentsActifs: agents.filter(a => ACTIFS.has(a.status)).length,
    tour: etat.tour,
  })
  if (!d.envoyer) {
    if (d.raison !== etat.raison) await noter($, `attente : ${d.raison} (statut ${statut})`)
    etat.raison = d.raison
    return
  }
  etat.envoi = true
  etat.raison = ''
  await noter($, `message envoyé : ${d.raison}, contexte ${usage.context.tokens ?? '?'} jetons`)
  try {
    await $.prompt.submit({ text: MESSAGE })
  } catch (err) {
    await noter($, `envoi refusé : ${String(err).slice(0, 200)}`)
  } finally {
    etat.envoi = false
  }
}

const sansEchec = ($: Engine, travail: () => Promise<unknown>) => () =>
  void travail().catch(err => $.ui.log(`chaud: ${String(err).slice(0, 160)}`))

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    etat.dernierAppel = null
    etat.tour = false
    etat.raison = ''
    sansEchec($, () => lireDelai($))()
    $.clock.every(30_000, sansEchec($, () => veiller($)))
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    etat.tour = true
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const fin = await next(e)
    if (e.agentId !== undefined) return fin
    etat.tour = false
    etat.dernierAppel = await $.clock.now()
    const u = e.usage
    if (u) await noter($, `tour fini : relu en cache ${u.cache_read_input_tokens}, écrit ${u.cache_creation_input_tokens}`)
    return fin
  })
}
