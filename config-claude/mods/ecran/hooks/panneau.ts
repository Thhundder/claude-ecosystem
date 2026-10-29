import type { Etape, PlanPanneau, PointFini } from '../types'

const STATUTS = /(?:REDÉFINIE|RÉORIENTÉ|ARRÊTÉE?|ARRÊT|FAIT|REMPLACÉE?|REPORTÉE?|EN COURS|Phase \d+),?(?: \d{1,2}\/\d{1,2})?(?: ~?\d{1,2}[:h]\d{2})?/g
const ECARTE = /\b(?:ARRÊTÉE?|REMPLACÉE?|REPORTÉE?|ABANDONNÉE?)\b/

const sansParentheses = (t: string) => {
  let out = ''
  let prof = 0
  for (const ch of t) {
    if (ch === '(') prof++
    else if (ch === ')' && prof > 0) prof--
    else if (prof === 0) out += ch
  }
  return out
}

export const nettoyer = (t: string) =>
  sansParentheses(t.replace(/\*\*|`/g, ''))
    .replace(STATUTS, '')
    .replace(/\b\d{1,2}\/\d{1,2}\b|~?\b\d{1,2}:\d{2}\b/g, '')
    .replace(/\b[0-9a-f]{8}\b(?: t\d)?/g, '')
    .replace(/~\/\S+|(?<=\s)\/\S+|\b\S+:\d{4,5}\b/g, '')
    .replace(/\b(?:agent|branche|Mongo|worktree)\b[^,:;]*,?/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.])/g, '$1')
    .replace(/([,;:])(?:\s*[,;:])+/g, '$1')
    .replace(/^[\s,;:.—-]+/, '')
    .trim()

const majuscule = (t: string) => t.slice(0, 1).toUpperCase() + t.slice(1)

export function couper(t: string, max = 56) {
  let r = (t.split(/ ; | : | — |\. |,? fini quand|,? on arrête/)[0] ?? '').trim().replace(/^[ ,;:.]+|[ ,;:.]+$/g, '')
  while (r.length > max && r.includes(', ')) r = r.slice(0, r.lastIndexOf(', '))
  return majuscule(r)
}

export const titreEtape = (corps: string) => couper(nettoyer(corps))

export function sousEtapes(corps: string): string[] {
  const t = nettoyer(corps.split(/\b[Ff]ini quand\b/)[0] ?? '').replace(/\bEvan\b[^«]{0,20}«[^»]*»(?:\s*;\s*«[^»]*»)*\.?/g, '')
  let i = t.indexOf(' : ')
  while (i >= 0) {
    const reste = t.slice(i + 3)
    const tete = reste.split(' ; ')[0] ?? ''
    const sep = (tete.match(/, /g) ?? []).length >= 2 ? ', ' : (reste.match(/ ; /g) ?? []).length >= 2 ? ' ; ' : null
    if (sep !== null) {
      const items = reste.split(sep).map(x => couper(x.trim(), 52)).filter(x => x.length > 3 && !/^(?:puis|on arrête)\b/i.test(x))
      if (items.length >= 2) return items
    }
    i = t.indexOf(' : ', i + 3)
  }
  return []
}

export type LignePlan = { num: string; fait: boolean; retrait: number; corps: string; parent: number | null; index: number }

export function lignesPlan(texte: string): LignePlan[] {
  const lignes: LignePlan[] = []
  const pile: LignePlan[] = []
  const brutes = texte.split('\n')
  for (let k = 0; k < brutes.length; k++) {
    const m = brutes[k]!.match(/^(\s*)[-*]\s+\[([ xX])\]\s*(.*)$/)
    if (!m) continue
    let corps = m[3]!
    while (k + 1 < brutes.length && /^\s{4,}\S/.test(brutes[k + 1]!) && !/^\s*[-*]\s+\[/.test(brutes[k + 1]!)) corps += ` ${brutes[++k]!.trim()}`
    const retrait = m[1]!.replace(/\t/g, '  ').length
    const num = corps.match(/^(\S*\d\S*?)\.?\s/)?.[1] ?? ''
    while (pile.length > 0 && pile.at(-1)!.retrait >= retrait) pile.pop()
    const l: LignePlan = { num, fait: m[2] !== ' ', retrait, corps: num ? corps.slice(corps.indexOf(num) + num.length).replace(/^\.?\s*/, '') : corps, parent: pile.at(-1)?.index ?? null, index: lignes.length }
    lignes.push(l)
    pile.push(l)
  }
  return lignes
}

// « # Plan — Chantier 1 : découverte des pages (sitemap + liens) » → « Découverte des pages (sitemap + liens) » ;
// une parenthèse de date, de version ou de GO est retirée.
export function titrePlan(texte: string) {
  const l = texte.match(/^#\s+(.+)$/m)?.[1] ?? ''
  return majuscule(
    l.replace(/^plan\b\s*[—:–-]?\s*/i, '')
      .replace(/^chantier \d+\s*:\s*/i, '')
      .replace(/\s*\([^()]*(?:\d|\bGO\b|cahier)[^()]*\)/g, '')
      .replace(/\*\*|`/g, '')
      .trim(),
  )
}

