import { describe, expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import type { Ram, Suivi } from '../types'
import { actionSous, CHAUD } from '../hooks/ligne-client'
import { arbreAuPlus, courtFini, finiQuand, lancees, lignesArbre, memoireRouge, nonFinis, objectif, planFini, planPanneau, processeurRouge, sousEtapes, titreEtape, titrePlan } from '../hooks/panneau'
import { chantierLie, FORMAT, horsDelai, quotasVus } from '../hooks/register'
import { hauteurRond } from '../hooks/ram-geo'
import { lignesDetail, propsValides, ROUGE, SURVOL, survolSous } from '../hooks/ronds-client'
import { A, lignesFini, partsMemoire, partsProcesseur, propsRonds } from '../hooks/vues'

const PLAN = `# PLAN — luna
- [ ] 4.38-P5 Phase 5 : vague finale 43 fils, note sur 100, latence face à 4.1.
  - [x] P4-18 (Evan : « chien », GO) agent c997c45a, ~/evan/luna-minimal/etape16/ : chien traité d'après les documents puis questions du logiciel ; contrôle
  - [x] P4-19 guidage, ton, complète ; fini quand vert
  - [ ] P4-20 fusion des étapes 16, 17 et 18 ; corriger à la fusion : langue mêlée sur le chien (camping néerlandais), « Je ne peux pas vérifier » sur le gîte, dates, terrains ; fini quand 0
  - [ ] P4-21 (Evan 27/10 : « je veux un 100% ») : définition de « 100 % » à valider avec Evan, puis chaque reproche corrigé ; on arrête si 4.1 bouge.
    Evan 27/10 : « Q1 oui » ; « Dates refusées … ». À corriger avec P4-20 : dates concrètes proposées après un refus de règle de séjour ; plusieurs terrains : la réponse dit ce qui est traité ; 0 adulte envoyé. Fini quand chacun est à 0.
  - [ ] P4-25 ARRÊTÉE 27/10 ancienne piste
  - [ ] P4-22 ton jugé par Evan lui-même, en fin de chantier.
`
const JOURNAL = 'Agent 51807f9e (étape 20, P4-20/21) lancé\nAgent deadbeef (étape 9, P4-22) lancé\n'
const VIVANTS = [{ id: '51807f9e-0000', depuis: 29 * 60 }]

const CAHIER = `CAHIER DES CHARGES — dépôt x

================================================================
CHANTIER 1 — Reconstruire le chatbot avec luna
================================================================

OBJECTIF
Un chatbot sur luna qui fait mieux que la prod d'aujourd'hui
(gpt-4.1), atteint le plus vite possible.
Tes mots (19/10) :
  - « faire mieux »

FINI QUAND
  Sur des vagues de vraies conversations rejouées et jugées à l'aveugle
  contre la réponse de la prod (méthode déjà utilisée en septembre) :
  - ✓ luna gagne plus souvent qu'elle ne perd face à la prod ;
  - le visiteur n'a pas à se répéter plus souvent qu'avec la prod ;
  ✓ Le temps de réponse est mesuré à chaque vague et montré à côté.
  Ajout d'Evan le 21/10 au matin :
  - la réponse complète arrive au plus 1 seconde après celle de 4.1, sur les mêmes questions.
    Précision d'Evan (21/10) : sur CHAQUE question.
  Puis tu décides du passage sur luna.


================================================================
HORS CHANTIER — noté pour mémoire
================================================================
`

const RAM: Ram = {
  quand: '2026-10-27T16:46:31',
  total: 64_000_000,
  dispo: 50_000_000,
  coeurs: 16,
  cpu_pris: 262,
  cpu_irq: 1.7,
  cpu_non_attribue: 0,
  noyau_ko: 5_000_000,
  noyau_detail: [['tables du noyau', 2_800_000]],
  familles: [
    { nom: 'sessions Claude', ko: 3_000_000, cpu: 135.2, n: 10, detail: [['thundder-5a', 400_000, 19.3, 1]] },
    { nom: 'Chrome', ko: 4_500_000, cpu: 12.3, n: 36, detail: [['chrome rendu', 3_800_000, 7.3, 25], ['chrome gpu', 200_000, 1, 1]] },
    { nom: 'python (bancs)', ko: 40_000, cpu: 72.1, n: 6, detail: [['pytest', 30_000, 70, 1]] },
    { nom: 'système', ko: 600_000, cpu: 23.6, n: 290, detail: [['Xorg', 40_000, 1.7, 1]] },
    { nom: 'autre', ko: 860_000, cpu: 21.6, n: 116, detail: [['xargs', 1000, 17.3, 1]] },
  ],
}

describe('plan en arbre', () => {
  test('titres courts : ni numéro, date, heure, parenthèse, identifiant, chemin ni statut', async () => {
    expect(titreEtape("(Evan : « chien », GO) agent c997c45a, ~/evan/luna-minimal/etape16/ : chien traité d'après les documents ; contrôle")).toBe("Chien traité d'après les documents")
    expect(titreEtape('Phase 5 : vague finale 43 fils, note sur 100, latence face à 4.1.')).toBe('Vague finale 43 fils, note sur 100, latence face à 4.1')
    expect(titreEtape('ARRÊTÉE 27/10 14:05 ancienne piste')).toBe('Ancienne piste')
  })
  test('sous-étapes : la liste énumérée, sans les citations d’Evan', async () => {
    expect(sousEtapes("fusion des étapes 16, 17 et 18 ; corriger à la fusion : langue mêlée sur le chien (nl), « Je ne peux pas » sur le gîte, dates ; fini quand 0").slice(0, 2)).toEqual(['Langue mêlée sur le chien', '« Je ne peux pas » sur le gîte'])
    const p = planPanneau(PLAN, JOURNAL, VIVANTS)!
    expect(p.etapes[1]!.sous.slice(0, 2)).toEqual(['Dates concrètes proposées après un refus de règle de séjour', 'Plusieurs terrains'])
  })
  test('en cours = étapes citées par un agent vivant (plusieurs), puis la suivante non écartée', async () => {
    expect([...lancees(JOURNAL, VIVANTS).keys()]).toEqual(['P4-20', 'P4-21'])
    const p = planPanneau(PLAN, JOURNAL, VIVANTS)!
    expect(p.phase).toBe('Vague finale 43 fils, note sur 100, latence face à 4.1')
    expect(p.etapes.map(e => [e.titre, e.etat, e.meta])).toEqual([
      ['Fusion des étapes 16, 17 et 18', 'encours', 'agent · 29 min'],
      ['Définition de « 100 % » à valider avec Evan', 'encours', 'même agent'],
      ['Ton jugé par Evan lui-même, en fin de chantier', 'ensuite', 'ensuite'],
    ])
    expect([p.faites.length, p.total]).toEqual([2, 6])
  })
  test('sans agent vivant : la première case non cochée est en cours', async () => {
    const p = planPanneau('- [x] 1. Maquette\n- [ ] 2. Mesure processeur\n- [ ] 3. Code du mod', '', [])!
    expect(p.etapes.map(e => [e.titre, e.etat])).toEqual([['Mesure processeur', 'encours'], ['Code du mod', 'ensuite']])
  })
  test('filtre « non fini » : sans les faites par défaut, avec elles barrées, 3 dernières puis le compte', async () => {
    const p = { phase: 'P', titre: 'T', faites: ['a', 'b', 'c', 'd', 'e'], total: 7, etapes: [{ titre: 'x', sous: ['s1', 's2', 's3'], etat: 'encours' as const, meta: 'm' }, { titre: 'y', sous: [], etat: 'ensuite' as const, meta: 'ensuite' }] }
    expect(lignesArbre(p, false, 3, 2).map(l => l.prefixe + l.icone + l.texte + (l.droite ? ` | ${l.droite}` : ''))).toEqual(['├─ ● x | m', '│  ├─ s1', '│  └─ s2 | + 1 autre', '└─ ○ y | ensuite'])
    const avec = lignesArbre(p, true, 3, 2)
    expect(avec.filter(l => l.sorte === 'fait').map(l => l.texte)).toEqual(['c', 'd', 'e'])
    expect(avec[0]!.texte).toBe('2 faites plus tôt')
    expect(arbreAuPlus(p, true, 7).length).toBeLessThanOrEqual(6)
    expect(arbreAuPlus(p, true, 7).some(l => l.sorte === 'encours')).toBe(true)
  })
})

describe('cahier des charges', () => {
  test('objectif en une phrase, chantier courant', async () => {
    expect(objectif(CAHIER, '1')).toBe("Un chatbot sur luna qui fait mieux que la prod d'aujourd'hui (gpt-4.1), atteint le plus vite possible.")
    const lie = chantierLie(CAHIER, '# Plan\nChantier : 1\n- [ ] a')!
    expect(lie.libelle).toBe('Chantier 1 · Reconstruire le chatbot avec luna')
    expect(lie.fini).toEqual(finiQuand(CAHIER, '1'))
    expect(chantierLie(CAHIER, '# Plan\n- [ ] a')).toBeNull()
    expect(chantierLie(CAHIER, '# Plan\nChantier : 9\n')).toBeNull()
  })
  test('cahier à points numérotés (claude-ecosystem) : le point nommé et ses fini quand', async () => {
    const cahier = 'CHANTIER : RÉGLAGES\n\nInclus\n  12. (Evan 27/10.) Fin de réponse : « Ce que tu dois faire ».\n     Fini quand : le style le dit.                     [fait]\n  13. (Evan 29/10.) Panneau et ligne du bas : une session = un plan.\n     Mots d\'Evan : « même plan ».\n     Fini quand : deux sessions montrent chacune leur plan ; aucune n\'est\n     déplacée ; validé par Evan.\n  14. Autre.\n\nExclu\n'
    const p = chantierLie(cahier, 'Chantier : 13 (cahier du 29/10)')!
    expect(p.libelle).toBe('Point 13 · Panneau et ligne du bas')
    expect(p.fini.map(f => [f.court, f.atteint])).toEqual([['Deux sessions montrent chacune leur plan', false], ["Aucune n'est déplacée", false], ['Validé par Evan', false]])
    expect(chantierLie(cahier, 'Chantier : 12')!.fini).toEqual([{ court: 'Le style le dit', long: 'Le style le dit', atteint: true }])
  })
  test('fini quand : une ligne courte par point, le long avec son introduction, atteints marqués, pas la décision', async () => {
    const f = finiQuand(CAHIER, '1')
    expect(f.map(p => [p.court, p.atteint])).toEqual([
      ["Luna gagne plus souvent qu'elle ne perd face à la prod", true],
      ["Le visiteur n'a pas à se répéter plus souvent qu'avec la prod", false],
      ['Le temps de réponse est mesuré à chaque vague et montré à côté', true],
      ['La réponse complète arrive au plus 1 seconde après celle de 4.1', false],
    ])
    expect(f[0]!.long).toStartWith('Sur des vagues de vraies conversations')
    expect(f[3]!.long).toEndWith('sur CHAQUE question.')
  })
  test('filtre « non fini » de fini quand', async () => {
    const f = finiQuand(CAHIER, '1')
    expect(nonFinis(f, true).length).toBe(4)
    expect(nonFinis(f, false).map(p => p.i)).toEqual([1, 3])
  })
})

// Forme « en ligne » des cahiers de xeko.ai et xeko-app.
const CAHIER_EN_LIGNE = `CAHIER DES CHARGES — dépôt xeko.ai (robot de création d'assistant)

Statut : section 1 validée par Evan le 27/10.

================================================================
CHANTIER 1 — Découverte des pages : sitemap toujours lu, sans plafond
================================================================
Mots d'Evan (27/10) : « des fois il récupère le sitemap ».

Objectif : à chaque création, la liste des pages = toutes les pages en français
du sitemap + celles que les liens trouvent en plus, sans plafond.

Inclus :
- sitemap toujours lu : robots.txt, racine du domaine ;
- plus de plafond de pages.

Exclu : pousser sur dev ou main, déployer.

Fini quand : sur les 3 sites du banc, la découverte rend au moins toutes les
pages FR du sitemap plus les pages trouvées par les liens hors sitemap
(Ardéchois ≥ 12, Arleblanc ≥ 107 + 4), sans adresse
fausse ; une création complète sur ces sites lit ces pages dans le budget de
temps ; tests du dépôt verts ; branche de travail poussée.

Ajout (Evan, 27/10, après relecture) — tracé au journal :
- Mots d'Evan : « on peut garder la limite à 100 fr ».
- Ajout aux « Fini quand » : au plus 100 pages FR découvertes, sitemap prioritaire ;
  toute page lue et facturée est envoyée à la base de connaissances (test qui
  échoue sur le code actuel) ; test de la protection contre les boucles de sitemaps.
`

describe('cahier : deux formes de rubrique', () => {
  test('« Objectif : … » et « Fini quand : … » en ligne : objectif et 7 points', async () => {
    expect(objectif(CAHIER_EN_LIGNE, '1')).toBe('À chaque création, la liste des pages = toutes les pages en français du sitemap + celles que les liens trouvent en plus, sans plafond.')
    const f = finiQuand(CAHIER_EN_LIGNE, '1')
    expect(f.length).toBe(7)
    expect(f.map(p => p.court).slice(1)).toEqual([
      'Une création complète sur ces sites lit ces pages dans le budget de temps',
      'Tests du dépôt verts',
      'Branche de travail poussée',
      'Au plus 100 pages FR découvertes, sitemap prioritaire',
      'Toute page lue et facturée est envoyée à la base de connaissances',
      'Test de la protection contre les boucles de sitemaps',
    ])
    expect(f[0]!.court).toStartWith('Sur les 3 sites du banc, la découverte rend au moins')
  })
  test('« OBJECTIF » / « FINI QUAND » seuls sur leur ligne : inchangé', async () => {
    expect(finiQuand(CAHIER, '1').length).toBe(4)
    expect(objectif(CAHIER, '1')).toStartWith('Un chatbot sur luna')
  })
  test('ligne courte : coupée aux virgules seulement si elle garde son sens', async () => {
    expect(courtFini('sur les 3 sites du banc, la découverte rend au moins toutes les pages FR du sitemap plus les liens, sans adresse fausse')).toBe('Sur les 3 sites du banc, la découverte rend au moins toutes les pages FR du sitemap plus les liens')
    expect(courtFini('sur les 3 sites du banc, la découverte rend au moins toutes les pages FR du sitemap plus les pages trouvées par les liens hors sitemap')).toStartWith('Sur les 3 sites du banc, la découverte')
    const l = lignesFini([{ court: 'x'.repeat(120), long: 'x'.repeat(120), atteint: false, i: 0 }, { court: 'Tests verts', long: 'Tests verts', atteint: false, i: 1 }], null, 88)
    expect(l[0]!.map(s => s.t).join('').length).toBe(88)
    expect(l[0]!.at(-1)!.t).toBe('▸')
    expect(l[0]![1]!.t.endsWith('…')).toBe(true)
    expect(l[1]!.some(s => s.t === '▸' || s.a !== undefined)).toBe(false)
  })
})

const PLAN_FINI = `# Plan — Chantier 1 : découverte des pages (sitemap + liens, sans plafond)

- [x] 1. Tests d'abord
- [x] 2. Lecture du sitemap
- [x] 3. Découverte
`

describe('plan fini', () => {
  test('titre du plan lu dans le fichier, toutes les étapes faites montrées barrées', async () => {
    const p = planPanneau(PLAN_FINI, '', [])!
    expect(p.titre).toBe('Découverte des pages (sitemap + liens, sans plafond)')
    expect(titrePlan('# Plan — reconstruire le chatbot luna (plan vivant global, version 2 du 19/10, GO Evan 19/10)')).toBe('Reconstruire le chatbot luna')
    expect(planFini(p)).toBe(true)
    const a = arbreAuPlus(p, false, 20)
    expect(a.map(l => [l.prefixe, l.texte, l.sorte])).toEqual([['├─ ', "Tests d'abord", 'fait'], ['├─ ', 'Lecture du sitemap', 'fait'], ['└─ ', 'Découverte', 'fait']])
    expect(arbreAuPlus(p, false, 3).map(l => l.texte)).toEqual(['2 faites plus tôt', 'Découverte'])
  })
})

describe('ronds mémoire et processeur', () => {
  test('quatre parts : système et autre = système + autre + noyau ; processeur sur 100 % de la machine', async () => {
    const m = partsMemoire(RAM)
    const c = partsProcesseur(RAM)
    expect(m.map(p => p.nom)).toEqual(['sessions Claude', 'Chrome', 'python (bancs)', 'système et autre'])
    expect(m[3]!.valeur).toBe(600_000 + 860_000 + 5_000_000)
    expect(Math.abs(c[3]!.valeur - (23.6 + 21.6 + 1.7))).toBeLessThan(1e-9)
    const p = propsRonds(RAM, 89)
    for (const r of p.ronds) expect(Math.abs(r.fractions.reduce((s, x) => s + x, 0) - 1)).toBeLessThan(1e-9)
    expect(p.ronds.map(r => r.totaux)).toEqual(['64 Go · 22 %', '16 cœurs · 16 %'])
    expect(p.ronds[1]!.parts[0]!.texte).toBe(' 8,4 %  sessions Claude')
    expect(p.ronds[0]!.parts[3]!.texte).toBe('  6,2 Go  système et autre')
    expect(new Set(p.ronds[0]!.parts.map(x => x.couleur)).size).toBe(4)
  })
  test('seuils rouges : mémoire libre sous 10 %, processeur au-delà de 95 %', async () => {
    expect(memoireRouge(62_000, 6_300)).toBe(false)
    expect(memoireRouge(62_000, 6_100)).toBe(true)
    expect(processeurRouge(1520, 16)).toBe(false)
    expect(processeurRouge(1521, 16)).toBe(true)
    expect(propsRonds({ ...RAM, dispo: 4_000_000 }, 89).ronds.map(r => r.rouge)).toEqual([true, false])
    expect(propsRonds({ ...RAM, cpu_pris: 1597 }, 89).ronds.map(r => r.rouge)).toEqual([false, true])
  })
  test('survol : rond ou ligne de légende → part ; sur le détail d’en face → rien', async () => {
    const p = propsRonds(RAM, 89, 12)
    const haut = hauteurRond(12)
    const sur = survolSous(p, null, 1 + p.cols * 0.75, haut / 3)
    expect(sur?.rond).toBe(0)
    expect(survolSous(p, sur, p.demi + 5, 2)).toBeNull()
    expect(survolSous(p, null, p.demi + 1 + 3, haut + 2 + 1.5)).toEqual({ rond: 1, part: 1 })
    expect(survolSous(p, null, p.demi + 1 + 3, haut + 1.5)).toBeNull()
    const d = lignesDetail(p.ronds[1]!.tableaux[3]!, 7)
    expect(d.length).toBeLessThanOrEqual(4)
    expect(d.at(-1)).not.toBeNull()
    expect(d.at(-1)!.entete).toBe(false)
  })
  test('lignes cliquables : action sous la souris, rien hors du texte', async () => {
    const lignes = [[{ t: '▾ ', c: '#000', a: 'plier:plan' }, { t: 'Plan', c: '#000', a: 'plier:plan' }, { t: '   ', c: '#000' }, { t: '[ ] x', c: '#000', a: 'planTout' }]]
    expect(actionSous({ lignes }, 3, 0.5)).toBe('plier:plan')
    expect(actionSous({ lignes }, 7, 0.5)).toBeNull()
    expect(actionSous({ lignes }, 10, 0.5)).toBe('planTout')
    expect(actionSous({ lignes }, 3, 1.5)).toBeNull()
  })
})

const PANE = {
  plugin: 'ecran',
  component: 'Pane',
  requestId: 'ecran-panneau',
  surface: 'terminal',
  props: { title: 'Où on en est', isFocused: false, bodyColumns: 89, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} },
} as const

