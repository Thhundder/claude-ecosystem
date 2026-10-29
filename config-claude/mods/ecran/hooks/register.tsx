import { atom, read, update } from 'claude-code'
import type { EngineInterface as Engine, Register } from 'claude-code'

import type { Agent, Donnees, Ram, Tache } from '../types'
import { chantierDe, finiQuand, objectif, planPanneau, pointDuCahier } from './panneau'
import type { AgentVivant } from './panneau'
import { chantierNomme, cheminEcrit, cheminsShell, commandeShell, dossierDe, estPlan, garderPlan, nomDe, planGarde } from './projet'
import { lireArbrePlan, lireProjet } from './suivi'
import { agir, planBas, segsBas, vueBas, vueLigne, vueSuivi } from './vues'
import type { Actions, El } from './vues'

const PANNEAU = 'ecran-panneau'
const ACTIFS = new Set(['pending', 'running', 'waiting'])
const QUOTAS: Record<string, string> = { five_hour: '5 h', seven_day: 'semaine' }
const VIDE: Donnees = { tokens: null, fenetre: 1, quotas: [], cout: null, tours: [], contextes: [], agents: [], plan: null, travaille: false, memoire: null, taches: [] }

// Format de suivi et ram depuis le panneau v4 du 27/10 (plan.titre ajouté) : une valeur d'un autre format, laissée
// par un code d'avant un rechargement à chaud, se lit comme non lue (null) au lieu de faire planter le dessin.
export const FORMAT = 'panneau-v4-20261027'
const donnees = atom({ plugin: 'ecran', key: 'donnees' } as const, VIDE)
const suivi = atom({ plugin: 'ecran', key: 'suivi' } as const, null, { shape: FORMAT })
const ram = atom({ plugin: 'ecran', key: 'ram' } as const, null, { shape: FORMAT })
const place = atom({ plugin: 'ecran', key: 'place' } as const, false)
const kitty = atom({ plugin: 'ecran', key: 'kitty' } as const, false)
const petit = atom({ plugin: 'ecran', key: 'petit' } as const, false)
const PETIT = { largeur: 960, hauteur: 504 }
const planEcrit = atom({ plugin: 'ecran', key: 'planEcrit' } as const, null)
const plis = atom({ plugin: 'ecran', key: 'plis' } as const, [])
const planTout = atom({ plugin: 'ecran', key: 'planTout' } as const, false)
const finiTout = atom({ plugin: 'ecran', key: 'finiTout' } as const, true)
const finiOuvert = atom({ plugin: 'ecran', key: 'finiOuvert' } as const, null)

// Le plan lié à la session : celui de l'état (rechargement, /clear), sinon celui gardé pour son identifiant.
async function planLie($: Engine) {
  const ici = await read($, planEcrit)
  if (ici !== null) return ici
  const garde = await planGarde($)
  if (garde !== null) await update($, planEcrit, () => garde)
  return garde
}

export const lirePlanTexte = (nom: string, texte: string) => {
  const arbre = lireArbrePlan(texte)
  return arbre === null || arbre.total === 0 ? null : { nom, faits: arbre.faits, total: arbre.total }
}

// Après /clear, l'état garde le plan et l'identifiant change : le lien suit la nouvelle session.
async function relier($: Engine) {
  const lie = await read($, planEcrit)
  if (lie !== null) await garderPlan($, lie)
}

export const nomPlan =(chemin: string) => nomDe(chemin).replace(/^PLAN-?|\.md$/g, '') || 'plan'

async function lirePlan($: Engine) {
  const plan = await planLie($)
  if (plan === null || !(await $.fs.exists(plan))) return null
  return lirePlanTexte(nomPlan(plan), await $.fs.read(plan))
}

async function lireMemoire($: Engine) {
  const run = await $.process.run(['cat', '/proc/meminfo'], { timeoutMs: 2000 })
  const m = run.stdout.match(/^MemAvailable:\s+(\d+) kB/m)
  return m ? (Number(m[1]) * 1024) / 1024 ** 3 : null
}

