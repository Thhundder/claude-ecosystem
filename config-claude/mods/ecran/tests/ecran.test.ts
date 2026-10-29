import { describe, expect, test } from 'claude-code/testing'

import { echecPolice, finErreur, estPleine, panneauVoulu, reposer, fusionner, lireEncours, lirePlanTexte } from '../hooks/register'
import { lireArbrePlan, lireProjet } from '../hooks/suivi'
import { dureeCourte, hauteurTaches } from '../hooks/vues'
import { camembert } from '../hooks/ram-geo'

describe('plan', () => {
  test('plan lu dans les cases', async () => {
    expect(lirePlanTexte('p', '- [x] a\n- [ ] b\n- [x] c')).toEqual({ nom: 'p', faits: 2, total: 3 })
    expect(lirePlanTexte('p', 'rien')).toBeNull()
  })
})

describe('panneau où on en est', () => {
  test('plan en arbre : titres, cases, retraits ; la première case non cochée est en cours', async () => {
    const plan = [
      '# Plan de la nuit — à valider par Evan',
      'texte libre',
      '## A. Terminal',
      '- [x] A1 installé',
      '- [x] A2 réglé — fini quand : ok',
      '## B. Panneau',
      '- [x] B1 lu',
      '- [ ] B2 **dessiné** ; fini quand vu',
      '  - [x] B2.1 arbre',
      '  - [ ] B2.2 mémoire',
      '## C. Mesure — [x] fait à 7 h',
      '## D. Sans case',
      '## E. Mods',
      '- [x] E1 un',
      '- [ ] E2 deux',
      '## Journal',
    ].join('\n')
    const a = lireArbrePlan(plan)!
    expect(a.titre).toBe('Plan de la nuit')
    expect(a.noeuds.map(n => [n.texte, n.etat])).toEqual([['A. Terminal', 'fait'], ['B. Panneau', 'encours'], ['C. Mesure', 'fait'], ['E. Mods', 'partiel']])
    expect(a.noeuds[0]!.enfants[1]!.texte).toBe('A2 réglé')
    expect(a.noeuds[1]!.enfants[1]!.texte).toBe('B2 dessiné')
    expect(a.noeuds[1]!.enfants[1]!.enfants.map(n => n.etat)).toEqual(['fait', 'encours'])
    expect(a.enCours).toBe('B2.2 mémoire')
    expect([a.faits, a.total]).toEqual([6, 8])
  })
  test('plan numéroté 1.1 [x] : les numéros font l’arbre', async () => {
    const a = lireArbrePlan('## Vague 1\n1.1 [x] **un**\n    suite du texte\n1.2 [ ] deux\n1.2.1 [x] deux-a\n1.2.2 [ ] deux-b\n1.3 [ ] trois')!
    expect(a.noeuds[0]!.enfants.map(n => n.texte)).toEqual(['1.1 un', '1.2 deux', '1.3 trois'])
    expect(a.noeuds[0]!.enfants[1]!.enfants.map(n => [n.texte, n.etat])).toEqual([['1.2.1 deux-a', 'fait'], ['1.2.2 deux-b', 'encours']])
    expect(a.enCours).toBe('1.2.2 deux-b')
  })
  test('plan sans titres : cases à plat, numéros en gras', async () => {
    const a = lireArbrePlan('# PLAN — copilote\n- [x] **1** Lire\n- [ ] **2** Écrire\n- [ ] **3** Tester')!
    expect(a.titre).toBe('copilote')
    expect(a.noeuds.map(n => [n.texte, n.etat])).toEqual([['1 Lire', 'fait'], ['2 Écrire', 'encours'], ['3 Tester', 'afaire']])
    expect(lireArbrePlan('# rien\ntexte')).toBeNull()
  })
  test('projet du cahier en une phrase', async () => {
    const cahier = 'CAHIER DES CHARGES - MATCHA\nProjet : Site de rencontre Matcha\n=====\nCHANTIER 1 - DONNÉES (Evan) - EN PREMIER\n=====\nObjectif : la structure\nde tout.\nInclus\n- Modèle\n- Contrat\nExclu : le design.\nFini quand : tout passe.\n\nCHANTIER 2 - AUTH (binôme)\nObjectif : conforme.\n'
    expect(lireProjet(cahier)).toBe('Site de rencontre Matcha')
    expect(lireProjet('CAHIER DES CHARGES - MATCHA\n')).toBe('MATCHA')
    expect(lireProjet('rien')).toBeNull()
  })
})

