import { describe, expect, test } from 'claude-code/testing'

import { decider, separer } from '../hooks/register'
import type { Suivi } from '../hooks/register'

const MIN = 60000
const agent = (vu: number, autre: Partial<Suivi> = {}): Suivi => ({ consigne: 'c', description: 'd', type: 'general-purpose', vu, outils: 0, rappele: false, relance: false, ...autre })

describe('veille des agents', () => {
  test('rien avant le rappel, rappel puis relance', async () => {
    expect(decider(agent(0), 9 * MIN, 10, 20)).toBe('rien')
    expect(decider(agent(0), 10 * MIN, 10, 20)).toBe('rappeler')
    expect(decider(agent(0, { rappele: true }), 15 * MIN, 10, 20)).toBe('rien')
    expect(decider(agent(0, { rappele: true }), 20 * MIN, 10, 20)).toBe('relancer')
  })
  test('un agent lent mais vivant, un outil en cours, n’est jamais relancé', async () => {
    expect(decider(agent(0, { outils: 1 }), 120 * MIN, 10, 20)).toBe('rien')
  })
  test('une seule relance', async () => {
    expect(decider(agent(0, { rappele: true, relance: true }), 120 * MIN, 10, 20)).toBe('rien')
  })
})

describe('suite', () => {
  test('sépare la consigne du second agent', async () => {
    expect(separer('lis X\nSUITE>> résume')).toEqual({ premiere: 'lis X', suite: 'résume' })
    expect(separer('lis X')).toEqual({ premiere: 'lis X' })
    expect(separer('lis X\nSUITE>>   ')).toEqual({ premiere: 'lis X\nSUITE>>   ' })
  })
})
