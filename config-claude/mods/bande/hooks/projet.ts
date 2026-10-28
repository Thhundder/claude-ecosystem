import type { EngineInterface as Engine } from 'claude-code'

const ECRITURE = new Set(['Write', 'Edit'])

export const cheminEcrit = (e: { tool: string; file_path?: unknown; notebook_path?: unknown }) => {
  const chemin = e.tool === 'NotebookEdit' ? e.notebook_path : ECRITURE.has(e.tool) ? e.file_path : undefined
  return typeof chemin === 'string' && chemin.startsWith('/') ? chemin : null
}

export const estPlan = (chemin: string) => /\/evan\/PLAN[^/]*\.md$/.test(chemin)

export const choisirPlan = <F extends { name: string; mtimeMs: number }>(fichiers: readonly F[], dossier: string, ecrit: string | null) => {
  const plans = fichiers.filter(f => /^PLAN.*\.md$/.test(f.name))
  return plans.find(f => `${dossier}/${f.name}` === ecrit) ?? [...plans].sort((a, b) => b.mtimeMs - a.mtimeMs)[0]
}

export async function depotDe($: Engine, chemin: string) {
  const dossier = chemin.slice(0, chemin.lastIndexOf('/')) || '/'
  const run = await $.process.run(['git', '-C', dossier, 'rev-parse', '--show-toplevel'], { timeoutMs: 2000 })
  return run.exitCode === 0 ? run.stdout.trim() || null : null
}
