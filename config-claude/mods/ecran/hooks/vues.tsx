import type { ElementTable, RenderElement } from 'claude-code'

import type { Donnees, Famille, PointFini, Ram, Suivi, Tache } from '../types'
import type { PropsLignes, Seg } from './ligne-client'
import { arbreAuPlus, memoireRouge, nonFinis, planFini, processeurRouge } from './panneau'
import type { LigneArbre } from './panneau'
import { hauteurRonds } from './ronds-client'
import type { PropsRonds, Tableau } from './ronds-client'

export type El = ElementTable<'terminal'>
export type Cadre = { colonnes: number; lignes: number }

export const P = {
  texte: '#cdd6f4',
  gris: '#6c7086',
  fond: '#313244',
  vert: '#a6e3a1',
  jaune: '#f9e2af',
  orange: '#fab387',
  rouge: '#f38ba8',
  bleu: '#89b4fa',
  violet: '#cba6f7',
  cyan: '#94e2d5',
  rose: '#f5c2e7',
}

export const pctContexte = (d: Donnees) => (d.tokens === null ? null : Math.round((d.tokens / d.fenetre) * 100))

// Bande « ligne » : ses valeurs (contexte, quotas, plan, agents) sont déjà sur la ligne sous la saisie (27/10).
// Elle ne reste que pour une mémoire basse, que la ligne ne montre pas ; sinon rien, et le moteur dessine la sienne.
export function vueLigne(E: El, d: Donnees) {
  if (d.memoire === null || d.memoire >= 3) return null
  return (
    <E.Box marginTop={1}>
      <E.Text color={P.rouge}>mémoire {d.memoire.toFixed(1).replace('.', ',')} Go libres</E.Text>
    </E.Box>
  )
}

// Panneau « où on en est », maquette v4b : toute la hauteur remplie, espace réparti, une colonne de marge à droite.
export const A = {
  blanc: '#F0EEE6',
  texte: '#E1DDD2',
  gris: '#98928A',
  trait: '#4E4A44',
  sable: '#B5AFA3',
  orange: '#D97757',
  vert: '#94C59C',
  bleu: '#8FB3D9',
  jaune: '#E3B66A',
  alerte: '#E3B66A',
  rouge: '#E8857A',
}

export type Actions = { plier: (id: string) => void; planTout: () => void; finiTout: () => void; ouvrir: (i: number) => void }
export type Reglages = { plis: readonly string[]; planTout: boolean; finiTout: boolean; finiOuvert: number | null }

export function agir(a: Actions, action: string) {
  const [verbe, arg] = action.split(':')
  if (verbe === 'plier' && arg) a.plier(arg)
  else if (verbe === 'planTout') a.planTout()
  else if (verbe === 'finiTout') a.finiTout()
  else if (verbe === 'ouvrir' && arg !== undefined && /^\d+$/.test(arg)) a.ouvrir(Number(arg))
}

const seuil = (pct: number) => (pct >= 90 ? A.rouge : pct >= 75 ? A.alerte : A.vert)

export function morceauxBas(d: Donnees, plan: { faits: number; total: number } | null): [string, string, string][] {
  return [
    ...d.quotas.map(q => [`${q.nom} `, `${Math.round(q.pct)} %`, seuil(q.pct)] as [string, string, string]),
    ...(plan === null ? [] : [['plan ', `${plan.faits}/${plan.total}`, A.vert] as [string, string, string]]),
    ['agents ', String(d.taches.filter(t => t.sorte === 'agent').length), A.bleu],
    ...(pctContexte(d) === null ? [] : [['contexte ', `${pctContexte(d)} %`, seuil(pctContexte(d)!)] as [string, string, string]]),
  ]
}

export const planBas = (s: Suivi | null, d: Donnees) => (s?.plan ? { faits: s.plan.faites.length, total: s.plan.total } : d.plan)

// La ligne du bas du panneau, la même sous la saisie : libellés gris, valeurs vertes, agents bleu, séparateurs │.
export const segsBas = (d: Donnees, plan: { faits: number; total: number } | null): Seg[] =>
  morceauxBas(d, plan).flatMap(([l, v, coul], i) => [...(i > 0 ? [{ t: ' │ ', c: A.trait }] : []), { t: l, c: A.gris }, { t: v, c: coul }])

