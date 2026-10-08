import type { EngineInterface as Engine, Register } from 'claude-code'

const DELAI_MS = 5000

export const CONSIGNE = [
  "Tu classes un message qu'un développeur, Evan, envoie à son assistant de code.",
  'Question : ce message dit-il que l’ASSISTANT s’est trompé, a mal compris, a mal fait, ou que son explication',
  'n’a pas été comprise ?',
  'ECART : reproche ou correction visant ce que l’assistant a fait, dit ou compris ; résultat de l’assistant',
  'jugé mauvais ; « je t’avais dit » ; Evan qui ne comprend pas l’explication de l’assistant ou est perdu.',
  'NEUTRE : tout le reste, même s’il y a « non », un problème ou de l’agacement qui ne vise pas l’assistant :',
  'nouvelle consigne, question, demande de vérification, bug du produit ou d’un service tiers signalé,',
  'choix entre options, validation, sujet écarté.',
  'Exemples :',
  '« non, je voulais le bouton à droite, pas en haut » → ECART',
  '« t’as encore modifié le mauvais fichier » → ECART',
  '« je comprends rien à ton tableau, explique autrement » → ECART',
  '« 3 non, on garde l’ancien » → NEUTRE',
  '« le paiement Stripe renvoie une erreur 500, regarde » → NEUTRE',
  '« fais tout toi-même et préviens-moi quand c’est fini » → NEUTRE',
  '« pourquoi le cache expire au bout de 5 min ? » → NEUTRE',
  'Réponds par un seul mot : ECART ou NEUTRE.',
].join('\n')

export const RAPPEL = [
  "Règle « S'aligner » (rappel automatique : ce message d'Evan exprime un désaccord, un reproche ou une incompréhension).",
  "Ne refais pas une variante et ne te justifie pas. Si tu croyais avoir bien fait, c'est un défaut de communication :",
  "pose d'abord les questions qui révèlent l'écart (ce qu'Evan voulait, ce que tu as compris, où ça diverge),",
  "puis reprends seulement une fois les deux points de vue concordants. S'il dit ne pas avoir compris :",
  'six lignes au plus, un exemple d’abord, aucun mot nouveau.',
  'Le repérage est automatique et se trompe parfois : si le message ne contient en fait ni désaccord ni',
  'incompréhension, ignore ce rappel et réponds normalement.',
].join(' ')

export const CONSIGNE_QUESTION = [
  "Tu classes un message qu'un développeur, Evan, envoie à son assistant de code.",
  'Réponds QUESTION si le message ne demande QUE des informations ou un avis (même posé comme une remarque :',
  '« normalement j’ai de l’espace là non ? », « avant le front on peut pas finir la logique ? »),',
  'sans demander de faire, lancer, modifier, valider ou continuer quoi que ce soit.',
  'Réponds ACTION s’il demande de faire quelque chose, valide une proposition (« oui », « go », « Q1 oui »),',
  'ou mêle une demande d’action à une question.',
  'Réponds par un seul mot : QUESTION ou ACTION.',
].join('\n')

export const RAPPEL_QUESTION = [
  'Repérage automatique (peut se tromper) : ce message d’Evan semble être une QUESTION.',
  'Réponds-y d’abord ; ne lance, n’installe ni ne modifie rien qu’il n’a pas explicitement demandé.',
  'S’il faut agir pour répondre, propose et attends son accord.',
].join(' ')

export const estQuestion = (texte: string) => /^\W*QUESTION/i.test(texte.trim())

export const classerQuestion = async ($: Engine, texte: string) => {
  const reponse = await $.model.complete({
    model: 'haiku',
    system: CONSIGNE_QUESTION,
    prompt: `Message :\n"""\n${texte.slice(0, 2000)}\n"""`,
    maxTokens: 5,
    timeoutMs: DELAI_MS,
  })
  if (!reponse.isAnswered) throw new Error(reponse.reason)
  return estQuestion(reponse.text)
}

