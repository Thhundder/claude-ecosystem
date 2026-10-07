export type Ligne = { id: string; statut: string; type: string; tache: string; depuis: number; fin: number | null }

declare module 'claude-code' {
  interface PluginState {
    'agents-vue': { lignes: Ligne[] }
  }
}
