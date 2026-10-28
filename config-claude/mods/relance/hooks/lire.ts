export const MODELE = 'claude-opus-5-5'
export const PLAFOND = 700_000

const FORMES = /\b(sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[abpr]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})/g
const ETIQUETTES = /((?:api[_-]?key|secret|token|password|passwd|pwd|authorization)["']?\s*[:=]\s*["']?|Bearer\s+)([^\s"',;]{6,})/gi
const ALEATOIRE = /\b[A-Za-z0-9]{24,}\b/g
const cacher = (v: string) => `${v.slice(0, 4)}…(masqué)`

export const masquer = (texte: string) =>
  texte
    .replace(FORMES, cacher)
    .replace(ETIQUETTES, (_, etiquette: string, valeur: string) => etiquette + (valeur.includes('…(masqué)') ? valeur : cacher(valeur)))
    .replace(ALEATOIRE, v => (/[A-Z]/.test(v) && /[a-z]/.test(v) && /\d/.test(v) ? cacher(v) : v))

type Bloc = { type?: string; text?: string; name?: string; input?: Record<string, unknown>; content?: unknown; is_error?: boolean }
type Ligne = { type?: string; timestamp?: string; cwd?: string; isMeta?: boolean; isCompactSummary?: boolean; origin?: { kind?: string }; message?: { content?: string | Bloc[] } }
// fin : longueur gardée pour les résultats d'outils de la fin de session (FIN_SESSION), où se lit l'état de fin.
type Niveau = { resultat: number; fin: number; cible: number; claude: number }

export const FIN_SESSION = 0.2

const NIVEAUX: Niveau[] = [
  { resultat: 300, fin: 20000, cible: 200, claude: Infinity },
  { resultat: 0, fin: 2000, cible: 120, claude: Infinity },
  { resultat: 0, fin: 0, cible: 80, claude: 1500 },
  { resultat: 0, fin: 0, cible: 0, claude: 600 },
]

// Relecture (2e passage) : une preuve tient rarement en 300 caractères, et elle peut être n'importe où dans la session.
const NIVEAUX_RELECTURE: Niveau[] = [{ resultat: 2000, fin: 20000, cible: 400, claude: Infinity }, ...NIVEAUX]

const couper = (s: string, n: number) => (n === Infinity || s.length <= n ? s : n === 0 ? '' : `${s.slice(0, n)}…`)
const uneLigne = (s: string) => s.replace(/\s+/g, ' ').trim()
const heure = (t?: string) => (t ? t.slice(0, 16).replace('T', ' ') : '?')

const texteDe = (c: string | Bloc[] | undefined) =>
  typeof c === 'string' ? c : (c ?? []).filter(b => b.type === 'text').map(b => b.text ?? '').join('\n')

const resultatDe = (b: Bloc) =>
  typeof b.content === 'string' ? b.content : Array.isArray(b.content) ? (b.content as Bloc[]).map(x => x.text ?? '').join(' ') : ''

export const cible = (i: Record<string, unknown> = {}) =>
  String(i.command ?? i.file_path ?? i.notebook_path ?? i.pattern ?? i.url ?? i.query ?? i.skill ?? i.description ?? i.path ?? i.prompt ?? '')

export function commandeTapee(texte: string): string | null {
  if (texte.includes('<local-command-caveat>') || texte.includes('<local-command-stdout>')) return ''
  const nom = texte.match(/<command-name>([^<]*)<\/command-name>/)?.[1]
  if (nom === undefined) return null
  const args = texte.match(/<command-args>([\s\S]*?)<\/command-args>/)?.[1]?.trim()
  return args ? `${nom} ${args}` : nom
}

function lignes(jsonl: string): Ligne[] {
  const sortie: Ligne[] = []
  for (const l of jsonl.split('\n')) {
    if (!l.trim()) continue
    try { sortie.push(JSON.parse(l) as Ligne) } catch {}
  }
  return sortie
}

