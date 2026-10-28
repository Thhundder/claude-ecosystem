export const SEUIL = 300_000

export const CONSIGNE =
  'Résumé pour continuer cette conversation sans rien perdre. Garde MOT POUR MOT chaque message d’Evan ' +
  '(demandes, refus, corrections, réponses à des questions). Garde toutes les décisions prises et par qui, ' +
  'chaque chiffre mesuré avec son unité, chaque chemin de fichier, commit, branche, commande importante, ' +
  'ce qui a été refusé ou rétracté et pourquoi, l’état exact du travail (fait, en cours, bloqué) et la prochaine ' +
  'action annoncée. Ne garde pas les sorties d’outils sauf leurs conclusions.'

export type Retenu = { outil: string; quoi: string }

export function retenir(outil: string, entree: Record<string, unknown>): Retenu | null {
  if (outil === 'Agent' || outil === 'Task') return { outil, quoi: String(entree.description ?? entree.prompt ?? '').slice(0, 300) }
  if (outil === 'Workflow') return { outil, quoi: String(entree.name ?? entree.description ?? 'workflow').slice(0, 300) }
  if (outil === 'Bash' && entree.run_in_background === true) return { outil, quoi: String(entree.command ?? '').slice(0, 300) }
  return null
}

export const refus = (r: Retenu) =>
  `Résumé automatique en attente (mod resume-auto) : ce lancement (${r.outil} : ${r.quoi}) est mis en file. Juste après le résumé, qui part dès la fin de ce tour (agents et shells en cours compris), la liste de ce qui a été mis en file te sera rendue pour que tu le relances. Ne le relance pas avant ; termine ce qui est en cours.`

export const relance = (file: readonly Retenu[]) =>
  'Le résumé automatique vient d’être fait (mod resume-auto). Pendant l’attente, ces lancements ont été mis en file ; relance-les maintenant s’ils servent encore, avec les mêmes consignes :\n' +
  file.map((r, i) => `${i + 1}. ${r.outil} : ${r.quoi}`).join('\n')

export const declencher = (tokens: number, seuil: number, apresResume: number | null) =>
  tokens >= Math.max(seuil, apresResume === null ? 0 : apresResume + 100_000)

export const libre = (statutSession: string | null, tourEnCours: boolean) =>
  !tourEnCours && statutSession !== 'busy' && statutSession !== 'waiting'