async function sessionsAgents($: Engine, maintenant: number) {
  const [sid, home] = await Promise.all([$.session.id(), $.env.get('HOME')])
  const dossier = `${home}/.claude/cache/agents-sessions`
  if (!(await $.fs.exists(dossier))) return []
  const actives = []
  for (const f of await $.fs.list(dossier)) {
    if (!f.name.endsWith('.json')) continue
    const x = JSON.parse(await $.fs.read(`${dossier}/${f.name}`)) as { id?: string; nom?: string; etat?: string; principale?: string; pid?: number; debut?: string }
    if (x.etat !== 'en cours' || x.principale !== sid || x.pid === undefined || !(await $.fs.exists(`/proc/${x.pid}`))) continue
    actives.push({ id: x.id ?? f.name, nom: x.nom ?? 'AGENT', statut: 'running', depuis: x.debut ? Math.max(0, Math.round((maintenant - Date.parse(x.debut)) / 1000)) : 0 })
  }
  return actives
}

export const fusionner = (agents: Agent[], barre: Tache[]): Tache[] => {
  const vus = new Set(barre.filter(t => t.sorte === 'agent').map(t => t.nom))
  const tous = [...barre, ...agents.filter(a => !vus.has(a.nom)).map(a => ({ sorte: 'agent' as const, nom: a.nom, depuis: a.depuis }))]
  const rang = { workflow: 0, agent: 1, shell: 2 }
  return tous.sort((a, b) => rang[a.sorte] - rang[b.sorte])
}

export const lireEncours = (sortie: string): Tache[] => {
  try {
    const brut = (JSON.parse(sortie) as { encours?: [string, string, number][] }).encours ?? []
    return brut
      .filter(([sorte]) => sorte === 'workflow' || sorte === 'agent' || sorte === 'shell')
      .map(([sorte, nom, depuis]) => ({ sorte: sorte as Tache['sorte'], nom, depuis }))
  } catch {
    return []
  }
}

let dernierEchec = ''

export const finErreur = (echec: string) => (echec.length > 300 ? `${echec.slice(0, echec.indexOf(')') + 1)} … ${echec.slice(-240)}` : echec)

async function tachesBarre($: Engine) {
  const [sid, home] = await Promise.all([$.session.id(), $.env.get('HOME')])
  const run = await $.process.run(['python3', '-I', `${home}/.claude/bin/barre.py`, '--parties'], { stdin: JSON.stringify({ session_id: sid }), timeoutMs: 4000 })
  if (run.exitCode !== 0) {
    const echec = `ecran : barre.py a échoué (${run.exitCode}) ${run.stderr.trim()}`
    if (echec !== dernierEchec) {
      $.ui.log(finErreur(echec))
      $.ui.log(echec, { to: 'debug' })
    }
    dernierEchec = echec
    return []
  }
  dernierEchec = ''
  return lireEncours(run.stdout)
}

async function mesurer($: Engine) {
  const [usage, liste, plan, memoire, maintenant] = await Promise.all([$.session.usage(), $.agent.list(), lirePlan($), lireMemoire($), $.clock.now()])
  const [enSession, barre] = await Promise.all([sessionsAgents($, maintenant), tachesBarre($)])
  const vus = await read($, donnees)
  const debuts = new Map(vus.agents.map(a => [a.id, maintenant - a.depuis * 1000]))
  const agents = [...liste.filter(a => ACTIFS.has(a.status)).map(a => ({ id: a.id, nom: a.description || a.type, statut: a.status, depuis: Math.round((maintenant - (debuts.get(a.id) ?? maintenant)) / 1000) })), ...enSession]
  // Avant la première réponse d'une session (rechargée, reprise), le moteur ne donne pas encore le remplissage :
  // l'estimation locale de /context le remplace, sans appel réseau (le contexte manquait en bas, 28/10).
  const tokens = usage.context.tokens ?? (await $.session.usage({ breakdown: 'summary' })).context.breakdown?.totalTokens
  const pct = tokens === undefined ? null : Math.round((tokens / usage.context.window) * 100)
  await update($, donnees, d => ({
    ...d,
    tokens: tokens ?? null,
    fenetre: usage.context.window,
    quotas: quotasVus(usage.rateLimits, d.quotas, maintenant),
    cout: usage.cost?.usd ?? null,
    contextes: pct === null || d.contextes.at(-1) === pct ? d.contextes : [...d.contextes, pct].slice(-120),
    agents,
    plan,
    memoire,
    taches: fusionner(agents, barre),
  }))
}

