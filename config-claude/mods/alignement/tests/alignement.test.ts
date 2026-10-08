import { describe, expect, test } from 'claude-code/testing'

import { aClasser, estQuestion, lireSansReponse, lireVerdict, marqueur, noteOubli, poseQuestion } from '../hooks/register'

describe('alignement', () => {
  test('marqueurs sûrs, sans les choix ni les consignes', async () => {
    expect(marqueur("j'ai pas compris le point 2")).toBe(true)
    expect(marqueur('je t’avais dit de ne rien coder')).toBe(true)
    expect(marqueur('non, je voulais le bouton à droite')).toBe(true)
    expect(marqueur('non on laisse comme ça')).toBe(false)
    expect(marqueur("t'arrêtes pas tant que tu n'as pas tout vérifié")).toBe(false)
    expect(marqueur('2 non, on garde l’ancien')).toBe(false)
    expect(marqueur('fais tout toi-même')).toBe(false)
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
