import { describe, expect, test } from 'claude-code/testing'

import { declencher, libre, refus, relance, retenir } from '../hooks/file'

describe('file d’attente', () => {
  test('retient les lancements, laisse passer le reste', async () => {
    expect(retenir('Agent', { description: 'audit', prompt: 'x' })).toEqual({ outil: 'Agent', quoi: 'audit' })
    expect(retenir('Bash', { command: 'npm run dev', run_in_background: true })?.quoi).toBe('npm run dev')
    expect(retenir('Bash', { command: 'ls' })).toBeNull()
    expect(retenir('Read', { file_path: '/x' })).toBeNull()
  })
  test('libre dès la fin du tour, agents et shells en cours compris', async () => {
    expect(libre('idle', false)).toBe(true)
    expect(libre('shell', false)).toBe(true)
    expect(libre('busy', false)).toBe(false)
    expect(libre('waiting', false)).toBe(false)
    expect(libre('idle', true)).toBe(false)
    expect(libre(null, false)).toBe(true)
  })
  test('messages', async () => {
    expect(refus({ outil: 'Agent', quoi: 'audit' })).toContain('mis en file')
    expect(relance([{ outil: 'Agent', quoi: 'audit' }, { outil: 'Bash', quoi: 'sleep 5' }])).toContain('2. Bash : sleep 5')
  })
})

describe('pas de résumé en boucle', () => {
  test('après un résumé, il faut 100 k de plus', async () => {
    expect(declencher(410_000, 400_000, null)).toBe(true)
    expect(declencher(41_000, 20_000, 40_000)).toBe(false)
    expect(declencher(141_000, 20_000, 40_000)).toBe(true)
  })
})