// Une fenêtre de quota dont l'heure de remise est passée n'est plus rapportée tant qu'aucune réponse n'en donne
// une nouvelle mesure : elle vaut alors 0 %, au lieu de disparaître de la ligne (vu le 27/10 à 20:08).
export function quotasVus(limites: readonly { kind: string; percentUsed: number; resetsAt?: string }[], avant: Donnees['quotas'], maintenant: number): Donnees['quotas'] {
  const lus = limites.filter(l => l.kind in QUOTAS).map(l => ({ nom: QUOTAS[l.kind]!, pct: l.percentUsed, ...(l.resetsAt ? { fin: l.resetsAt } : {}) }))
  const remis = avant.filter(q => q.fin !== undefined && Date.parse(q.fin) <= maintenant && !lus.some(l => l.nom === q.nom)).map(q => ({ ...q, pct: 0 }))
  const ordre = Object.values(QUOTAS)
  return [...lus, ...remis].sort((a, b) => ordre.indexOf(a.nom) - ordre.indexOf(b.nom))
}

// Une mesure qui dépasse son délai (machine chargée) part au journal de débogage seulement, jamais à l'écran.
export const horsDelai = (err: unknown) => /still running after \d+ ?ms|timed? ?out/i.test(String(err))

const sansEchec = ($: Engine, travail: () => Promise<unknown>) => () =>
  void travail().catch(err => $.ui.log(`ecran: ${String(err).slice(0, 160)}`, horsDelai(err) ? { to: 'debug' } : undefined))

let signature = ''

const fichesAgents = new Map<string, { mtime: number; fiche: { id?: string; etat?: string; pid?: number; debut?: string } | null }>()

async function agentsVivants($: Engine, maintenant: number): Promise<AgentVivant[]> {
  const dossier = `${await $.env.get('HOME')}/.claude/cache/agents-sessions`
  if (!(await $.fs.exists(dossier))) return []
  const vivants: AgentVivant[] = []
  for (const f of await $.fs.list(dossier)) {
    if (!f.name.endsWith('.json')) continue
    let lu = fichesAgents.get(f.name)
    if (lu === undefined || lu.mtime !== f.mtimeMs) {
      let fiche = null
      try {
        fiche = JSON.parse(await $.fs.read(`${dossier}/${f.name}`))
      } catch {
        fiche = null
      }
      lu = { mtime: f.mtimeMs, fiche }
      fichesAgents.set(f.name, lu)
    }
    const x = lu.fiche
    if (x?.etat !== 'en cours' || x.pid === undefined || x.id === undefined || !(await $.fs.exists(`/proc/${x.pid}`))) continue
    vivants.push({ id: x.id, depuis: x.debut ? Math.max(0, Math.round((maintenant - Date.parse(x.debut)) / 1000)) : 0 })
  }
  return vivants
}

