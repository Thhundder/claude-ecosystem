import { describe, expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { CONSIGNE, aClasser, court, estQuestion, lireSansReponse, lireVerdict, marqueur, noteOubli, poseQuestion } from '../hooks/register'

describe('alignement', () => {
  test('marqueurs sûrs, sans les choix ni les consignes', async () => {
    expect(marqueur("j'ai pas compris le point 2")).toBe(true)
    expect(marqueur('je t’avais dit de ne rien coder')).toBe(true)
    expect(marqueur('non on laisse comme ça')).toBe(false)
    expect(marqueur("t'arrêtes pas tant que tu n'as pas tout vérifié")).toBe(false)
    expect(marqueur('2 non, on garde l’ancien')).toBe(false)
    expect(marqueur('fais tout toi-même')).toBe(false)
  })
  test('« non, je voulais le bouton à droite » : classé désaccord par Opus, reçoit toujours le rappel', async ($, on) => {
    ouvrir(on, 'ECART')
    const r = await $.prompt.submit({ text: 'non, je voulais le bouton à droite', origin: { kind: 'composer' } } as never)
    expect(JSON.stringify(r)).toContain("S'aligner")
  })
  test('tri désaccord sur claude-opus-5-5 en 15 s, tri question resté sur Haiku en 5 s', async ($, on) => {
    const vus: { model: string; timeoutMs?: number }[] = []
    on('model.complete', (_, e) => {
      vus.push({ model: e.model, timeoutMs: (e as { timeoutMs?: number }).timeoutMs })
      return { value: { isAnswered: true, text: 'NEUTRE', usage: { input_tokens: 1, output_tokens: 1 } } } as never
    })
    on('ui.log', () => ({ value: undefined }))
    on('prompt.submit', (_, e) => ({ text: e.text }) as never)
    await $.prompt.submit({ text: 'remets le bouton en bas', origin: { kind: 'composer' } } as never)
    expect(vus.sort((a, b) => a.model.localeCompare(b.model))).toEqual([
      { model: 'claude-opus-5-5', timeoutMs: 15000 },
      { model: 'haiku', timeoutMs: 5000 },
    ])
  })
  test('« non » en tête ne suffit plus : Opus tranche', async () => {
    expect(marqueur('non on doit garder la qualité en prio')).toBe(false)
    expect(marqueur('nn juste vérifie dans le code')).toBe(false)
    expect(marqueur('mais non, refais-le')).toBe(false)
  })
  test('« comprends pas » ne suffit plus : il vise souvent un tiers ou le produit', async () => {
    expect(marqueur('l’autre session ne comprend pas ce que je veux')).toBe(false)
    expect(marqueur('il ne comprends pas ce que je veux faire')).toBe(false)
    expect(marqueur('Préview indisponible, pourquoi ? je ne comprends pas mais regarde')).toBe(false)
    expect(marqueur('je comprends rien')).toBe(false)
    expect(marqueur('j’ai pas compris le point 2')).toBe(true)
  })
  test('la consigne du tri désaccord porte la règle du changement de consigne', async () => {
    expect(CONSIGNE).toContain('Une nouvelle consigne ou un changement de ce qu’Evan veut n’est pas un reproche')
    expect(CONSIGNE).toContain('« d’ailleurs je ne veux plus voir ça en bas » → NEUTRE')
    expect(CONSIGNE).toContain('« non, je voulais le bouton à droite, pas en haut » → ECART')
  })
  test('lit le verdict du modèle', async () => {
    expect(lireVerdict('ECART')).toBe(true)
    expect(lireVerdict(' «ECART».')).toBe(true)
    expect(lireVerdict('NEUTRE')).toBe(false)
    expect(lireVerdict('')).toBe(false)
  })
  test('ne classe ni les commandes ni les messages vides', async () => {
    expect(aClasser('/cost')).toBe(false)
    expect(aClasser(' ')).toBe(false)
    expect(aClasser('non pas ça')).toBe(true)
  })
})

describe('question', () => {
  test('lit le verdict question / action', async () => {
    expect(estQuestion('QUESTION')).toBe(true)
    expect(estQuestion(' «Question».')).toBe(true)
    expect(estQuestion('ACTION')).toBe(false)
    expect(estQuestion('')).toBe(false)
  })
})

describe('fin de tour', () => {
  test('repère une question, ignore le texte collé', async () => {
    expect(poseQuestion('normalement j’ai de l’espace là non ?')).toBe(true)
    expect(poseQuestion('pourquoi tu as lancé ça')).toBe(true)
    expect(poseQuestion('fais le plan')).toBe(false)
    expect(poseQuestion('ok go <pasted_content id="x">Pourquoi 400 g ?</pasted_content id="x">')).toBe(false)
  })
  test('lit le verdict du juge', async () => {
    expect(lireSansReponse('{"questions": 2, "sans_reponse": ["a ?", ""]}')).toEqual(['a ?'])
    expect(lireSansReponse('rien')).toEqual([])
    expect(noteOubli(['a ?'])).toContain('- a ?')
  })
})

const CONVERSATION = [
  { role: 'user', text: 'mets le bouton à droite', toolResults: [], toolUses: [] },
  { role: 'assistant', text: 'Fait, clé sk-abcdefghijklmnopqrstuvwx utilisée.', toolUses: [] },
] as never

const ouvrir = (on: Parameters<TestBody>[1], verdict: string) => {
  const ajouts: { fichier: string; texte: string }[] = []
  const statuts: unknown[] = []
  on('env.get', () => ({ value: '/home/e' }))
  on('session.id', () => ({ value: 'sid' }))
  on('session.root', () => ({ value: '/home/e/projet' }))
  on('session.cwd', () => ({ value: '/home/e/projet' }))
  on('session.messages', () => ({ value: CONVERSATION }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.status', (_, e) => {
    statuts.push(e)
    return { value: undefined }
  })
  const appels: string[] = []
  on('model.complete', (_, e) => {
    const texte = String(e.system).includes('QUESTION ou ACTION') ? 'ACTION' : verdict
    appels.push(texte)
    return { value: { isAnswered: true, text: texte, usage: { input_tokens: 1, output_tokens: 1 } } } as never
  })
  on('process.run', (_, e) => {
    ajouts.push({ fichier: (e.argv as string[]).at(-1)!, texte: e.init?.stdin ?? '' })
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('prompt.submit', (_, e) => ({ text: [e.text, ...(e.context ?? [])].join('\n') }) as never)
  return { ajouts, statuts, appels }
}

describe('notes', () => {
  test('un désaccord : rappel joint, aucun statut, une ligne ALIGNEMENT et une entrée auto masquée', async ($, on) => {
    const { ajouts, statuts } = ouvrir(on, 'ECART')
    const r = await $.prompt.submit({ text: 'non, je voulais le bouton à droite, token=Zx9kQ2mP7rT4', origin: { kind: 'composer' } } as never)
    expect(JSON.stringify(r)).toContain("S'aligner")
    for (let i = 0; i < 2000 && ajouts.length < 2; i++) await Promise.resolve()
    expect(statuts).toEqual([])
    const ligne = ajouts.find(a => a.fichier === '/home/e/.claude/retours/ALIGNEMENT.txt')!
    expect(ligne.texte).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d\tsid\t\/home\/e\/projet\tdésaccord\tnon, je voulais/)
    expect(ligne.texte).toContain('token=Zx9k…(masqué)')
    const auto = ajouts.find(a => a.fichier === '/home/e/.claude/retours/RETOURS.txt')!
    expect(auto.texte).toMatch(/^===== BOF .* auto =====/)
    expect(auto.texte).toContain('[1] Evan : mets le bouton à droite')
    expect(auto.texte).toContain('sk-a…(masqué)')
    expect(auto.texte).not.toContain('abcdefghijklmnop')
  })
  test('un message neutre : rien d’écrit', async ($, on) => {
    const { ajouts, statuts, appels } = ouvrir(on, 'NEUTRE')
    await $.prompt.submit({ text: 'fais le plan', origin: { kind: 'composer' } } as never)
    for (let i = 0; i < 2000; i++) await Promise.resolve()
    expect(appels.sort()).toEqual(['ACTION', 'NEUTRE'])
    expect(ajouts).toEqual([])
    expect(statuts).toEqual([])
  })
  test('le message est coupé à 300 caractères, sans le texte collé', async () => {
    expect(court('a'.repeat(400)).length).toBe(301)
    expect(court('ok <pasted_content id="x">long</pasted_content id="x"> go')).toBe('ok [collé] go')
  })
})