describe('rond de la mémoire', () => {
  test('chaque part a des cases à sa mesure, le dessus avant le flanc', async () => {
    const lignes = camembert([0.25, 0.75], 40, 10)
    const comptes = [0, 0]
    for (const ligne of lignes) for (const [haut, bas] of ligne) for (const p of [haut, bas]) if (p && !p[1]) comptes[p[0]]! += 1
    const part = comptes[0]! / (comptes[0]! + comptes[1]!)
    expect(part).toBeGreaterThan(0.2)
    expect(part).toBeLessThan(0.3)
    expect(lignes.every(l => l.length === 40)).toBe(true)
  })
})

describe('workflows, agents et shells en cours', () => {
  test('fin d’une erreur de barre.py', async () => {
    const longue = finErreur(`ecran : barre.py a échoué (1) Traceback ${'x'.repeat(500)}TypeError: fin`)
    expect(longue).toStartWith('ecran : barre.py a échoué (1) … ')
    expect(longue).toEndWith('TypeError: fin')
    expect(finErreur('ecran : barre.py a échoué (1) court')).toBe('ecran : barre.py a échoué (1) court')
  })
  test('sortie de barre.py', async () => {
    expect(lireEncours('{"encours": [["shell", "npm test", 4], ["workflow", "revue", 90], ["inconnu", "x", 1]]}')).toEqual([
      { sorte: 'shell', nom: 'npm test', depuis: 4 },
      { sorte: 'workflow', nom: 'revue', depuis: 90 },
    ])
    expect(lireEncours('pas du json')).toEqual([])
  })
  test('fusion sans doublon, workflows puis agents puis shells', async () => {
    const agents = [
      { id: 'a1', nom: 'Audit', statut: 'running', depuis: 30 },
      { id: 'a2', nom: 'AGENT · revue', statut: 'running', depuis: 10 },
    ]
    const barre = [
      { sorte: 'shell' as const, nom: 'npm test', depuis: 4 },
      { sorte: 'agent' as const, nom: 'Audit', depuis: 31 },
      { sorte: 'workflow' as const, nom: 'revue', depuis: 90 },
    ]
    expect(fusionner(agents, barre).map(t => `${t.sorte}:${t.nom}`)).toEqual(['workflow:revue', 'agent:Audit', 'agent:AGENT · revue', 'shell:npm test'])
  })
  test('hauteur et durées', async () => {
    expect(hauteurTaches([])).toBe(2)
    expect(hauteurTaches(Array.from({ length: 3 }, (_, i) => ({ sorte: 'shell' as const, nom: `x${i}`, depuis: 1 })))).toBe(4)
    expect(hauteurTaches(Array.from({ length: 9 }, (_, i) => ({ sorte: 'shell' as const, nom: `x${i}`, depuis: 1 })))).toBe(8)
    expect(hauteurTaches(Array.from({ length: 4 }, (_, i) => ({ sorte: 'agent' as const, nom: `juge lot${i + 1}`, depuis: 1 })))).toBe(2)
    expect(dureeCourte(42)).toBe('42 s')
    expect(dureeCourte(125)).toBe('2 min')
    expect(dureeCourte(3725)).toBe('1 h 02')
  })
})

describe('police kitty', () => {
  test('silence en succès, message en échec', async () => {
    expect(echecPolice(0, '')).toBeNull()
    expect(echecPolice(0, 'avertissement')).toBeNull()
    expect(echecPolice(1, 'Error: no matching window\n')).toBe('ecran: police 8 refusée par kitten (rc=1) Error: no matching window')
  })
})

describe('bugs du 28/10', () => {
  test('panneau : seulement fenêtre kitty sur tout l’écran, jamais selon la colonne que le panneau rétrécit', () => {
    expect(panneauVoulu(true, true)).toBe(true)
    expect(panneauVoulu(false, true)).toBe(false)
    expect(panneauVoulu(null, true)).toBe(false)
    expect(panneauVoulu(null, false)).toBe(true)
    const ecran = { l: 1920, h: 1080 }
    expect(estPleine(1920, 1080, ecran)).toBe(true)
    expect(estPleine(1920, 1044, ecran)).toBe(true)
    expect(estPleine(960, 1044, ecran)).toBe(false)
    expect(estPleine(960, 504, ecran)).toBe(false)
    expect(estPleine(1300, 1044, ecran)).toBe(false)
  })
  test('police : reposée à chaque taille nouvelle et toutes les 15 s, jamais une seule fois pour toutes', () => {
    expect(reposer(null, '960×504', 0)).toBe(true)
    expect(reposer({ taille: '960×504', t: 0 }, '960×504', 5_000)).toBe(false)
    expect(reposer({ taille: '960×504', t: 0 }, '1920×1044', 5_000)).toBe(true)
    expect(reposer({ taille: '960×504', t: 0 }, '960×504', 15_000)).toBe(true)
  })
})