function rendre(rangs: readonly Ligne[], n: Niveau) {
  const morceaux: string[] = []
  const evan: string[] = []
  const debutFin = Math.floor(rangs.length * (1 - FIN_SESSION))
  let dossier = ''
  for (const [i, r] of rangs.entries()) {
    const contenu = r.message?.content
    if (r.cwd && r.cwd !== dossier && r.type !== 'system') {
      dossier = r.cwd
      morceaux.push(`· dossier de travail : ${dossier}`)
    }
    if (r.type === 'user' && r.isCompactSummary) {
      morceaux.push(`[RÉSUMÉ AUTOMATIQUE DU MOTEUR]\n${couper(texteDe(contenu), 20000)}\n[FIN DU RÉSUMÉ]`)
      continue
    }
    if (r.type === 'user' && r.origin?.kind === 'human' && !r.isMeta) {
      const brut = texteDe(contenu).trim()
      const commande = commandeTapee(brut)
      const dit = commande === null ? brut : commande
      if (!dit) continue
      evan.push(dit)
      morceaux.push(`\n### EVAN, message ${evan.length} (${heure(r.timestamp)}) :\n${dit}`)
      continue
    }
    if (r.type === 'user' && r.origin?.kind === 'task-notification') {
      const resume = texteDe(contenu).match(/<summary>([\s\S]*?)<\/summary>/)?.[1] ?? texteDe(contenu).match(/<status>([^<]*)</)?.[1] ?? ''
      if (resume) morceaux.push(`· fin de tâche de fond : ${couper(uneLigne(resume), 200)}`)
      continue
    }
    if (r.type === 'user' && Array.isArray(contenu)) {
      const garde = i >= debutFin ? Math.max(n.fin, n.resultat) : n.resultat
      for (const b of contenu) {
        if (b.type !== 'tool_result' || garde === 0) continue
        const t = couper(uneLigne(resultatDe(b)), garde)
        if (t) morceaux.push(`    ⎿ ${b.is_error ? 'ERREUR ' : ''}${t}`)
      }
      continue
    }
    if (r.type === 'assistant' && Array.isArray(contenu)) {
      for (const b of contenu) {
        if (b.type === 'text' && b.text?.trim()) morceaux.push(`CLAUDE : ${couper(b.text.trim(), n.claude)}`)
        if (b.type === 'tool_use' && n.cible > 0) morceaux.push(`  · ${b.name} : ${couper(uneLigne(cible(b.input)), n.cible)}`)
      }
    }
  }
  return { texte: morceaux.join('\n'), evan }
}

function condenserAvec(niveaux: readonly Niveau[], jsonl: string, plafond: number) {
  const rangs = lignes(jsonl)
  let rendu = rendre(rangs, niveaux[0]!)
  let niveau = 0
  while (rendu.texte.length > plafond && niveau < niveaux.length - 1) rendu = rendre(rangs, niveaux[++niveau]!)
  return { texte: masquer(rendu.texte), evan: rendu.evan.map(masquer), niveau, tronque: rendu.texte.length > plafond }
}

export const condenser = (jsonl: string, plafond = PLAFOND) => condenserAvec(NIVEAUX, jsonl, plafond)

// Niveau 0 de la relecture : tous les résultats à 2 000 caractères ; au-delà, les niveaux de condenser.
export const condenserRelecture = (jsonl: string, plafond = PLAFOND) => condenserAvec(NIVEAUX_RELECTURE, jsonl, plafond)

