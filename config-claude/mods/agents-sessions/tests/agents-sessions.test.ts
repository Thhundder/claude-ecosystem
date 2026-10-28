import { describe, expect, test } from 'claude-code/testing'

import { commande, refus } from '../hooks/commande'

describe('agents en sessions nommées', () => {
  test('commande : description protégée, fork, modèle, consigne en entrée', async () => {
    const c = commande({ description: "l'audit", prompt: 'fais X', subagent_type: 'fork', model: 'opus' }, '/tmp/d')
    expect(c.startsWith(`~/.claude/bin/agent-session.py 'l'\\''audit' --fork --dossier '/tmp/d' --modele claude-opus-5-5 <<'CONSIGNE_AGENT'\nfais X\nCONSIGNE_AGENT`)).toBe(true)
  })
  test('jamais Sonnet ni Haiku : l’agent part sur le modèle de la session', async () => {
    for (const model of ['sonnet', 'haiku']) {
      const c = commande({ description: 'x', prompt: 'p', model }, '/d')
      expect(c).not.toContain('--modele')
      expect(c).not.toContain(model)
    }
  })
  test('rôle reporté, borne qui ne collisionne pas, isolation signalée', async () => {
    const c = commande({ description: 'x', prompt: 'a CONSIGNE_AGENT b', subagent_type: 'Explore' }, '/d')
    expect(c).toContain("<<'CONSIGNE_AGENT_'\nRôle demandé : Explore.\n\na CONSIGNE_AGENT b\nCONSIGNE_AGENT_")
    expect(c).not.toContain('--fork')
    expect(refus({ description: 'x', prompt: 'p', isolation: 'worktree' }, '/d')).toContain('« worktree » n’est pas reprise')
    expect(refus({ description: 'x', prompt: 'p' }, '/d')).toContain('run_in_background: true')
  })
})
