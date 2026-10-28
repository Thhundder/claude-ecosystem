import { describe, expect, mock, test } from 'claude-code/testing'

import { choisirPlan } from '../hooks/projet'

const DEPOT = '/home/e/Documents/depot'
const fichiers = [
  { name: 'PLAN-ancien.md', mtimeMs: 1 },
  { name: 'PLAN-recent.md', mtimeMs: 9 },
]

describe('plan du dépôt où la session écrit', () => {
  test('plan écrit par la session, sinon le plus récent', async () => {
    expect(choisirPlan(fichiers, `${DEPOT}/evan`, `${DEPOT}/evan/PLAN-ancien.md`)?.name).toBe('PLAN-ancien.md')
    expect(choisirPlan(fichiers, `${DEPOT}/evan`, null)?.name).toBe('PLAN-recent.md')
  })

  test('une écriture dans un dépôt : le plan est lu dans ce dépôt', async ($, on) => {
    const horloge = mock.clock(on)
    const lus: string[] = []
    const listes: string[] = []
    on('session.root', () => ({ value: '/home/e' }))
    on('session.cwd', () => ({ value: '/home/e' }))
    on('process.run', (_, e) => {
      const argv = e.argv as string[]
      if (argv[0] === 'git') return { value: { exitCode: 0, stdout: `${DEPOT}\n`, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
      return { value: { exitCode: 0, stdout: 'MemAvailable: 8000000 kB\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    })
    on('fs.exists', (_, e) => ({ value: (e.path as string).startsWith(DEPOT) }))
    on('fs.list', (_, e) => {
      listes.push(e.path as string)
      return { value: fichiers.map(f => ({ ...f, kind: 'file', size: 1, isLink: false })) }
    })
    on('fs.read', (_, e) => {
      lus.push(e.path as string)
      return { value: '- [x] a\n- [ ] b' }
    })
    on('ui.log', () => ({ value: undefined }))
    on('tool.call', () => ({ result: {} }))

    await $.tool.call({ tool: 'Edit', file_path: `${DEPOT}/src/a.ts`, old_string: 'a', new_string: 'b' })
    await horloge.settle()
    expect(listes).toContain(`${DEPOT}/evan`)
    expect(lus).toContain(`${DEPOT}/evan/PLAN-recent.md`)

    await $.tool.call({ tool: 'Write', file_path: `${DEPOT}/evan/PLAN-ancien.md`, content: '- [ ] a' })
    await horloge.settle()
    expect(lus.at(-1)).toBe(`${DEPOT}/evan/PLAN-ancien.md`)
  })
})
