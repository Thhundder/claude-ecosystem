export type Ligne = { id: string; statut: string; type: string; tache: string; depuis: number; fin: number | null }
export type Conso = { etapes: number; lus: number; relus: number; ecrits: number; ms: number }

declare module 'claude-code' {
  interface PluginState {
    'agents-vue': { lignes: Ligne[]; conso: Record<string, Conso> }
  }
}