export const REDACTION = `Tu es chargé de relancer une session Claude Code dont le contexte s'est cassé : elle ne suit plus ce qu'Evan veut. Evan a tapé /relance avec un motif. Tu lis toute la session (messages d'Evan mot pour mot, réponses et actions de Claude, résultats abrégés) et le contexte du dépôt, puis tu écris LE PROMPT qui ouvrira une session neuve, propre, au même dossier.

Ce prompt est lu par une session qui ne sait rien. Il doit contenir, dans cet ordre, en français simple :
1. CE QU'EVAN VEUT : le but de la session, dit avec les mots d'Evan, cités mot pour mot entre guillemets (ses demandes, ses décisions, ses refus, ses corrections). Pas d'interprétation qui ne soit pas appuyée par une citation. Commence par sa demande de départ : le ou les messages d'Evan qui ont fixé le but et l'ordre du travail (« d'abord… », « on commence par… »), cités mot pour mot en entier, sous le titre « Demande de départ d'Evan ». Puis, sous le titre « Consignes d'Evan pour cette session », chaque consigne qu'il a donnée sur l'ordre, le périmètre ou la façon de mener ce travail (y compris celles contenues dans la demande de départ), une par ligne, chacune citée mot pour mot. Puis, sous le titre « Ce qui attend Evan », les questions posées à Evan restées sans réponse et ce qu'on lui a demandé de faire. Si plusieurs sujets se sont succédé, dis lequel est en cours et lesquels sont clos. Une consigne explicite qu'Evan a donnée dans cette conversation et qui ne vaut que pour cette session (par exemple « tu ne push rien ») se cite ici mot pour mot, jamais reformulée ni élargie.
2. CE QUI EST FAIT ET VÉRIFIÉ : seulement ce que la transcription prouve (fichier écrit, commande passée, mesure, essai), avec les chemins, branches, commits. Sépare ce qui est vérifié de ce qui a été seulement annoncé.
3. CE QUI A DÉRAPÉ ET POURQUOI : où l'ancienne session s'est trompée sur la demande d'Evan, ce qu'elle a fait à la place, en t'appuyant sur le motif d'Evan. Dis-le franchement, sans excuse. Ce sont des faits, pas des leçons : aucune « leçon », conseil ou bonne pratique que tu en tirerais toi-même ; une leçon n'apparaît que si Evan l'a dite, citée mot pour mot.
4. LA PROCHAINE ACTION : la première chose à faire, concrète, telle que l'ancienne session l'a annoncée en dernier (si elle attendait une réponse d'Evan, c'est d'attendre ou de reposer sa question) ; n'y ajoute pas d'étapes ou de vérifications qu'elle n'a pas annoncées. « À ne pas refaire » ne contient que ce qu'Evan a refusé ou corrigé dans la conversation, chaque point avec sa citation mot pour mot ; s'il n'a rien refusé, n'écris pas cette ligne. Une décision, une information ou une question d'Evan n'est pas un refus : ne la change jamais en interdit.
5. L'ANCIENNE SESSION : elle est coupée ; pour un détail absent de ce prompt, la nouvelle session relit sa transcription (chemin donné plus bas) avec Read ou grep, seulement pour ce détail, plutôt que de deviner ou de redemander à Evan.

Pas de partie « règles » : la nouvelle session charge déjà les CLAUDE.md (global et du dépôt). N'y recopie, ne résume ni ne prête à Evan aucune règle générale (façon de répondre, de commiter, de travailler).

Règles d'écriture : tu écris le prompt lui-même, adressé à la nouvelle session (« Evan veut… », « tu reprends… »), sans préambule ni commentaire autour. JAMAIS de tableau (aucune ligne commençant par « | ») : une énumération s'écrit en liste à puces, un élément par ligne. Pas de remplissage. Aucune valeur de secret (mot de passe, jeton, clé) : nomme l'endroit où elle se trouve, jamais la valeur. Si la transcription ne permet pas de trancher un point, écris-le comme question ouverte à vérifier dans la transcription de l'ancienne session ou à poser à Evan.`

export type Demande = { motif: string; session: string; dossier: string; transcription: string; condense: string; contexte: readonly { titre: string; texte: string }[]; niveau: number; tronque: boolean }

