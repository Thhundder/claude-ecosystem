export type AppelAgent = { description: string; prompt: string; subagent_type?: string; model?: string; isolation?: string }

const MODELES: Record<string, string> = { opus: 'claude-opus-5-5', fable: 'claude-fable-5-1' }
const ORDINAIRES = new Set(['', 'fork', 'general-purpose', 'claude'])

const guillemets = (texte: string) => `'${texte.replace(/'/g, `'\\''`)}'`

export function commande(a: AppelAgent, dossier: string) {
  const type = a.subagent_type ?? ''
  const options = [
    type === 'fork' ? '--fork' : '',
    `--dossier ${guillemets(dossier)}`,
    a.model && MODELES[a.model] ? `--modele ${MODELES[a.model]}` : '',
  ].filter(Boolean)
  const role = ORDINAIRES.has(type) ? '' : `Rôle demandé : ${type}.\n\n`
  let borne = 'CONSIGNE_AGENT'
  while (a.prompt.includes(borne)) borne += '_'
  return `~/.claude/bin/agent-session.py ${guillemets(a.description)} ${options.join(' ')} <<'${borne}'\n${role}${a.prompt}\n${borne}`
}

export function refus(a: AppelAgent, dossier: string) {
  const isolation = a.isolation ? `\n\nL’isolation « ${a.isolation} » n’est pas reprise : prépare toi-même le dossier (par exemple un worktree git) et passe-le en --dossier.` : ''
  return (
    'agents-sessions : chez Evan, un agent passe par une vraie session nommée « AGENT · … », reprenable par son nom. ' +
    'Relance exactement ce travail avec l’outil Bash, run_in_background: true, et cette commande :\n\n' +
    `${commande(a, dossier)}\n\n` +
    `Le rapport arrive à la fin de la tâche de fond. Reprise : claude --resume ${guillemets(`AGENT · ${a.description}`)} ; liste : ~/.claude/bin/agent-session.py --etat.` +
    isolation
  )
}
