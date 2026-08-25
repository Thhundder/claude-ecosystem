#!/usr/bin/env python3
"""Amorce l'atlas visuel d'un depot a partir de ce qu'il contient reellement.

Trois etages : le socle (jetons, echelles, controles rendus a leur taille), la
zone contraste (calculee, jamais saisie), les fils (un par domaine, ses ecrans).

Ne produit jamais une page blanche, et ne pretend jamais que les fils sont faits :
il pose la structure et nomme ce qui reste a dessiner.

usage: atlas.py <depot> [sortie.html]
"""
import os, re, sys, glob, html, colorsys

# Le debut de ligne n'est pas une ancre fiable : une feuille compacte ou minifiee
# porte plusieurs declarations par ligne, et l'atlas sortait presque vide sans le dire.
VAR = re.compile(r'(?:^|[{;]|\*/)\s*(--[a-z0-9-]+)\s*:\s*([^;}]+)(?=[;}])', re.M)
HEX = re.compile(r'#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b')
CLS = re.compile(r'(?:^|[\s{},>+~])\.([a-z][a-z0-9-]*)', re.M)
FS  = re.compile(r'font-size\s*:\s*([0-9.]+)(px|rem|em)')
RAD = re.compile(r'border-radius\s*:\s*([0-9.]+)px')

def lire_css(root):
    txt, fichiers = '', []
    for m in ('src/app/globals.css', 'src/**/*.css', 'app/**/*.css', 'styles/**/*.css'):
        for p in glob.glob(os.path.join(root, m), recursive=True):
            if 'node_modules' in p: continue
            try: txt += open(p, encoding='utf-8', errors='replace').read() + '\n'
            except OSError: continue
            fichiers.append(os.path.relpath(p, root))
    return txt, fichiers

HSL3 = re.compile(r'^\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*$')
HSLF = re.compile(r'hsla?\(\s*([\d.]+)\s*,?\s*([\d.]+)%\s*,?\s*([\d.]+)%')
RGBF = re.compile(r'rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)')
ALPHA = re.compile(r'(?:rgba|hsla)\([^)]*,\s*(0?\.\d+|0)\s*\)')
TSCOL = re.compile(r"""([A-Za-z_][A-Za-z0-9_]*)\s*:\s*['"](#[0-9a-fA-F]{3,8})['"]""")

def hsl_hex(h, s_, l):
    r, g, b = colorsys.hls_to_rgb(float(h) / 360, float(l) / 100, float(s_) / 100)
    return '#%02x%02x%02x' % (round(r * 255), round(g * 255), round(b * 255))

def couleur_de(v):
    """Une valeur de jeton ramenee a un hex OPAQUE.

    Une valeur translucide n'a pas de contraste propre : il depend de ce qu'il y a
    dessous. L'aplatir en blanc fabriquerait des surfaces qui n'existent pas.
    """
    v = v.strip()
    if ALPHA.search(v) or re.search(r'#[0-9a-fA-F]{8}\b', v):
        return None
    m = HEX.search(v)
    if m: return norm(m.group(0))
    m = HSL3.match(v) or HSLF.search(v)
    if m: return hsl_hex(*m.groups()[:3])
    m = RGBF.search(v)
    if m:
        if m.group(4) is not None and float(m.group(4)) < 1:
            return None
        r, g, b = (int(x) for x in m.groups()[:3])
        return '#%02x%02x%02x' % (r, g, b)
    return None

def jetons_ts(root, bases):
    """Les couleurs declarees en TypeScript, la ou le theme fait foi."""
    out, vus = [], []
    motifs = ['src/**/palettes.ts', 'src/**/theme.ts', 'src/**/colors.ts',
              'src/**/design-tokens.ts', 'src/constants/theme.ts',
              '**/tailwind.config.*', 'theme/**/*.ts']
    fichiers = []
    for m in motifs:
        fichiers += [f for f in glob.glob(os.path.join(root, m), recursive=True) if 'node_modules' not in f]
    fichiers += [b for b in bases if b.endswith(('.ts', '.tsx', '.js', '.mjs'))]
    for f in dict.fromkeys(fichiers):
        try: txt = open(f, encoding='utf-8', errors='replace').read()
        except OSError: continue
        n = 0
        for cle, val in TSCOL.findall(txt):
            out.append((cle, norm(val[:7]))); n += 1
        if n: vus.append(os.path.relpath(f, root))
    return out, vus

def norm(h):
    h = h.lstrip('#')
    if len(h) == 3: h = ''.join(c*2 for c in h)
    return '#' + h.lower()

