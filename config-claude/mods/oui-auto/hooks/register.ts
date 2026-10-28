import type { Register } from 'claude-code'

const RECOMMANDEE = /recommand|recommended/i

export const register: Register = on => {
  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    if (e.tool !== 'AskUserQuestion' || !(await $.fs.exists(`${await $.env.get('HOME')}/.claude/absent`))) return next(e)
    const answers: Record<string, string> = {}
    for (const q of e.questions) {
      const o = q.options?.find(x => RECOMMANDEE.test(x.label)) ?? q.options?.[0]
      if (o) answers[q.question] = o.label
    }
    $.ui.toast('Evan absent : option recommandée choisie')
    return { result: { questions: e.questions, answers }, context: 'Réponse automatique (Evan absent) : option recommandée choisie. Signale-le à Evan à son retour.' }
  }).catch(($, e, next) => next(e))
}