export const planFini = (p: PlanPanneau) => p.total > 0 && p.faites.length === p.total

export type AgentVivant = { id: string; depuis: number }

export function lancees(journal: string, vivants: readonly AgentVivant[]) {
  const r = new Map<string, { depuis: number; meme: boolean }>()
  for (const m of journal.matchAll(/Agent ([0-9a-f]{8}) \(([^)]*)\) lancé/g)) {
    const agent = vivants.find(a => a.id.startsWith(m[1]!))
    if (!agent) continue
    const ref = (m[2]!.split(',').at(-1) ?? '').trim()
    const [base, ...suite] = ref.split('/')
    if (!base) continue
    ;[base, ...suite.map(s => base.replace(/\d+$/, s))].forEach((n, k) => r.set(n, { depuis: agent.depuis, meme: k > 0 }))
  }
  return r
}

const duree = (s: number) => (s < 60 ? `${s} s` : s < 3600 ? `${Math.floor(s / 60)} min` : `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`)

export function planPanneau(texte: string, journal: string, vivants: readonly AgentVivant[]): PlanPanneau | null {
  const lignes = lignesPlan(texte)
  if (lignes.length === 0) return null
  const parAgent = lancees(journal, vivants)
  const feuille = (l: LignePlan) => !lignes.some(x => x.parent === l.index)
  let encours = lignes.filter(l => !l.fait && l.num !== '' && parAgent.has(l.num))
  if (encours.length === 0) {
    const premiere = lignes.find(l => !l.fait && feuille(l) && !ECARTE.test(l.corps))
    encours = premiere ? [premiere] : []
  }
  const phase = encours[0]?.parent ?? null
  const fratrie = lignes.filter(l => l.parent === phase)
  const dans = encours.filter(l => l.parent === phase)
  const dernier = Math.max(-1, ...dans.map(l => fratrie.indexOf(l)))
  const ensuite = fratrie.slice(dernier + 1).find(l => !l.fait && !dans.includes(l) && !ECARTE.test(l.corps)) ?? null
  const etapes: Etape[] = fratrie.flatMap((l): Etape[] => {
    if (dans.includes(l)) {
      const a = parAgent.get(l.num)
      return [{ titre: titreEtape(l.corps), sous: sousEtapes(l.corps), etat: 'encours', meta: a === undefined ? 'en cours' : a.meme ? 'même agent' : `agent · ${duree(a.depuis)}` }]
    }
    return l === ensuite ? [{ titre: titreEtape(l.corps), sous: [], etat: 'ensuite', meta: 'ensuite' }] : []
  })
  const tete = phase === null ? null : lignes[phase]!
  return {
    phase: tete ? titreEtape(tete.corps) : '',
    titre: titrePlan(texte),
    faites: fratrie.filter(l => l.fait).map(l => titreEtape(l.corps)),
    total: fratrie.length,
    etapes,
  }
}

