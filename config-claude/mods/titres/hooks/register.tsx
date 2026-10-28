import type { Register } from 'claude-code'

const TITRES: [RegExp, string][] = [
  [/^Fini\.$/, 'success'],
  [/^Pas fini\b/, 'warning'],
  [/^Ce que j[’']ai fait$/, '#8FB3D9'],
  [/^Ce que tu dois faire$/, '#D97757'],
  [/^Questions?$/, '#E3B66A'],
  [/^Traçabilité$/, '#B5AFA3'],
  [/^(État|Prochaine action|Plan( \d+\/\d+)?)$/, '#B5AFA3'],
]

export type Morceau = { titre: string; couleur: string; reste: string } | { texte: string }

const couleurDe = (titre: string) => TITRES.find(([motif]) => motif.test(titre))?.[1]

export const decouper = (texte: string): Morceau[] => {
  const morceaux: Morceau[] = []
  let tampon: string[] = []
  let dansCode = false
  const vider = () => {
    if (tampon.join('').trim() !== '') morceaux.push({ texte: tampon.join('\n').replace(/^\n+|\n+$/g, '') })
    tampon = []
  }
  for (const ligne of texte.split('\n')) {
    if (/^\s*```/.test(ligne)) dansCode = !dansCode
    const gras = dansCode ? null : /^\*\*([^*]+?)\*\*\s*(?::\s*)?(.*)$/.exec(ligne)
    const simple = dansCode || gras ? null : /^(Fini\.|Pas fini|État|Prochaine action|Plan \d+\/\d+)\s*(?::\s*)?(.*)$/.exec(ligne)
    const trouve = gras ?? simple
    const couleur = trouve ? couleurDe(trouve[1]!.trim()) : undefined
    if (trouve && couleur) {
      vider()
      morceaux.push({ titre: trouve[1]!.trim(), couleur, reste: trouve[2]!.trim() })
    } else {
      tampon.push(ligne)
    }
  }
  vider()
  return morceaux
}

export const register: Register = on => {
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.props.isSummary) return next(e)
    const morceaux = decouper(e.props.text)
    if (!morceaux.some(m => 'titre' in m)) return next(e)
    const { Box, Text, Markdown } = $.ui.resolve(e)
    return (
      <Box flexDirection="row" marginTop={1}>
        <Box width={2} flexShrink={0}>
          <Text color="text">{e.props.isFirstOfReply ? '●' : ' '}</Text>
        </Box>
        <Box flexDirection="column" flexGrow={1}>
          {morceaux.map((m, i) =>
            'titre' in m ? (
              <Box key={`t${i}`} flexDirection="column" marginTop={i === 0 ? 0 : 1}>
                <Text color={m.couleur} bold>{m.titre}</Text>
                {m.reste !== '' && <Markdown key={`r${i}`} text={m.reste} />}
              </Box>
            ) : (
              <Box key={`m${i}`} marginTop={i === 0 || 'titre' in morceaux[i - 1]! ? 0 : 1}>
                <Markdown key={`k${i}`} text={m.texte} />
              </Box>
            ),
          )}
        </Box>
      </Box>
    )
  })
}
