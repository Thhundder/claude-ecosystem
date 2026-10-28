import type { EngineInterface as Engine, ModelUsage, Register, SessionMessage } from 'claude-code'

import { ENTETE, derniersEchanges, formaterEchange, horodatage, masquer } from './bof'

const DELAI_MS = 5000
// Tri désaccord sur Opus : meilleur que Haiku aux deux tirages (evan/agents/alignement-opus/MESURE-OPUS.txt).
export const MODELE_ECART = 'claude-opus-5-5'
export const DELAI_ECART_MS = 15000

type Compte = (u: ModelUsage) => void

export const CONSIGNE = [
  "Tu classes un message qu'un développeur, Evan, envoie à son assistant de code.",
  'Question : ce message dit-il que l’ASSISTANT s’est trompé, a mal compris, a mal fait, ou que son explication',
  'n’a pas été comprise ?',
  'ECART : reproche ou correction visant ce que l’assistant a fait, dit ou compris ; résultat de l’assistant',
  'jugé mauvais ; « je t’avais dit » ; Evan qui ne comprend pas l’explication de l’assistant ou est perdu.',
  'NEUTRE : tout le reste, même s’il y a « non », un problème ou de l’agacement qui ne vise pas l’assistant :',
  'nouvelle consigne, question, demande de vérification, bug du produit ou d’un service tiers signalé,',
  'choix entre options, validation, sujet écarté.',
  'Une nouvelle consigne ou un changement de ce qu’Evan veut n’est pas un reproche, même dit sèchement.',
  'Ne pas comprendre un message du produit, d’un service ou d’une autre session n’est pas ne pas comprendre l’assistant.',
  'Une question sur l’avancement ou sur la cause d’un problème n’est pas un reproche.',
  'Exemples :',
  '« non, je voulais le bouton à droite, pas en haut » → ECART',
  '« t’as encore modifié le mauvais fichier » → ECART',
  '« je comprends rien à ton tableau, explique autrement » → ECART',
  '« 3 non, on garde l’ancien » → NEUTRE',
  '« le paiement Stripe renvoie une erreur 500, regarde » → NEUTRE',
  '« fais tout toi-même et préviens-moi quand c’est fini » → NEUTRE',
  '« pourquoi le cache expire au bout de 5 min ? » → NEUTRE',
  '« d’ailleurs je ne veux plus voir ça en bas » → NEUTRE',
  '« tu ne commit rien mais vas-y, lance » → NEUTRE',
  '« le titre d’intro on l’enlève, ça sert à rien » → NEUTRE',
  '« toujours pas fini ? il y a un souci ? » → NEUTRE',
  '« tu sais pourquoi la page n’affiche pas le plan ? t’as regardé ? » → NEUTRE',
  '« le site affiche "accès refusé", pourquoi ? je comprends pas, regarde » → NEUTRE',
  '« l’autre session ne comprend pas ce que je veux, fais une commande pour lui réexpliquer » → NEUTRE',
  '« la V2 est bien, juste l’animation reste au début, rallonge-la » → NEUTRE',
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

export const classerQuestion = async ($: Engine, texte: string, compte?: Compte) => {
  const reponse = await $.model.complete({
    model: 'haiku',
    system: CONSIGNE_QUESTION,
    prompt: `Message :\n"""\n${texte.slice(0, 2000)}\n"""`,
    maxTokens: 5,
    timeoutMs: DELAI_MS,
  })
  if (!reponse.isAnswered) throw new Error(reponse.reason)
  compte?.(reponse.usage)
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

export const juger = async ($: Engine, message: string, reponse: string, compte?: Compte) => {
  const r = await $.model.complete({
    model: 'opus',
    system: CONSIGNE_JUGE,
    prompt: `Message d'Evan :\n"""${message.slice(0, 3000)}"""\nRéponse de l'assistant :\n"""${reponse.slice(0, 6000)}"""`,
    maxTokens: 300,
    timeoutMs: 8000,
  })
  if (!r.isAnswered) throw new Error(r.reason)
  compte?.(r.usage)
  return lireSansReponse(r.text)
}

export const aClasser = (texte: string) => {
  const t = texte.trim()
  return t.length >= 2 && !t.startsWith('/')
}

const MARQUEURS = new RegExp(
  [
    "(pas|rien) compris",
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
  ].join('|'),
  'i',
)

export const marqueur = (texte: string) => MARQUEURS.test(texte.replace(/[’`]/g, "'"))

export const lireVerdict =(texte: string) => /^\W*ECART/i.test(texte.trim())

export const classer = async ($: Engine, texte: string, compte?: Compte) => {
  const reponse = await $.model.complete({
    model: MODELE_ECART,
    system: CONSIGNE,
    prompt: `Message :\n"""\n${texte.slice(0, 2000)}\n"""`,
    maxTokens: 5,
    timeoutMs: DELAI_ECART_MS,
  })
  if (!reponse.isAnswered) throw new Error(reponse.reason)
  compte?.(reponse.usage)
  return lireVerdict(reponse.text)
}

export const ALIGNEMENT = '.claude/retours/ALIGNEMENT.txt'
export const RETOURS = '.claude/retours/RETOURS.txt'
export type Type = 'désaccord' | 'question' | 'question oubliée'

export const court = (texte: string, n = 300) => {
  const t = texte.replace(/<pasted_content[\s\S]*?<\/pasted_content[^>]*>/g, '[collé]').replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n)}…` : t
}

export const ligneAlignement = (o: { quand: Date; session: string; depot: string; type: Type; texte: string }) =>
  masquer(`${horodatage(o.quand)}\t${o.session}\t${o.depot}\t${o.type}\t${court(o.texte)}\n`)

export const entreeAuto = (o: { quand: Date; texte: string; session: string; dossier: string; messages: readonly SessionMessage[] }) => {
  const echanges = derniersEchanges(o.messages, 3)
  const corps = echanges.map((e, i) => formaterEchange(e, i + 1)).join('\n\n')
  return masquer(
    `${ENTETE}${horodatage(o.quand)} auto =====\n` +
      `Retour d'Evan (auto : désaccord repéré par le mod alignement) : ${o.texte.trim()}\n` +
      `Session : ${o.session}\nDossier : ${o.dossier}\n` +
      `--- ${echanges.length} derniers échanges ---\n${corps}\n\n`,
  )
}

const ajouter = async ($: Engine, fichier: string, texte: string) => {
  const home = (await $.env.get('HOME')) ?? ''
  const run = await $.process.run(['sh', '-c', 'mkdir -p "$(dirname "$1")" && cat >> "$1"', 'alignement', `${home}/${fichier}`], { stdin: texte, timeoutMs: 10000 })
  if (run.exitCode !== 0) throw new Error(run.stderr.trim() || String(run.exitCode))
}

export const noter = async ($: Engine, types: Type[], texte: string, messages?: readonly SessionMessage[]) => {
  if (types.length === 0) return
  const quand = new Date()
  const [session, depot, dossier] = await Promise.all([$.session.id(), $.session.root(), $.session.cwd()])
  await ajouter($, ALIGNEMENT, types.map(type => ligneAlignement({ quand, session, depot, type, texte })).join(''))
  if (types.includes('désaccord')) {
    await ajouter($, RETOURS, entreeAuto({ quand, texte, session, dossier, messages: messages ?? (await $.session.messages()) }))
  }
}

const banc = async ($: Engine, chemin: string) => {
  const lignes = JSON.parse(await $.fs.read(chemin)) as { i?: number; texte?: string; evan?: string; attendu: string }[]
  const sortie: { i: number; attendu: string; ecart: boolean | null; question: boolean | null; ms: number; jetons: { ecart?: ModelUsage; question?: ModelUsage } }[] = []
  for (const [n, ligne] of lignes.entries()) {
    const texte = ligne.texte ?? ligne.evan ?? ''
    const debut = await $.clock.now()
    const jetons: { ecart?: ModelUsage; question?: ModelUsage } = {}
    const [ecart, question] = await Promise.all([
      classer($, texte, u => (jetons.ecart = u)).catch(() => null),
      classerQuestion($, texte, u => (jetons.question = u)).catch(() => null),
    ])
    sortie.push({ i: ligne.i ?? n, attendu: ligne.attendu, ecart, question, ms: (await $.clock.now()) - debut, jetons })
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
    return next(e)
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
        $.ui.log(`alignement: classement impossible (${String(erreur).slice(0, 120)})`, { to: 'debug' })
        return defaut
      })
    const [ecartModele, question] = await Promise.all([
      marqueur(e.text) ? Promise.resolve(true) : sur(classer($, e.text), false),
      sur(classerQuestion($, e.text), false),
    ])
    const types: Type[] = [...(ecartModele ? ['désaccord' as const] : []), ...(question ? ['question' as const] : [])]
    const ajouts = [...(ecartModele ? [RAPPEL] : []), ...(question ? [RAPPEL_QUESTION] : []), ...rappelOubli]
    if (ajouts.length === 0) return next(e)
    $.ui.log(`alignement : rappel joint (${[...types, ...(rappelOubli.length > 0 ? ['questions oubliées'] : [])].join(', ')})`, { to: 'debug' })
    void noter($, types, e.text).catch(erreur => $.ui.log(`alignement : écriture impossible (${String(erreur).slice(0, 120)})`, { to: 'debug' }))
    return next({ ...e, context: [...(e.context ?? []), ...ajouts] })
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId !== undefined || e.reason !== 'answer' || !poseQuestion(dernierMessage) || !r.text.trim()) return r
    try {
      const message = dernierMessage
      const sans = await juger($, message, r.text)
      dernierMessage = ''
      if (sans.length === 0) return r
      oubliees = sans
      void noter($, ['question oubliée'], `${message} → sans réponse : ${sans.join(' ; ')}`).catch(erreur =>
        $.ui.log(`alignement : écriture impossible (${String(erreur).slice(0, 120)})`, { to: 'debug' }),
      )
      return { ...r, text: noteOubli(sans) }
    } catch (erreur) {
      $.ui.log(`alignement: contrôle de fin de tour impossible (${String(erreur).slice(0, 120)})`, { to: 'debug' })
      return r
    }
  })
}