// Chantier de la session : celui que son plan nomme, cherché dans le cahier du même dossier evan/ ; plus jamais
// le « Où j'en suis » du journal, commun à toutes les sessions du dépôt (29/10).
export function chantierLie(cahier: string, plan: string) {
  const nomme = chantierNomme(plan)
  if (nomme === null || cahier === '') return null
  const c = chantierDe(cahier, nomme)
  if (c !== null) return { libelle: `Chantier ${c.numero} · ${c.titre}`, objectif: objectif(cahier, c.numero), fini: finiQuand(cahier, c.numero) }
  const numero = nomme.match(/^(\d+)\b/)?.[1]
  const point = numero === undefined ? null : pointDuCahier(cahier, numero)
  return point === null ? null : { libelle: `Point ${numero} · ${point.titre}`, objectif: null, fini: point.fini }
}

async function lireSuivi($: Engine) {
  const chemin = await planLie($)
  const dossier = chemin === null ? null : dossierDe(chemin)
  const projet = dossier === null ? '' : dossier.replace(/\/evan$/, '').split('/').pop() || dossier
  const vide = { dossier: dossier ?? '', projet, chantier: null, objectif: null, plan: null, planNom: null, fini: [] }
  if (chemin === null || dossier === null || !(await $.fs.exists(chemin))) {
    if (signature !== 'absent') await update($, suivi, () => vide)
    signature = 'absent'
    return
  }
  const maintenant = await $.clock.now()
  const [fichiers, vivants] = await Promise.all([$.fs.list(dossier), agentsVivants($, maintenant)])
  const plan = fichiers.find(f => f.name === nomDe(chemin))
  const journal = fichiers.find(f => f.name === 'JOURNAL.md')
  const cahier = fichiers.find(f => f.name === 'CAHIER-DES-CHARGES.txt')
  const nouvelle = [chemin, ...[plan, journal, cahier].map(f => (f ? `${f.name}:${f.mtimeMs}` : '-')), vivants.map(v => v.id).join(','), Math.floor(maintenant / 60000)].join('|')
  if (nouvelle === signature) return
  signature = nouvelle
  const lire = (nom?: string) => (nom ? $.fs.read(`${dossier}/${nom}`) : Promise.resolve(''))
  const [textePlan, texteJournal, texteCahier] = await Promise.all([lire(plan?.name), lire(journal?.name), lire(cahier?.name)])
  const chantier = chantierLie(texteCahier, textePlan)
  await update($, suivi, () => ({
    ...vide,
    chantier: chantier?.libelle ?? null,
    objectif: chantier?.objectif ?? (cahier ? lireProjet(texteCahier) : null),
    plan: plan ? planPanneau(textePlan, texteJournal, vivants) : null,
    planNom: nomPlan(chemin),
    fini: chantier?.fini ?? [],
  }))
}

// Seul un plan écrit par la session la lie ; une autre écriture relit seulement (cahier, journal du même dossier).
// La session ne se déplace plus vers le dépôt écrit (/cd retiré le 29/10).
async function suivreEcriture($: Engine, chemin: string) {
  if (estPlan(chemin) && chemin !== (await read($, planEcrit))) {
    await update($, planEcrit, () => chemin)
    await garderPlan($, chemin)
    signature = ''
    $.ui.log(`ecran: session liée au plan ${chemin}`, { to: 'debug' })
  }
  await Promise.all([lireSuivi($), mesurer($)])
}
// Le système de fichiers date l'écriture au tic d'horloge grossier du noyau, jusqu'à quelques ms avant Date.now().
const MARGE_MTIME = 50

// Une commande shell : parmi les fichiers evan/ qu'elle nomme, ceux modifiés depuis son lancement ont été écrits ;
// le plus récemment modifié gagne. Un fichier seulement lu garde sa date et ne déplace rien.
async function suivreShell($: Engine, commande: string, depuis: number, cwd: string) {
  const home = (await $.env.get('HOME')) ?? ''
  let dernier: { chemin: string; mtime: number } | null = null
  for (const chemin of cheminsShell(commande, cwd, home)) {
    const s = await $.fs.stat(chemin).catch(() => undefined)
    if (s?.kind === 'file' && s.mtimeMs >= depuis - MARGE_MTIME && (dernier === null || s.mtimeMs >= dernier.mtime)) dernier = { chemin, mtime: s.mtimeMs }
  }
  if (dernier !== null) await suivreEcriture($, dernier.chemin)
}