export function vueBas(E: El, segs: Seg[]) {
  return (
    <E.Box flexDirection="row">
      {texteSegs(E, segs, 'bas')}
    </E.Box>
  )
}

const longueurTexte = (t: string) => [...t].length
export const couperA = (t: string, n: number) => (n <= 0 ? '' : longueurTexte(t) <= n ? t : `${[...t].slice(0, n - 1).join('')}…`)

export function envelopper(t: string, n: number) {
  const lignes: string[] = []
  let cour = ''
  for (const mot of t.split(' ')) {
    if (cour !== '' && longueurTexte(cour) + 1 + longueurTexte(mot) > n) {
      lignes.push(cour)
      cour = mot
    } else cour = cour === '' ? mot : `${cour} ${mot}`
  }
  return [...lignes, cour].map(l => couperA(l, n))
}

// Une ligne de W colonnes : la gauche coupée (…) pour laisser la droite entière, puis des espaces jusqu'à la droite.
export function aligner(gauche: Seg[], droite: Seg[], W: number): Seg[] {
  const ld = droite.reduce((n, s) => n + longueurTexte(s.t), 0)
  const place = Math.max(0, W - ld - (ld > 0 ? 1 : 0))
  const out: Seg[] = []
  let n = 0
  for (const s of gauche) {
    if (n >= place) break
    const t = couperA(s.t, place - n)
    out.push({ ...s, t })
    n += longueurTexte(t)
  }
  if (ld > 0) out.push({ t: ' '.repeat(Math.max(0, W - n - ld)), c: A.gris }, ...droite)
  return out
}

function texteSegs(E: El, segs: Seg[], cle: string) {
  return (
    <E.Text key={cle} wrap="truncate-end">
      {segs.length === 0 ? ' ' : segs.map((s, i) => <E.Text key={`s${i}`} color={s.c} bold={s.g === true} strikethrough={s.b === true}>{s.t}</E.Text>)}
    </E.Text>
  )
}

function cliquable(E: El, cle: string, lignes: Seg[][], W: number) {
  return <E.Client key={cle} module="./ligne-client.tsx" props={{ lignes } satisfies PropsLignes} width={W} height={lignes.length} />
}

export const SECTIONS: Record<string, [string, string]> = {
  plan: ['Plan', A.orange],
  fini: ['Fini quand', A.vert],
  taches: ['Workflows · agents · shells', A.bleu],
  ronds: ['Mémoire · processeur', A.jaune],
}

export function ligneEntete(id: string, ouvert: boolean, droite: Seg[], W: number, titre?: Seg[]): Seg[] {
  const a = `plier:${id}`
  const [nom, couleur] = SECTIONS[id] ?? [id, A.blanc]
  return aligner([{ t: ouvert ? '▾ ' : '▸ ', c: A.gris, a }, ...(titre ?? [{ t: nom, c: couleur, g: true }]).map(s => ({ ...s, a }))], droite, W)
}

const boutonSegs = (action: string, coche: boolean): Seg => ({ t: `[${coche ? '✓' : ' '}] seulement ce qui n'est pas fini`, c: A.texte, a: action })

const SORTES: Record<Tache['sorte'], { icone: string; couleur: string; titre: string }> = {
  workflow: { icone: '◆', couleur: A.jaune, titre: 'workflow' },
  agent: { icone: '●', couleur: A.orange, titre: 'agent' },
  shell: { icone: '$', couleur: A.sable, titre: 'shell' },
}
const MAX_TACHES = 6

export const dureeCourte = (s: number) => (s < 60 ? `${s} s` : s < 3600 ? `${Math.floor(s / 60)} min` : `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`)

export function regrouper(taches: readonly Tache[]) {
  const groupes: (Tache & { n: number })[] = []
  for (const t of taches) {
    const cle = t.nom.replace(/ lot\s*\d+$/, '')
    const g = groupes.find(x => x.sorte === t.sorte && x.nom === cle)
    if (g) {
      g.n++
      g.depuis = Math.max(g.depuis, t.depuis)
    } else groupes.push({ ...t, nom: cle, n: 1 })
  }
  return groupes.map(g => (g.n > 1 ? { ...g, nom: `${g.nom} · ${g.n} lots` } : g))
}

