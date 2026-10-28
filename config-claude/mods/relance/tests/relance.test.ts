import type { TestBody } from 'claude-code/testing'
import { describe, expect, mock, test } from 'claude-code/testing'

import { REDACTION, RELECTURE, avecMotif, avecTranscription, commandeTapee, dossierDeTravail, condenser, condenserRelecture, demande, masquer, relecture, sansTableau } from '../hooks/lire'

const ligne = (o: Record<string, unknown>) => JSON.stringify(o)
const evan = (text: string, t = '2026-10-27T10:00:00Z') => ligne({ type: 'user', timestamp: t, cwd: '/d', origin: { kind: 'human' }, message: { content: text } })
const outil = (name: string, input: Record<string, unknown>) => ligne({ type: 'assistant', cwd: '/d', message: { content: [{ type: 'thinking', thinking: 'secret interne' }, { type: 'text', text: 'Je regarde.' }, { type: 'tool_use', name, input }] } })
const resultat = (texte: string) => ligne({ type: 'user', cwd: '/d', message: { content: [{ type: 'tool_result', content: texte }] } })
const jsonl = [
  evan('je veux dissocier la bulle du texte'),
  ligne({ type: 'user', isMeta: true, origin: { kind: 'plugin' }, message: { content: '<system-reminder>bruit</system-reminder>' } }),
  outil('Bash', { command: 'ls src\nsuite' }),
  resultat('a.ts b.ts'),
  evan('<command-name>/ecran</command-name>\n<command-message>ecran</command-message>\n<command-args>8</command-args>'),
  evan('<local-command-stdout>ok</local-command-stdout>'),
  'pas du json',
  evan('non, pas de maquette, code directement'),
].join('\n')

describe('lecture de la transcription', () => {
  test('les messages d’Evan mot pour mot, les commandes tapées, sans réflexion ni rappel', async () => {
    const lu = condenser(jsonl)
    expect(lu.evan).toEqual(['je veux dissocier la bulle du texte', '/ecran 8', 'non, pas de maquette, code directement'])
    expect(lu.texte).toContain('### EVAN, message 1 (2026-10-27 10:00) :\nje veux dissocier la bulle du texte')
    expect(lu.texte).toContain('  · Bash : ls src suite')
    expect(lu.texte).toContain('    ⎿ a.ts b.ts')
    expect(lu.texte).not.toContain('secret interne')
    expect(lu.texte).not.toContain('bruit')
    expect(lu.niveau).toBe(0)
  })
  test('trop long : les résultats partent d’abord, les mots d’Evan jamais', async () => {
    const long = [evan('garde-moi'), outil('Read', { file_path: '/x' }), resultat('r'.repeat(5000))].join('\n')
    const lu = condenser(long, 200)
    expect(lu.niveau).toBeGreaterThan(0)
    expect(lu.texte).not.toContain('⎿')
    expect(lu.evan).toEqual(['garde-moi'])
  })
  test('fin de session : résultats entiers ; avant : 300 caractères ; relecture : 2 000 partout', async () => {
    const debut = [evan('début'), outil('Bash', { command: 'git log' }), resultat('A'.repeat(1000) + ' (vide = rien)')]
    const suite = Array.from({ length: 12 }, (_, k) => evan(`message ${k}`))
    const fin = [outil('Bash', { command: 'git merge-tree' }), resultat('CONFLICT 1 ' + 'x'.repeat(800) + ' CONFLICT 3')]
    const tout = [...debut, ...suite, ...fin].join('\n')
    const lu = condenser(tout)
    expect(lu.texte).not.toContain('(vide = rien)')
    expect(lu.texte).toContain('CONFLICT 3')
    const relu = condenserRelecture(tout)
    expect(relu.texte).toContain('(vide = rien)')
    expect(relu.niveau).toBe(0)
  })
  test('commandes et secrets', async () => {
    expect(commandeTapee('<local-command-caveat>x</local-command-caveat>')).toBe('')
    expect(commandeTapee('bonjour')).toBe(null)
    expect(masquer('token=abcdefghijkl')).toBe('token=abcd…(masqué)')
  })
  test('dossier de travail : celui où la session a été ouverte, même si le moteur est revenu à la racine', async () => {
    expect(dossierDeTravail([ligne({ type: 'system' }), evan('a'), ligne({ type: 'user', cwd: '/racine', origin: { kind: 'human' }, message: { content: '/relance x' } })].join('\n'))).toBe('/d')
    expect(dossierDeTravail('pas du json')).toBe(null)
  })
})

