import { describe, expect, test } from 'claude-code/testing'
import type { AgentInfo } from 'claude-code'

import { cumuler, duree, fusionner, resumeConso } from '../hooks/register'

const agent = (id: string, status: AgentInfo['status']) =>
  ({ id, status, type: 'Explore', description: `tâche ${id}` }) as AgentInfo

describe('agents-vue', () => {
  test('durées lisibles', async () => {
    expect(duree(4_000)).toBe('4 s')
    expect(duree(125_000)).toBe('2 min 05')
    expect(duree(3_725_000)).toBe('1 h 02')
  })
  test('garde le début, fige la fin', async () => {
    const t1 = fusionner([], [agent('a', 'running')], 1000)
    expect(t1[0]?.depuis).toBe(1000)
    expect(t1[0]?.fin).toBe(null)
    const t2 = fusionner(t1, [agent('a', 'completed')], 5000)
    expect(t2[0]?.depuis).toBe(1000)
    expect(t2[0]?.fin).toBe(5000)
    const t3 = fusionner(t2, [agent('a', 'completed')], 9000)
    expect(t3[0]?.fin).toBe(5000)
  })
})

describe('consommation', () => {
  test('cumule les étapes et les jetons', async () => {
    const u = { input_tokens: 100, cache_creation_input_tokens: 900, cache_read_input_tokens: 40_000, output_tokens: 500 }
    const une = cumuler(undefined, u, 2000)
    expect(une).toEqual({ etapes: 1, lus: 1000, relus: 40_000, ecrits: 500, ms: 2000 })
    const deux = cumuler(une, null, 1000)
    expect(deux.etapes).toBe(2)
    expect(deux.relus).toBe(40_000)
    expect(resumeConso(cumuler(deux, u, 1000))).toBe('3 étapes · 80 k relus · 2 k lus · 1 k écrits · 4 s au modèle')
  })
})
