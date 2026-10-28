import type { ClientModule } from 'claude-code'

import { assombrir, camembert, hauteurRond, zone } from './ram-geo'

// Deux colonnes (mémoire, processeur) : rond, ligne vide, totaux, légende. Au survol d'une part, rien ne bouge : le
// détail remplace seulement la zone du dessin d'en face ; la ligne de légende survolée change de couleur de texte.
export type PartRond = { couleur: string; texte: string }
export type LigneTableau = { n: string; m: string; p: string; entete: boolean } | null
export type Tableau = { titre: string; couleur: string; resume: string; lignes: LigneTableau[] }
export type Rond = { totaux: string; rouge: boolean; fractions: number[]; parts: PartRond[]; tableaux: Tableau[] }
export type PropsRonds = { ronds: Rond[]; cols: number; rangs: number; demi: number; largeur: number }
export type Survol = { rond: number; part: number } | null

export const TEXTE = '#E1DDD2'
export const GRIS = '#98928A'
export const SURVOL = '#F2A27E'
export const ROUGE = '#FF3B30'

export const hauteurRonds = (rangs: number, parts = 4) => hauteurRond(rangs) + 2 + parts

export const debut = (p: PropsRonds, rond: number) => (rond === 0 ? 0 : p.demi + 1)
export const largeurColonne = (p: PropsRonds, rond: number) => (rond === 0 ? p.demi + 1 : p.largeur - p.demi - 1)

export function survolSous(p: PropsRonds, survol: Survol, x: number, y: number): Survol {
  if (x < 0 || y < 0 || x >= p.largeur) return null
  const rond = x < debut(p, 1) ? 0 : 1
  const lx = x - debut(p, rond)
  const r = p.ronds[rond]
  if (!r || (survol !== null && survol.rond !== rond)) return null
  const haut = hauteurRond(p.rangs)
  if (y < haut) {
    if (lx < 1 || lx >= 1 + p.cols) return null
    const z = zone(r.fractions, p.cols, p.rangs)(lx - 1, y * 2)
    return z === null ? null : { rond, part: z[0] }
  }
  const i = Math.floor(y) - haut - 2
  return i >= 0 && i < r.parts.length && lx < 2 + [...r.parts[i]!.texte].length ? { rond, part: i } : null
}

const couper = (t: string, n: number) => ([...t].length <= n ? t : `${[...t].slice(0, n - 1).join('')}…`)

// Les lignes du détail tiennent dans la hauteur du rond : liste coupée (plus gros d'abord), sans en-tête orphelin.
export function lignesDetail(t: Tableau, haut: number) {
  const l = t.lignes.slice(0, Math.max(0, haut - 3))
  while (l.length > 0 && (l.at(-1) === null || l.at(-1)!.entete)) l.pop()
  return l
}

export const ligneTableau = (l: NonNullable<LigneTableau>) => `${couper(l.n, 24).padEnd(25)}${l.m.padStart(8)} ${l.p.padStart(8)}`

// Après un rechargement à chaud, une instance gardée par le moteur peut recevoir une fois les données de l'ancien code.
export const propsValides = (p: unknown): p is PropsRonds => {
  const x = p as Partial<PropsRonds> | null
  return typeof x?.largeur === 'number' && typeof x.demi === 'number' && Array.isArray(x.ronds) && x.ronds.length === 2 && x.ronds.every(r => typeof r?.totaux === 'string' && Array.isArray(r.parts) && Array.isArray(r.tableaux))
}

const RondsClient: ClientModule<PropsRonds, { survol: Survol }> = (p, surface) => {
  const { Box, Text } = surface.elements
  if (!propsValides(p)) return <Box />
  const survol = surface.state?.survol ?? null
  surface.onPointer(e => {
    const suivant = e.type === 'leave' ? null : survolSous(p, survol, e.fine?.x ?? e.x + 0.5, e.fine?.y ?? e.y + 0.5)
    if (JSON.stringify(suivant) !== JSON.stringify(survol)) surface.setState({ survol: suivant })
  })
  const haut = hauteurRond(p.rangs)
  const dessin = (rond: number) => {
    const autre = survol !== null && survol.rond !== rond ? p.ronds[survol.rond]!.tableaux[survol.part] : undefined
    if (autre !== undefined) {
      const lignes = lignesDetail(autre, haut)
      return [
        <Text key="d0" wrap="truncate-end" color={autre.couleur} bold>{autre.titre}</Text>,
        <Text key="d1" wrap="truncate-end" color={TEXTE}>{autre.resume}</Text>,
        <Text key="d2"> </Text>,
        ...lignes.map((l, i) => <Text key={`d${i + 3}`} wrap="truncate-end" color={l === null || l.entete ? GRIS : TEXTE}>{l === null ? ' ' : ligneTableau(l)}</Text>),
        ...Array.from({ length: Math.max(0, haut - 3 - lignes.length) }, (_, i) => <Text key={`v${i}`}> </Text>),
      ]
    }
    const r = p.ronds[rond]!
    const teinte = (z: [number, boolean] | null) => (z === null ? undefined : z[1] ? assombrir(r.parts[z[0]]?.couleur ?? '#888888') : r.parts[z[0]]?.couleur)
    return camembert(r.fractions, p.cols, p.rangs).map((ligne, y) => (
      <Text key={`r${y}`}>
        <Text> </Text>
        {ligne.map(([dessus, dessous], x) => (
          <Text key={`c${x}`} color={teinte(dessus ?? dessous)} backgroundColor={dessus === null ? undefined : teinte(dessous)}>
            {(dessus ?? dessous) === null ? ' ' : dessus === null ? '▄' : '▀'}
          </Text>
        ))}
      </Text>
    ))
  }
  const colonne = (rond: number) => {
    const r = p.ronds[rond]!
    const ici = survol !== null && survol.rond === rond ? survol.part : null
    return (
      <Box key={`m${rond}`} flexDirection="column" width={largeurColonne(p, rond)} flexShrink={0}>
        {dessin(rond)}
        <Text> </Text>
        <Text wrap="truncate-end" color={r.rouge ? ROUGE : TEXTE}>{r.totaux}</Text>
        {r.parts.map((l, i) => (
          <Text key={`l${i}`} wrap="truncate-end">
            <Text color={l.couleur}>■ </Text>
            <Text color={i === ici ? SURVOL : TEXTE}>{l.texte}</Text>
          </Text>
        ))}
      </Box>
    )
  }
  return <Box flexDirection="row">{[0, 1].map(colonne)}</Box>
}

export default RondsClient
