import type { Arbre, Noeud } from '../types'

const LIBELLES = ['Chantier', 'Situation', 'Prochaine action', 'Bloqué par']
const RUBRIQUES = ['Objectif', 'Inclus', 'Exclu', 'Fini quand']

const net = (texte: string) =>
  texte.replace(/\*\*|`/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim()

export function lireOuJenSuis(journal: string) {
  const debut = journal.search(/^## Où j'en suis/m)
  if (debut < 0) return []
  const reste = journal.slice(debut).split('\n').slice(1)
  const fin = reste.findIndex(l => /^## /.test(l))
  const section = (fin < 0 ? reste : reste.slice(0, fin)).join('\n')
  return LIBELLES.flatMap(libelle => {
    const m = section.match(new RegExp(`^\\*\\*${libelle}\\*\\*\\s*:?\\s*([\\s\\S]*?)(?=^\\*\\*|^#|(?![\\s\\S]))`, 'm'))
    const texte = m?.[1] ? net(m[1]) : ''
    return texte ? [{ libelle, texte }] : []
  })
}

const libelleEtape = (texte: string) =>
  net(texte)
    .replace(/\s*[—–-]\s*\[[ xX]\].*$/, '')
    .replace(/\s*(?:[—–;,]\s*|\.\s+)(?:fini quand|on arrête si)\b.*$/i, '')
    .trim()

type Brut = { rang: number; texte: string; coche: boolean | null; enfants: Brut[] }

const feuilles = (n: Brut): Brut[] => (n.enfants.length === 0 ? (n.coche === null ? [] : [n]) : n.enfants.flatMap(feuilles))

function etats(n: Brut, courant: Brut | null): Noeud {
  const enfants = n.enfants.map(e => etats(e, courant))
  const fs = feuilles(n)
  const faits = fs.filter(f => f.coche).length
  const toutFait = n.coche === true || (fs.length > 0 && faits === fs.length)
  const contient = (x: Brut): boolean => x === courant || x.enfants.some(contient)
  const etat = toutFait ? 'fait' : courant !== null && contient(n) ? 'encours' : faits > 0 ? 'partiel' : 'afaire'
  return { texte: n.texte, etat, enfants, faits, total: fs.length }
}

