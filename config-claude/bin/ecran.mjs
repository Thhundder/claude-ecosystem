// Inventaire d'un ecran rendu, et comparaison maquette contre reel.
// Le but n'est pas le pixel : c'est qu'aucun element de la maquette ne manque.
// Rendu par un vrai navigateur, parce qu'un element peut exister dans le HTML
// et n'etre pas visible.
import { createRequire } from 'node:module';
const exiger = createRequire(import.meta.url);
const { chromium } = exiger(process.env.HOME + '/.claude/lib/node_modules/playwright-core');
import { readFile, writeFile } from 'node:fs/promises';

const EXTRACTION = () => {
  const visible = (e) => {
    const r = e.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const s = getComputedStyle(e);
    return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05;
  };
  const norm = (t) => (t || '').replace(/\s+/g, ' ').trim();

  const textes = [];
  const marche = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = marche.nextNode(); n; n = marche.nextNode()) {
    const t = norm(n.nodeValue);
    if (!t) continue;
    const p = n.parentElement;
    if (!p || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(p.tagName)) continue;
    if (!visible(p)) continue;
    textes.push(t);
  }

  // Une maquette dessine ses boutons avec des blocs stylés ; une app en produit
  // de vrais. Trois indices, pour que les deux soient vus par le même outil.
  const SEL = 'button,a,input,select,textarea,[role=button],[role=link],[role=tab],[role=switch],[onclick],[tabindex]';
  const CLS = /(^|[-_ ])(btn|button|cta|action|tab|chip|toggle|switch|pill|fab)([-_ ]|$)/i;
  const cand = new Set(document.querySelectorAll(SEL));
  for (const e of document.querySelectorAll('div,span,li,section,a,p')) {
    const c = (e.className || '').toString();
    if (CLS.test(c) || getComputedStyle(e).cursor === 'pointer') cand.add(e);
  }
  const controles = [...cand].filter(visible).map((e) => ({
    role: e.getAttribute('role') || e.tagName.toLowerCase(),
    nom: norm(e.getAttribute('aria-label') || e.textContent || e.getAttribute('placeholder') || e.value || ''),
  })).filter((c) => c.nom);

  const medias = [...document.querySelectorAll('img,svg,video,canvas')].filter(visible).map((e) => ({
    type: e.tagName.toLowerCase(),
    nom: norm(e.getAttribute('alt') || e.getAttribute('aria-label')
        || (e.getAttribute('src') || '').split('/').pop() || ''),
  }));

  return { titre: document.title || '', textes, controles, medias };
};

async function inventaire(cible, { viewport, attente }) {
  const nav = await chromium.launch({ channel: 'chrome' });
  const page = await nav.newPage({ viewport });
  const url = /^https?:|^file:/.test(cible) ? cible : 'file://' + cible;
  await page.goto(url, { waitUntil: 'networkidle' }).catch(() => page.goto(url));
  await page.waitForTimeout(attente);
  const inv = await page.evaluate(EXTRACTION);
  await nav.close();
  return { source: cible, ...inv };
}

const cle = (s) => s.toLowerCase().replace(/[\s ]+/g, ' ').replace(/[·•–—-]/g, '-').trim();

function comparer(ref, reel) {
  const sac = (liste, f) => {
    const m = new Map();
    for (const x of liste) { const k = cle(f(x)); if (k) m.set(k, (m.get(k) || 0) + 1); }
    return m;
  };
  const diff = (a, b, f) => {
    const A = sac(a, f), B = sac(b, f);
    const manque = [], surplus = [];
    for (const [k, n] of A) { const d = n - (B.get(k) || 0); if (d > 0) manque.push({ quoi: k, fois: d }); }
    for (const [k, n] of B) { const d = n - (A.get(k) || 0); if (d > 0) surplus.push({ quoi: k, fois: d }); }
    return { manque, surplus };
  };
  const t = diff(ref.textes, reel.textes, (x) => x);
  // le libelle seul : une maquette dessine un bloc la ou l'app produit un vrai bouton
  const c = diff(ref.controles, reel.controles, (x) => x.nom);
  const m = diff(ref.medias, reel.medias, (x) => x.nom);
  const total = t.manque.length + c.manque.length + m.manque.length;
  return { textes: t, controles: c, medias: m, verdict: total === 0 ? 'CONFORME' : 'INCOMPLET', manquants: total };
}

const [mode, a, b] = process.argv.slice(2);
const opt = {
  viewport: { width: Number(process.env.LARGEUR || 1280), height: Number(process.env.HAUTEUR || 900) },
  attente: Number(process.env.ATTENTE || 700),
};

if (mode === 'inventaire') {
  const inv = await inventaire(a, opt);
  if (b) { await writeFile(b, JSON.stringify(inv, null, 1)); console.log(`inventaire → ${b}`); }
  else console.log(JSON.stringify(inv, null, 1));
} else if (mode === 'comparer') {
  const lire = async (x) => x.endsWith('.json')
    ? JSON.parse(await readFile(x, 'utf8'))
    : await inventaire(x, opt);
  const r = comparer(await lire(a), await lire(b));
  console.log(JSON.stringify(r, null, 1));
  process.exit(r.verdict === 'CONFORME' ? 0 : 1);
} else {
  console.log('usage: ecran.mjs inventaire <fichier|url> [sortie.json]\n       ecran.mjs comparer <maquette> <reel>');
  process.exit(2);
}
