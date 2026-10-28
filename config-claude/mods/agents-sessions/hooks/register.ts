import type { Register } from 'claude-code'

import { refus } from './commande'

export const register: Register = on => {
  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    if (e.subagent_type === 'fork') return next(e)
    const dossier = await $.session.cwd()
    $.ui.log(`agents-sessions: Agent « ${e.description} » refusé, session nommée proposée`)
    return { deny: refus(e, dossier) }
  }).catch(($, e, next) => next(e))
}