const SUIVI: Suivi = {
  dossier: '/d/evan',
  projet: 'xeko-backend',
  chantier: 'Chantier 1 · Reconstruire',
  objectif: 'Un chatbot.',
  plan: planPanneau(PLAN, JOURNAL, VIVANTS),
  planNom: 'luna',
  fini: finiQuand(CAHIER, '1'),
}

type Trouve = { type?: string; key?: string; props?: Record<string, unknown>; children?: unknown[]; text?: string }
const aplatir = (x: unknown): string => (typeof x === 'string' ? x : ((x as Trouve).children ?? []).map(aplatir).join(''))
const textes = (x: unknown): Trouve[] => (typeof x === 'string' ? [] : [x as Trouve, ...((x as Trouve).children ?? []).flatMap(textes)]).filter(t => t.type === 'Text')

describe('panneau monté', () => {
  const monter = async ($: Parameters<TestBody>[0], on: Parameters<TestBody>[1], suivi: Suivi, ram: Ram, gardes: Record<string, unknown> = {}) => {
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    on('ui.open', () => ({ value: { isPlaced: true } }))
    on('store.set', (_, e) => {
      gardes[e.key] = e.value
      return { value: undefined }
    })
    const semees: Record<string, unknown> = { suivi: { shape: FORMAT, value: suivi }, ram: { shape: FORMAT, value: ram } }
    on('state.get', (_, e, next) => (e.key in semees ? { value: { value: semees[e.key], version: 1 } } : next(e)))
    return $.ui.mount(PANE)
  }

  test('clics par les lignes cliquables : barré, ouvrir, boutons « non fini », plier ; hauteur remplie, marge à droite', async ($, on) => {
    const gardes: Record<string, unknown> = {}
    const ui = await monter($, on, SUIVI, RAM, gardes)
    expect(await ui.find({ type: 'Text', text: /Fusion des étapes 16, 17 et 18/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Chien traité/ })).toBeUndefined()
    expect(await ui.find({ type: 'Button' })).toBeUndefined()

    const court = await ui.find({ type: 'Text', text: /^Luna gagne plus souvent/, in: 'l-fini-lignes' })
    expect(court?.props.strikethrough).toBe(true)
    await ui.post({ action: 'ouvrir:0' }, { in: 'l-fini-lignes' })
    const longues = (await ui.findAll({ type: 'Text', in: 'l-fini-lignes' })).filter(t => t.props.strikethrough === true)
    expect(longues.map(t => t.text).join(' ')).toContain('Sur des vagues de vraies conversations')
    expect(longues.length).toBeGreaterThan(1)

    const lignes = () => ui.findAll({ type: 'Text', text: /^(Luna|Le |La )/, in: 'l-fini-lignes' })
    expect((await lignes()).length).toBe(3)
    await ui.pointer({ type: 'down', x: 60, y: 0, button: 'left', in: 'l-fini' })
    expect((await lignes()).length).toBe(2)

    await ui.post({ action: 'planTout' }, { in: 'l-plan' })
    expect((await ui.find({ type: 'Text', text: /^Chien traité/ }))?.props.strikethrough).toBe(true)
    expect(gardes).toEqual({ finiTout: false, planTout: true })

    await ui.pointer({ type: 'down', x: 3, y: 0, button: 'left', in: 'l-plan' })
    expect(await ui.find({ type: 'Text', text: /Fusion des étapes/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /« à toi »|à toi|survol/ })).toBeUndefined()

    const racine = (await ui.findAll({ type: 'Box' }))[0]!
    expect(racine.props.width).toBe(88)
    expect(racine.props.height).toBe(60)
    for (const c of await ui.findAll({ type: 'Client' })) expect(Number(c.props.width)).toBeLessThanOrEqual(88)
    await ui.unmount()
  })

  test('survol sans fond : le texte de la zone change de couleur, aucun fond', async ($, on) => {
    const ui = await monter($, on, SUIVI, RAM)
    const titre = async () => ui.find({ type: 'Text', text: /^Plan$/, in: 'l-plan' })
    expect((await titre())?.props.color).toBe('#D97757')
    await ui.pointer({ type: 'move', x: 3, y: 0, in: 'l-plan' })
    expect((await titre())?.props.color).toBe(CHAUD)
    for (const t of await ui.findAll({ type: 'Text', in: 'l-plan' })) expect(t.props.backgroundColor).toBeUndefined()
    expect((await ui.find({ type: 'Text', text: /seulement ce qui/, in: 'l-plan' }))?.props.color).not.toBe(CHAUD)
    await ui.pointer({ type: 'leave', x: 3, y: 0, in: 'l-plan' })
    expect((await titre())?.props.color).toBe('#D97757')
    await ui.unmount()
  })

  test('totaux au-dessus des légendes : couleur du texte, rouge franc si critique', async ($, on) => {
    const ui = await monter($, on, SUIVI, RAM)
    expect((await ui.find({ type: 'Text', text: /^64 Go · 22 %$/, in: 'ronds-v4' }))?.props.color).toBe('#E1DDD2')
    expect((await ui.find({ type: 'Text', text: /^16 cœurs · 16 %$/, in: 'ronds-v4' }))?.props.color).toBe('#E1DDD2')
    await ui.unmount()
  })

  test('totaux en rouge franc : mémoire libre < 10 %, processeur > 95 %', async ($, on) => {
    const ui = await monter($, on, SUIVI, { ...RAM, dispo: 4_000_000, cpu_pris: 1597 })
    expect((await ui.find({ type: 'Text', text: /^\d+ Go · /, in: 'ronds-v4' }))?.props.color).toBe(ROUGE)
    expect((await ui.find({ type: 'Text', text: /^16 cœurs · 100 %$/, in: 'ronds-v4' }))?.props.color).toBe(ROUGE)
    expect(ROUGE).not.toBe('#D97757')
    await ui.unmount()
  })

  test('plan fini : « k faites sur k · plan fini », étapes barrées', async ($, on) => {
    const ui = await monter($, on, { ...SUIVI, plan: planPanneau(PLAN_FINI, '', []), planNom: 'sitemap' }, RAM)
    expect(await ui.find({ type: 'Text', text: /^3 faites sur 3 · plan fini$/, in: 'l-plan' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /seulement ce qui/, in: 'l-plan' })).toBeUndefined()
    expect((await ui.find({ type: 'Text', text: /^Découverte$/ }))?.props.strikethrough).toBe(true)
    expect(await ui.find({ type: 'Text', text: /^PLAN-sitemap\.md$/ })).toBeDefined()
    await ui.unmount()
  })

  test('survol d’une part : seul le dessin d’en face change ; totaux, légendes et rond survolé identiques', async ($, on) => {
    const ui = await monter($, on, SUIVI, RAM)
    const colonnes = async () => {
      const boites = await ui.findAll({ type: 'Box', in: 'ronds-v4' })
      return ['m0', 'm1'].map(k => (boites.find(b => b.key === k)!.children as unknown[]).map(x => ({ texte: aplatir(x), json: JSON.stringify(x), couleurs: textes(x).map(t => t.props?.color ?? '') })))
    }
    const avant = await colonnes()
    const p = propsRonds(RAM, 89)
    const haut = (await ui.findAll({ type: 'Box', in: 'ronds-v4' })).find(b => b.key === 'm0')!.children.length - 2 - 4
    for (const rond of [0, 1]) {
      for (let part = 0; part < 4; part++) {
        const x = (rond === 0 ? 0 : p.demi + 1) + 3
        const y = haut + 2 + part
        await ui.pointer({ type: 'move', x, y, in: 'ronds-v4' })
        const apres = await colonnes()
        const ici = apres[rond]!
        const face = apres[1 - rond]!
        for (let k = 0; k < ici.length; k++) {
          if (k === haut + 2 + part) {
            expect(ici[k]!.texte).toBe(avant[rond]![k]!.texte)
            expect(ici[k]!.couleurs.at(-1)).toBe(SURVOL)
          } else expect(ici[k]!.json).toBe(avant[rond]![k]!.json)
        }
        for (let k = haut; k < face.length; k++) expect(face[k]!.json).toBe(avant[1 - rond]![k]!.json)
        expect(face.length).toBe(avant[1 - rond]!.length)
        expect(face[0]!.texte).toStartWith('Détail · ')
        await ui.pointer({ type: 'leave', x, y, in: 'ronds-v4' })
      }
    }
    expect(JSON.stringify(await colonnes())).toBe(JSON.stringify(avant))
    await ui.unmount()
  })
})