// Configuration unique depuis le retrait de /ecran (28/10) : la ligne au-dessus de la saisie (mémoire basse) et le
// panneau « où on en est ». Le mod bande lit ce fichier pour céder sa place.
const signaler = async ($: Engine) =>
  $.fs.write(`${await $.env.get('HOME')}/.claude/cache/ecran/config`, '8')

async function lireRam($: Engine) {
  const run = await $.process.run(['python3', '-I', `${await $.env.get('HOME')}/.claude/bin/ram-parts.py`, '--json'], { timeoutMs: 4000 })
  const r = JSON.parse(run.stdout) as Ram
  if (typeof r.total === 'number' && Array.isArray(r.familles)) await update($, ram, () => r)
}

// Ouvert seulement quand la fenêtre kitty couvre l'écran (plein écran ou maximisée), demande d'Evan du 28/10 ;
// jamais selon la largeur de la colonne de conversation : le panneau posé la rétrécit, ce qui le refermait puis
// le rouvrait en boucle (vu le 28/10). Sous kitty, tant que la taille n'est pas lue, fermé (sinon il clignote au
// démarrage) ; hors kitty, l'engine décide seul (144 colonnes).
export const panneauVoulu = (pleine: boolean | null, enKitty: boolean) => (enKitty ? pleine === true : true)
// Maximisée : la barre du bureau peut prendre un peu de hauteur, jamais la moitié de la largeur.
export const estPleine = (l: number, h: number, ecran: { l: number; h: number }) => l >= ecran.l * 0.95 && h >= ecran.h * 0.85
let panneauOuvert: boolean | null = null
let fenetrePleine: boolean | null = null
let tailleEcran: { l: number; h: number } | null = null

async function placerPanneau($: Engine) {
  const voulu = panneauVoulu(fenetrePleine, await read($, kitty))
  if (voulu !== panneauOuvert) {
    $.ui.log(`ecran: panneau ${voulu ? 'ouvert' : 'fermé'}`, { to: 'debug' })
    if (voulu) await $.ui.open({ id: PANNEAU, title: 'Où on en est' })
    else await $.ui.close({ id: PANNEAU })
    panneauOuvert = voulu
  }
  await suivrePlace($)
}

// La fenêtre kitty de la session : KITTY_PID et KITTY_WINDOW_ID sont dans l'environnement du processus claude,
// lu directement (plus de recherche du pid par les fiches de ~/.claude/sessions).
const TROUVER_KITTY = `import json, subprocess, sys
to, fen = f"unix:@kitty-{sys.argv[1]}", sys.argv[2]
for o in json.loads(subprocess.run(['kitten', '@', '--to', to, 'ls'], capture_output=True, text=True, timeout=3).stdout):
    if any(str(w['id']) == fen for t in o['tabs'] for w in t['windows']):
        print(to, fen, o['platform_window_id'])`

let fenetreKitty: { to: string; id: string; x11: string } | null = null

export const estPetit = (largeurPx: number, hauteurPx: number) => largeurPx <= PETIT.largeur && hauteurPx <= PETIT.hauteur

const POLICE = '8'
// La police est reposée à chaque changement de taille de la fenêtre et au moins toutes les 15 s : une pose unique
// par chargement laissait la fenêtre en police 10 dès qu'autre chose la remettait (ancien code, rechargement de
// la configuration kitty, raccourci), vu le 28/10 sur la session 5013256e. Poser la taille qu'elle a déjà ne
// change rien à l'écran.
const REPOSE_MS = 15_000
let policeSur: { taille: string; t: number } | null = null
let dernierEchecPolice = ''

export const echecPolice = (rc: number, stderr: string) => (rc === 0 ? null : `ecran: police ${POLICE} refusée par kitten (rc=${rc}) ${stderr.trim().slice(0, 200)}`.trim())
export const reposer = (avant: { taille: string; t: number } | null, taille: string, maintenant: number) => avant === null || avant.taille !== taille || maintenant - avant.t >= REPOSE_MS

