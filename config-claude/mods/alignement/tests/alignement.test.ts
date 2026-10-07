import { describe, expect, test } from 'claude-code/testing'

import { aClasser, lireVerdict, marqueur } from '../hooks/register'

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
