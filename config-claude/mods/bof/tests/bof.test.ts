import { describe, expect, test } from 'claude-code/testing'
import type { SessionMessage } from 'claude-code'

import { derniersEchanges, entree, estConfig, masquer } from '../hooks/bof'

const evan = (text: string): SessionMessage => ({ role: 'user', text, toolUses: [] })
const claude = (text: string, outils: [string, Record<string, unknown>][] = []): SessionMessage => ({
  role: 'assistant',
  text,
  toolUses: outils.map(([tool, input], i) => ({ tool_use_id: `t${i}`, tool, input })),
})
const resultat: SessionMessage = { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 't0', text: 'ok' } as never] }

const conversation = Array.from({ length: 12 }, (_, i) => [evan(`question ${i + 1}`), claude('', [['Bash', { command: `ls ${i + 1}\nsuite` }]]), resultat, claude(`réponse ${i + 1}`)]).flat()

describe('bof', () => {
  test('les 10 derniers échanges, actions sur une ligne, la commande /bof exclue', async () => {
    const commande = [evan('<local-command-caveat>The command below was run directly</local-command-caveat>'), evan('<command-name>/ecran</command-name>\n<command-message>ecran</command-message>\n<command-args>8</command-args>'), evan('<local-command-stdout>ok</local-command-stdout>')]
    const avecCommandes = derniersEchanges([...conversation, ...commande])
    expect(avecCommandes.length).toBe(10)
    expect(avecCommandes.at(-1)!.map(m => m.text)).toEqual([commande[1]!.text])
    expect(entree({ quand: new Date(), texte: '', session: 's', transcription: 't', dossier: 'd', messages: [...conversation, ...commande] })).toContain('[10] Evan : /ecran 8\n')
    const echanges = derniersEchanges([...conversation, evan('<local-command-caveat>x</local-command-caveat>'), evan('<command-name>/bof</command-name>\n<command-args>essai</command-args>')])
    expect(echanges.length).toBe(10)
    expect(echanges[0]![0]!.text).toBe('question 3')
    const texte = entree({ quand: new Date(2026, 9, 27, 9, 5), texte: 'trop long', session: 'abc', transcription: '/t/abc.jsonl', dossier: '/d', messages: conversation })
    expect(texte.startsWith('===== BOF 2026-10-27 09:05 =====\nRetour d\'Evan : trop long\nSession : abc\nTranscription : /t/abc.jsonl\nDossier : /d\n--- 10 derniers échanges ---\n[1] Evan : question 3\n  · Bash : ls 3\nClaude : réponse 3\n')).toBe(true)
    expect(texte).toContain('[10] Evan : question 12')
    expect(texte).not.toContain('question 2\n')
    expect(texte).not.toContain('suite')
    expect(texte.endsWith('Claude : réponse 12\n\n')).toBe(true)
  })

  test('une valeur à forme de clé est masquée, un chemin ou un sha ne l’est pas', async () => {
    const cle = 'sk-ant-api03-AbCdEf0123456789xyzXYZ'
    const texte = masquer(`clé ${cle} ; API_KEY=s3cr3tValeur ; Bearer abcdefghij ; jeton Zq8xK2mN4pR7tV1wY3bC6dF9gH ; /home/e/evan/PLAN-etat-relais-ecran-2026-10-10.md ; 0b2b7ab1c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4`)
    expect(texte).not.toContain(cle.slice(8))
    expect(texte).not.toContain('s3cr3tValeur')
    expect(texte).not.toContain('abcdefghij')
    expect(texte).not.toContain('Zq8xK2mN4pR7tV1wY3bC6dF9gH')
    expect(texte).toContain('API_KEY=s3cr…(masqué)')
    expect(texte).toContain('/home/e/evan/PLAN-etat-relais-ecran-2026-10-10.md')
    expect(texte).toContain('0b2b7ab1c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4')
  })

  test('configuration : ~/.claude et config-claude, pas le fichier des retours', async () => {
    expect(estConfig('/home/e/.claude/settings.json', '/home/e')).toBe(true)
    expect(estConfig('/home/e/Documents/claude-ecosystem/config-claude/CLAUDE.md', '/home/e')).toBe(true)
    expect(estConfig('/home/e/.claude/retours/RETOURS.txt', '/home/e')).toBe(false)
    expect(estConfig('/home/e/Documents/claude-ecosystem/commands/x.md', '/home/e')).toBe(false)
  })

  test('/bof ajoute à la fin sans relire ; la note vient une seule fois', async ($, on) => {
    const ajouts: { argv: readonly string[]; stdin?: string }[] = []
    const lus: string[] = []
    on('env.get', () => ({ value: '/home/e' }))
    on('session.id', () => ({ value: 'sid' }))
    on('session.root', () => ({ value: '/home/e/projet' }))
    on('session.cwd', () => ({ value: '/home/e/projet' }))
    on('session.messages', () => ({ value: conversation }))
    on('fs.exists', (_, e) => ({ value: e.path === '/home/e/.claude/projects/-home-e-projet/sid.jsonl' }))
    on('fs.read', (_, e) => {
      lus.push(e.path as string)
      return { value: '' }
    })
    on('process.run', (_, e) => {
      ajouts.push({ argv: e.argv as string[], stdin: e.init?.stdin })
      const grep = (e.argv as string[])[0] === 'grep'
      return { value: { exitCode: 0, stdout: grep ? '3\n' : '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    })
    on('tool.call', () => ({ result: {} }))

    const sortie = await $.command.run({ command: 'bof', args: 'trop verbeux', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })
    expect(sortie.text).toContain('RETOURS.txt')
    const ajout = ajouts[0]!
    expect(ajout.argv.join(' ')).toContain('cat >> "$1"')
    expect(ajout.argv.at(-1)).toBe('/home/e/.claude/retours/RETOURS.txt')
    expect(ajout.stdin).toContain("Retour d'Evan : trop verbeux")
    expect(ajout.stdin).toContain('Transcription : /home/e/.claude/projects/-home-e-projet/sid.jsonl')
    expect(lus).toEqual([])

    const hors = await $.tool.call({ tool: 'Write', file_path: '/home/e/projet/a.txt', content: 'x' })
    expect(hors.context ?? []).toEqual([])
    const premiere = await $.tool.call({ tool: 'Edit', file_path: '/home/e/.claude/settings.json', old_string: 'a', new_string: 'b' })
    expect(premiere.context).toEqual(['3 retours dans ~/.claude/retours/RETOURS.txt : lis-les avant de modifier la configuration.'])
    const seconde = await $.tool.call({ tool: 'Write', file_path: '/home/e/.claude/CLAUDE.md', content: 'x' })
    expect(seconde.context ?? []).toEqual([])
  })

  test('transcription rangée sous un autre dossier de projet : la recherche de secours la trouve', async ($, on) => {
    const ajouts: { stdin?: string }[] = []
    on('env.get', () => ({ value: '/home/e' }))
    on('session.id', () => ({ value: 'sid' }))
    on('session.root', () => ({ value: '/home/e/projet' }))
    on('session.cwd', () => ({ value: '/home/e/projet/sous' }))
    on('session.messages', () => ({ value: conversation }))
    on('fs.list', () => ({ value: [{ name: 'fichier.txt', kind: 'file' }, { name: '-home-e-autre', kind: 'dir' }] }) as never)
    on('fs.exists', (_, e) => ({ value: e.path === '/home/e/.claude/projects/-home-e-autre/sid.jsonl' }))
    on('process.run', (_, e) => {
      ajouts.push({ stdin: e.init?.stdin })
      return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    })
    await $.command.run({ command: 'bof', args: 'essai' } as never)
    expect(ajouts[0]!.stdin).toContain('Transcription : /home/e/.claude/projects/-home-e-autre/sid.jsonl')
  })
})