describe('rechargement à chaud', () => {
  test('rond : les données de l’ancien code (instance gardée par le moteur) ne sont pas dessinées', async () => {
    expect(propsValides({ cols: 32, rangs: 5, demi: 44, ronds: [{ titre: 'Mémoire', chiffres: '', rouge: false, sousTitre: '', fractions: [1], parts: [], tableaux: [] }] })).toBe(false)
    expect(propsValides(propsRonds(RAM, 89))).toBe(true)
  })
  test('suivi et ram au format d’avant le panneau : lus comme non lus, le panneau se dessine', async ($, on) => {
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    const anciens: Record<string, unknown> = {
      suivi: { dossier: '/d/evan', projet: 'xeko-backend', arbre: null, source: null },
      ram: { total: 64_000_000, dispo: 50_000_000, autres: 1_000_000, parts: [{ nom: 'Chrome', ko: 4_500_000, detail: [['chrome', 4_500_000]] }] },
    }
    on('state.get', (_, e, next) => (e.key in anciens ? { value: { value: anciens[e.key], version: 1 } } : next(e)))
    const ui = await $.ui.mount(PANE)
    expect(await ui.find({ type: 'Text', text: /Lecture du dossier evan/ })).toBeDefined()
    await ui.unmount()
  })
})

describe('ligne sous la saisie (27/10)', () => {
  const DONNEES = {
    tokens: 412_000, fenetre: 1_000_000, quotas: [{ nom: '5 h', pct: 54 }, { nom: 'semaine', pct: 39 }], cout: null, tours: [], contextes: [], agents: [],
    plan: null, travaille: true, memoire: null, taches: [],
  }
  test('la même que le bas du panneau, avec contexte, sans état ni signe', async ($, on) => {
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    on('ui.open', () => ({ value: { isPlaced: true } }))
    const semees: Record<string, unknown> = { suivi: { shape: FORMAT, value: SUIVI }, ram: { shape: FORMAT, value: RAM }, donnees: DONNEES, place: false }
    on('state.get', (_, e, next) => (e.key in semees ? { value: { value: semees[e.key], version: 1 } } : next(e)))
    const panneau = await $.ui.mount(PANE)
    const plusLong = (ts: { text: string }[]) => ts.map(t => t.text).sort((x, y) => y.length - x.length)[0]
    const bas = plusLong(await panneau.findAll({ type: 'Text', text: /^5 h / }))
    const saisie = await $.ui.mount({ plugin: 'ecran', surface: 'terminal', component: 'PromptHint', props: { isDraft: false, isWorking: true, hint: '⏵⏵ auto mode on (shift+tab to cycle)' } })
    const ligne = (await saisie.findAll({ type: 'Text' })).sort((x, y) => y.text.length - x.text.length)[0]
    const faits = SUIVI.plan!.faites.length
    const texte = ligne!.text
    expect(texte).toBe(`5 h 54 % │ semaine 39 % │ plan ${faits}/${SUIVI.plan!.total} │ agents 0 │ contexte 41 %`)
    expect(bas?.trimEnd()).toBe(texte)
    expect(texte).not.toMatch(/à toi|travaille|attend|[❗◐●✅❓○✓]/i)
    const couleurs = (await saisie.findAll({ type: 'Text' })).filter(t => t !== ligne).map(t => [t.text, t.props.color])
    expect(couleurs).toContainEqual(['5 h ', A.gris])
    expect(couleurs).toContainEqual(['54 %', A.vert])
    expect(couleurs).toContainEqual(['0', A.bleu])
    expect(couleurs).toContainEqual([' │ ', A.trait])
    expect(couleurs).toContainEqual(['contexte ', A.gris])
    await panneau.unmount()
    await saisie.unmount()
  })
  test('panneau posé : rien sous la saisie, la ligne est déjà en bas du panneau (28/10)', async ($, on) => {
    const semees: Record<string, unknown> = { donnees: DONNEES, place: true }
    on('state.get', (_, e, next) => (e.key in semees ? { value: { value: semees[e.key], version: 1 } } : next(e)))
    const saisie = await $.ui.mount({ plugin: 'ecran', surface: 'terminal', component: 'PromptHint', props: { isDraft: false, isWorking: true, hint: '⏵⏵ auto mode on (shift+tab to cycle)' } })
    expect((await saisie.findAll({ type: 'Text' })).map(t => t.text).join('')).toBe('')
    await saisie.unmount()
  })
  test('bande au-dessus de la saisie : plus de « travaille » ni « à toi »', async ($, on) => {
    const semees: Record<string, unknown> = { place: false, petit: false }
    on('state.get', (_, e, next) => (e.key in semees ? { value: { value: semees[e.key], version: 1 } } : next(e)))
    on('ui.render', { component: 'AbovePrompt' }, async ($, e) => h($.ui.resolve(e).Text, null, 'MOTEUR') as never)
    const ui = await $.ui.mount({ plugin: 'ecran', surface: 'terminal', component: 'AbovePrompt', props: { bodyColumns: 160 } as never })
    const tout = (await ui.findAll({ type: 'Text' })).map(t => t.text).join(' ')
    expect(tout.length).toBeGreaterThan(0)
    expect(tout).not.toMatch(/à toi|travaille|[❗◐●✅❓○]/)
    await ui.unmount()
  })
})

