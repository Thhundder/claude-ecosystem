import { describe, expect, test } from 'claude-code/testing'
import type { AgentInfo } from 'claude-code'

import { duree, fusionner } from '../hooks/register'

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
    expect(t1[0].depuis).toBe(1000)
    expect(t1[0].fin).toBe(null)
    const t2 = fusionner(t1, [agent('a', 'completed')], 5000)
    expect(t2[0].depuis).toBe(1000)
    expect(t2[0].fin).toBe(5000)
    const t3 = fusionner(t2, [agent('a', 'completed')], 9000)
    expect(t3[0].fin).toBe(5000)
  })
})
