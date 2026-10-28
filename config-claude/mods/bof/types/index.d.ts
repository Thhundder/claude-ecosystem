export type NoteDonnee = boolean

declare module 'claude-code' {
  interface PluginState {
    bof: {
      noteDonnee: NoteDonnee
    }
  }
}