def lum(h):
    r, g, b = (int(h[i:i+2], 16)/255 for i in (1, 3, 5))
    f = lambda c: c/12.92 if c <= .03928 else ((c+.055)/1.055) ** 2.4
    return .2126*f(r) + .7152*f(g) + .0722*f(b)

def ratio(a, b):
    la, lb = lum(a), lum(b)
    return round((max(la, lb) + .05) / (min(la, lb) + .05), 2)

def verdict(r):
    if r >= 7:   return 'AAA', 'ok'
    if r >= 4.5: return 'AA', 'ok'
    if r >= 3:   return 'AA gros texte', 'moyen'
    return 'insuffisant', 'mauvais'

def routes(root):
    fils = {}
    for p in glob.glob(os.path.join(root, 'src/app/**/page.tsx'), recursive=True) \
           + glob.glob(os.path.join(root, 'app/**/page.tsx'), recursive=True):
        rel = os.path.relpath(p, root)
        parts = [x for x in rel.split(os.sep)[:-1] if x not in ('src', 'app')]
        groupe = next((x.strip('()') for x in parts if x.startswith('(')), None)
        seg = [x for x in parts if not x.startswith('(')]
        route = '/' + '/'.join(seg) if seg else '/'
        fils.setdefault(groupe or (seg[0] if seg else 'racine'), []).append(route)
    return {k: sorted(set(v)) for k, v in sorted(fils.items())}

