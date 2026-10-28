import { describe, expect, test } from 'claude-code/testing'
import type { Engine, Mounted } from 'claude-code/testing'
import type { RenderElement, RenderPropsOf } from 'claude-code'

import { duree, nature, nomCite, resumeRapport, resumeTache } from '../hooks/register'

type Props = RenderPropsOf['UserMessage']

const AGENT: Props = {
  text: 'Agent "Réponds OK" completed',
  origin: { kind: 'task-notification' },
  isExpanded: false,
  task: { id: 'a1', status: 'completed', durationMs: 192_000 },
}
const SHELL: Props = {
  text: 'Background command "sleep 5" completed (exit code 0)',
  origin: { kind: 'task-notification' },
  isExpanded: false,
  task: { id: 'b1', status: 'failed', durationMs: 5_200 },
}
const ARRETE: Props = {
  text: 'Task was stopped',
  origin: { kind: 'task-notification' },
  isExpanded: false,
  task: { id: 'a2', status: 'killed', durationMs: 61_000 },
}
const RAPPORT: Props = {
  text: 'Fait.\nTrois fichiers.\nTests verts.',
  origin: { kind: 'unclassified' },
  isExpanded: false,
  from: { name: 'auditeur' },
}
const PROMPT: Props = { text: 'bonjour', origin: { kind: 'composer' }, isExpanded: false }

describe('textes', () => {
  test('durées', async () => {
    expect(duree(5_200)).toBe('5 s')
    expect(duree(192_000)).toBe('3 min 12 s')
    expect(duree(3_725_000)).toBe('1 h 02 min')
  })
  test('nature et nom de la tâche', async () => {
    expect(nature('Agent "x" completed', false)).toBe('agent')
    expect(nature('Background command "sleep 5" completed', false)).toBe('shell')
    expect(nature('fini', true)).toBe('agent')
    expect(nature('fini', false)).toBe('tâche')
    expect(nomCite('Agent "Réponds OK" completed')).toBe('Réponds OK')
    expect(nomCite('rien')).toBeUndefined()
  })
  test('fin d’agent, échec, arrêt', async () => {
    expect(resumeTache(AGENT.text, AGENT.task ?? {})).toEqual({ glyphe: '✓', couleur: undefined, texte: 'agent « Réponds OK » fini en 3 min 12 s' })
    expect(resumeTache(SHELL.text, SHELL.task ?? {})).toMatchObject({ glyphe: '✗', texte: 'shell « sleep 5 » échoué en 5 s' })
    expect(resumeTache(ARRETE.text, ARRETE.task ?? {}, 'Audit')).toMatchObject({ glyphe: '■', texte: 'agent « Audit » arrêté en 1 min 01 s' })
  })
  test('rapport', async () => {
    expect(resumeRapport('auditeur', RAPPORT.text).texte).toBe('rapport de auditeur (3 lignes)')
    expect(resumeRapport('a', 'seul\n').texte).toBe('rapport de a (1 ligne)')
  })
})

const monter = (
  $: Engine,
  surface: 'terminal' | 'desktop',
  props: Props,
) => $.ui.mount({ plugin: 'replis', surface, component: 'UserMessage', props })

const vu = async (ui: Mounted<'terminal' | 'desktop', 'UserMessage'>) => (await ui.find({ type: 'Text' }))?.text

describe('affichage dans le fil', () => {
  for (const surface of ['terminal', 'desktop'] as const) {
    test(`replié et déplié (${surface})`, async ($, on) => {
      on('ui.render', { component: 'UserMessage' }, async ($, e) => {
        const { Text } = $.ui.resolve(e)
        return h(Text, null, `ORIGINAL ${e.props.text}`) as RenderElement
      })
      on('agent.list', async () => ({ value: [{ id: 'a2', description: 'Audit des sessions', type: 'general-purpose', status: 'killed' }] }))

      const agent = await monter($, surface, AGENT)
      expect(await vu(agent)).toBe('✓ agent « Réponds OK » fini en 3 min 12 s')
      await agent.redraw({ ...AGENT, isExpanded: true })
      expect(await vu(agent)).toBe(`ORIGINAL ${AGENT.text}`)

      const shell = await monter($, surface, SHELL)
      expect(await vu(shell)).toBe('✗ shell « sleep 5 » échoué en 5 s')
      expect(await shell.find({ type: 'Text', text: /^✗$/ })).toMatchObject({ props: { color: 'error' } })

      const arrete = await monter($, surface, ARRETE)
      expect(await vu(arrete)).toBe('■ agent « Audit des sessions » arrêté en 1 min 01 s')

      const rapport = await monter($, surface, RAPPORT)
      expect(await vu(rapport)).toBe('↩ rapport de auditeur (3 lignes)')
      await rapport.redraw({ ...RAPPORT, isExpanded: true })
      expect(await vu(rapport)).toBe(`ORIGINAL ${RAPPORT.text}`)

      const prompt = await monter($, surface, PROMPT)
      expect(await vu(prompt)).toBe('ORIGINAL bonjour')
    })
  }
})