export function lireArbrePlan(plan: string): Arbre | null {
  const racine: Brut = { rang: 0, texte: '', coche: null, enfants: [] }
  const pile: Brut[] = [racine]
  let titre = ''
  for (const ligne of plan.split('\n')) {
    const t = ligne.match(/^(#{1,6})\s+(.*)$/)
    const c = ligne.match(/^(\s*)(?:[-*]\s+|(\d+(?:\.\d+)*)\.?\s+)\[([ xX])\]\s*(.*)$/)
    if (t) {
      const niveau = t[1]!.length
      if (niveau === 1) {
        if (titre === '') titre = net(t[2]!).replace(/^PLAN\s*[—–-]\s*/i, '').split(/\s+[—–]\s+(?=à valider)/)[0]!
        continue
      }
      const marque = t[2]!.match(/[—–-]\s*\[([ xX])\]/)
      const n: Brut = { rang: niveau, texte: libelleEtape(t[2]!), coche: marque ? marque[1] !== ' ' : null, enfants: [] }
      while (pile.length > 1 && pile.at(-1)!.rang >= niveau) pile.pop()
      pile.at(-1)!.enfants.push(n)
      pile.push(n)
    } else if (c) {
      const rang = 10 + c[1]!.replace(/\t/g, '  ').length + (c[2] ? c[2].split('.').length : 0)
      const n: Brut = { rang, texte: libelleEtape(`${c[2] ? `${c[2]} ` : ''}${c[4]!}`), coche: c[3] !== ' ', enfants: [] }
      while (pile.length > 1 && pile.at(-1)!.rang >= rang) pile.pop()
      pile.at(-1)!.enfants.push(n)
      pile.push(n)
    }
  }
  const garder = (n: Brut): Brut | null => {
    const enfants = n.enfants.map(garder).filter((e): e is Brut => e !== null)
    return enfants.length > 0 || n.coche !== null ? { ...n, enfants } : null
  }
  const propre = garder(racine)
  if (propre === null) return null
  const courant = feuilles(propre).find(f => !f.coche) ?? null
  const arbre = etats(propre, courant)
  const chemin: string[] = []
  const descendre = (n: Noeud) => {
    const suite = n.enfants.find(e => e.etat === 'encours')
    if (suite) {
      chemin.push(suite.texte)
      descendre(suite)
    }
  }
  descendre(arbre)
  return { titre: titre || 'Plan', noeuds: arbre.enfants, faits: arbre.faits, total: arbre.total, enCours: chemin.at(-1) ?? null }
}

function rubriques(bloc: string[]): Noeud[] {
  const lignes = bloc.filter(l => !/^=+$/.test(l.trim()))
  return RUBRIQUES.flatMap(nom => {
    const i = lignes.findIndex(l => new RegExp(`^\\s*${nom}\\s*(?::|$)`).test(l))
    if (i < 0) return []
    const premiere = lignes[i]!.replace(new RegExp(`^\\s*${nom}\\s*:?\\s*`), '')
    const suite: string[] = []
    for (const l of lignes.slice(i + 1)) {
      if (l.trim() === '' || RUBRIQUES.some(r => new RegExp(`^\\s*${r}\\s*(?::|$)`).test(l)) || /^[A-ZÉ]/.test(l)) break
      suite.push(l.trim().replace(/^- /, '· '))
    }
    const texte = net([premiere, ...suite].filter(Boolean).join(' '))
    return texte ? [{ texte, etat: 'afaire' as const, enfants: [], faits: 0, total: 0, libelle: nom }] : []
  })
}

export function lireProjet(cahier: string) {
  const entete = cahier.split(/^CHANTIER /m)[0] ?? ''
  const ligne = entete.match(/^Projet\s*:\s*(.+)$/m)?.[1]
  if (ligne) return net(ligne)
  const titre = entete.match(/^CAHIER DES CHARGES\s*[—–:-]\s*(.+)$/im)?.[1]
  return titre ? net(titre) : null
}

export function lireArbreCahier(cahier: string, journal = ''): Arbre | null {
  const sections = cahier.split(/^CHANTIER /m).slice(1)
  if (sections.length === 0) return null
  const chantierJournal = lireOuJenSuis(journal).find(l => l.libelle === 'Chantier')?.texte.toLowerCase() ?? ''
  const lus = sections.map(s => {
    const lignes = s.split('\n')
    const titre = net(lignes[0] ?? '')
    const statut = s.match(/Statut\s*:\s*([^\n]*)/)?.[1]?.toLowerCase() ?? ''
    const numero = lignes[0]?.match(/^(\d+)/)?.[1]
    const nom = net(lignes[0] ?? '').replace(/^\d+\s*[—–-]\s*/, '').split(/\s+[—–-]\s+|\s*\(/)[0]!.toLowerCase()
    const fait = /\b(fini|fait|terminé|livré|clos)\b/.test(statut)
    const enCours = /en cours/.test(statut) || (chantierJournal !== '' && ((numero !== undefined && new RegExp(`chantier\\s+${numero}\\b`).test(chantierJournal)) || (nom.length > 3 && chantierJournal.includes(nom))))
    return { titre, fait, enCours, lignes: lignes.slice(1) }
  })
  const courant = lus.findIndex(l => l.enCours && !l.fait)
  const noeuds: Noeud[] = lus.map((l, i) => ({
    texte: l.titre,
    etat: l.fait ? 'fait' : i === courant ? 'encours' : 'afaire',
    enfants: i === courant ? rubriques(l.lignes) : [],
    faits: l.fait ? 1 : 0,
    total: 1,
  }))
  return { titre: 'Cahier des charges', noeuds, faits: lus.filter(l => l.fait).length, total: lus.length, enCours: courant >= 0 ? lus[courant]!.titre : null }
}
