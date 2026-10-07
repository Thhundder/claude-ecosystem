import { atom, read, update } from 'claude-code'
import type { EngineInterface as Engine, ModelUsage, Register, SessionRateLimit } from 'claude-code'

import type { Mesure, Plan, Quota } from '../types'

const mesure = atom({ plugin: 'bande', key: 'mesure' } as const, null)
const agents = atom({ plugin: 'bande', key: 'agents' } as const, { actifs: 0, anomalies: [] })
const signalees = atom({ plugin: 'bande', key: 'signalees' } as const, [])
const tour = atom({ plugin: 'bande', key: 'tour' } as const, { lus: 0, relus: 0, ecrits: 0 })
const plan = atom({ plugin: 'bande', key: 'plan' } as const, null)
const memoire = atom({ plugin: 'bande', key: 'memoire' } as const, null)

const VEILLE = '.claude/bin/veille-wf.py'
const ANOMALIE = /agent gelé|arrêté|agent seul muet/
const ACTIFS = new Set(['pending', 'running', 'waiting'])
const GO = 1024 ** 3
const NOMS_QUOTA: Record<string, string> = { five_hour: '5 h', seven_day: 'semaine' }

export const kilo = (tokens: number) =>
  tokens >= 1_000_000 ? `${(tokens / 1_000_000).toFixed(1).replace('.', ',')} M` : `${Math.round(tokens / 1000)} k`

export const lignesAnomalies = (sortie: string) =>
  sortie
    .split('\n')
    .filter(ligne => ANOMALIE.test(ligne))
    .map(ligne => {
      const [cles = ligne, texte = ligne] = ligne.includes('\t') ? ligne.split('\t', 2) : [ligne, ligne]
      return { cles: [cles.trim()], texte: texte.trim().replace(/\s{2,}/g, ' ') }
    })

export const quotas = (limites: readonly SessionRateLimit[]): Quota[] =>
  limites.filter(l => l.kind in NOMS_QUOTA).map(l => ({ kind: l.kind, pct: l.percentUsed }))

export const compterPlan = (nom: string, texte: string): Plan | null => {
  const faits = (texte.match(/^\s*[-*] \[[xX]\]/gm) ?? []).length
  const restants = (texte.match(/^\s*[-*] \[ \]/gm) ?? []).length
  return faits + restants === 0 ? null : { nom, faits, total: faits + restants }
}

export const barre = (faits: number, total: number, largeur = 10) => {
  const pleins = Math.round((faits / total) * largeur)
  return '▓'.repeat(pleins) + '░'.repeat(largeur - pleins)
}

export const disponible = (meminfo: string) => {
  const m = meminfo.match(/^MemAvailable:\s+(\d+) kB/m)
  return m ? (Number(m[1]) * 1024) / GO : null
}

const ajouterUsage = async ($: Engine, u: ModelUsage) => {
  await update($, tour, t => ({
    lus: t.lus + u.input_tokens + u.cache_creation_input_tokens,
    relus: t.relus + u.cache_read_input_tokens,
    ecrits: t.ecrits + u.output_tokens,
  }))
}

const mesurer = async ($: Engine) => {
  const usage = await $.session.usage()
  const valeur: Mesure = {
    tokens: usage.context.tokens ?? null,
    fenetre: usage.context.window,
    quotas: quotas(usage.rateLimits),
  }
  await update($, mesure, () => valeur)
}

const lirePlan = async ($: Engine) => {
  const dossier = `${await $.session.cwd()}/evan`
  if (!(await $.fs.exists(dossier))) return update($, plan, () => null)
  const plans = (await $.fs.list(dossier)).filter(f => /^PLAN.*\.md$/.test(f.name))
  if (plans.length === 0) return update($, plan, () => null)
  const dates = await Promise.all(plans.map(async f => ({ f, t: (await $.fs.stat(`${dossier}/${f.name}`)).mtimeMs ?? 0 })))
  const recent = dates.sort((a, b) => b.t - a.t)[0]?.f.name
  if (recent === undefined) return update($, plan, () => null)
  const valeur = compterPlan(recent.replace(/^PLAN-?|\.md$/g, '') || 'plan', await $.fs.read(`${dossier}/${recent}`))
  await update($, plan, () => valeur)
}