export function demande(d: Demande) {
  const contexte = d.contexte.map(c => `===== ${c.titre} =====\n${c.texte}`).join('\n\n') || '(aucun cahier ni journal trouvé dans le dépôt)'
  const abrege = d.niveau === 0 ? 'résultats d’outils abrégés à 300 caractères, sauf sur les 20 derniers % de la session où ils sont entiers' : `abrégée au niveau ${d.niveau} pour tenir dans la lecture${d.tronque ? ', encore trop longue : la fin peut manquer' : ''}`
  return [
    { text: `CONTEXTE DU DÉPÔT (${d.dossier})\n\n${contexte}`, cache: true as const },
    { text: `TRANSCRIPTION DE LA SESSION ${d.session} (${abrege} ; réflexions internes retirées)\n\n${d.condense}`, cache: true as const },
    {
      text:
        `MOTIF D'EVAN pour /relance, mot pour mot : « ${d.motif} »\n\n` +
        `Ancienne session, à recopier dans la partie 5 : sessionId ${d.session}, dossier ${d.dossier}, transcription ${d.transcription}. ` +
        `Elle est coupée et ne répond plus : on ne la joint pas, on relit sa transcription.\n\n` +
        `Écris maintenant le prompt de reprise.`,
    },
  ]
}

export const RELECTURE = `Tu relis, avant son lancement, un prompt de reprise écrit pour une session Claude Code neuve. Tu as la transcription de l'ancienne session, avec des résultats d'outils plus complets que ceux qu'avait le rédacteur. Ton travail : que chaque fait d'état du prompt soit exact au moment où l'ancienne session s'arrête.

Le MOTIF D'EVAN (donné plus bas, la raison de la relance) ne se vérifie pas contre la transcription : c'est sa parole, elle fait foi même si la transcription ne le montre pas. Le prompt doit le citer mot pour mot, et la partie « ce qui a dérapé » et la prochaine action doivent en découler ; si le brouillon l'omet, l'affaiblit ou conclut « aucun dérapage », corrige-le d'après le motif.

Vérifie, une par une, contre la transcription :
- chaque chose donnée comme faite ou vérifiée : la preuve existe-t-elle (résultat d'outil, mesure, fichier écrit) ?
- chaque chose donnée comme « non prouvée », « à vérifier », « tronquée » ou « incertaine » : cherche la preuve dans les résultats d'outils ; si elle y est, écris-la comme vérifiée, avec sa preuve en quelques mots ;
- chaque étape, case ou tâche donnée comme à faire : n'a-t-elle pas été faite ensuite ? Un échec suivi d'une réussite, ou une action faite par un agent, compte comme fait ;
- la prochaine action : c'est la dernière que l'ancienne session a annoncée dans son dernier message. Si elle attendait une réponse ou un geste d'Evan, la prochaine action est d'attendre ou de reposer cette question, pas d'agir à sa place ni d'inventer une enquête ;
- un fait établi par l'ancienne session avec une preuve lue (commit, fichier, sortie) l'emporte sur une supposition contraire ; si Evan a dit autre chose, garde les deux et dis ce que la preuve montre ;
- chaque consigne ou règle attribuée à Evan : elle ne reste que si c'est une consigne explicite d'un de ses messages de cette session, citée mot pour mot. Une règle générale (façon de répondre, de commiter, de travailler : les CLAUDE.md la donnent déjà), une consigne reformulée ou élargie, ou une partie « règles » sortent du prompt ;
- la demande de départ d'Evan : elle doit figurer, citée mot pour mot depuis ses premiers messages ; si elle manque ou est reformulée, remets la citation exacte ; chaque consigne qu'elle contient sur l'ordre ou la façon de travailler doit aussi figurer, citée, sur sa propre ligne parmi les consignes d'Evan ;
- chaque point « à ne pas refaire », « leçon », « à éviter » ou conseil : il ne reste que si Evan l'a refusé, corrigé ou dit dans un de ses messages, avec sa citation mot pour mot ; sinon il sort ; une décision, une information ou une question d'Evan changée en interdit sort aussi ;
- la prochaine action : retire les étapes et vérifications préalables que l'ancienne session n'a pas annoncées.

Ne retire rien de juste, n'ajoute rien qui ne soit dans la transcription. Garde la structure, le ton et l'adresse de l'ancienne session.
Réponds par le prompt corrigé, entier, et rien d'autre : pas de préambule, pas de liste de corrections, pas de tableau. Aucune valeur de secret.`