async function lirePetit($: Engine) {
  if (!(await read($, kitty))) return
  if (fenetreKitty === null) {
    const [kpid, kfen] = await Promise.all([$.env.get('KITTY_PID'), $.env.get('KITTY_WINDOW_ID')])
    if (!kpid || !kfen) return
    const [to, id, x11] = (await $.process.run(['python3', '-I', '-c', TROUVER_KITTY, kpid, kfen], { timeoutMs: 4000 })).stdout.trim().split(/\s+/)
    if (!to || !id || !x11) return
    fenetreKitty = { to, id, x11 }
  }
  const sortie = (await $.process.run(['xwininfo', '-id', fenetreKitty.x11], { timeoutMs: 2000 })).stdout
  const l = Number(sortie.match(/Width: (\d+)/)?.[1])
  const h = Number(sortie.match(/Height: (\d+)/)?.[1])
  if (!l || !h) return
  const taille = `${l}×${h}`
  const maintenant = await $.clock.now()
  if (reposer(policeSur, taille, maintenant)) {
    const run = await $.process.run(['kitten', '@', '--to', fenetreKitty.to, 'action', '--match', `id:${fenetreKitty.id}`, 'change_font_size', 'current', POLICE], { timeoutMs: 3000 })
    const echec = echecPolice(run.exitCode, run.stderr)
    if (echec !== null && echec !== dernierEchecPolice) $.ui.log(echec)
    dernierEchecPolice = echec ?? ''
    if (echec === null && policeSur?.taille !== taille) $.ui.log(`ecran: police ${POLICE} posée sur la fenêtre ${taille}`, { to: 'debug' })
    policeSur = echec === null ? { taille, t: maintenant } : null
  }
  if (tailleEcran === null) {
    const racineX = (await $.process.run(['xwininfo', '-root'], { timeoutMs: 2000 })).stdout
    const el = Number(racineX.match(/Width: (\d+)/)?.[1])
    const eh = Number(racineX.match(/Height: (\d+)/)?.[1])
    if (el && eh) tailleEcran = { l: el, h: eh }
  }
  const pleine = tailleEcran === null ? null : estPleine(l, h, tailleEcran)
  if (pleine !== fenetrePleine) {
    $.ui.log(`ecran: fenêtre ${taille} ${pleine ? 'couvre' : 'ne couvre pas'} l'écran`, { to: 'debug' })
    fenetrePleine = pleine
    await placerPanneau($)
  }
  const voulu = estPetit(l, h)
  if (voulu === (await read($, petit))) return
  $.ui.log(`ecran: fenêtre ${taille} → ${voulu ? 'petite, barre cachée' : 'grande, barre affichée'}`, { to: 'debug' })
  await update($, petit, () => voulu)
}

async function suivrePlace($: Engine) {
  const vu = (await $.ui.panes()).some(p => p.id === PANNEAU && p.isPlaced && p.isShown)
  if (vu !== (await read($, place))) await update($, place, () => vu)
}

const garder = ($: Engine, cle: string, valeur: () => Promise<boolean | string[]>) =>
  sansEchec($, async () => $.store.set(cle, await valeur()))()

