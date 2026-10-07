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
  const lignes = JSON.parse(await $.fs.read(chemin)) as { i: number; texte: string; attendu: string }[]
  const sortie: { i: number; attendu: string; ecart: boolean | null; ms: number }[] = []
  for (const ligne of lignes) {
    const debut = await $.clock.now()
    let ecart: boolean | null = null
    try {
      ecart = await classer($, ligne.texte)
    } catch {
      ecart = null
    }
    sortie.push({ i: ligne.i, attendu: ligne.attendu, ecart, ms: (await $.clock.now()) - debut })
  }
  const cible = chemin.replace(/\.json$/, '.resultats.json')
  await $.fs.write(cible, JSON.stringify(sortie))
  return cible
}

export const register: Register = on => {
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
    let ecart = marqueur(e.text)
    if (!ecart) {
      try {
        ecart = await classer($, e.text)
      } catch (erreur) {
        $.ui.log(`alignement: classement impossible (${String(erreur).slice(0, 120)})`)
      }
    }
    if (!ecart) return next(e)
    $.ui.status('alignement : désaccord repéré, rappel joint')
    return next({ ...e, context: [...(e.context ?? []), RAPPEL] })
  })

  on('turn.complete', ($, e, next) => {
    $.ui.status(undefined)
    return next(e)
  })
}
