export type Mesure = { tokens: number | null; fenetre: number; usd: number | null }
export type Agents = { actifs: number; anomalies: string[] }

declare module 'claude-code' {
  interface PluginState {
    bande: { mesure: Mesure | null; agents: Agents; plafond: number | null; signalees: string[] }
  }
}
