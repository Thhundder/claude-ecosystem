import type { ClientModule } from 'claude-code'

// Lignes cliquables du panneau (titres de section, boutons « non fini », lignes de fini quand) : le Button du moteur
// s'inverse sous la souris ; ici seul le texte de la zone survolée change de couleur, sans fond.
export type Seg = { t: string; c: string; g?: boolean; b?: boolean; a?: string }
export type PropsLignes = { lignes: Seg[][] }

export const CHAUD = '#FFFFFF'

export const longueur = (t: string) => [...t].length

export function actionSous(p: PropsLignes, x: number, y: number) {
  const ligne = p.lignes[Math.floor(y)]
  if (!ligne || x < 0) return null
  let debut = 0
  for (const s of ligne) {
    const fin = debut + longueur(s.t)
    if (x >= debut && x < fin) return s.a ?? null
    debut = fin
  }
  return null
}

const LigneClient: ClientModule<PropsLignes, { chaud: string | null }> = (p, surface) => {
  const { Box, Text } = surface.elements
  const chaud = surface.state?.chaud ?? null
  surface.onPointer(e => {
    const a = e.type === 'leave' ? null : actionSous(p, e.fine?.x ?? e.x + 0.5, e.fine?.y ?? e.y + 0.5)
    if (e.type === 'down' && (e.button ?? 'left') === 'left' && a !== null) surface.post({ action: a })
    if (a !== chaud) surface.setState({ chaud: a })
  })
  return (
    <Box flexDirection="column">
      {p.lignes.map((ligne, y) => (
        <Text key={`l${y}`} wrap="truncate-end">
          {ligne.map((s, i) => (
            <Text key={`s${i}`} color={s.a !== undefined && s.a === chaud ? CHAUD : s.c} bold={s.g === true} strikethrough={s.b === true}>{s.t}</Text>
          ))}
        </Text>
      ))}
    </Box>
  )
}

export default LigneClient