export type Relecture = { motif: string; brouillon: string; condense: string; contexte: readonly { titre: string; texte: string }[]; session: string; niveau: number; tronque: boolean }

export function relecture(d: Relecture) {
  const contexte = d.contexte.map(c => `===== ${c.titre} =====\n${c.texte}`).join('\n\n') || '(aucun cahier ni journal trouvé dans le dépôt)'
  const abrege = d.niveau === 0 ? 'résultats d’outils jusqu’à 2 000 caractères, entiers sur les 20 derniers %' : `abrégée au niveau ${d.niveau} pour tenir dans la lecture${d.tronque ? ', encore trop longue : la fin peut manquer' : ''}`
  return [
    { text: `CONTEXTE DU DÉPÔT\n\n${contexte}`, cache: true as const },
    { text: `TRANSCRIPTION DE LA SESSION ${d.session} (${abrege} ; réflexions internes retirées)\n\n${d.condense}`, cache: true as const },
    { text: `MOTIF D'EVAN pour /relance, mot pour mot (fait foi) : « ${d.motif} »\n\nPROMPT DE REPRISE À RELIRE\n\n${d.brouillon}\n\nRends maintenant le prompt corrigé, entier.` },
  ]
}

const LIGNE_TABLEAU =/^\s*\|.*\|\s*$/
const SEPARATEUR = /^\s*\|(\s*:?-{2,}:?\s*\|)+\s*$/
const cellules = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim())

export function sansTableau(texte: string) {
  const lignes = texte.split('\n')
  const sortie: string[] = []
  for (let i = 0; i < lignes.length; i++) {
    if (!(LIGNE_TABLEAU.test(lignes[i]!) && SEPARATEUR.test(lignes[i + 1] ?? ''))) {
      sortie.push(lignes[i]!)
      continue
    }
    const entetes = cellules(lignes[i]!)
    i += 2
    for (; i < lignes.length && LIGNE_TABLEAU.test(lignes[i]!); i++) {
      const [premiere, ...reste] = cellules(lignes[i]!)
      const suite = reste.map((c, k) => (entetes[k + 1] ? `${entetes[k + 1]} : ${c}` : c)).filter(c => c.trim())
      sortie.push(`- **${premiere}**${suite.length ? ` — ${suite.join(' ; ')}` : ''}`)
    }
    i--
  }
  return sortie.join('\n')
}

export const fichierPrompt = (home: string, session: string) => `${home}/.claude/cache/relance/PROMPT-${session.slice(0, 8)}.txt`
// Le motif d'Evan, cité mot pour mot en tête si le prompt ne le contient pas : il ne peut pas se perdre.
export const avecMotif = (prompt: string, motif: string) =>
  prompt.includes(`« ${motif} »`) ? prompt : `Motif d'Evan pour cette relance, mot pour mot : « ${motif} ». La session d'avant s'est trompée sur ce point : repars de là.\n\n${prompt}`

// Ligne ajoutée au prompt au lancement : la conversation d'avant est vidée, seule sa transcription reste.
export const ligneTranscription = (chemin: string) =>
  `Transcription de la session d'avant (coupée) : ${chemin} — à relire avec Read ou grep seulement pour un détail absent de ce prompt.`

export const avecTranscription = (prompt: string, chemin: string | null) =>
  chemin === null ? prompt : `${prompt}\n\n${ligneTranscription(chemin)}`

// Dossier où la session a été ouverte (première ligne qui en porte un) : celui du moteur peut être revenu à la racine du dépôt.
export function dossierDeTravail(jsonl: string): string | null {
  for (const r of lignes(jsonl)) if (r.cwd) return r.cwd
  return null
}
