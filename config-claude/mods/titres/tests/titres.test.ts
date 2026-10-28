import { describe, expect, test } from 'claude-code/testing'

import { decouper } from '../hooks/register'

const REPONSE = [
  'Fini.',
  '',
  '**Ce que j\'ai fait**',
  '- thème réécrit',
  '',
  '**Ce que tu dois faire** : relance Claude.',
  '',
  '```',
  '**Questions**',
  '```',
  '',
  '**Questions**',
  '1. On y va ?',
].join('\n')

describe('découpage', () => {
  test('titres reconnus, code laissé tel quel', async () => {
    expect(decouper(REPONSE)).toEqual([
      { titre: 'Fini.', couleur: 'success', reste: '' },
      { titre: 'Ce que j\'ai fait', couleur: '#8FB3D9', reste: '' },
      { texte: '- thème réécrit' },
      { titre: 'Ce que tu dois faire', couleur: '#D97757', reste: 'relance Claude.' },
      { texte: '```\n**Questions**\n```' },
      { titre: 'Questions', couleur: '#E3B66A', reste: '' },
      { texte: '1. On y va ?' },
    ])
  })
  test('gras ordinaire ignoré', async () => {
    expect(decouper('**Attention** : rien')).toEqual([{ texte: '**Attention** : rien' }])
    expect(decouper('Pas fini : reste X')).toEqual([{ titre: 'Pas fini', couleur: 'warning', reste: 'reste X' }])
  })
})

describe('dessin', () => {
  test('titre coloré, texte en markdown', async ($) => {
    const ui = await $.ui.mount({ plugin: 'titres', surface: 'terminal', component: 'AssistantMessage', props: { text: REPONSE, isFirstOfReply: true } })
    expect(await ui.find({ type: 'Text', text: 'Ce que tu dois faire' })).toMatchObject({ props: { color: '#D97757', bold: true } })
    expect(await ui.find({ type: 'Markdown' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '●' })).toBeDefined()
  })
  test('réponse sans titre : dessin du moteur', async ($, on) => {
    on('ui.render', { component: 'AssistantMessage' }, async ($, e) => {
      const { Text } = $.ui.resolve(e)
      return h(Text, null, `MOTEUR ${e.props.text}`) as never
    })
    const ui = await $.ui.mount({ plugin: 'titres', surface: 'terminal', component: 'AssistantMessage', props: { text: 'Bonjour', isFirstOfReply: true } })
    expect((await ui.find({ type: 'Text' }))?.text).toBe('MOTEUR Bonjour')
  })
})
