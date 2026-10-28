export const SEUIL_GO = 3

const SANS_EFFET = new Set(['Read', 'Grep', 'Glob', 'LS', 'TaskStop', 'TaskOutput', 'KillShell', 'ToolSearch', 'AskUserQuestion', 'SubagentHandback', 'SendMessage', 'ExitPlanMode'])

const LIBERER = /^(kill|pkill|killall|ps|free|top|cat|ls|head|tail|grep|rg|wc|pgrep|tmux\s+(kill-session|kill-server|ls)|docker\s+(stop|kill|rm|ps)|systemctl\s+--user\s+(stop|status)|\S*\/(memoire\.py|garde-memoire\.py))\b/

const LOURDES: [string, number, RegExp][] = [
  ['émulateur Android', 5, /(^|[\s/;&|])(emulator|qemu-system\S*)\b/],
  ['compilation Android', 4, /(^|[\s/;&|])(gradlew?)\b|expo\s+run:android|react-native\s+run-android/],
  ['suite de tests navigateur', 4, /playwright\s+test\b|run\s+test:e2e\b/],
  ['serveur de développement', 3, /expo\s+start|next\s+(dev|build)|(^|[\s;&|])vite(\s|$)|(bun|npm|pnpm|yarn)\s+(run\s+)?(dev|build)(\s|$)/],
  ['vérification de types', 2.5, /(^|[\s/;&|])(tsc|vue-tsc)\b|(bun|npm|pnpm|yarn)\s+(run\s+)?(typecheck|lint)(\s|$)/],
]

export const disponibleGo = (meminfo: string) => {
  const m = meminfo.match(/^MemAvailable:\s+(\d+) kB/m)
  return m ? Number(m[1]) / 1024 ** 2 : null
}

const segments = (commande: string) =>
  commande
    .replace(/'[^']*'|"(\\.|[^"\\])*"/g, ' ')
    .split(/&&|\|\||[;&|\n]/)
    .map(s => s.trim().replace(/^(sudo|nohup|exec|timeout\s+\S+)\s+/, ''))
    .filter(Boolean)

export const lourde = (commande: string) => {
  const nu = commande.replace(/'[^']*'|"(\\.|[^"\\])*"/g, ' ')
  return LOURDES.filter(([, , motif]) => motif.test(nu)).sort((a, b) => b[1] - a[1])[0] ?? null
}

export function juger(outil: string, commande: string | undefined, dispo: number, seuil = SEUIL_GO): string | null {
  const reste = `il reste ${dispo.toFixed(1).replace('.', ',')} Go de mémoire disponible`
  if (dispo < seuil) {
    if (SANS_EFFET.has(outil)) return null
    if (outil === 'Bash' && commande !== undefined && segments(commande).every(s => LIBERER.test(s))) return null
    return `Garde mémoire (mod bande) : ${outil} refusé, ${reste}, sous le seuil de ${seuil} Go. Seules la lecture et l'arrêt de tâches restent permis. Libérer de la mémoire d'abord (ps, TaskStop, arrêt d'un serveur ou d'un émulateur) ; ne jamais arrêter une session Claude ni les robots crypto ; proposer à Evan quoi arrêter.`
  }
  if (outil === 'Bash' && commande !== undefined) {
    const l = lourde(commande)
    if (l && dispo - l[1] < seuil)
      return `Garde mémoire (mod bande) : ${l[0]} refusé, ${reste} ; il en demande environ ${String(l[1]).replace('.', ',')} Go et il doit en rester ${seuil}. Libérer de la mémoire d'abord, ou proposer à Evan quoi arrêter.`
  }
  return null
}