export type LigneArbre = { prefixe: string; icone: string; texte: string; droite: string; sorte: 'fait' | 'encours' | 'ensuite' | 'sous' | 'resume' }

export function lignesArbre(p: PlanPanneau, avecFaites: boolean, faitesMax: number, sousMax: number): LigneArbre[] {
  const haut: LigneArbre[] = []
  if (avecFaites && p.faites.length > 0) {
    const vues = faitesMax > 0 ? p.faites.slice(-faitesMax) : []
    const plusTot = p.faites.length - vues.length
    if (plusTot > 0) haut.push({ prefixe: '├─ ', icone: '✓ ', texte: `${plusTot} faite${plusTot > 1 ? 's' : ''}${vues.length > 0 ? ' plus tôt' : ''}`, droite: '', sorte: 'resume' })
    for (const t of vues) haut.push({ prefixe: '├─ ', icone: '✓ ', texte: t, droite: '', sorte: 'fait' })
  }
  const bas = p.etapes.flatMap((e, i) => {
    const dernier = i === p.etapes.length - 1
    const montrees = e.sous.slice(0, sousMax)
    const reste = e.sous.length - montrees.length
    return [
      { prefixe: dernier ? '└─ ' : '├─ ', icone: e.etat === 'encours' ? '● ' : '○ ', texte: e.titre, droite: e.meta, sorte: e.etat },
      ...montrees.map((s, k) => ({
        prefixe: `${dernier ? '   ' : '│  '}${k === montrees.length - 1 ? '└─ ' : '├─ '}`,
        icone: '',
        texte: s,
        droite: k === montrees.length - 1 && reste > 0 ? `+ ${reste} autre${reste > 1 ? 's' : ''}` : '',
        sorte: 'sous' as const,
      })),
    ]
  })
  if (bas.length === 0 && haut.length > 0) haut.at(-1)!.prefixe = '└─ '
  return [...haut, ...bas]
}

export function arbreAuPlus(p: PlanPanneau, avecFaites: boolean, place: number) {
  if (planFini(p)) return lignesArbre(p, true, Math.max(0, place - 2), 0)
  const essais: [number, number][] = avecFaites ? [[3, 2], [3, 1], [1, 1], [0, 1], [0, 0]] : [[0, 2], [0, 1], [0, 0]]
  for (const [f, s] of essais) {
    const l = lignesArbre(p, avecFaites, f, s)
    if (l.length + 1 <= place) return l
  }
  return lignesArbre(p, avecFaites, 0, 0)
}

// Deux formes de rubrique dans les cahiers : « OBJECTIF » seul sur sa ligne puis le texte (xeko-backend), ou
// « Objectif : texte… » en ligne (xeko.ai, xeko-app). La seconde est ramenée à la première ; pour « Fini quand : »,
// le paragraphe est coupé aux « ; », un point par morceau, plus les « Ajout aux « Fini quand » : » du même chantier.
export function normaliserCahier(cahier: string) {
  const out: string[] = []
  const lignes = cahier.split('\n')
  for (let i = 0; i < lignes.length; i++) {
    const m = lignes[i]!.match(/^([A-ZÉ][a-zéèêàç]+(?: [a-zéèêàç]+){0,2})\s*:\s*(.*)$/)
    if (!m) {
      out.push(lignes[i]!)
      continue
    }
    out.push(m[1]!.toUpperCase())
    if (m[1]!.toLowerCase() !== 'fini quand') {
      if (m[2]) out.push(m[2])
      continue
    }
    let para = m[2]!
    while (i + 1 < lignes.length && lignes[i + 1]!.trim() !== '') para += ` ${lignes[++i]!.trim()}`
    for (const p of para.split(/ ; /)) out.push(`- ${p.replace(/[.;\s]+$/, '')}`)
    for (let j = i + 1; j < lignes.length && !/^={5,}/.test(lignes[j]!); j++) {
      const a = lignes[j]!.match(/^- Ajout aux « Fini quand » : (.*)$/)
      if (!a) continue
      let suite = a[1]!
      while (j + 1 < lignes.length && /^\s{2,}\S/.test(lignes[j + 1]!)) suite += ` ${lignes[++j]!.trim()}`
      for (const p of suite.split(/ ; /)) out.push(`- ${p.replace(/[.;\s]+$/, '')}`)
    }
    out.push('FIN DE RUBRIQUE')
  }
  return out.join('\n')
}

