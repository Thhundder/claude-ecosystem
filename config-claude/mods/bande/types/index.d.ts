export type Quota = { kind: string; pct: number }
export type Mesure = { tokens: number | null; fenetre: number; quotas: Quota[] }
export type Agents = { actifs: number; anomalies: string[] }
export type Tour = { lus: number; relus: number; ecrits: number }
export type Plan = { nom: string; faits: number; total: number }

declare module 'claude-code' {
  interface PluginState {
    bande: {
      mesure: Mesure | null
      agents: Agents
      signalees: string[]
      tour: Tour
      plan: Plan | null
      memoire: number | null
      muet: { agent: string; s: number } | null
    }
  }
}
