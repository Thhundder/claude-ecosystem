import { atom, read, update } from 'claude-code'
import type { EngineInterface as Engine, Register } from 'claude-code'

import type { Mesure } from '../types'

const mesure = atom({ plugin: 'bande', key: 'mesure' } as const, null)
const agents = atom({ plugin: 'bande', key: 'agents' } as const, { actifs: 0, anomalies: [] })
const plafond = atom({ plugin: 'bande', key: 'plafond' } as const, null)
const signalees = atom({ plugin: 'bande', key: 'signalees' } as const, [])

const VEILLE = '.claude/bin/veille-wf.py'
const ANOMALIE = /agent gelé|arrêté|agent seul muet/
const ACTIFS = new Set(['pending', 'running', 'waiting'])

export const euros = (usd: number) => `${usd.toFixed(2).replace('.', ',')} $`

export const kilo = (tokens: number) => `${Math.round(tokens / 1000)} k`

export const lignesAnomalies = (sortie: string) =>
  sortie
    .split('\n')
    .filter(ligne => ANOMALIE.test(ligne))
    .map(ligne => {
      const [cles, texte] = ligne.includes('\t') ? ligne.split('\t', 2) : [ligne, ligne]
      return { cles: [cles.trim()], texte: (texte ?? ligne).trim().replace(/\s{2,}/g, ' ') }
    })

export const lirePlafond = (args: string) => {
  const brut = args.trim().replace(',', '.').replace(/\s*\$$/, '')
  if (brut === '' || brut === 'off') return null
  const n = Number(brut)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

const mesurer = async ($: Engine) => {
  const usage = await $.session.usage()
  const valeur: Mesure = {
    tokens: usage.context.tokens ?? null,
    fenetre: usage.context.window,
    usd: usage.cost?.usd ?? null,
  }
  await update($, mesure, () => valeur)
  await alerterPlafond($, valeur.usd)
}

const alerterPlafond = async ($: Engine, usd: number | null) => {
  const max = await read($, plafond)
  if (max === null || usd === null) return
  for (const seuil of [1, 0.8]) {
    if (usd < max * seuil) continue
    const cle = `plafond:${max}:${seuil}`
    const deja = await read($, signalees)
    if (deja.includes(cle)) return
    await update($, signalees, liste => [...liste, cle])
    $.ui.toast(
      seuil === 1
        ? `Plafond atteint : ${euros(usd)} dépensés sur ${euros(max)}`
        : `80 % du plafond : ${euros(usd)} sur ${euros(max)}`,
      { timeoutMs: 15000 },
    )
    return
  }
}

const compter = async ($: Engine) => {
  const liste = await $.agent.list()
  const actifs = liste.filter(a => ACTIFS.has(a.status)).length
  const avant = await read($, agents)
  if (avant.actifs !== actifs) await update($, agents, a => ({ ...a, actifs }))
}

const veiller = async ($: Engine) => {
  const [cwd, sid, home] = await Promise.all([
    $.session.cwd(),
    $.session.id(),
    $.env.get('HOME'),
  ])
  const projet = cwd.replace(/[/.]/g, '-')
  let anomalies: { cles: string[]; texte: string }[] = []
  try {
    const run = await $.process.run(
      ['python3', `${home}/${VEILLE}`, '--projet', projet, '--session', sid, '--cles'],
      { timeoutMs: 10000 },
    )
    anomalies = lignesAnomalies(run.stdout)
  } catch (erreur) {
    $.ui.log(`bande: veille impossible (${String(erreur).slice(0, 120)})`)
  }
  await update($, agents, a => ({ ...a, anomalies: anomalies.map(x => x.texte) }))
  await compter($)

  const deja = await read($, signalees)
  const neuves = anomalies.filter(a => a.cles.some(c => !deja.includes(c)))
  if (neuves.length === 0) return
  await update($, signalees, l => [...l, ...neuves.flatMap(a => a.cles)])
  $.ui.toast(`Veille : ${neuves.map(a => a.texte).join(' ; ')}`, { timeoutMs: 20000 })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'plafond',
      description: 'Plafond de dépense de la session en dollars (/plafond 15, /plafond off)',
      argumentHint: '<dollars|off>',
    })
    $.clock.every(60_000, () => void veiller($).catch(err => $.ui.log(`bande: ${String(err)}`)))
    $.clock.every(5_000, () => void compter($).catch(err => $.ui.log(`bande: ${String(err)}`)))
    void veiller($)
    void mesurer($)
    return next(e)
  })

  on('command.run', { command: 'plafond' }, async ($, e) => {
    const valeur = lirePlafond(e.args)
    if (valeur === undefined) return { text: `Plafond illisible : « ${e.args} ». Exemple : /plafond 15` }
    await update($, plafond, () => valeur)
    await mesurer($)
    return { text: valeur === null ? 'Plafond retiré.' : `Plafond fixé à ${euros(valeur)}.` }
  })

  on('session.measure', async ($, e, next) => {
    await update($, mesure, () => ({
      tokens: e.context.tokens ?? null,
      fenetre: e.context.window,
      usd: e.cost?.usd ?? null,
    }))
    await alerterPlafond($, e.cost?.usd ?? null)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    void veiller($)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const [m, a, max] = await Promise.all([read($, mesure), read($, agents), read($, plafond)])
    if (m === null) return next(e)
    const { Box, Text } = $.ui.resolve(e)

    const pct = m.tokens === null ? null : Math.round((m.tokens / m.fenetre) * 100)
    const contexte = m.tokens === null ? 'contexte —' : `contexte ${kilo(m.tokens)} (${pct} %)`
    const lourd = m.tokens !== null && m.tokens >= 600_000
    const cout = m.usd === null ? null : max === null ? euros(m.usd) : `${euros(m.usd)} / ${euros(max)}`
    const cher = m.usd !== null && max !== null && m.usd >= max * 0.8
    const gel = a.anomalies.length

    return (
      <Box>
        <Text color={lourd ? 'warning' : undefined} dimColor={!lourd}>{contexte}</Text>
        {cout !== null && <Text dimColor> · </Text>}
        {cout !== null && <Text color={cher ? 'error' : undefined} dimColor={!cher}>{cout}</Text>}
        <Text dimColor> · agents {a.actifs}</Text>
        {gel > 0 && <Text color="error"> · {gel} en panne</Text>}
      </Box>
    )
  })
}