export const hauteurTaches = (taches: readonly Tache[]) => {
  const n = regrouper(taches).length
  return 1 + Math.max(1, Math.min(n, MAX_TACHES)) + (n > MAX_TACHES ? 1 : 0)
}

export function lignesTaches(taches: readonly Tache[], W: number): Seg[][] {
  const g = regrouper(taches)
  if (g.length === 0) return [[{ t: '  rien en cours', c: A.gris }]]
  return [
    ...g.slice(0, MAX_TACHES).map(t =>
      aligner([{ t: `  ${SORTES[t.sorte].icone} `, c: SORTES[t.sorte].couleur, g: true }, { t: SORTES[t.sorte].titre.padEnd(9), c: A.sable }, { t: t.nom, c: A.texte }], [{ t: dureeCourte(t.depuis), c: A.gris }], W),
    ),
    ...(g.length > MAX_TACHES ? [[{ t: `    + ${g.length - MAX_TACHES} autres`, c: A.gris }]] : []),
  ]
}

const STYLE_ARBRE: Record<LigneArbre['sorte'], { icone: string; texte: string; gras: boolean; barre: boolean }> = {
  encours: { icone: A.orange, texte: A.blanc, gras: true, barre: false },
  ensuite: { icone: A.gris, texte: A.texte, gras: false, barre: false },
  sous: { icone: A.gris, texte: A.sable, gras: false, barre: false },
  fait: { icone: A.vert, texte: A.gris, gras: false, barre: true },
  resume: { icone: A.vert, texte: A.gris, gras: false, barre: false },
}

export function segsArbre(l: LigneArbre, W: number): Seg[] {
  const s = STYLE_ARBRE[l.sorte]
  return aligner(
    [{ t: l.prefixe, c: A.trait }, ...(l.icone !== '' ? [{ t: l.icone, c: s.icone, g: l.sorte === 'encours' }] : []), { t: l.texte, c: s.texte, g: s.gras, b: s.barre }],
    l.droite !== '' ? [{ t: l.droite, c: A.gris }] : [],
    W,
  )
}

export const ouvrable = (p: PointFini, W: number) => p.long !== p.court || longueurTexte(p.court) > W - 4

export function lignesFini(points: readonly (PointFini & { i: number })[], ouvert: number | null, W: number): Seg[][] {
  return points.flatMap(p => {
    const a = ouvrable(p, W) ? `ouvrir:${p.i}` : undefined
    const couleur = p.atteint ? A.gris : A.texte
    const puce: Seg = { t: p.atteint ? '✓ ' : '· ', c: p.atteint ? A.gris : A.vert }
    const morceaux = p.i === ouvert && a ? envelopper(p.long, W - 4) : [couperA(p.court, W - 4)]
    return morceaux.map((t, k) => {
      const segs: Seg[] = [k === 0 ? puce : { t: '  ', c: A.gris }, { t, c: couleur, b: p.atteint, ...(a ? { a } : {}) }]
      if (k === 0 && a) segs.push({ t: ' '.repeat(Math.max(1, W - 3 - longueurTexte(t))), c: A.gris, a }, { t: p.i === ouvert ? '▾' : '▸', c: A.gris, a })
      return segs
    })
  })
}

export const TEINTES: Record<string, string> = {
  'sessions Claude': '#D97757',
  Chrome: '#F5C6A8',
  'python (bancs)': '#6E3524',
  'système et autre': '#A65F40',
}
const PROPRES = ['sessions Claude', 'Chrome', 'python (bancs)']
const GO = 1024 ** 2

const virgule = (n: number, d = 1) => n.toFixed(d).replace('.', ',')
export const go = (ko: number) => `${virgule(ko / GO)} Go`

type Part = { nom: string; ko: number; cpu: number; familles: Famille[] }

// Quatre parts : les trois familles nommées, puis « système et autre » = système + autre + noyau (et toute famille inconnue).
export function parts(r: Ram): Part[] {
  const propres = PROPRES.map(nom => r.familles.find(f => f.nom === nom) ?? { nom, ko: 0, cpu: 0, n: 0, detail: [] })
  const reste = r.familles.filter(f => !PROPRES.includes(f.nom))
  return [
    ...propres.map(f => ({ nom: f.nom, ko: f.ko, cpu: f.cpu, familles: [f] })),
    { nom: 'système et autre', ko: reste.reduce((s, f) => s + f.ko, 0) + r.noyau_ko, cpu: reste.reduce((s, f) => s + f.cpu, 0) + r.cpu_irq + r.cpu_non_attribue, familles: reste },
  ]
}