def main():
    argv = sys.argv[1:]
    bases = []
    while '--base' in argv:
        i = argv.index('--base'); bases.append(os.path.abspath(argv[i + 1])); del argv[i:i + 2]
    root = os.path.abspath(argv[0] if argv else '.')
    sortie = argv[1] if len(argv) > 1 else os.path.join(root, 'maquettes', 'atlas.html')
    css, fichiers = lire_css(root)
    for b in bases:
        try: t = open(b, encoding='utf-8', errors='replace').read()
        except OSError: continue
        if b.endswith(('.css', '.html', '.htm')):
            css += chr(10) + t
            fichiers.insert(0, b.replace(root + os.sep, ''))
    if not css.strip() and not jetons_ts(root, bases)[0]:
        print("ni feuille de style ni fichier de thème : rien à amorcer", file=sys.stderr); sys.exit(1)

    jetons = [(n, v.strip()) for n, v in VAR.findall(css)]
    couleurs = [(n, couleur_de(v)) for n, v in jetons]
    couleurs = [(n, h) for n, h in couleurs if h]
    ts_cols, ts_fichiers = jetons_ts(root, bases)
    couleurs += ts_cols
    fichiers += ts_fichiers
    opaques = {n: h for n, h in couleurs}
    encres   = {n: h for n, h in opaques.items() if lum(h) < .35}
    surfaces = {n: h for n, h in opaques.items() if lum(h) >= .55}
    autres   = {n: h for n, h in opaques.items() if n not in encres and n not in surfaces}
    # le fond de page reel, sinon le blanc : sans lui, les seules surfaces opaques
    # sont les teintes douces et toutes les paires deviennent croisees, donc absurdes
    fond = re.search(r'body\s*\{[^}]*background(?:-color)?\s*:\s*(#[0-9a-fA-F]{3,6})', css)
    neutres = {n: h for n, h in surfaces.items()
               if not n.endswith('-soft') and not re.search(r'(ok|warn|bad|info|spark|brand)', n)}
    if fond: neutres['fond de page'] = norm(fond.group(1))
    if not neutres: neutres = {'blanc': '#ffffff'}
    familles = [(n, s2) for n in opaques for s2 in opaques
                if s2 == n + '-soft']
    if not surfaces: surfaces = {'--blanc': '#ffffff'}
    tailles = sorted({round(float(a) * (16 if u == 'rem' else 1), 1) for a, u in FS.findall(css) if u != 'em'})
    rayons  = sorted({float(x) for x in RAD.findall(css)})
    classes = sorted(set(CLS.findall(css)))
    fils = routes(root)
    nom = os.path.basename(root)

    e = html.escape
    P = []
    P.append(f"""<!doctype html><meta charset="utf-8"><title>Atlas — {e(nom)}</title>
<style>{css}</style>
<style>
:root{{--a-sol:#0B0C0B;--a-surf:#141613;--a-ligne:rgba(240,238,225,.10);--a-encre:#F3F1E9;
--a-sourd:#9C9D90;--a-faible:#6C6D63;--a-tint:#E08A2E}}
body.atlas{{margin:0;background:var(--a-sol);color:var(--a-encre);
font:15px/1.6 system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased}}
.atlas .page{{max-width:1280px;margin:0 auto;padding:clamp(26px,5vw,60px) clamp(14px,3vw,32px) 90px}}
.atlas .kick{{font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--a-tint);margin:0 0 12px}}
.atlas h1{{font-size:clamp(30px,5vw,50px);line-height:1.05;letter-spacing:-.03em;margin:0 0 16px;max-width:18ch}}
.atlas h2{{font-size:clamp(21px,3vw,29px);letter-spacing:-.025em;margin:0 0 10px}}
.atlas h3{{font-size:17px;margin:32px 0 8px}}
.atlas .lede,.atlas .p{{color:var(--a-sourd);max-width:66ch;margin:0 0 14px}}
.atlas section{{margin:clamp(38px,6vw,64px) 0 0;padding-top:clamp(20px,3vw,30px);border-top:1px solid var(--a-ligne)}}
.atlas .chiffres{{display:flex;gap:26px;flex-wrap:wrap;margin:24px 0 0;padding-top:16px;border-top:1px solid var(--a-ligne)}}
.atlas .chiffres b{{display:block;font-size:25px;font-variant-numeric:tabular-nums}}
.atlas .chiffres span{{font-size:12px;color:var(--a-faible);text-transform:uppercase;letter-spacing:.05em}}
.atlas .grille{{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}}
.atlas .panneau{{background:var(--a-surf);border:1px solid var(--a-ligne);border-radius:16px;padding:16px}}
.atlas .etiq{{font-size:11px;font-weight:600;letter-spacing:.09em;text-transform:uppercase;color:var(--a-sourd);margin:0 0 12px}}
.atlas .teinte{{display:grid;grid-template-columns:26px 1fr auto;gap:9px;align-items:center;font-size:12px;padding:2px 0}}
.atlas .teinte i{{width:26px;height:17px;border-radius:5px;border:1px solid var(--a-ligne)}}
.atlas .teinte code{{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;color:var(--a-faible)}}
.atlas table{{width:100%;border-collapse:collapse;font-size:12.5px}}
.atlas th,.atlas td{{text-align:left;padding:6px 8px;border-bottom:1px solid var(--a-ligne)}}
.atlas th{{color:var(--a-faible);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.06em}}
.atlas .ok{{color:#84AC72}}.atlas .moyen{{color:#E0A93E}}.atlas .mauvais{{color:#E0654B;font-weight:600}}
.atlas .demo{{background:#fff;color:#111;border-radius:12px;padding:18px;margin-top:10px}}
.atlas .aremplir{{border:1px dashed var(--a-ligne);border-radius:12px;padding:14px;color:var(--a-faible);font-size:13px}}
.atlas .fil li{{margin:3px 0;font-size:13.5px}}
.atlas .fil code{{color:var(--a-tint)}}
</style>
<body class="atlas"><div class="page">
<p class="kick">Atlas visuel — amorcé automatiquement</p>
<h1>{e(nom)} — le socle, le contraste, les fils</h1>
<p class="lede">Cette page est <b>la référence visuelle du dépôt</b>. Elle a été amorcée à partir des
feuilles de style réellement présentes ; le socle et le contraste sont mesurés, les fils sont une
structure à remplir. Elle ne fait foi que pour ce qui y est effectivement dessiné.</p>
<div class="chiffres">
<div><b>{len(jetons)}</b><span>jetons déclarés</span></div>
<div><b>{len(opaques)}</b><span>couleurs</span></div>
<div><b>{len(tailles)}</b><span>tailles de police</span></div>
<div><b>{len(rayons)}</b><span>rayons</span></div>
<div><b>{len(classes)}</b><span>classes</span></div>
<div><b>{sum(len(v) for v in fils.values())}</b><span>écrans</span></div>
</div>""")

    # ---- socle
    P.append('<section><h2>Le socle</h2><p class="p">Un seul jeu de rôles. Tout ce qui suit est extrait du dépôt.</p><div class="grille">')
    for titre, jeu in (('Encres', encres), ('Surfaces', surfaces), ('Accents et états', autres)):
        P.append(f'<div class="panneau"><p class="etiq">{titre}</p>')
        for n, h in sorted(jeu.items(), key=lambda x: lum(x[1])):
            P.append(f'<div class="teinte"><i style="background:{h}"></i><b>{e(n)}</b><code>{h}</code></div>')
        P.append('</div>')
    P.append('</div>')

    P.append('<h3>Échelle typographique</h3>')
    if len(tailles) > 8:
        P.append(f'<p class="p"><b>{len(tailles)} tailles distinctes</b> — une échelle en dérive. '
                 'Une échelle tenue en compte cinq à sept.</p>')
    P.append('<div class="demo">' + ''.join(
        f'<div style="font-size:{t}px;line-height:1.35">{t} px — Le vif renard brun saute par-dessus le chien</div>'
        for t in tailles[:14]) + '</div>')

    P.append('<h3>Rayons</h3>')
    if len(rayons) > 5:
        P.append(f'<p class="p"><b>{len(rayons)} rayons distincts</b> — à ramener sur les jetons déclarés.</p>')
    P.append('<div class="demo" style="display:flex;gap:10px;flex-wrap:wrap">' + ''.join(
        f'<div style="width:64px;height:48px;background:#e8e8e4;border:1px solid #ccc;border-radius:{r}px;'
        f'display:flex;align-items:center;justify-content:center;font-size:11px">{r:g}</div>' for r in rayons[:12]
    ) + '</div>')

    P.append('<h3>Contrôles, à leur taille réelle</h3><p class="p">Rendus avec la feuille de style du dépôt.</p>')
    utiles = [c for c in classes if re.match(r'^(btn|chip|card|kpi|tag|glass|switch|pill|badge)', c)]
    P.append('<div class="demo">' + (''.join(
        f'<span class="{e(c)}" style="margin:4px;display:inline-block">.{e(c)}</span>' for c in utiles[:24])
        or '<span class="aremplir">aucune classe de contrôle reconnue — à dessiner à la main</span>') + '</div>')

    # ---- contraste
    P.append('<section><h2>La zone contraste</h2>'
             '<p class="p">Chaque encre sur chaque surface. Ratios calculés, pas saisis. '
             'Seuils : 4,5 pour du texte courant, 3 pour du gros texte. '
             'Les valeurs translucides sont exclues — leur contraste dépend de ce qu\'il y a dessous.</p>'
             '<table><tr><th>Encre</th><th>Surface</th><th>Ratio</th><th>Verdict</th></tr>')
    # on ne compare que ce qui se superpose reellement : les encres sur les fonds
    # neutres, et chaque accent sur sa propre teinte douce. Les paires croisees
    # entre familles n'existent pas a l'ecran.
    mauvais = 0
    paires = [(ne, he, ns, hs) for ne, he in sorted(encres.items()) for ns, hs in sorted(neutres.items())]
    paires += [(a, opaques[a], b, opaques[b]) for a, b in sorted(familles)]
    for ne, he, ns, hs in paires:
            r = ratio(he, hs); v, k = verdict(r)
            if k == 'mauvais': mauvais += 1
            P.append(f'<tr><td>{e(ne)} <code>{he}</code></td><td>{e(ns)} <code>{hs}</code></td>'
                     f'<td>{r}</td><td class="{k}">{v}</td></tr>')
    P.append('</table>')
    if mauvais:
        P.append(f'<p class="p" style="color:#E0654B"><b>{mauvais} paire(s) sous le seuil.</b> '
                 'À corriger avant de dessiner quoi que ce soit dessus.</p>')

    # ---- fils
    P.append('<section><h2>Les fils</h2><p class="p">Un fil par domaine. Les écrans sont réels, '
             'lus dans l\'arborescence. <b>Ce qui manque, c\'est le dessin de chaque écran et les '
             'chemins entre eux</b> — c\'est ce qui reste à faire.</p>')
    for f, rts in fils.items():
        P.append(f'<h3 id="f-{e(f)}">{e(f)} <span style="color:var(--a-faible);font-size:13px">— {len(rts)} écran(s)</span></h3>'
                 '<ul class="fil">' + ''.join(f'<li><code>{e(r)}</code></li>' for r in rts) + '</ul>'
                 '<div class="aremplir">À dessiner : chaque écran de ce fil, et les chemins qui y mènent.</div>')
    P.append(f'</section><section><p class="p" style="font-size:12.5px">Amorcé depuis : '
             + ', '.join(f'<code>{e(x)}</code>' for x in list(dict.fromkeys(fichiers))[:6]) + '</p></section></div>')

    os.makedirs(os.path.dirname(sortie), exist_ok=True)
    fichiers = list(dict.fromkeys(fichiers))
    open(sortie, 'w', encoding='utf-8').write('\n'.join(P))
    print(f"atlas amorcé → {sortie}")
    print(f"  {len(opaques)} couleurs, {len(encres)} encres, {len(surfaces)} surfaces, "
          f"{mauvais} paire(s) de contraste insuffisantes, {sum(len(v) for v in fils.values())} écrans dans {len(fils)} fil(s)")

if __name__ == '__main__':
    main()