const lireMemoire = async ($: Engine) => {
  const run = await $.process.run(['cat', '/proc/meminfo'], { timeoutMs: 2000 })
  const go = disponible(run.stdout)
  const avant = await read($, memoire)
  if (go === null || avant === null || Math.abs(go - avant) >= 0.1) await update($, memoire, () => go)
}

const compter = async ($: Engine) => {
  const liste = await $.agent.list()
  const actifs = liste.filter(a => ACTIFS.has(a.status)).length
  const avant = await read($, agents)
  if (avant.actifs !== actifs) await update($, agents, a => ({ ...a, actifs }))
}

const veiller = async ($: Engine) => {
  const [cwd, sid, home] = await Promise.all([$.session.cwd(), $.session.id(), $.env.get('HOME')])
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

const sansEchec = ($: Engine, travail: () => Promise<unknown>) => () =>
  void travail().catch(err => $.ui.log(`bande: ${String(err).slice(0, 160)}`))

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    $.clock.every(60_000, sansEchec($, () => veiller($)))
    $.clock.every(30_000, sansEchec($, () => lirePlan($)))
    $.clock.every(5_000, sansEchec($, () => compter($)))
    $.clock.every(5_000, sansEchec($, () => lireMemoire($)))
    sansEchec($, () => veiller($))()
    sansEchec($, () => mesurer($))()
    sansEchec($, () => lirePlan($))()
    sansEchec($, () => lireMemoire($))()
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind === 'composer' || e.origin.kind === 'bridge') {
      await update($, tour, () => ({ lus: 0, relus: 0, ecrits: 0 }))
    }
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const reponse = yield* next(e)
    if (reponse.usage) await ajouterUsage($, reponse.usage)
    return reponse
  })

  on('session.measure', async ($, e, next) => {
    await update($, mesure, () => ({
      tokens: e.context.tokens ?? null,
      fenetre: e.context.window,
      quotas: quotas(e.rateLimits),
    }))
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    sansEchec($, () => veiller($))()
    sansEchec($, () => lirePlan($))()
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const [m, a, t, p, go] = await Promise.all([
      read($, mesure), read($, agents), read($, tour), read($, plan), read($, memoire),
    ])
    if (m === null) return next(e)
    const { Box, Text } = $.ui.resolve(e)

    const pct = m.tokens === null ? null : Math.round((m.tokens / m.fenetre) * 100)
    const contexte = m.tokens === null ? 'contexte —' : `contexte ${kilo(m.tokens)} (${pct} %)`
    const lourd = m.tokens !== null && m.tokens >= 600_000
    const gel = a.anomalies.length
    const basse = go !== null && go < 3

    return (
      <Box>
        <Text color={lourd ? 'warning' : undefined} dimColor={!lourd}>{contexte}</Text>
        {m.quotas.map(q => (
          <Text key={q.kind} color={q.pct >= 80 ? 'warning' : undefined} dimColor={q.pct < 80}>
            {' · '}quota {NOMS_QUOTA[q.kind]} {Math.round(q.pct)} %
          </Text>
        ))}
        {t.relus + t.lus > 0 && (
          <Text dimColor> · tour {kilo(t.relus)} relus, {kilo(t.lus)} lus, {kilo(t.ecrits)} écrits</Text>
        )}
        {p !== null && <Text dimColor> · plan {p.faits}/{p.total} {barre(p.faits, p.total)}</Text>}
        <Text dimColor> · agents {a.actifs}</Text>
        {gel > 0 && <Text color="error"> · {gel} en panne</Text>}
        {go !== null && (
          <Text color={basse ? 'error' : undefined} dimColor={!basse}> · mémoire {go.toFixed(1).replace('.', ',')} Go</Text>
        )}
      </Box>
    )
  })
}