describe('demande à Opus', () => {
  test('motif mot pour mot et transcription de l’ancienne session, plus de SendMessage', async () => {
    const blocs = demande({ motif: 'il ne comprend pas', session: 'abc-123', dossier: '/d', transcription: '/t.jsonl', condense: 'TRANSCRIT', contexte: [], niveau: 0, tronque: false })
    const tout = blocs.map(b => b.text).join('\n')
    expect(tout).toContain('« il ne comprend pas »')
    expect(tout).toContain('sessionId abc-123')
    expect(tout).toContain('transcription /t.jsonl')
    expect(tout + REDACTION).not.toContain('SendMessage')
    expect(tout).toContain('TRANSCRIT')
    expect(blocs.at(-1)!.text.endsWith('Écris maintenant le prompt de reprise.')).toBe(true)
  })
})

describe('relecture', () => {
  test('le brouillon et la transcription riche, la consigne vise les faits d’état', async () => {
    const blocs = relecture({ motif: 'pas de chien', brouillon: 'BROUILLON', condense: 'RICHE', contexte: [], session: 's1', niveau: 0, tronque: false })
    const tout = blocs.map(b => b.text).join('\n')
    expect(tout).toContain('BROUILLON')
    expect(tout).toContain('RICHE')
    expect(tout).toContain('« pas de chien »')
    expect(RELECTURE).toContain('MOTIF D\'EVAN')
    expect(blocs.at(-1)!.text.endsWith('Rends maintenant le prompt corrigé, entier.')).toBe(true)
    expect(RELECTURE).toContain('prochaine action')
    expect(RELECTURE).toContain('non prouvée')
  })
})

describe('motif', () => {
  test('déjà cité : le prompt ne bouge pas ; absent : cité en tête', async () => {
    expect(avecMotif('Evan dit « pas de chien ».', 'pas de chien')).toBe('Evan dit « pas de chien ».')
    expect(avecMotif('P', 'pas de chien').startsWith('Motif d\'Evan pour cette relance, mot pour mot : « pas de chien »')).toBe(true)
  })
})

describe('pas de tableau', () => {
  test('un tableau devient une liste, le reste ne bouge pas', async () => {
    const avant = 'Commits :\n\n| Dépôt | Commits |\n|---|---|\n| widget-v2 | `d6591e4`, `1e971d1` |\n| app | `0d70b52` |\n\nSuite | pas un tableau'
    expect(sansTableau(avant)).toBe('Commits :\n\n- **widget-v2** — Commits : `d6591e4`, `1e971d1`\n- **app** — Commits : `0d70b52`\n\nSuite | pas un tableau')
    expect(sansTableau('a | b\nc')).toBe('a | b\nc')
  })
  test('la consigne l’interdit en toutes lettres', async () => {
    expect(REDACTION).toContain('JAMAIS de tableau')
  })
})

describe('pas de partie règles', () => {
  test('la rédaction ne demande plus de règles, seulement les consignes de la session citées mot pour mot', async () => {
    expect(REDACTION).not.toContain('RÈGLES DE LA SESSION')
    expect(REDACTION).toContain('Pas de partie « règles »')
    expect(REDACTION).toContain('mot pour mot, jamais reformulée')
    expect(REDACTION).toContain('5. L\'ANCIENNE SESSION')
    const tout = demande({ motif: 'm', session: 's', dossier: '/d', transcription: '/t', condense: '', contexte: [], niveau: 0, tronque: false }).map(b => b.text).join('\n')
    expect(tout).toContain('dans la partie 5')
  })
  test('la relecture retire règles générales et consignes reformulées', async () => {
    expect(RELECTURE).toContain('citée mot pour mot')
    expect(RELECTURE).toContain('une partie « règles » sortent du prompt')
  })
  test('demande de départ citée, « à ne pas refaire » et leçons seulement d’après Evan', async () => {
    expect(REDACTION).toContain('« Demande de départ d\'Evan »')
    expect(REDACTION).toContain('ce qu\'Evan a refusé ou corrigé dans la conversation, chaque point avec sa citation')
    expect(REDACTION).toContain('aucune « leçon »')
    expect(REDACTION).toContain('« Consignes d\'Evan pour cette session »')
    expect(REDACTION).toContain('ne la change jamais en interdit')
    expect(RELECTURE).toContain('la demande de départ d\'Evan : elle doit figurer')
    expect(RELECTURE).toContain('« à ne pas refaire », « leçon »')
  })
})