const actions = ($: Engine): Actions => ({
  plier: id => void update($, plis, l => (l.includes(id) ? l.filter(x => x !== id) : [...l, id])).then(() => garder($, 'plis', () => read($, plis))),
  planTout: () => void update($, planTout, v => !v).then(() => garder($, 'planTout', () => read($, planTout))),
  finiTout: () => void update($, finiTout, v => !v).then(() => garder($, 'finiTout', () => read($, finiTout))),
  ouvrir: i => void update($, finiOuvert, v => (v === i ? null : i)),
})

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const terminal = await $.env.get('TERM')
    await update($, kitty, () => terminal === 'xterm-kitty')
    sansEchec($, () => signaler($))()
    const plies = await $.store.get('plis')
    if (Array.isArray(plies)) await update($, plis, () => plies.filter((x): x is string => typeof x === 'string'))
    const tout = await $.store.get('planTout')
    if (typeof tout === 'boolean') await update($, planTout, () => tout)
    const toutFini = await $.store.get('finiTout')
    if (typeof toutFini === 'boolean') await update($, finiTout, () => toutFini)
    sansEchec($, () => relier($))()
    signature = ''
    panneauOuvert = null
    sansEchec($, () => placerPanneau($))()
    sansEchec($, () => lirePetit($))()
    $.clock.every(1000, sansEchec($, () => lirePetit($)))
    sansEchec($, () => lireSuivi($))()
    $.clock.every(5000, sansEchec($, () => lireSuivi($)))
    sansEchec($, () => lireRam($))()
    $.clock.every(5000, sansEchec($, () => lireRam($)))
    $.clock.every(2000, sansEchec($, () => suivrePlace($)))
    sansEchec($, () => mesurer($))()
    $.clock.every(5000, sansEchec($, () => mesurer($)))
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const commande = e.agentId === undefined ? commandeShell(e) : null
    const avant = commande !== null ? { t: await $.clock.now(), cwd: await $.session.cwd() } : null
    const r = await next(e)
    const chemin = e.agentId === undefined && !('deny' in r) && r.isError !== true ? cheminEcrit(e) : null
    if (chemin !== null) sansEchec($, () => suivreEcriture($, chemin))()
    // Une commande en erreur a pu écrire avant d'échouer : les dates de modification tranchent.
    else if (commande !== null && avant !== null && !('deny' in r)) sansEchec($, () => suivreShell($, commande, avant.t, avant.cwd))()
    return r
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind === 'composer') await update($, donnees, d => ({ ...d, travaille: true }))
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      const u = e.usage
      const jetons = u ? u.input_tokens + u.cache_creation_input_tokens + u.cache_read_input_tokens + u.output_tokens : 0
      await update($, donnees, d => ({ ...d, travaille: false, tours: jetons > 0 ? [...d.tours, jetons].slice(-120) : d.tours }))
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, place))) return next(e)
    if (await read($, petit)) {
      const { Box } = $.ui.resolve(e)
      return <Box />
    }
    return vueLigne($.ui.resolve(e) as El, await read($, donnees)) ?? next(e)
  })

  // Sous la saisie : la ligne du bas du panneau, mot pour mot (demande d'Evan 27/10) ; rien quand le panneau est
  // posé, qui l'a déjà en bas (28/10).
  on('ui.render', { component: 'PromptHint' }, async ($, e) => {
    if (await read($, place)) return $.ui.resolve(e).Box({})
    const d = await read($, donnees)
    return vueBas($.ui.resolve(e) as El, segsBas(d, planBas(await read($, suivi), d)))
  })

  on('ui.render', { component: 'Pane', requestId: PANNEAU }, async ($, e) => {
    if (e.props.placement === 'inline') return ($.ui.resolve(e) as El).Text({ children: ' ' })
    const d = await read($, donnees)
    const reglages = { plis: await read($, plis), planTout: await read($, planTout), finiTout: await read($, finiTout), finiOuvert: await read($, finiOuvert) }
    return vueSuivi($.ui.resolve(e) as El, await read($, suivi), d, await read($, ram), { colonnes: e.props.bodyColumns ?? e.viewport?.columns ?? 60, lignes: e.props.scroll?.bodyRows ?? 0 }, reglages)
  })

  // Clic sur un titre, un bouton ou une ligne de fini quand : posté par ligne-client.tsx.
  on('ui.message', async ($, e, next) => {
    const action = (e.data as { action?: unknown } | null)?.action
    if (typeof action === 'string') agir(actions($), action)
    return next(e)
  })
}