export const partsMemoire = (r: Ram) => parts(r).map(p => ({ nom: p.nom, valeur: p.ko, couleur: TEINTES[p.nom]! }))
export const partsProcesseur = (r: Ram) => parts(r).map(p => ({ nom: p.nom, valeur: p.cpu, couleur: TEINTES[p.nom]! }))

const fractions = (valeurs: readonly number[]) => {
  const somme = valeurs.reduce((s, v) => s + v, 0)
  return somme > 0 ? valeurs.map(v => v / somme) : valeurs.map(() => 1 / valeurs.length)
}

const pctTexte = (p: number) => (p < 10 ? `${virgule(p)} %` : `${Math.round(p)} %`)

// Processeur sur une base de 100 % = toute la machine.
export const pctMachine = (cpu: number, coeurs: number) => pctTexte(coeurs > 0 ? cpu / coeurs : 0)

// Mémoire comme le processeur (28/10) : la taille posée dans la machine (MemTotal arrondi aux 8 Go du dessus :
// 62,0 Go lus → 64 Go), puis la part utilisée de toute la mémoire.
export const goPoses = (totalKo: number) => `${Math.max(8, Math.ceil(totalKo / GO / 8) * 8)} Go`
export const pctMemoire = (r: Ram) => pctTexte(r.total > 0 ? ((r.total - r.dispo) / r.total) * 100 : 0)

function tableau(r: Ram, p: Part, parMemoire: boolean): Tableau {
  const pc = (cpu: number) => pctMachine(cpu, r.coeurs)
  const tri = (d: Famille['detail']) => [...d].sort((x, y) => (parMemoire ? y[1] - x[1] : y[2] - x[2]))
  const proc = ([n, ko, cpu, k]: Famille['detail'][number]) => ({ n: k === 1 ? n : `${n} ×${k}`, m: go(ko), p: pc(cpu), entete: false })
  if (p.nom === 'système et autre') {
    const fam = (nom: string) => p.familles.find(f => f.nom === nom) ?? { ko: 0, cpu: 0 }
    return {
      titre: `Détail · ${p.nom}`,
      couleur: A.sable,
      resume: `${go(p.ko)} · ${pc(p.cpu)} du processeur`,
      lignes: [
        { n: 'partie', m: 'mémoire', p: 'proc.', entete: true },
        { n: 'système', m: go(fam('système').ko), p: pc(fam('système').cpu), entete: false },
        { n: 'autre', m: go(fam('autre').ko), p: pc(fam('autre').cpu), entete: false },
        { n: 'noyau, illisible', m: go(r.noyau_ko), p: pc(r.cpu_irq + r.cpu_non_attribue), entete: false },
        null,
        { n: 'plus gros processus', m: '', p: '', entete: true },
        ...tri(p.familles.flatMap(f => f.detail)).slice(0, 4).map(proc),
      ],
    }
  }
  const f = p.familles[0]!
  return {
    titre: `Détail · ${p.nom}`,
    couleur: TEINTES[p.nom]!,
    resume: `${f.n} processus · ${go(f.ko)} · ${pc(f.cpu)} du processeur`,
    lignes: [{ n: 'processus', m: 'mémoire', p: 'proc.', entete: true }, ...tri(f.detail).slice(0, 8).map(proc)],
  }
}

export const colsRond = (colonnes: number) => Math.max(16, Math.min(40, Math.floor(colonnes / 2) - 4))
export const rangsMax = (cols: number) => Math.max(4, Math.min(12, Math.round(cols * 0.3)))

