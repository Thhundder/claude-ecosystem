import { describe, expect, test } from 'claude-code/testing'

import { decider, DELAI_MS, SEUIL_JETONS } from '../hooks/regle'

const base = { maintenant: 10 * 3_600_000, dernierAppel: 10 * 3_600_000 - DELAI_MS - 1, delaiMs: DELAI_MS, seuil: SEUIL_JETONS, jetons: 400_000, statut: 'idle', agentsActifs: 1, tour: false }

describe('au chaud', () => {
  test('envoie quand un agent tourne, contexte gros, 55 min passées', async () => {
    expect(decider(base).envoyer).toBe(true)
    expect(decider({ ...base, agentsActifs: 0, statut: 'shell' }).envoyer).toBe(true)
  })
  test('n’envoie pas sans attente, pendant un tour, sur petit contexte, ni trop tôt', async () => {
    expect(decider({ ...base, agentsActifs: 0 }).raison).toBe('rien ne tourne')
    expect(decider({ ...base, tour: true }).envoyer).toBe(false)
    expect(decider({ ...base, statut: 'busy' }).envoyer).toBe(false)
    expect(decider({ ...base, statut: 'waiting' }).envoyer).toBe(false)
    expect(decider({ ...base, jetons: 50_000 }).envoyer).toBe(false)
    expect(decider({ ...base, dernierAppel: base.maintenant - 60_000 }).raison).toBe('cache encore chaud')
    expect(decider({ ...base, dernierAppel: null }).envoyer).toBe(false)
  })
})
