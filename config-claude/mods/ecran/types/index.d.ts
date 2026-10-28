export type Famille = { nom: string; ko: number; cpu: number; n: number; detail: [string, number, number, number][] }
export type Ram = {
  quand: string
  total: number
  dispo: number
  coeurs: number
  cpu_pris: number
  cpu_irq: number
  cpu_non_attribue: number
  noyau_ko: number
  noyau_detail: [string, number][]
  familles: Famille[]
}
export type Etape = { titre: string; sous: string[]; etat: 'encours' | 'ensuite'; meta: string }
export type PlanPanneau = { phase: string; titre: string; faites: string[]; total: number; etapes: Etape[] }
export type PointFini = { court: string; long: string; atteint: boolean }
export type Noeud = { texte: string; etat: 'fait' | 'encours' | 'partiel' | 'afaire'; enfants: Noeud[]; faits: number; total: number; libelle?: string }
export type Arbre = { titre: string; noeuds: Noeud[]; faits: number; total: number; enCours: string | null }
export type Suivi = {
  dossier: string
  projet: string
  chantier: string | null
  objectif: string | null
  plan: PlanPanneau | null
  planNom: string | null
  fini: PointFini[]
}
export type Agent = { id: string; nom: string; statut: string; depuis: number }
export type Tache = { sorte: 'workflow' | 'agent' | 'shell'; nom: string; depuis: number }
export type Donnees = {
  tokens: number | null
  fenetre: number
  quotas: { nom: string; pct: number; fin?: string }[]
  cout: number | null
  tours: number[]
  contextes: number[]
  agents: Agent[]
  plan: { nom: string; faits: number; total: number } | null
  travaille: boolean
  memoire: number | null
  taches: Tache[]
}

declare module 'claude-code' {
  interface PluginState {
    ecran: {
      donnees: Donnees
      suivi: Shaped<Suivi | null>
      ram: Shaped<Ram | null>
      racine: string | null
      place: boolean
      largeur: number
      kitty: boolean
      petit: boolean
      planEcrit: string | null
      plis: string[]
      planTout: boolean
      finiTout: boolean
      finiOuvert: number | null
    }
  }
}