export function propsRonds(r: Ram, colonnes: number, rangs = rangsMax(colsRond(colonnes))): PropsRonds {
  const demi = Math.floor(colonnes / 2)
  const ps = parts(r)
  const fm = fractions(ps.map(p => p.ko))
  const fc = fractions(ps.map(p => p.cpu))
  return {
    cols: colsRond(colonnes),
    rangs,
    demi,
    largeur: colonnes - 1,
    ronds: [
      {
        totaux: `${goPoses(r.total)} · ${pctMemoire(r)}`,
        rouge: memoireRouge(r.total, r.dispo),
        fractions: fm,
        parts: ps.map(p => ({ couleur: TEINTES[p.nom]!, texte: `${virgule(p.ko / GO).padStart(5)} Go  ${p.nom}` })),
        tableaux: ps.map(p => tableau(r, p, true)),
      },
      {
        totaux: `${r.coeurs} cœurs · ${pctMachine(r.cpu_pris, r.coeurs)}`,
        rouge: processeurRouge(r.cpu_pris, r.coeurs),
        fractions: fc,
        parts: ps.map(p => ({ couleur: TEINTES[p.nom]!, texte: `${pctMachine(p.cpu, r.coeurs).padStart(6)}  ${p.nom}` })),
        tableaux: ps.map(p => tableau(r, p, false)),
      },
    ],
  }
}

export const largeurTexte = (colonnes: number) => Math.max(10, colonnes - 1)

type Bloc = { cle: string; hauteur: number; dessin: () => RenderElement[] }

// Composition : le rond prend la place qu'il peut (rangs 12 → 4), le plan prend ce qui reste, puis les lignes vides
// restantes sont réparties entre les cinq écarts (après chaque section) ; la ligne du bas est la dernière.
export function composer(E: El, s: Suivi, d: Donnees, r: Ram | null, c: Cadre, g: Reglages): { blocs: Bloc[]; ecarts: number[]; resumePlan: { faits: number; total: number } | null } {
  const W = largeurTexte(c.colonnes)
  const ouvert = (id: string) => !g.plis.includes(id)
  const titreProjet: Seg[] = [{ t: '✦ ', c: A.orange }, { t: s.projet, c: A.orange, g: true }, ...(s.chantier ? [{ t: ` · ${s.chantier}`, c: A.blanc, g: true }] : [])]
  const objectif = ouvert('projet') && s.objectif ? envelopper(s.objectif, W).slice(0, 4) : []
  const projet: Bloc = {
    cle: 'projet',
    hauteur: 1 + objectif.length,
    dessin: () => [cliquable(E, 'l-projet', [ligneEntete('projet', ouvert('projet'), [], W, titreProjet)], W), ...objectif.map((l, i) => <E.Text key={`o${i}`} color={A.texte}>{l}</E.Text>)],
  }

  const fini = nonFinis(s.fini, g.finiTout)
  const atteints = s.fini.filter(p => p.atteint).length
  const lf = lignesFini(fini, g.finiOuvert, W)
  const enteteFini = ligneEntete('fini', ouvert('fini'), s.fini.length === 0 ? [] : [{ t: `${atteints} atteint${atteints > 1 ? 's' : ''} sur ${s.fini.length}   `, c: A.gris }, boutonSegs('finiTout', !g.finiTout)], W)
  const blocFini: Bloc | null =
    s.fini.length === 0 && s.chantier === null
      ? null
      : {
          cle: 'fini',
          hauteur: 1 + (ouvert('fini') ? (s.fini.length === 0 ? 1 : lf.length) : 0),
          dessin: () => [
            cliquable(E, 'l-fini', [enteteFini], W),
            ...(!ouvert('fini') ? [] : s.fini.length === 0 ? [<E.Text key="f-vide" color={A.gris}>  fini quand introuvable dans le cahier</E.Text>] : lf.length > 0 ? [cliquable(E, 'l-fini-lignes', lf, W)] : []),
          ],
        }

  const lt = lignesTaches(d.taches, W)
  const taches: Bloc = {
    cle: 'taches',
    hauteur: 1 + (ouvert('taches') ? lt.length : 0),
    dessin: () => [cliquable(E, 'l-taches', [ligneEntete('taches', ouvert('taches'), [{ t: String(regrouper(d.taches).reduce((n, t) => n + t.n, 0)), c: A.gris }], W)], W), ...(ouvert('taches') ? lt.map((l, i) => texteSegs(E, l, `t${i}`)) : [])],
  }

  const ronds = (rangs: number): Bloc => {
    const p = r === null ? null : propsRonds(r, c.colonnes, rangs)
    const haut = p === null ? 0 : hauteurRonds(rangs, p.ronds[0]!.parts.length)
    return {
      cle: 'ronds',
      hauteur: 1 + (!ouvert('ronds') ? 0 : p === null ? 1 : 1 + haut),
      dessin: () => [
        cliquable(E, 'l-ronds', [ligneEntete('ronds', ouvert('ronds'), [], W)], W),
        ...(!ouvert('ronds') ? [] : p === null ? [<E.Text key="r-mesure" color={A.gris}>mesure en cours…</E.Text>] : [<E.Text key="r-vide"> </E.Text>, vueRonds(E, p, haut)]),
      ],
    }
  }

  const fixes = [projet, ...(blocFini ? [blocFini] : []), taches]
  const hFixes = fixes.reduce((n, b) => n + b.hauteur, 0)
  const disponible = c.lignes > 0 ? c.lignes - 1 : 0
  const nEcarts = fixes.length + 2
  let rangs = rangsMax(colsRond(c.colonnes))
  let placePlan = 99
  if (c.lignes > 0) {
    for (; ; rangs--) {
      placePlan = disponible - hFixes - ronds(rangs).hauteur - nEcarts
      if (placePlan >= 8 || rangs <= 4) break
    }
  }
  const plan = s.plan
  const fin = plan !== null && planFini(plan)
  const arbre = plan && ouvert('plan') ? arbreAuPlus(plan, g.planTout || fin, Math.max(1, placePlan - 1)) : []
  const droitePlan: Seg[] = plan === null ? [{ t: 'pas de plan dans evan/', c: A.gris }] : fin ? [{ t: `${plan.total} faite${plan.total > 1 ? 's' : ''} sur ${plan.total} · plan fini`, c: A.vert }] : [boutonSegs('planTout', !g.planTout)]
  const blocPlan: Bloc = {
    cle: 'plan',
    hauteur: 1 + (plan && ouvert('plan') ? 1 + arbre.length : 0),
    dessin: () => [
      cliquable(E, 'l-plan', [ligneEntete('plan', ouvert('plan'), droitePlan, W)], W),
      ...(plan && ouvert('plan')
        ? [
            texteSegs(E, aligner([{ t: (fin ? plan.titre : plan.phase) || plan.titre || s.planNom || 'Plan', c: A.blanc, g: true }], fin ? [{ t: s.planNom ? `PLAN-${s.planNom}.md` : '', c: A.gris }] : [{ t: `${plan.faites.length} faite${plan.faites.length > 1 ? 's' : ''} sur ${plan.total}`, c: A.gris }], W), 'phase'),
            ...arbre.map((l, i) => texteSegs(E, segsArbre(l, W), `a${i}`)),
          ]
        : []),
    ],
  }
  const ordre = [projet, blocPlan, ...(blocFini ? [blocFini] : []), taches, ronds(rangs)]
  const libre = Math.max(0, disponible - ordre.reduce((n, b) => n + b.hauteur, 0))
  const ecarts = c.lignes > 0 ? ordre.map((_, k) => Math.floor(libre / ordre.length) + (k < libre % ordre.length ? 1 : 0)) : ordre.map(() => 1)
  return { blocs: ordre, ecarts, resumePlan: planBas(s, d) }
}

