import type { EngineInterface as Engine, Register } from 'claude-code'

type Tache = { id?: string; status?: string; durationMs?: number }
export type Ligne = { glyphe: string; couleur?: string; texte: string }

const GLYPHES: Record<string, { glyphe: string; couleur?: string }> = {
  completed: { glyphe: '✓' },
  failed: { glyphe: '✗', couleur: 'error' },
  killed: { glyphe: '■' },
}

export function duree(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s} s`
  const min = Math.floor(s / 60)
  if (min < 60) return `${min} min ${String(s % 60).padStart(2, '0')} s`
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`
}

export function nature(texte: string, connu: boolean): string {
  if (/^\s*(\S+\s+)?agent\b/i.test(texte) || connu) return 'agent'
  if (/\b(command|commande|shell|bash)\b/i.test(texte)) return 'shell'
  if (/\bmonitor\b/i.test(texte)) return 'veille'
  if (/\bworkflow\b/i.test(texte)) return 'workflow'
  return 'tâche'
}

export const nomCite = (texte: string) => texte.match(/["“«]\s*([^"”»\n]+?)\s*["”»]/)?.[1]

const FINS: Record<string, string> = { completed: 'fini', failed: 'échoué', killed: 'arrêté' }

export function resumeTache(texte: string, tache: Tache, description?: string): Ligne {
  const statut = tache.status ?? ''
  const { glyphe, couleur } = GLYPHES[statut] ?? { glyphe: '•' }
  const nom = nomCite(texte) ?? description
  const fin = FINS[statut] ?? (statut || 'terminé')
  const temps = tache.durationMs === undefined ? '' : ` en ${duree(tache.durationMs)}`
  return { glyphe, couleur, texte: `${nature(texte, description !== undefined)}${nom ? ` « ${nom} »` : ''} ${fin}${temps}` }
}

export function resumeRapport(nom: string, texte: string): Ligne {
  const n = texte.trimEnd().split('\n').length
  return { glyphe: '↩', texte: `rapport de ${nom} (${n} ligne${n > 1 ? 's' : ''})` }
}

async function descriptionAgent($: Engine, id: string | undefined) {
  if (id === undefined) return undefined
  const agents = await $.agent.list()
  return agents.find(a => a.id === id)?.description
}

export const register: Register = on => {
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const { props } = e
    if (props.isExpanded) return next(e)
    const tache = props.origin.kind === 'task-notification' ? props.task : undefined
    const ligne = tache
      ? resumeTache(props.text, tache, nomCite(props.text) ? undefined : await descriptionAgent($, tache.id))
      : props.from
        ? resumeRapport(props.from.name, props.text)
        : undefined
    if (!ligne) return next(e)
    const { Text } = $.ui.resolve(e)
    return (
      <Text dimColor wrap="truncate-end">
        <Text color={ligne.couleur}>{ligne.glyphe}</Text> {ligne.texte}
      </Text>
    )
  })
}
