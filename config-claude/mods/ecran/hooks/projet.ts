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

// Commande Bash de la session, lancée au premier plan (une commande de fond écrit après la fin de l'appel).
export const commandeShell = (e: { tool: string; command?: unknown; run_in_background?: unknown }) =>
  e.tool === 'Bash' && typeof e.command === 'string' && e.run_in_background !== true ? e.command : null

const resoudre = (base: string, chemin: string) => {
  const parts: string[] = []
  for (const p of (chemin.startsWith('/') ? chemin : `${base}/${chemin}`).split('/')) {
    if (p === '..') parts.pop()
    else if (p !== '' && p !== '.') parts.push(p)
  }
  return `/${parts.join('/')}`
}

const HEREDOC = /(?<!<)<<(?!<)-?\s*(['"]?)([\w.-]+)\1/g

// Fichiers sous un dossier evan/ que la commande nomme, en absolu, dans l'ordre (le dernier nommé en dernier) : les
// mots qui ont une forme de chemin, y compris dans le corps d'un heredoc (script python), relatifs au dossier courant
// suivi le long des `cd`. Seulement des candidats : leur date de modification dit lesquels ont été écrits.
export function cheminsShell(commande: string, cwd: string, home: string) {
  const vus: string[] = []
  let ici = cwd
  const developper = (mot: string) => mot.replace(/^~(?=\/|$)|^\$\{?HOME\}?(?=\/|$)/, home)
  const noter = (texte: string) => {
    for (const brut of texte.match(/[~$\w.{}/+@%-]+/g) ?? []) {
      const mot = developper(brut)
      if (mot.startsWith('-') || /^\.\w/.test(mot) || mot.includes('$') || !(mot.includes('/') || /\.\w{1,8}$/.test(mot))) continue
      const chemin = resoudre(ici, mot)
      if (!/\/evan\/[^/]/.test(chemin)) continue
      vus.splice(0, vus.length, ...vus.filter(v => v !== chemin), chemin)
    }
  }
  const fins: string[] = []
  for (const ligne of commande.split('\n')) {
    if (fins.length > 0) {
      if (ligne.trim() === fins[0]) fins.shift()
      else noter(ligne)
      continue
    }
    for (const m of ligne.matchAll(HEREDOC)) fins.push(m[2] as string)
    for (const segment of ligne.replace(HEREDOC, ' ').split(/&&|\|\||[;|&()]/)) {
      const [verbe, arg] = segment.trim().split(/\s+/)
      if (verbe === 'cd' || verbe === 'pushd') {
        const dossier = arg?.replace(/^(['"])(.*)\1$/, '$2')
        if (dossier === undefined || dossier === '~') ici = home
        else if (dossier !== '-') ici = resoudre(ici, developper(dossier))
      } else noter(segment)
    }
  }
  return vus.slice(-20)
}
