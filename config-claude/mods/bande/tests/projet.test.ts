import { describe, expect, mock, test } from 'claude-code/testing'

const DEPOT = '/home/e/Documents/depot'
const fichiers = [
  { name: 'PLAN-ancien.md', mtimeMs: 1 },
  { name: 'PLAN-recent.md', mtimeMs: 9 },
]

describe('plan lié à la session', () => {
  test('aucun plan avant que la session en écrive un ; ensuite le sien, jamais le plus récent du dossier', async ($, on) => {
    const horloge = mock.clock(on)
    const lus: string[] = []
    const magasin = new Map<string, unknown>()
    on('session.id', () => ({ value: 'S1' }))
    on('session.root', () => ({ value: DEPOT }))
    on('session.cwd', () => ({ value: DEPOT }))
    on('store.get', (_, e) => ({ value: magasin.get(e.key as string) }))
    on('store.set', (_, e) => {
      magasin.set(e.key as string, JSON.parse(JSON.stringify(e.value)))
      return { value: undefined }
    })
    on('process.run', () => ({ value: { exitCode: 0, stdout: 'MemAvailable: 8000000 kB\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
    on('fs.exists', (_, e) => ({ value: (e.path as string).startsWith(DEPOT) }))
    on('fs.list', () => ({ value: fichiers.map(f => ({ ...f, kind: 'file', size: 1, isLink: false })) }))
    on('fs.read', (_, e) => {
      lus.push(e.path as string)
      return { value: '- [x] a\n- [ ] b' }
    })
    on('ui.log', () => ({ value: undefined }))
    on('tool.call', () => ({ result: {} }))

    await $.tool.call({ tool: 'Edit', file_path: `${DEPOT}/src/a.ts`, old_string: 'a', new_string: 'b' })
    await horloge.settle()
    expect(lus.filter(l => l.includes('PLAN'))).toEqual([])

    await $.tool.call({ tool: 'Write', file_path: `${DEPOT}/evan/PLAN-ancien.md`, content: '- [ ] a' })
    await horloge.settle()
    expect(lus.at(-1)).toBe(`${DEPOT}/evan/PLAN-ancien.md`)
    expect(lus).not.toContain(`${DEPOT}/evan/PLAN-recent.md`)
    expect((magasin.get('liens') as Record<string, { plan: string }>).S1!.plan).toBe(`${DEPOT}/evan/PLAN-ancien.md`)
  })
})
