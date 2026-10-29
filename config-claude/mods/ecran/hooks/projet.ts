import type { EngineInterface as Engine } from 'claude-code'

const ECRITURE = new Set(['Write', 'Edit'])

export const cheminEcrit = (e: { tool: string; file_path?: unknown; notebook_path?: unknown }) => {
  const chemin = e.tool === 'NotebookEdit' ? e.notebook_path : ECRITURE.has(e.tool) ? e.file_path : undefined
  return typeof chemin === 'string' && chemin.startsWith('/') ? chemin : null
}

export const estPlan = (chemin: string) => /\/evan\/PLAN[^/]*\.md$/.test(chemin)

export const dossierDe = (chemin: string) => chemin.slice(0, chemin.lastIndexOf('/')) || '/'
export const nomDe = (chemin: string) => chemin.slice(chemin.lastIndexOf('/') + 1)

// Une session = un plan (demande d'Evan du 29/10) : le dernier PLAN*.md que la session a écrit, gardé par
// identifiant de session dans le magasin du mod pour survivre au rechargement et à la reprise. Jamais le plus
// récent du dossier : toutes les sessions d'un dépôt montraient alors le même plan. Un lien de plus de 30 jours
// est oublié.
const LIENS = 'liens'
const GARDE_MS = 30 * 24 * 3600 * 1000

type Liens = Record<string, { plan: string; t: number }>

async function lireLiens($: Engine): Promise<Liens> {
  const brut = await $.store.get(LIENS)
  return brut !== null && typeof brut === 'object' ? (brut as Liens) : {}
}

export async function planGarde($: Engine) {
  const lien = (await lireLiens($))[await $.session.id()]
  return typeof lien?.plan === 'string' ? lien.plan : null
}

export async function garderPlan($: Engine, plan: string) {
  const [sid, maintenant, liens] = await Promise.all([$.session.id(), $.clock.now(), lireLiens($)])
  const frais = Object.fromEntries(Object.entries(liens).filter(([, l]) => maintenant - l.t < GARDE_MS))
  await $.store.set(LIENS, { ...frais, [sid]: { plan, t: maintenant } })
}

// Le chantier que le plan nomme : la ligne « Chantier : … », sinon « Chantier N » dans le titre.
export function chantierNomme(plan: string) {
  const ligne = plan.match(/^\**Chantier\**\s*:\s*(.+)$/im)?.[1] ?? plan.match(/^#\s.*\bChantier\s+(\d+)\b/im)?.[1]
  return ligne ? ligne.replace(/\*\*|`/g, '').trim() || null : null
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
