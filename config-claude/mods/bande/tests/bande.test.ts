import { describe, expect, test } from 'claude-code/testing'

import { barre, compterPlan, disponible, kilo, lignesAnomalies, quotas, silences } from '../hooks/register'

describe('veille', () => {
  test('ne garde que les anomalies, avec leurs clés', async () => {
    const sortie = [
      'agent a50d87a4c:agent seul muet\tagent a50d87a4c      agent seul muet — plus rien depuis 54 min',
      'wf-12:arrêté\twf-12   arrêté      1/3 rendus  — 2 agent(s) sans résultat',
      'aucun workflow dans la fenêtre',
      'wf-13:en cours\twf-13   en cours    1/3 rendus',
    ].join('\n')
    const lignes = lignesAnomalies(sortie)
    expect(lignes.length).toBe(2)
    expect(lignes[0]?.cles).toEqual(['agent a50d87a4c:agent seul muet'])
    expect(lignes[0]?.texte).toBe('agent a50d87a4c agent seul muet — plus rien depuis 54 min')
    expect(lignes[1]?.texte).toBe('wf-12 arrêté 1/3 rendus — 2 agent(s) sans résultat')
  })
})

describe('jetons et quotas', () => {
  test('milliers et millions', async () => {
    expect(kilo(612_400)).toBe('612 k')
    expect(kilo(2_350_000)).toBe('2,4 M')
  })
  test('quotas d’abonnement seulement', async () => {
    expect(
      quotas([
        { kind: 'five_hour', percentUsed: 34.5 },
        { kind: 'seven_day', percentUsed: 61 },
        { kind: 'spend_limit', percentUsed: 10 },
      ]),
    ).toEqual([
      { kind: 'five_hour', pct: 34.5 },
      { kind: 'seven_day', pct: 61 },
    ])
  })
})

describe('plan', () => {
  test('compte les cases faites et à faire', async () => {
    const texte = '# PLAN\n- [x] 1. a\n- [X] 2. b\n  - [ ] 3. c\n- [ ] 4. d\ntexte [x] au milieu'
    expect(compterPlan('copilote', texte)).toEqual({ nom: 'copilote', faits: 2, total: 4 })
    expect(compterPlan('vide', '# rien\n1. étape')).toBe(null)
    expect(barre(3, 10)).toBe('▓▓▓░░░░░░░')
  })
})

describe('mémoire', () => {
  test('lit la mémoire disponible', async () => {
    expect(disponible('MemTotal: 16050100 kB\nMemAvailable:   10485760 kB\n')).toBe(10)
    expect(disponible('rien')).toBe(null)
  })
})

describe('appel muet', () => {
  test('ne retient que les appels silencieux au-delà du seuil', async () => {
    const appels = [{ dernier: 0 }, { dernier: 250_000 }, { dernier: 299_000 }]
    expect(silences(appels, 300_000, 60_000).length).toBe(1)
    expect(silences(appels, 400_000, 60_000).length).toBe(3)
    expect(silences([], 400_000, 60_000).length).toBe(0)
  })
})
