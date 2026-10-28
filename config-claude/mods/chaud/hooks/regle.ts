export const DELAI_MS = 55 * 60_000
export const SEUIL_JETONS = 100_000
export const MESSAGE = 'Point d’étape automatique du mod « au chaud » (il garde le cache de cette session pendant l’attente) : n’agis pas, réponds seulement « présent ».'

export type Situation = {
  maintenant: number
  dernierAppel: number | null
  delaiMs: number
  seuil: number
  jetons: number
  statut: string | null
  agentsActifs: number
  tour: boolean
}

export function decider(s: Situation): { envoyer: boolean; raison: string } {
  if (s.tour || s.statut === 'busy') return { envoyer: false, raison: 'un tour est en cours' }
  if (s.statut === 'waiting') return { envoyer: false, raison: 'une fenêtre attend Evan' }
  if (s.statut !== 'shell' && s.agentsActifs === 0) return { envoyer: false, raison: 'rien ne tourne' }
  if (s.jetons < s.seuil) return { envoyer: false, raison: `contexte ${Math.round(s.jetons / 1000)} k sous ${Math.round(s.seuil / 1000)} k` }
  if (s.dernierAppel === null) return { envoyer: false, raison: 'aucun appel encore' }
  const ecoule = s.maintenant - s.dernierAppel
  if (ecoule < s.delaiMs) return { envoyer: false, raison: 'cache encore chaud' }
  return { envoyer: true, raison: `${Math.round(ecoule / 60_000)} min depuis le dernier appel` }
}
