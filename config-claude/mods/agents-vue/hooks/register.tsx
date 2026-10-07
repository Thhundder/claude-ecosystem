import { atom, read, update } from 'claude-code'
import type { AgentInfo, EngineInterface as Engine, Register } from 'claude-code'

import type { Ligne } from '../types'

const PANE = 'agents-vue'
const lignes = atom({ plugin: 'agents-vue', key: 'lignes' } as const, [])

const ACTIFS = new Set(['pending', 'running', 'waiting'])
const STATUTS: Record<string, string> = {
  pending: 'en attente',
  running: 'au travail',
  waiting: 'attend une réponse',
  idle: 'inactif',
  completed: 'fini',
  failed: 'échoué',
  killed: 'arrêté',
}

export const duree = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m} min ${String(s % 60).padStart(2, '0')}` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`
}

export const fusionner = (avant: Ligne[], liste: AgentInfo[], maintenant: number): Ligne[] => {
  const connues = new Map(avant.map(l => [l.id, l]))
  return liste.map(a => {
    const deja = connues.get(a.id)
    const actif = ACTIFS.has(a.status)
    return {
      id: a.id,
      statut: a.status,
      type: a.type,
      tache: a.description,
      depuis: deja?.depuis ?? maintenant,
      fin: actif ? null : (deja?.fin ?? maintenant),
    }
  })
}

const rafraichir = async ($: Engine) => {
  const [liste, maintenant] = await Promise.all([$.agent.list(), $.clock.now()])
  await update($, lignes, avant => fusionner(avant, liste, maintenant))
}

export const register: Register = on => {
  let maintenant = 0

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'agents-vue', description: 'Ouvre le panneau des agents de la session' })
    $.clock.every(2000, () => {
      void $.clock.now().then(t => (maintenant = t))
      void rafraichir($).catch(err => $.ui.log(`agents-vue: ${String(err)}`))
    })
    return next(e)
  })

  on('command.run', { command: 'agents-vue' }, async $ => {
    await rafraichir($)
    await $.ui.open({ id: PANE, title: 'Agents' })
    return { text: 'Panneau des agents ouvert.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const liste = await read($, lignes)
    const t = maintenant || (await $.clock.now())
    const room = Math.max(1, (e.viewport?.rows ?? 24) - 2)
    const tri = [...liste].sort((a, b) => Number(b.fin === null) - Number(a.fin === null) || b.depuis - a.depuis)

    return (
      <Box flexDirection="column">
        {tri.length === 0 && <Text dimColor>Aucun agent dans cette session.</Text>}
        {tri.slice(0, room).map(l => (
          <Box key={l.id} flexDirection="column">
            <Text color={l.fin === null ? 'success' : undefined} dimColor={l.fin !== null}>
              {STATUTS[l.statut] ?? l.statut} · {duree((l.fin ?? t) - l.depuis)} · {l.type}
            </Text>
            <Text dimColor>  {l.tache}</Text>
          </Box>
        ))}
      </Box>
    )
  })
}