describe('une seule ligne en bas (27/10, 20:08)', () => {
  const monterBande = async ($: Parameters<TestBody>[0], on: Parameters<TestBody>[1], d: Record<string, unknown>) => {
    const semees: Record<string, unknown> = { place: false, petit: false, donnees: d }
    on('state.get', (_, e, next) => (e.key in semees ? { value: { value: semees[e.key], version: 1 } } : next(e)))
    on('ui.render', { component: 'AbovePrompt' }, async ($, e) => h($.ui.resolve(e).Text, null, 'MOTEUR') as never)
    return $.ui.mount({ plugin: 'ecran', surface: 'terminal', component: 'AbovePrompt', props: { bodyColumns: 120 } as never })
  }
  const D = { tokens: 290_000, fenetre: 1_000_000, quotas: [{ nom: '5 h', pct: 0 }, { nom: 'semaine', pct: 43 }], cout: 1.5, tours: [], contextes: [], agents: [], plan: { nom: 'p', faits: 5, total: 6 }, travaille: false, memoire: 40, taches: [] }
  test('plus de bande « ctx │ 5 h │ semaine │ plan │ agents » au-dessus de la saisie', async ($, on) => {
    const ui = await monterBande($, on, D)
    const tout = (await ui.findAll({ type: 'Text' })).map(t => t.text).join(' ')
    expect(tout).toBe('MOTEUR')
    await ui.unmount()
  })
  test('mémoire basse : la bande ne garde que ça', async ($, on) => {
    const ui = await monterBande($, on, { ...D, memoire: 2.4 })
    const tout = (await ui.findAll({ type: 'Text' })).map(t => t.text).join(' ')
    expect(tout).toBe('mémoire 2,4 Go libres')
    await ui.unmount()
  })
  test('quota 5 h remis à zéro : 0 % au lieu de disparaître', () => {
    const avant = [{ nom: '5 h', pct: 78, fin: '2026-10-27T19:00:00Z' }, { nom: 'semaine', pct: 43, fin: '2026-11-01T00:00:00Z' }]
    const apres = Date.parse('2026-10-27T19:05:00Z')
    const semaine = [{ kind: 'seven_day', percentUsed: 43, resetsAt: '2026-11-01T00:00:00Z' }]
    expect(quotasVus(semaine, avant, apres)).toEqual([{ nom: '5 h', pct: 0, fin: '2026-10-27T19:00:00Z' }, avant[1]])
    // Avant la remise, une fenêtre absente reste absente ; une nouvelle mesure remplace tout.
    expect(quotasVus(semaine, avant, Date.parse('2026-10-27T18:00:00Z'))).toEqual([avant[1]])
    expect(quotasVus([{ kind: 'five_hour', percentUsed: 2, resetsAt: '2026-10-28T00:00:00Z' }, ...semaine], avant, apres).map(q => q.pct)).toEqual([2, 43])
    expect(quotasVus([], [], apres)).toEqual([])
  })
  test('mesure hors délai : journal de débogage seulement', () => {
    expect(horsDelai(new Error('ecran: $.process.run(sh) aborted: still running after 2000ms'))).toBe(true)
    expect(horsDelai(new Error('ENOENT'))).toBe(false)
  })
})
