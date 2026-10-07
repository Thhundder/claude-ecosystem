import { atom, read, update } from 'claude-code'
import type { AgentInfo, EngineInterface as Engine, ModelUsage, Register } from 'claude-code'

import type { Conso, Ligne } from '../types'

const PANE = 'agents-vue'
const PRINCIPAL = 'principal'
const lignes = atom({ plugin: 'agents-vue', key: 'lignes' } as const, [])
const conso = atom({ plugin: 'agents-vue', key: 'conso' } as const, {})

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

const VIDE: Conso = { etapes: 0, lus: 0, relus: 0, ecrits: 0, ms: 0 }

export const kilo = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace('.', ',')} M` : `${Math.round(n / 1000)} k`

export const cumuler = (c: Conso | undefined, u: ModelUsage | null, ms: number): Conso => {
  const a = c ?? VIDE
  return {
    etapes: a.etapes + 1,
    lus: a.lus + (u?.input_tokens ?? 0) + (u?.cache_creation_input_tokens ?? 0),
    relus: a.relus + (u?.cache_read_input_tokens ?? 0),
    ecrits: a.ecrits + (u?.output_tokens ?? 0),
    ms: a.ms + ms,
  }
}

export const resumeConso = (c: Conso) =>
  `${c.etapes} étapes · ${kilo(c.relus)} relus · ${kilo(c.lus)} lus · ${kilo(c.ecrits)} écrits · ${duree(c.ms)} au modèle`

const consigner = async ($: Engine, ligne: Record<string, unknown>) => {
  const [home, sid] = await Promise.all([$.env.get('HOME'), $.session.id()])
  const dossier = `${home}/.claude/cache/conso`
  await $.process.run(['sh', '-c', 'mkdir -p "$1" && cat >> "$1/$2.jsonl"', '_', dossier, sid], {
    stdin: JSON.stringify(ligne) + '\n',
    timeoutMs: 5000,
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
    await $.command.register({ name: 'conso', description: 'Jetons et temps de la session et de chaque agent' })
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

  on('turn.step', async function* ($, e, next) {
    const debut = await $.clock.now()
    const reponse = yield* next(e)
    const ms = (await $.clock.now()) - debut
    const cle = e.agentId ?? PRINCIPAL
    await update($, conso, c => ({ ...c, [cle]: cumuler(c[cle], reponse.usage, ms) }))
    void consigner($, {
      t: new Date(debut).toISOString(),
      agent: cle,
      etape: e.index,
      modele: e.model,
      ms,
      lus: (reponse.usage?.input_tokens ?? 0) + (reponse.usage?.cache_creation_input_tokens ?? 0),
      relus: reponse.usage?.cache_read_input_tokens ?? 0,
      ecrits: reponse.usage?.output_tokens ?? 0,
      outils: reponse.toolUses.map(o => o.name),
    }).catch(err => $.ui.log(`agents-vue: conso non écrite (${String(err).slice(0, 120)})`))
    return reponse
  })

  on('command.run', { command: 'conso' }, async $ => {
    const [c, l, home, sid] = await Promise.all([read($, conso), read($, lignes), $.env.get('HOME'), $.session.id()])
    const noms = new Map(l.map(x => [x.id, `${x.type} — ${x.tache}`]))
    const rangs = Object.entries(c).sort((a, b) => b[1].relus - a[1].relus)
    if (rangs.length === 0) return { text: 'Aucun appel au modèle compté depuis le chargement du mod.' }
    const texte = rangs
      .map(([id, v]) => `${id === PRINCIPAL ? 'session principale' : (noms.get(id) ?? id)} : ${resumeConso(v)}`)
      .join('\n')
    return { text: `${texte}\nDétail étape par étape : ${home}/.claude/cache/conso/${sid}.jsonl` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const [liste, c] = await Promise.all([read($, lignes), read($, conso)])
    const principal = c[PRINCIPAL]
    const t = maintenant || (await $.clock.now())
    const room = Math.max(1, Math.floor(((e.viewport?.rows ?? 24) - 3) / 3))
    const tri = [...liste].sort((a, b) => Number(b.fin === null) - Number(a.fin === null) || b.depuis - a.depuis)

    return (
      <Box flexDirection="column">
        {principal !== undefined && <Text dimColor>session principale · {resumeConso(principal)}</Text>}
        {tri.length === 0 && <Text dimColor>Aucun agent dans cette session.</Text>}
        {tri.slice(0, room).map(l => (
          <Box key={l.id} flexDirection="column">
            <Text color={l.fin === null ? 'success' : undefined} dimColor={l.fin !== null}>
              {STATUTS[l.statut] ?? l.statut} · {duree((l.fin ?? t) - l.depuis)} · {l.type}
            </Text>
            <Text dimColor>  {l.tache}</Text>
            {c[l.id] !== undefined && <Text dimColor>  {resumeConso(c[l.id] ?? VIDE)}</Text>}
          </Box>
        ))}
      </Box>
    )
  })
}
