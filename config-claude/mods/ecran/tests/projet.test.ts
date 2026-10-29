import { describe, expect, mock, test } from 'claude-code/testing'

import { chantierNomme, cheminEcrit, cheminsShell, commandeShell, estPlan } from '../hooks/projet'

const DEPOT = '/home/e/Documents/depot'
const fichiers = [
  { name: 'PLAN-ancien.md', mtimeMs: 1 },
  { name: 'PLAN-recent.md', mtimeMs: 9 },
  { name: 'JOURNAL.md', mtimeMs: 20 },
]

describe('projet suivi', () => {
  test('chemin écrit : Write, Edit, NotebookEdit seulement', async () => {
    expect(cheminEcrit({ tool: 'Write', file_path: '/a/b.md' })).toBe('/a/b.md')
    expect(cheminEcrit({ tool: 'Edit', file_path: '/a/b.md' })).toBe('/a/b.md')
    expect(cheminEcrit({ tool: 'NotebookEdit', notebook_path: '/a/n.ipynb' })).toBe('/a/n.ipynb')
    expect(cheminEcrit({ tool: 'Read', file_path: '/a/b.md' })).toBeNull()
    expect(cheminEcrit({ tool: 'Write', file_path: 'relatif.md' })).toBeNull()
    expect(estPlan(`${DEPOT}/evan/PLAN-x.md`)).toBe(true)
    expect(estPlan(`${DEPOT}/evan/notes/PLAN-x.md`)).toBe(false)
  })
  test('commande shell : fichiers evan/ nommés, relatifs au cd, heredoc compris', async () => {
    const X = '/home/e/Documents/Xeko'
    expect(commandeShell({ tool: 'Bash', command: 'ls' })).toBe('ls')
    expect(commandeShell({ tool: 'Bash', command: 'ls', run_in_background: true })).toBeNull()
    expect(commandeShell({ tool: 'Write', command: 'ls' })).toBeNull()
    // ligne 1740 de la transcription ; un mot du texte ajouté (a.b) est candidat aussi : sa date le départage
    expect(cheminsShell(`cd ${X}/xeko-app/evan && cat >> CAHIER-DES-CHARGES.txt <<'EOF'\nCHANTIER 2 > a.b\nEOF`, `${X}/xeko.ai`, '/home/e'))
      .toEqual([`${X}/xeko-app/evan/CAHIER-DES-CHARGES.txt`, `${X}/xeko-app/evan/a.b`])
    // ligne 1769 : script python en heredoc, nom du fichier dans une chaîne
    expect(cheminsShell(`cd ${X}/xeko-app/evan && python3 - <<'EOF'\np='CAHIER-DES-CHARGES.txt'; s=open(p).read()\nopen(p,'w').write(s)\nEOF`, `${X}/xeko.ai`, '/home/e')).toEqual([`${X}/xeko-app/evan/CAHIER-DES-CHARGES.txt`])
    // relatif au cwd, ~, $HOME, sed -i, tee, > ; hors evan/ et options ignorés ; ordre = dernier nommé en dernier
    expect(cheminsShell(`sed -i 's/a/b/' evan/PLAN-x.md; echo x > ~/d/evan/JOURNAL.md 2>&1 | tee -a "$HOME/e/evan/n.txt" /dev/null`, `${X}/xeko.ai`, '/home/e'))
      .toEqual([`${X}/xeko.ai/evan/PLAN-x.md`, '/home/e/d/evan/JOURNAL.md', '/home/e/e/evan/n.txt'])
    expect(cheminsShell('cd ../xeko-app && cp /tmp/a.txt ./evan/../evan/b.txt && cd - && ls', `${X}/xeko.ai`, '/home/e')).toEqual([`${X}/xeko-app/evan/b.txt`])
    expect(cheminsShell('git status && npm test', `${X}/xeko.ai/evan`, '/home/e')).toEqual([])
    expect(cheminsShell('cat <<< "evan/a.md"', `${X}/xeko.ai`, '/home/e')).toEqual([`${X}/xeko.ai/evan/a.md`])
  })

  test('chantier nommé par le plan : ligne « Chantier : », sinon le titre', async () => {
    expect(chantierNomme('# PLAN — x\n\nChantier : 13 (cahier du 29/10)\n- [ ] a')).toBe('13 (cahier du 29/10)')
    expect(chantierNomme('# Plan\n**Chantier** : Widget\n')).toBe('Widget')
    expect(chantierNomme('# Plan — Chantier 2 : découverte\n- [ ] a')).toBe('2')
    expect(chantierNomme('# Plan\n- [ ] a')).toBeNull()
  })

  test('deux sessions, deux plans gardés ; un lien de plus de 30 jours oublié', async ($, on) => {
    const horloge = mock.clock(on, { now: 1_000_000 })
    const magasin = new Map<string, unknown>()
    let sid = 'A'
    on('session.id', () => ({ value: sid }))
    on('store.get', (_, e) => ({ value: magasin.get(e.key as string) }))
    on('store.set', (_, e) => {
      magasin.set(e.key as string, JSON.parse(JSON.stringify(e.value)))
      return { value: undefined }
    })
    on('fs.exists', () => ({ value: false }))
    on('fs.list', () => ({ value: [] }))
    on('fs.read', () => ({ value: '' }))
    on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
    on('ui.log', () => ({ value: undefined }))
    on('tool.call', () => ({ result: {} }))
    const liens = () => Object.fromEntries(Object.entries(magasin.get('liens') as Record<string, { plan: string }>).map(([k, v]) => [k, v.plan]))

    await $.tool.call({ tool: 'Write', file_path: `${DEPOT}/evan/PLAN-a.md`, content: '- [ ] a' })
    await horloge.settle()
    sid = 'B'
    await $.tool.call({ tool: 'Write', file_path: '/autre/evan/PLAN-b.md', content: '- [ ] b' })
    await horloge.settle()
    expect(liens()).toEqual({ A: `${DEPOT}/evan/PLAN-a.md`, B: '/autre/evan/PLAN-b.md' })

    await horloge.advance(31 * 24 * 3600 * 1000)
    sid = 'C'
    await $.tool.call({ tool: 'Write', file_path: '/c/evan/PLAN.md', content: '- [ ] c' })
    await horloge.settle()
    expect(liens()).toEqual({ C: '/c/evan/PLAN.md' })
  })

  test('une écriture ailleurs ne déplace plus la session ; seul un plan écrit la lie, jamais le plus récent du dossier', async ($, on) => {
    const horloge = mock.clock(on)
    const cd: string[] = []
    const lus: string[] = []
    const magasin = new Map<string, unknown>()
    on('session.id', () => ({ value: 'S1' }))
    on('session.root', () => ({ value: '/home/e' }))
    on('store.get', (_, e) => ({ value: magasin.get(e.key as string) }))
    on('store.set', (_, e) => {
      magasin.set(e.key as string, JSON.parse(JSON.stringify(e.value)))
      return { value: undefined }
    })
    on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
    on('command.run', (_, e) => {
      cd.push(`${e.command} ${e.args}`)
      return { text: '' }
    })
    on('fs.exists', () => ({ value: true }))
    on('fs.list', () => ({ value: fichiers.map(f => ({ ...f, kind: 'file', size: 1, isLink: false })) }))
    on('fs.read', (_, e) => {
      lus.push(e.path as string)
      return { value: '- [x] a\n- [ ] b' }
    })
    on('ui.log', () => ({ value: undefined }))
    on('ui.toast', () => ({ value: undefined }))
    on('tool.call', () => ({ result: {} }))

    await $.tool.call({ tool: 'Write', file_path: `${DEPOT}/evan/JOURNAL.md`, content: 'x' })
    await horloge.settle()
    expect(lus.filter(l => l.includes('PLAN'))).toEqual([])

    await $.tool.call({ tool: 'Write', file_path: `${DEPOT}/evan/PLAN-ancien.md`, content: '- [ ] a' })
    await horloge.settle()
    expect(lus).toContain(`${DEPOT}/evan/PLAN-ancien.md`)
    expect(lus).not.toContain(`${DEPOT}/evan/PLAN-recent.md`)
    expect((magasin.get('liens') as Record<string, { plan: string }>).S1!.plan).toBe(`${DEPOT}/evan/PLAN-ancien.md`)

    await $.tool.call({ tool: 'Edit', file_path: '/ailleurs/src/a.ts', old_string: 'a', new_string: 'b' })
    await horloge.settle()
    expect(cd).toEqual([])
  })

  test('un agent qui écrit ailleurs ne déplace pas la session', async ($, on) => {
    const horloge = mock.clock(on)
    const cd: string[] = []
    on('session.root', () => ({ value: '/home/e' }))
    on('process.run', () => ({ value: { exitCode: 0, stdout: `${DEPOT}\n`, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
    on('command.run', (_, e) => {
      cd.push(e.args)
      return { text: '' }
    })
    on('tool.call', () => ({ result: {} }))
    await $.tool.call({ tool: 'Write', file_path: `${DEPOT}/a.md`, content: 'x', agentId: 'a1' })
    await $.tool.call({ tool: 'Bash', command: `echo x > ${DEPOT}/evan/a.md`, agentId: 'a1' })
    await horloge.settle()
    expect(cd).toEqual([])
  })

  test('une écriture par commande shell : le plan écrit lie la session, aucun /cd (cas réel du 27/10, session 5013256e)', async ($, on) => {
    const horloge = mock.clock(on, { now: 1_000_000 })
    const XA = '/home/e/Documents/Xeko/xeko.ai'
    const XP = '/home/e/Documents/Xeko/xeko-app'
    const cd: string[] = []
    const ecrits = new Map<string, number>()
    const magasin = new Map<string, unknown>()
    const lie = () => (magasin.get('liens') as Record<string, { plan: string }> | undefined)?.S1?.plan ?? null
    on('session.id', () => ({ value: 'S1' }))
    on('session.root', () => ({ value: XA }))
    on('session.cwd', () => ({ value: XA }))
    on('env.get', () => ({ value: '/home/e' }))
    on('store.get', (_, e) => ({ value: magasin.get(e.key as string) }))
    on('store.set', (_, e) => {
      magasin.set(e.key as string, JSON.parse(JSON.stringify(e.value)))
      return { value: undefined }
    })
    on('process.run', () => ({ value: { exitCode: 128, stdout: '', stderr: 'fatal', isStdoutTruncated: false, isStderrTruncated: false } }))
    on('command.run', (_, e) => {
      cd.push(`${e.command} ${e.args}`)
      return { text: '' }
    })
    on('fs.stat', (_, e) => {
      const m = ecrits.get(e.path as string)
      return m === undefined ? { deny: 'ENOENT' } : { value: { kind: 'file', size: 1, mtimeMs: m, isLink: false } }
    })
    on('fs.exists', () => ({ value: true }))
    on('fs.list', () => ({ value: [] }))
    on('fs.read', () => ({ value: '' }))
    on('ui.log', () => ({ value: undefined }))
    on('ui.toast', () => ({ value: undefined }))
    let aEcrire: string[] = []
    let maintenant = 1_000_000
    on('tool.call', () => {
      aEcrire.forEach((f, i) => ecrits.set(f, maintenant + 3 + i))
      return { result: { stdout: '' } }
    })
    const bash = (commande: string, ecrit: string[]) => {
      aEcrire = ecrit
      return $.tool.call({ tool: 'Bash', command: commande, description: 'x' })
    }

    // Le cahier d'un autre dépôt écrit (ligne 1740 de la transcription) : pas de lien, pas de /cd.
    await bash(`cd ${XP}/evan && cat >> CAHIER-DES-CHARGES.txt <<'EOF'\n\nCHANTIER 2 — Widget > éléments\nEOF`, [`${XP}/evan/CAHIER-DES-CHARGES.txt`])
    await horloge.settle()
    expect(lie()).toBeNull()

    // Un plan écrit par la commande : la session lui est liée.
    maintenant += 1000
    horloge.advance(1000)
    await bash(`echo a > ${XA}/evan/PLAN-a.md && echo b >> ${XP}/evan/CAHIER-DES-CHARGES.txt`, [`${XP}/evan/CAHIER-DES-CHARGES.txt`, `${XA}/evan/PLAN-a.md`])
    await horloge.settle()
    expect(lie()).toBe(`${XA}/evan/PLAN-a.md`)
    expect(cd).toEqual([])
  })
})