export function vueSuivi(E: El, s: Suivi | null, d: Donnees, r: Ram | null, c: Cadre, g: Reglages) {
  if (s === null) return <E.Text color={A.gris}>Lecture du dossier evan/…</E.Text>
  const W = largeurTexte(c.colonnes)
  const { blocs, ecarts, resumePlan } = composer(E, s, d, r, c, g)
  const bas = aligner(segsBas(d, resumePlan), [], W)
  return (
    <E.Box flexDirection="column" width={W} height={c.lignes > 0 ? c.lignes : undefined}>
      {blocs.flatMap((b, k) => [
        <E.Box key={`b-${b.cle}`} flexDirection="column" flexShrink={0} height={b.hauteur}>{b.dessin()}</E.Box>,
        ...(ecarts[k]! > 0 ? [<E.Box key={`e-${b.cle}`} height={ecarts[k]} flexShrink={0} />] : []),
      ])}
      {c.lignes > 0 ? null : <E.Box flexGrow={1} />}
      {texteSegs(E, bas, 'bas')}
    </E.Box>
  )
}

export function vueRonds(E: El, p: PropsRonds, haut: number) {
  return (
    <E.Box key="ronds" height={haut} flexShrink={0}>
      <E.Client key="ronds-v4" module="./ronds-client.tsx" props={p} width={p.largeur} height={haut} />
    </E.Box>
  )
}
