import type { EngineInterface as Engine } from 'claude-code'

const ECRITURE = new Set(['Write', 'Edit'])

export const cheminEcrit = (e: { tool: string; file_path?: unknown; notebook_path?: unknown }) => {
  const chemin = e.tool === 'NotebookEdit' ? e.notebook_path : ECRITURE.has(e.tool) ? e.file_path : undefined
  return typeof chemin === 'string' && chemin.startsWith('/') ? chemin : null
}

export const estPlan = (chemin: string) => /\/evan\/PLAN[^/]*\.md$/.test(chemin)

// Une session = un plan (Evan, 29/10) : le dernier PLAN*.md écrit par la session, gardé par identifiant de session
// dans le magasin du mod (même règle que le mod ecran) ; un lien de plus de 30 jours est oublié.
const LIENS = 'liens'
const GARDE_MS = 30 * 24 * 3600 * 1000

type Liens = Record<string, { plan: string; t: number }>

async function lireLiens($: Engine): Promise<Liens> {
  const brut = await $.store.get(LIENS)
  return brut !== null && typeof brut === 'object' ? (brut as Liens) : {}
}

export async function planGarde($: Engine) {
  const lien = (await lireLiens($))[await $.session.id()]
  return typeof lien?.plan === 'string' ? lien.plan : null
}

export async function garderPlan($: Engine, plan: string) {
  const [sid, maintenant, liens] = await Promise.all([$.session.id(), $.clock.now(), lireLiens($)])
  const frais = Object.fromEntries(Object.entries(liens).filter(([, l]) => maintenant - l.t < GARDE_MS))
  await $.store.set(LIENS, { ...frais, [sid]: { plan, t: maintenant } })
}
