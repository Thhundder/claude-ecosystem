import type { Arbre, Noeud } from '../types'

const net = (texte: string) =>
  texte.replace(/\*\*|`/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim()

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

export function lireProjet(cahier: string) {
  const entete = cahier.split(/^CHANTIER /m)[0] ?? ''
  const ligne = entete.match(/^Projet\s*:\s*(.+)$/m)?.[1]
  if (ligne) return net(ligne)
  const titre = entete.match(/^CAHIER DES CHARGES\s*[—–:-]\s*(.+)$/im)?.[1]
  return titre ? net(titre) : null
}