function section(brut: string, chantier: string, rubrique: string) {
  const lignes = normaliserCahier(brut).split('\n')
  const debut = lignes.findIndex(l => l.startsWith(`CHANTIER ${chantier}`))
  if (debut < 0) return []
  const fin = lignes.findIndex((l, i) => i > debut + 1 && /^={5,}/.test(l) && !lignes[i - 1]?.startsWith('CHANTIER'))
  const bloc = lignes.slice(debut + 1, fin < 0 ? undefined : fin)
  const i = bloc.findIndex(l => l.trim().toUpperCase() === rubrique)
  if (i < 0) return []
  const suite = bloc.slice(i + 1)
  const j = suite.findIndex(l => /^[A-ZÉÈ][A-ZÉÈ ]{3,}$/.test(l.trim()) && !l.startsWith(' '))
  return j < 0 ? suite : suite.slice(0, j)
}

export function chantiers(cahier: string) {
  return [...cahier.matchAll(/^CHANTIER (\d+)\s*[—–-]\s*(.+)$/gm)].map(m => ({ numero: m[1]!, titre: m[2]!.trim() }))
}

// Le chantier du cahier que le plan nomme (« 3 », « 3 — titre », ou le titre seul) ; null si aucun ne répond.
export function chantierDe(cahier: string, nomme: string) {
  const liste = chantiers(cahier)
  const numero = nomme.match(/^(\d+)\b/)?.[1]
  if (numero !== undefined) return liste.find(c => c.numero === numero) ?? null
  const bas = nomme.toLowerCase()
  return liste.find(c => bas.includes(c.titre.toLowerCase()) || c.titre.toLowerCase().includes(bas)) ?? null
}

