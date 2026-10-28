import { describe, expect, mock, test } from 'claude-code/testing'

import { cheminEcrit, cheminsShell, choisirPlan, commandeShell, estPlan } from '../hooks/projet'

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

  test('plan : celui que la session a écrit, sinon le plus récent du dépôt', async () => {
    expect(choisirPlan(fichiers, `${DEPOT}/evan`, null)?.name).toBe('PLAN-recent.md')
    expect(choisirPlan(fichiers, `${DEPOT}/evan`, `${DEPOT}/evan/PLAN-ancien.md`)?.name).toBe('PLAN-ancien.md')
    expect(choisirPlan(fichiers, `${DEPOT}/evan`, `/autre/evan/PLAN-ancien.md`)?.name).toBe('PLAN-recent.md')
    expect(choisirPlan([], `${DEPOT}/evan`, null)).toBeUndefined()
  })

  test('une écriture dans un autre dépôt : /cd vers sa racine, plan écrit lu', async ($, on) => {
    const horloge = mock.clock(on)
    const cd: string[] = []
    const lus: string[] = []
    let racine = '/home/e'
    on('session.root', () => ({ value: racine }))
    on('process.run', (_, e) => {
      const argv = e.argv as string[]
      if (argv[0] === 'git') return { value: argv[2]?.startsWith(DEPOT) ? { exitCode: 0, stdout: `${DEPOT}\n`, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } : { exitCode: 128, stdout: '', stderr: 'fatal', isStdoutTruncated: false, isStderrTruncated: false } }
      return { value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    })
    on('command.run', (_, e) => {
      cd.push(`${e.command} ${e.args}`)
      racine = e.args
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

    await $.tool.call({ tool: 'Write', file_path: '/tmp/x.txt', content: 'x' })
    await horloge.settle()
    expect(cd).toEqual([])

    await $.tool.call({ tool: 'Write', file_path: `${DEPOT}/evan/PLAN-ancien.md`, content: '- [ ] a' })
    await horloge.settle()
    expect(cd).toEqual([`cd ${DEPOT}`])
    expect(lus).toContain(`${DEPOT}/evan/PLAN-ancien.md`)
    expect(lus).not.toContain(`${DEPOT}/evan/PLAN-recent.md`)

    await $.tool.call({ tool: 'Edit', file_path: `${DEPOT}/src/a.ts`, old_string: 'a', new_string: 'b' })
    await horloge.settle()
    expect(cd).toEqual([`cd ${DEPOT}`])
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

  test('une écriture par commande shell dans un autre dépôt : le panneau suit (cas réel du 27/10, session 5013256e)', async ($, on) => {
    const horloge = mock.clock(on, { now: 1_000_000 })
    const XA = '/home/e/Documents/Xeko/xeko.ai'
    const XP = '/home/e/Documents/Xeko/xeko-app'
    const cd: string[] = []
    let racine = XA
    const ecrits = new Map<string, number>()
    on('session.root', () => ({ value: racine }))
    on('session.cwd', () => ({ value: XA }))
    on('env.get', () => ({ value: '/home/e' }))
    on('process.run', (_, e) => {
      const argv = e.argv as string[]
      const depot = [XA, XP].find(d => argv[2]?.startsWith(d))
      if (argv[0] === 'git' && depot) return { value: { exitCode: 0, stdout: `${depot}\n`, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
      return { value: { exitCode: 128, stdout: '', stderr: 'fatal', isStdoutTruncated: false, isStderrTruncated: false } }
    })
    on('command.run', (_, e) => {
      cd.push(`${e.command} ${e.args}`)
      racine = e.args
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
    let erreur = false
    on('tool.call', () => {
      aEcrire.forEach((f, i) => ecrits.set(f, maintenant + 3 + i))
      return erreur ? { result: { stdout: '' }, isError: true } : { result: { stdout: '' } }
    })
    const bash = (commande: string, ecrit: string[]) => {
      aEcrire = ecrit
      return $.tool.call({ tool: 'Bash', command: commande, description: 'x' })
    }

    // Lecture seule d'un fichier evan/ d'un autre dépôt : rien ne bouge.
    ecrits.set(`${XP}/evan/CAHIER-DES-CHARGES.txt`, 1)
    await bash(`grep -n "^=" ${XP}/evan/CAHIER-DES-CHARGES.txt | head -30`, [])
    await horloge.settle()
    expect(cd).toEqual([])

    // La commande de la transcription (ligne 1740) : cd puis cat >> relatif, heredoc.
    horloge.advance(1000)
    maintenant += 1000
    await bash(`cd ${XP}/evan && cat >> CAHIER-DES-CHARGES.txt <<'EOF'\n\nCHANTIER 2 — Widget > éléments\nEOF`, [`${XP}/evan/CAHIER-DES-CHARGES.txt`])
    await horloge.settle()
    expect(cd).toEqual([`cd ${XP}`])

    // Deux dépôts nommés, les deux écrits : le dernier modifié gagne (ici XA, écrit après).
    maintenant += 1000
    horloge.advance(1000)
    await bash(`echo a > ${XA}/evan/PLAN-a.md && echo b >> ${XP}/evan/CAHIER-DES-CHARGES.txt`, [`${XP}/evan/CAHIER-DES-CHARGES.txt`, `${XA}/evan/PLAN-a.md`])
    await horloge.settle()
    expect(cd).toEqual([`cd ${XP}`, `cd ${XA}`])

    // Script python (ligne 1769), commande en échec après avoir écrit : suivi quand même.
    maintenant += 1000
    horloge.advance(1000)
    erreur = true
    await bash(`cd ${XP}/evan && python3 - <<'EOF'\np='CAHIER-DES-CHARGES.txt'; open(p,'w').write('x')\nEOF`, [`${XP}/evan/CAHIER-DES-CHARGES.txt`])
    await horloge.settle()
    expect(cd).toEqual([`cd ${XP}`, `cd ${XA}`, `cd ${XP}`])
  })

})
