import type { SessionMessage } from 'claude-code'

export const FICHIER = '.claude/retours/RETOURS.txt'
export const ENTETE = '===== BOF '

const FORMES = /\b(sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[abpr]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})/g
const ETIQUETTES = /((?:api[_-]?key|secret|token|password|passwd|pwd|authorization)["']?\s*[:=]\s*["']?|Bearer\s+)([^\s"',;]{6,})/gi
const ALEATOIRE = /\b[A-Za-z0-9]{24,}\b/g

const cacher = (v: string) => `${v.slice(0, 4)}…(masqué)`

export const masquer = (texte: string) =>
  texte
    .replace(FORMES, cacher)
    .replace(ETIQUETTES, (_, etiquette: string, valeur: string) => etiquette + (valeur.includes('…(masqué)') ? valeur : cacher(valeur)))
    .replace(ALEATOIRE, v => (/[A-Z]/.test(v) && /[a-z]/.test(v) && /\d/.test(v) ? cacher(v) : v))

const court = (v: unknown, n = 120) => {
  const s = typeof v === 'string' ? v.split('\n')[0]!.trim() : ''
  return s.length > n ? `${s.slice(0, n)}…` : s
}

export const cible = (input: Record<string, unknown>) =>
  court(input.file_path ?? input.notebook_path ?? input.command ?? input.pattern ?? input.url ?? input.query ?? input.skill ?? input.description ?? input.path ?? input.prompt ?? '')

const estCommandeBof = (t: string) => /<command-name>\/?bof<\/command-name>/.test(t) || /^\/bof(\s|$)/.test(t.trim())
const estTechnique = (t: string) => /^\s*<(local-command-caveat|local-command-stdout|local-command-stderr)>/.test(t)

export const lisible = (t: string) => {
  const nom = /<command-name>\/?([^<]+)<\/command-name>/.exec(t)
  if (!nom) return t.trim()
  const args = /<command-args>([\s\S]*?)<\/command-args>/.exec(t)?.[1]?.trim()
  return `/${nom[1]}${args ? ` ${args}` : ''}`
}

export const estPrompt = (m: SessionMessage) => m.role === 'user' && !m.toolResults?.length && m.text.trim() !== '' && !estTechnique(m.text)

export function derniersEchanges(messages: readonly SessionMessage[], n = 10) {
  const utiles = messages.filter(m => !(m.role === 'user' && (estCommandeBof(m.text) || estTechnique(m.text))))
  const debuts = utiles.flatMap((m, i) => (estPrompt(m) ? [i] : []))
  const depart = debuts.length > n ? debuts[debuts.length - n]! : (debuts[0] ?? utiles.length)
  const echanges: SessionMessage[][] = []
  for (const m of utiles.slice(depart)) {
    if (estPrompt(m) || !echanges.length) echanges.push([])
    echanges.at(-1)!.push(m)
  }
  return echanges
}

export function formaterEchange(echange: readonly SessionMessage[], rang: number) {
  const lignes: string[] = []
  for (const m of echange) {
    if (m.role === 'user') {
      if (estPrompt(m)) lignes.push(`[${rang}] Evan : ${lisible(m.text)}`)
      continue
    }
    if (m.text.trim()) lignes.push(`Claude : ${m.text.trim()}`)
    for (const u of m.toolUses) lignes.push(`  · ${u.tool}${cible(u.input) ? ` : ${cible(u.input)}` : ''}${u.isError ? ' (erreur)' : ''}`)
  }
  return lignes.join('\n')
}

const deux = (n: number) => String(n).padStart(2, '0')
export const horodatage = (d: Date) => `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())} ${deux(d.getHours())}:${deux(d.getMinutes())}`

export function entree(o: { quand: Date; texte: string; session: string; transcription: string; dossier: string; messages: readonly SessionMessage[] }) {
  const echanges = derniersEchanges(o.messages)
  const corps = echanges.map((e, i) => formaterEchange(e, i + 1)).join('\n\n')
  return masquer(
    `${ENTETE}${horodatage(o.quand)} =====\n` +
      `Retour d'Evan : ${o.texte.trim() || '(sans texte)'}\n` +
      `Session : ${o.session}\nTranscription : ${o.transcription}\nDossier : ${o.dossier}\n` +
      `--- ${echanges.length} derniers échanges ---\n${corps}\n\n`,
  )
}

export const dossierProjet = (racine: string) => racine.replace(/[^A-Za-z0-9]/g, '-')

export const estConfig = (chemin: string, home: string) =>
  (chemin.startsWith(`${home}/.claude/`) && !chemin.startsWith(`${home}/.claude/retours/`)) ||
  chemin.startsWith(`${home}/Documents/claude-ecosystem/config-claude/`)