const MOTIF_EN_TETE = 'Motif d\'Evan pour cette relance, mot pour mot : « il ne comprend pas ». La session d\'avant s\'est trompée sur ce point : repars de là.\n\n'
const CHEMIN = '/home/e/.claude/projects/-home-e-projet/abcdef12-0000.jsonl'
const usage = { input_tokens: 1, output_tokens: 2, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

// Une session de test : transcription lisible, écritures, /clear et dépôts relevés.
function session(on: Parameters<TestBody>[1]) {
  const ecrits: { path: string; content: string }[] = []
  const vides: string[] = []
  const deposes: { text: string; origin: { asUser?: boolean } }[] = []
  const lances: unknown[] = []
  on('env.get', () => ({ value: '/home/e' }))
  on('session.id', () => ({ value: 'abcdef12-0000' }))
  on('session.root', () => ({ value: '/home/e/projet' }))
  on('session.cwd', () => ({ value: '/home/e/projet' }))
  on('fs.exists', (_, e) => ({ value: e.path === CHEMIN }))
  on('fs.read', () => ({ value: jsonl }))
  on('fs.write', (_, e) => { ecrits.push({ path: e.path as string, content: e.text }); return { value: undefined } as never })
  on('process.run', (_, e) => { lances.push((e.argv as string[])[0]); return { value: { exitCode: 0, stdout: '/home/e/projet\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } } })
  on('ui.toast', () => ({ value: undefined }) as never)
  on('ui.log', () => ({ value: undefined }) as never)
  on('command.run', { command: 'clear' }, () => { vides.push('clear'); return { text: '' } })
  on('prompt.submit', (_, e) => { deposes.push(e as never); return { drop: 'essai' } as never })
  return { ecrits, vides, deposes, lances, horloge: mock.clock(on) }
}

describe('/relance', () => {
  test('sans motif : une ligne d’usage, rien d’autre', async ($, on) => {
    const s = session(on)
    let appels = 0
    on('model.complete', () => { appels++; return { value: { isAnswered: false, reason: 'aborted', usage } } as never })
    const sortie = await $.command.run({ command: 'relance', args: '  ' } as never)
    await s.horloge.settle()
    expect(sortie.text).toBe('Usage : /relance <ce qui ne va pas>')
    expect(appels).toBe(0)
    expect([s.ecrits, s.vides, s.deposes]).toEqual([[], [], []])
  })
  test('avec motif : rédaction, puis vidage de la même fenêtre et dépôt du prompt, sans aperçu ni onglet', async ($, on) => {
    const s = session(on)
    const requetes: { model: string; system: string; prompt: unknown }[] = []
    on('model.complete', (_, e) => {
      requetes.push(e as never)
      return { value: { isAnswered: true, text: requetes.length === 1 ? 'BROUILLON' : 'PROMPT DE REPRISE\n\n| a | b |\n|---|---|\n| x | y |', usage } } as never
    })
    const sortie = await $.command.run({ command: 'relance', args: 'il ne comprend pas' } as never)
    expect(requetes.map(r => r.model)).toEqual(['claude-opus-5-5', 'claude-opus-5-5'])
    expect(JSON.stringify(requetes[0]!.prompt)).toContain('il ne comprend pas')
    expect(requetes[1]!.system).toBe(RELECTURE)
    expect(JSON.stringify(requetes[1]!.prompt)).toContain('BROUILLON')
    expect(JSON.stringify(requetes[1]!.prompt)).toContain('« il ne comprend pas »')
    const prompt = `${MOTIF_EN_TETE}PROMPT DE REPRISE\n\n- **x** — b : y`
    expect(s.ecrits).toEqual([{ path: '/home/e/.claude/cache/relance/PROMPT-abcdef12.txt', content: `${prompt}\n` }])
    expect(sortie.text).not.toContain('PROMPT DE REPRISE')
    expect(sortie.text).not.toContain('/relance lancer')
    expect(s.vides).toEqual([])
    await s.horloge.settle()
    expect(s.vides).toEqual(['clear'])
    expect(s.deposes.map(d => [d.text, d.origin.asUser])).toEqual([[avecTranscription(prompt, CHEMIN), true]])
    expect(s.deposes[0]!.text).toContain(`Transcription de la session d'avant (coupée) : ${CHEMIN}`)
    expect(s.lances.filter(c => c !== 'git' && c !== 'mkdir')).toEqual([])
  })
  test('relecture sans réponse : le premier jet est déposé et c’est dit', async ($, on) => {
    const s = session(on)
    let n = 0
    on('model.complete', () => ({ value: ++n === 1 ? { isAnswered: true, text: 'PREMIER JET', usage } : { isAnswered: false, reason: 'timeout', usage } }) as never)
    const sortie = await $.command.run({ command: 'relance', args: 'il ne comprend pas' } as never)
    await s.horloge.settle()
    expect(sortie.text).toContain('Relecture non faite (timeout)')
    expect(s.deposes.map(d => d.text)).toEqual([avecTranscription(`${MOTIF_EN_TETE}PREMIER JET`, CHEMIN)])
  })
  test('rédaction sans réponse : rien n’est vidé ni déposé', async ($, on) => {
    const s = session(on)
    on('model.complete', () => ({ value: { isAnswered: false, reason: 'api-error', usage } }) as never)
    const sortie = await $.command.run({ command: 'relance', args: 'il ne comprend pas' } as never)
    await s.horloge.settle()
    expect(sortie.text).toContain('pas de prompt')
    expect([s.vides, s.deposes]).toEqual([[], []])
  })
})