const CONSIGNE_JUGE = [
  'Tu contrôles la réponse d’un assistant de code au message de son utilisateur, Evan.',
  'Relève chaque question posée par Evan dans son message (y compris sans point d’interrogation),',
  'en ignorant le texte qu’Evan a seulement collé (citations de l’assistant, journaux).',
  'Pour chacune, la réponse de l’assistant y répond-elle explicitement ?',
  'Rends UNIQUEMENT un JSON : {"questions": n, "sans_reponse": ["la question, courte", ...]}.',
].join('\n')

export const poseQuestion = (texte: string) =>
  /\?|\b(pourquoi|comment|combien|est-ce|est ce|c'est quoi|lequel|laquelle|quand)\b/i.test(texte.replace(/<pasted_content[\s\S]*?<\/pasted_content[^>]*>/g, ''))

export const lireSansReponse = (texte: string): string[] => {
  const m = texte.match(/\{[\s\S]*\}/)
  if (!m) return []
  try {
    const j = JSON.parse(m[0]) as { sans_reponse?: unknown }
    return Array.isArray(j.sans_reponse) ? j.sans_reponse.filter((q): q is string => typeof q === 'string' && q.trim() !== '') : []
  } catch {
    return []
  }
}

export const noteOubli = (questions: string[]) =>
  `Questions qui semblent sans réponse (contrôle automatique, peut se tromper) :\n${questions.map(q => `- ${q}`).join('\n')}`

export const juger = async ($: Engine, message: string, reponse: string) => {
  const r = await $.model.complete({
    model: 'haiku',
    system: CONSIGNE_JUGE,
    prompt: `Message d'Evan :\n"""${message.slice(0, 3000)}"""\nRéponse de l'assistant :\n"""${reponse.slice(0, 6000)}"""`,
    maxTokens: 300,
    timeoutMs: 8000,
  })
  if (!r.isAnswered) throw new Error(r.reason)
  return lireSansReponse(r.text)
}

export const aClasser = (texte: string) => {
  const t = texte.trim()
  return t.length >= 2 && !t.startsWith('/')
}

const MARQUEURS = new RegExp(
  [
    "(pas|rien) compris",
    "comprends? (pas|rien)",
    "je suis perdu",
    "je t'(ai|avais) (dit|dis|demandé)",
    "pourquoi tu",
    "(?<!tant que )tu n'as (pas|rien) (fait|vérifié|compris|répondu|regardé|testé)",
    "t'as (pas|rien) (fait|vérifié|compris|répondu|regardé|testé)",
    "(ce n'est|c'est) pas ce que (je|j')",
    "personne (n')?a demandé",
    "toujours la même chose",
    "tu (fais|dis) n'importe quoi",
    "tu tournes? en rond|tu tournes? en boucle",
    "tu me parles que",
    "de quoi tu parles",
    "^\\s*(non|nn|mais non)\\b(?![,.]?\\s*(on (laisse|garde)|merci|c'est bon))",
  ].join('|'),
  'i',
)

export const marqueur = (texte: string) => MARQUEURS.test(texte.replace(/[’`]/g, "'"))

export const lireVerdict =(texte: string) => /^\W*ECART/i.test(texte.trim())

export const classer = async ($: Engine, texte: string) => {
  const reponse = await $.model.complete({
    model: 'haiku',
    system: CONSIGNE,
    prompt: `Message :\n"""\n${texte.slice(0, 2000)}\n"""`,
    maxTokens: 5,
    timeoutMs: DELAI_MS,
  })
  if (!reponse.isAnswered) throw new Error(reponse.reason)
  return lireVerdict(reponse.text)
}

const banc = async ($: Engine, chemin: string) => {
  const lignes = JSON.parse(await $.fs.read(chemin)) as { i?: number; texte?: string; evan?: string; attendu: string }[]
  const sortie: { i: number; attendu: string; ecart: boolean | null; question: boolean | null; ms: number }[] = []
  for (const [n, ligne] of lignes.entries()) {
    const texte = ligne.texte ?? ligne.evan ?? ''
    const debut = await $.clock.now()
    const [ecart, question] = await Promise.all([
      classer($, texte).catch(() => null),
      classerQuestion($, texte).catch(() => null),
    ])
    sortie.push({ i: ligne.i ?? n, attendu: ligne.attendu, ecart, question, ms: (await $.clock.now()) - debut })
  }
  const cible = chemin.replace(/\.json$/, '.resultats.json')
  await $.fs.write(cible, JSON.stringify(sortie))
  return cible
}

export const register: Register = on => {
  let dernierMessage = ''
  let oubliees: string[] = []

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'banc-alignement',
      description: 'Banc du détecteur de désaccord sur un fichier JSON de messages étiquetés',
      argumentHint: '<fichier.json>',
    })
    await $.command.register({ name: 'banc-fin', description: 'Juge des fins de tour réelles', argumentHint: '<seq.json>' })
    return next(e)
  })

  on('command.run', { command: 'banc-fin' }, async ($, e) => {
    const seq = JSON.parse(await $.fs.read(e.args.trim())) as { evan: string; claude: string }[]
    const sortie: { tour: number; pose: boolean; sans: string[] | null; ms: number }[] = []
    for (const [tour, t] of seq.entries()) {
      const debut = await $.clock.now()
      const pose = poseQuestion(t.evan)
      const sans = pose ? await juger($, t.evan, t.claude).catch(() => null) : []
      sortie.push({ tour, pose, sans, ms: (await $.clock.now()) - debut })
    }
    const cible = e.args.trim().replace(/\.json$/, '.juge.json')
    await $.fs.write(cible, JSON.stringify(sortie, null, 1))
    return { text: `Banc fini : ${cible}` }
  })

  on('command.run', { command: 'banc-alignement' }, async ($, e) => {
    const cible = await banc($, e.args.trim())
    return { text: `Banc fini : ${cible}` }
  })

  on('prompt.submit', async ($, e, next) => {
    const humain = e.origin.kind === 'composer' || e.origin.kind === 'bridge'
    if (!humain || !aClasser(e.text)) return next(e)
    dernierMessage = e.text
    const rappelOubli = oubliees.length > 0
      ? [`Au tour précédent, ces questions d’Evan semblent être restées sans réponse (repérage automatique) : ${oubliees.join(' ; ')}. Réponds-y aussi.`]
      : []
    oubliees = []
    const sur = <T>(p: Promise<T>, defaut: T) =>
      p.catch(erreur => {
        $.ui.log(`alignement: classement impossible (${String(erreur).slice(0, 120)})`)
        return defaut
      })
    const [ecartModele, question] = await Promise.all([
      marqueur(e.text) ? Promise.resolve(true) : sur(classer($, e.text), false),
      sur(classerQuestion($, e.text), false),
    ])
    const ajouts = [...(ecartModele ? [RAPPEL] : []), ...(question ? [RAPPEL_QUESTION] : []), ...rappelOubli]
    if (ajouts.length === 0) return next(e)
    $.ui.status(`alignement : rappel joint (${[ecartModele && 'désaccord', question && 'question', rappelOubli.length > 0 && 'questions oubliées'].filter(Boolean).join(', ')})`)
    return next({ ...e, context: [...(e.context ?? []), ...ajouts] })
  })

  on('turn.complete', async ($, e, next) => {
    $.ui.status(undefined)
    const r = await next(e)
    if (e.agentId !== undefined || e.reason !== 'answer' || !poseQuestion(dernierMessage) || !r.text.trim()) return r
    try {
      const sans = await juger($, dernierMessage, r.text)
      dernierMessage = ''
      if (sans.length === 0) return r
      oubliees = sans
      return { ...r, text: noteOubli(sans) }
    } catch (erreur) {
      $.ui.log(`alignement: contrôle de fin de tour impossible (${String(erreur).slice(0, 120)})`)
      return r
    }
  })
}
