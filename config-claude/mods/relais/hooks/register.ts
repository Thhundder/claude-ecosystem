import type { EngineInterface, Register } from 'claude-code'

const SUITE = /\nSUITE>>([\s\S]*)$/
const JOURNAL = `${'/home/thundder/.claude/cache/relais'}`
const CONSIGNE = [
  "Relais d'agents (mod relais) : quand le rapport d'un agent doit servir de consigne à un second agent,",
  "lance seulement le premier et termine sa consigne par une ligne « SUITE>> » suivie de la consigne du second.",
  "Le mod lance le second avec le rapport du premier ; tu ne reçois du premier qu'une ligne, puis le rapport du second.",
].join(' ')

export type Suivi = { consigne: string; description: string; type: string; vu: number; outils: number; rappele: boolean; relance: boolean; double?: boolean }
export type Action = 'rien' | 'rappeler' | 'relancer'

export function decider(agent: Suivi, maintenant: number, rappelMin: number, relanceMin: number): Action {
  if (agent.outils > 0 || agent.relance) return 'rien'
  const silence = (maintenant - agent.vu) / 60000
  if (silence >= relanceMin) return 'relancer'
  if (silence >= rappelMin && !agent.rappele) return 'rappeler'
  return 'rien'
}

export function separer(consigne: string): { premiere: string; suite?: string } {
  const suite = consigne.match(SUITE)?.[1]?.trim()
  return suite ? { premiere: consigne.replace(SUITE, ''), suite } : { premiere: consigne }
}

const suites = new Map<string, string>()
const suivis = new Map<string, Suivi>()
const lignes: string[] = []

async function noter($: EngineInterface, texte: string) {
  const session = (await $.session.id()).slice(0, 8)
  lignes.push(`${new Date(await $.clock.now()).toISOString()} ${texte}`)
  try { await $.fs.write(`${JOURNAL}/${session}.log`, lignes.slice(-500).join('\n') + '\n') } catch {}
}

async function signeDeVie($: EngineInterface, id: string | undefined, delta: number) {
  const suivi = id === undefined ? undefined : suivis.get(id)
  if (!suivi) return
  suivi.vu = await $.clock.now()
  suivi.outils = Math.max(0, suivi.outils + delta)
  if (suivi.relance && !suivi.double) {
    suivi.double = true
    await noter($, `${id} donne de nouveau signe de vie après avoir été signalé gelé`)
  }
}

async function veiller($: EngineInterface, rappelMin: number, relanceMin: number) {
  const maintenant = await $.clock.now()
  const vivants = new Set((await $.agent.list()).filter(a => a.status === 'running').map(a => a.id))
  for (const [id, suivi] of suivis) {
    if (!vivants.has(id)) { suivis.delete(id); continue }
    const action = decider(suivi, maintenant, rappelMin, relanceMin)
    if (action === 'rappeler') {
      suivi.rappele = true
      await $.session.send({ to: { agentId: id }, text: `Aucun signe de vie depuis ${rappelMin} min. Reprends ton travail, ou réponds en une ligne où tu en es.` })
      await noter($, `${id} rappelé après ${rappelMin} min de silence`)
      $.ui.toast(`relais : agent « ${suivi.description} » silencieux, rappelé`)
    }
    if (action === 'relancer') {
      suivi.relance = true
      await noter($, `${id} gelé depuis ${relanceMin} min : signalé à la session principale`)
      $.ui.toast(`relais : agent « ${suivi.description} » gelé depuis ${relanceMin} min`)
      void $.ui.notify(`Agent « ${suivi.description} » gelé depuis ${relanceMin} min.`)
      await $.prompt.submit({ text: `Le mod relais signale que l'agent « ${suivi.description} » (${id}) ne donne plus signe de vie depuis ${relanceMin} min, sans outil en cours, malgré un rappel. Arrête-le avec TaskStop, puis relance-le avec la même consigne si son travail sert encore. Un mod ne peut pas arrêter un agent lui-même.` })
    }
  }
}

export const register: Register = (on, options) => {
  const rappelMin = Number(options?.rappelMinutes ?? 10)
  const relanceMin = Number(options?.relanceMinutes ?? 20)

  on('session.start', async ($, e, next) => {
    $.clock.every(60000, () => veiller($, rappelMin, relanceMin))
    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const rendu = await next(e)
    return { sections: [...rendu.sections, { id: 'relais:consigne', text: CONSIGNE, scope: 'session' as const }] }
  }).catch(($, e, next) => next(e))

  on('agent.spawn', async ($, e, next) => {
    const { premiere, suite } = separer(e.prompt)
    const lance = await next(suite ? { ...e, prompt: premiere } : e)
    if (!lance.agentId || e.workflow) return lance
    suivis.set(lance.agentId, { consigne: premiere, description: e.description, type: e.subagentType, vu: await $.clock.now(), outils: 0, rappele: false, relance: false })
    if (suite) {
      suites.set(lance.agentId, suite)
      await noter($, `${lance.agentId} lancé, sa suite est gardée pour le second agent`)
    }
    return lance
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const id = e.agentId
    const suite = id === undefined ? undefined : suites.get(id)
    const rapport = (e as { message?: unknown }).message
    if ((e.tool as string) === 'SubagentHandback' && suite !== undefined && typeof rapport === 'string') {
      suites.delete(id!)
      const lance = await $.agent.spawn({ prompt: `${suite}\n\nRapport de l'agent précédent :\n\n${rapport}`, description: 'relais : suite', subagentType: 'general-purpose' })
      await noter($, `rapport de ${id} (${rapport.length} caractères) passé à ${lance.agentId}`)
      return next({ ...(e as object), message: `Rapport transmis directement à l'agent suivant (${lance.agentId}) par le mod relais, non recopié ici.` } as typeof e)
    }
    await signeDeVie($, id, 1)
    try { return await next(e) } finally { await signeDeVie($, id, -1) }
  }).catch(($, e, next) => next(e))

  on('turn.step', async function* ($, e, next) {
    await signeDeVie($, e.agentId, 0)
    const flux = next(e)
    let pas = await flux.next()
    while (!pas.done) {
      await signeDeVie($, e.agentId, 0)
      yield pas.value
      pas = await flux.next()
    }
    return pas.value
  })

  on('turn.complete', async ($, e, next) => {
    await signeDeVie($, e.agentId, 0)
    return next(e)
  })
}
