import { describe, expect, test } from 'claude-code/testing'

import { euros, kilo, lignesAnomalies, lirePlafond } from '../hooks/register'

describe('plafond', () => {
  test('lit un montant, la virgule, le dollar et off', async () => {
    expect(lirePlafond('15')).toBe(15)
    expect(lirePlafond(' 12,5 $')).toBe(12.5)
    expect(lirePlafond('off')).toBe(null)
    expect(lirePlafond('')).toBe(null)
    expect(lirePlafond('abc')).toBe(undefined)
    expect(lirePlafond('-3')).toBe(undefined)
  })
})

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
    expect(lignes[0].cles).toEqual(['agent a50d87a4c:agent seul muet'])
    expect(lignes[0].texte).toBe('agent a50d87a4c agent seul muet — plus rien depuis 54 min')
    expect(lignes[1].texte).toBe('wf-12 arrêté 1/3 rendus — 2 agent(s) sans résultat')
  })
})

describe('format', () => {
  test('dollars et milliers', async () => {
    expect(euros(1.234)).toBe('1,23 $')
    expect(kilo(612_400)).toBe('612 k')
  })
})