// Cahier à un seul chantier et points numérotés (« 13. … Fini quand : … [fait] »), comme celui de
// claude-ecosystem : le point N, son titre et ses « fini quand » coupés aux « ; ».
export function pointDuCahier(cahier: string, numero: string): { titre: string; fini: PointFini[] } | null {
  const lignes = cahier.split('\n')
  const i = lignes.findIndex(l => new RegExp(`^ {1,6}${numero}\\.\\s`).test(l))
  if (i < 0) return null
  const retrait = lignes[i]!.search(/\S/)
  const bloc = [lignes[i]!.trim().replace(/^\d+\.\s*/, '')]
  for (const l of lignes.slice(i + 1)) {
    if (l.trim() === '' || l.search(/\S/) <= retrait) break
    bloc.push(l.trim())
  }
  const titre = couper(nettoyer(bloc[0]!.replace(/\s*\[fait\]\s*$/i, '')))
  const k = bloc.findIndex(l => /^Fini quand\s*:/i.test(l))
  if (k < 0) return { titre, fini: [] }
  let texte = bloc[k]!.replace(/^Fini quand\s*:\s*/i, '')
  for (const l of bloc.slice(k + 1)) {
    if (/^[A-ZÉ][\wéèêàç' ]{0,30}(?:\(|:)/.test(l)) break
    texte += ` ${l}`
  }
  const atteint = /\[fait\]\s*$/i.test(texte)
  const fini = texte
    .replace(/\s*\[fait\]\s*$/i, '')
    .split(/ ; /)
    .map(p => p.replace(/[.;\s]+$/, '').trim())
    .filter(p => p !== '')
    .map(p => ({ court: courtFini(p), long: majuscule(p), atteint }))
  return { titre, fini }
}

export function objectif(cahier: string, chantier: string) {
  const phrase: string[] = []
  for (const l of section(cahier, chantier, 'OBJECTIF')) {
    const s = l.trim()
    if (s === '' || s.startsWith('-') || /^Tes mots\b/.test(s)) {
      if (phrase.length > 0) break
      continue
    }
    phrase.push(s)
  }
  return phrase.length > 0 ? majuscule(phrase.join(' ')) : null
}

const MARQUE = /^(?:✓|\[[xX]\])\s*/

export function courtFini(long: string) {
  let r = (long.split(/ ; | \(/)[0] ?? '').replace(/[ ;.,:]+$/, '')
  // coupe aux virgules seulement si la tête garde son sens (40 caractères au moins) ; sinon l'affichage coupe à la largeur
  while (r.length > 70 && r.includes(', ') && r.lastIndexOf(', ') >= 40) r = r.slice(0, r.lastIndexOf(', '))
  return majuscule(r)
}

export function finiQuand(cahier: string, chantier: string): PointFini[] {
  const lignes = section(cahier, chantier, 'FINI QUAND').filter(l => l.trim() !== '')
  if (lignes.length === 0) return []
  const base = Math.min(...lignes.map(l => l.length - l.trimStart().length))
  const points: { long: string; intro: string; atteint: boolean }[] = []
  let intro = ''
  let paragraphe = ''
  let cour: { long: string; intro: string; atteint: boolean } | null = null
  for (const l of lignes) {
    const retrait = l.length - l.trimStart().length
    const s = l.trim()
    if (retrait > base && cour !== null) {
      cour.long += ` ${s}`
      continue
    }
    if (s.startsWith('- ')) {
      const t = s.slice(2)
      cour = { long: t.replace(MARQUE, ''), intro, atteint: MARQUE.test(t) }
      points.push(cour)
      paragraphe = ''
      continue
    }
    cour = null
    paragraphe = `${paragraphe} ${s}`.trim()
    if (paragraphe.endsWith(':')) {
      intro = paragraphe.replace(/\s*:$/, '')
      paragraphe = ''
    } else if (/[.!]$/.test(paragraphe)) {
      if (!/\btu\b/i.test(paragraphe)) points.push({ long: paragraphe.replace(MARQUE, ''), intro: '', atteint: MARQUE.test(paragraphe) })
      paragraphe = ''
    }
  }
  return points.map(p => {
    const long = p.long.replace(/[ ;]+$/, '')
    return { court: courtFini(long), long: p.intro ? `${p.intro} : ${long}` : majuscule(long), atteint: p.atteint }
  })
}

export const SEUIL_MEMOIRE = 0.1
export const SEUIL_PROCESSEUR = 0.95

export const memoireRouge = (totalKo: number, dispoKo: number) => dispoKo < SEUIL_MEMOIRE * totalKo
export const processeurRouge = (pris: number, coeurs: number) => pris > SEUIL_PROCESSEUR * coeurs * 100

export const nonFinis = (points: readonly PointFini[], tout: boolean) => points.map((p, i) => ({ ...p, i })).filter(p => tout || !p.atteint)

export function hauteurTexte(texte: string, largeur: number) {
  if (largeur <= 0) return 1
  let lignes = 1
  let courante = 0
  for (const mot of texte.split(' ')) {
    const n = [...mot].length
    if (courante === 0) courante = n
    else if (courante + 1 + n <= largeur) courante += 1 + n
    else {
      lignes++
      courante = n
    }
    while (courante > largeur) {
      lignes++
      courante -= largeur
    }
  }
  return lignes
}
