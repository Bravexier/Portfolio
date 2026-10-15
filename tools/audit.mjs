// Audit dans un vrai navigateur, thème par thème et largeur par largeur :
//   - tout le texte du CV est réellement lisible : ni masqué, ni minuscule, ni rogné,
//     ni recouvert, ni hors de la page, avec un contraste suffisant sur fond uni ;
//   - la page ne déborde pas en largeur ;
//   - le sélecteur est atteignable, s'ouvre et se ferme comme il l'annonce, change de thème
//     avec une seule feuille de style à la fois, et s'en souvient ;
//   - la page ne s'affiche jamais avant la feuille de son thème, même sur réseau lent.
//   npm run audit
//   node tools/audit.mjs --theme jdr --width 360
// Limites : le survol réel de la souris et le contraste sur une image ou un dégradé
// (signalé par ⚠, à vérifier à l'œil) ne se mesurent pas d'ici.
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { STORAGE_KEY } from '../src/render-html.mjs';
import { THEMES } from '../src/themes.mjs';
import { MIN_WINDOW, openBrowser } from './browser.mjs';
import { createStaticServer, listen } from './serve.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MIN_FONT_SIZE = 11;
const SLOW_SHEET = 300;
const TIMEOUT = 120_000;

const { values } = parseArgs({
  options: {
    theme: { type: 'string', multiple: true },
    width: { type: 'string', multiple: true },
  },
});
const themes = values.theme ?? THEMES.map((theme) => theme.id);
const widths = (values.width ?? ['360', '390', '768', '1280', '1920']).map(Number);
// Le sélecteur et le premier affichage sont vérifiés une fois par thème, à la première largeur.
const jobs = themes.flatMap((theme) => widths.map((width, index) => ({ theme, width, full: index === 0 })));

// ---- Code exécuté dans la page d'audit (sérialisé tel quel) ----

function inspect(doc, win, minFontSize) {
  const problems = [];
  const root = doc.documentElement;
  const viewport = root.clientWidth;
  const describe = (element) =>
    [element.tagName.toLowerCase(), element.id && `#${element.id}`, ...[...element.classList].map((name) => `.${name}`)]
      .filter(Boolean)
      .join('');
  const report = (type, element, text, detail, warning = false) =>
    problems.push({ type, where: describe(element), text: text.trim().slice(0, 50), detail, warning });

  // Couleur calculée -> [r, v, b, alpha], quelle que soit sa syntaxe (rgb, oklch, color-mix…).
  const canvas = doc.createElement('canvas');
  canvas.width = canvas.height = 1;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const rgba = (color) => {
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = '#000';
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
    const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
    return [red, green, blue, alpha / 255];
  };
  const luminance = (color) => {
    const [red, green, blue] = color.slice(0, 3).map((value) => {
      const channel = value / 255;
      return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const contrast = (first, second) => {
    const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
    return (light + 0.05) / (dark + 0.05);
  };
  // Fond sous un élément. `exact` est faux dès qu'une image, un dégradé, un filtre ou une
  // couleur translucide s'interpose : le contraste réel ne se calcule alors plus d'ici.
  const backdrop = (element) => {
    let exact = true;
    for (let node = element; node; node = node.parentElement) {
      const style = win.getComputedStyle(node);
      if (style.backgroundImage !== 'none' || style.filter !== 'none' || style.mixBlendMode !== 'normal') exact = false;
      const color = rgba(style.backgroundColor);
      if (color[3] > 0.99) return { color, exact };
      if (color[3] > 0.01) exact = false;
    }
    return { color: [255, 255, 255, 1], exact };
  };

  if (root.scrollWidth > viewport + 1) {
    problems.push({ type: 'débordement', where: 'page', text: '', detail: `${root.scrollWidth}px pour ${viewport}px` });
  }

  const walker = doc.createTreeWalker(doc.body, win.NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeValue;
    const element = node.parentElement;
    if (!text.trim() || element.closest('script, style, noscript, [data-theme-switcher], .skip-link, .visually-hidden')) continue;

    const range = doc.createRange();
    range.selectNodeContents(node);
    const visibleRects = () => [...range.getClientRects()].filter((rect) => rect.width >= 1 && rect.height >= 1);
    let rects = visibleRects();
    const style = win.getComputedStyle(element);
    const shown = element.checkVisibility({ visibilityProperty: true, contentVisibilityAuto: true });
    if (!rects.length || !shown) {
      report('masqué', element, text);
      continue;
    }

    const fontSize = parseFloat(style.fontSize);
    const rendered = Math.max(...rects.map((rect) => rect.height));
    if (fontSize < minFontSize) report('trop petit', element, text, `${fontSize}px`);
    else if (rendered < minFontSize - 2) report('trop petit', element, text, `${rendered.toFixed(1)}px de haut une fois rendu`);

    let opacity = 1;
    for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
      opacity *= parseFloat(win.getComputedStyle(ancestor).opacity);
    }
    const ink = rgba(style.webkitTextFillColor);
    opacity *= ink[3];
    if (opacity < 0.4) {
      report('presque invisible', element, text, `opacité ${opacity.toFixed(2)}`);
    } else {
      const { color: paper, exact } = backdrop(element);
      const blended = ink.slice(0, 3).map((value, index) => value * opacity + paper[index] * (1 - opacity));
      const ratio = contrast(blended, paper);
      const large = fontSize >= 24 || (fontSize >= 18.66 && Number(style.fontWeight) >= 700);
      const required = large ? 3 : 4.5;
      if (ratio < 1.5 && exact) report('illisible', element, text, `contraste ${ratio.toFixed(2)}:1`);
      else if (ratio < required) {
        report('contraste', element, text, `${ratio.toFixed(2)}:1 pour ${required}:1 requis${exact ? '' : ', fond approché'}`, !exact);
      }
    }

    const left = Math.min(...rects.map((rect) => rect.left));
    const right = Math.max(...rects.map((rect) => rect.right));
    if (left < -1 || right > viewport + 1) report('hors écran', element, text, `de ${Math.round(left)} à ${Math.round(right)}px`);
    const top = Math.min(...rects.map((rect) => rect.top)) + win.scrollY;
    const bottom = Math.max(...rects.map((rect) => rect.bottom)) + win.scrollY;
    if (bottom < 0 || top > root.scrollHeight) report('hors page', element, text, `à ${Math.round(top)}px`);

    for (let ancestor = element; ancestor && ancestor !== doc.body; ancestor = ancestor.parentElement) {
      const ancestorStyle = win.getComputedStyle(ancestor);
      const clips = (value) => value === 'hidden' || value === 'clip';
      const box = ancestor.getBoundingClientRect();
      if (clips(ancestorStyle.overflowX) && (left < box.left - 1 || right > box.right + 1)) {
        report('rogné', element, text, `en largeur par ${describe(ancestor)}`);
      }
      // Le milieu de la ligne, pas ses bords : une ligne dépasse normalement d'un pixel ou deux.
      const cut = rects.some((rect) => {
        const middle = (rect.top + rect.bottom) / 2;
        return middle < box.top || middle > box.bottom;
      });
      if (clips(ancestorStyle.overflowY) && cut) report('rogné', element, text, `en hauteur par ${describe(ancestor)}`);
    }

    // Rien ne doit être posé par-dessus le texte.
    if (style.pointerEvents !== 'none') {
      element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
      rects = visibleRects();
      const probe = rects[0];
      const hit = probe && doc.elementFromPoint(probe.left + probe.width / 2, probe.top + probe.height / 2);
      if (hit && !element.contains(hit) && !hit.contains(element)) report('recouvert', element, text, `par ${describe(hit)}`);
    }
  }
  // Les images du CV (la photo) : chargées, visibles, ni déformées ni recouvertes.
  for (const image of doc.querySelectorAll('main img')) {
    const name = image.getAttribute('alt') || image.getAttribute('src');
    if (!image.complete || !image.naturalWidth) {
      report('image absente', image, name);
      continue;
    }
    image.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    const box = image.getBoundingClientRect();
    const size = `${Math.round(box.width)}x${Math.round(box.height)}px`;
    const shown = image.checkVisibility({ visibilityProperty: true, opacityProperty: true });
    if (!shown || box.width < 48 || box.height < 48) report('image masquée', image, name, size);
    else if (box.left < -1 || box.right > viewport + 1) report('hors écran', image, name, `de ${Math.round(box.left)} à ${Math.round(box.right)}px`);
    else {
      const natural = image.naturalWidth / image.naturalHeight;
      const stretched = win.getComputedStyle(image).objectFit === 'fill' && Math.abs(box.width / box.height / natural - 1) > 0.03;
      if (stretched) report('image déformée', image, name, size);
      const hit = doc.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      if (hit && hit !== image && !hit.contains(image)) report('recouvert', image, name, `par ${describe(hit)}`);
    }
  }
  win.scrollTo(0, 0);
  return problems;
}

// Une colonne latérale gardée en vue pendant le défilement (position: sticky) ne doit jamais
// rester calée avec son pied sous l'écran, ni son début au-dessus alors qu'elle tiendrait.
async function checkSticky(frame, win, heights) {
  const failures = [];
  const doc = win.document;
  const side = doc.querySelector('.sheet__side');
  if (!side?.firstElementChild || win.getComputedStyle(side).position !== 'sticky') return failures;

  const settled = () => new Promise((done) => win.requestAnimationFrame(() => win.requestAnimationFrame(done)));
  const initial = frame.style.height;
  for (const height of heights) {
    frame.style.height = `${height}px`;
    await settled();
    const end = doc.documentElement.scrollHeight - height;
    for (let y = 0; y + 40 <= end; y += 120) {
      win.scrollTo(0, y);
      const before = side.getBoundingClientRect().top;
      win.scrollTo(0, y + 40);
      // Calée : elle n'a pas bougé alors que la page a défilé.
      if (Math.abs(side.getBoundingClientRect().top - before) > 0.5) continue;
      const top = side.firstElementChild.getBoundingClientRect().top;
      const bottom = side.lastElementChild.getBoundingClientRect().bottom;
      const where = `fenêtre de ${height}px, défilement ${y + 40}px`;
      if (bottom > height + 1) failures.push(`pied de la colonne ${Math.round(bottom - height)}px sous l'écran (${where})`);
      else if (top < -1 && bottom - top <= height) failures.push(`début de la colonne ${Math.round(-top)}px au-dessus de l'écran alors qu'elle y tient (${where})`);
      else if (top < -1 && bottom < height - 80) failures.push(`colonne calée ${Math.round(height - bottom)}px trop haut (${where})`);
      if (failures.length) break;
    }
  }
  frame.style.height = initial;
  win.scrollTo(0, 0);
  await settled();
  return failures;
}

// Le panneau doit être atteignable, et son état affiché égal à son état annoncé.
function exercisePanel(doc, win) {
  const failures = [];
  const handle = doc.querySelector('[data-theme-switcher] [aria-controls]');
  const panel = doc.getElementById(handle.getAttribute('aria-controls'));
  const options = [...panel.querySelectorAll('[data-set-theme]')];
  const reachable = (element) => {
    const box = element.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) return false;
    if (!element.checkVisibility({ visibilityProperty: true, opacityProperty: true })) return false;
    const hit = doc.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return Boolean(hit) && element.contains(hit);
  };
  const expect = (step, open) => {
    const shown = win.getComputedStyle(panel).visibility === 'visible';
    const announced = handle.getAttribute('aria-expanded') === 'true';
    if (shown === open && announced === open) return;
    failures.push(`${step} : panneau ${shown ? 'visible' : 'masqué'}, annoncé ${announced ? 'ouvert' : 'fermé'}, attendu ${open ? 'ouvert' : 'fermé'}`);
  };

  if (!reachable(handle)) failures.push('bouton du sélecteur inatteignable (masqué, recouvert ou hors écran)');
  handle.focus();
  expect('focus sur le bouton', false);
  handle.click();
  expect('clic sur le bouton', true);
  for (const option of options) {
    if (!reachable(option)) failures.push(`option ${option.dataset.setTheme} inatteignable (masquée, recouverte ou hors écran)`);
  }
  options[0].focus();
  expect('focus sur une option', true);
  handle.focus();
  handle.click();
  expect('second clic sur le bouton', false);
  handle.click();
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect('touche Échap', false);
  handle.click();
  doc.querySelector('.colophon a').focus();
  expect('focus hors du sélecteur', false);
  doc.activeElement.blur();
  return failures;
}

async function exerciseSwitcher(doc, win, storageKey) {
  const steps = [];
  const options = [...doc.querySelectorAll('[data-set-theme]')];
  const waitFor = (id) =>
    new Promise((done) => {
      if (doc.documentElement.dataset.theme === id) return done();
      const observer = new win.MutationObserver(() => {
        if (doc.documentElement.dataset.theme !== id) return;
        observer.disconnect();
        done();
      });
      observer.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      win.setTimeout(() => {
        observer.disconnect();
        done();
      }, 3000);
    });
  const snapshot = (label, expected) => ({
    label,
    expected,
    applied: doc.documentElement.dataset.theme,
    sheets: [...doc.querySelectorAll('link[rel="stylesheet"]')]
      .map((link) => link.getAttribute('href'))
      .filter((href) => href.includes('/themes/')),
    pressed: options.filter((option) => option.getAttribute('aria-pressed') === 'true').map((option) => option.dataset.setTheme),
    stored: win.localStorage.getItem(storageKey),
    address: new win.URLSearchParams(win.location.search).get('theme'),
  });

  // Chaque thème tour à tour, en finissant par celui de départ.
  const start = options.findIndex((option) => option.dataset.setTheme === doc.documentElement.dataset.theme);
  const tour = [...options.slice(start + 1), ...options.slice(0, start + 1)];
  for (const option of tour) {
    option.click();
    await waitFor(option.dataset.setTheme);
    steps.push(snapshot(`clic ${option.dataset.setTheme}`, option.dataset.setTheme));
  }
  // Deux clics coup sur coup : seul le dernier doit rester.
  const others = options.filter((option) => option !== tour.at(-1));
  const second = others[1] ?? tour.at(-1);
  others[0].click();
  second.click();
  await waitFor(second.dataset.setTheme);
  steps.push(snapshot('deux clics rapides', second.dataset.setTheme));
  return steps;
}

async function runAudit({ jobs, minFontSize, storageKey }) {
  const frame = document.getElementById('page');
  const load = (address) =>
    new Promise((done) => {
      frame.addEventListener('load', done, { once: true });
      frame.src = address;
    });
  const pause = (duration) => new Promise((done) => setTimeout(done, duration));
  const slow = (state) => fetch('/__slow', { method: 'POST', body: state ? 'on' : 'off' });
  const settle = async () => {
    const win = frame.contentWindow;
    await win.document.fonts.ready;
    // État final des animations, y compris celles pilotées par le défilement : on juge la page au repos.
    const still = win.document.createElement('style');
    still.textContent =
      '*,*::before,*::after{animation-delay:0s!important;animation-duration:0s!important;animation-timeline:auto!important;transition:none!important;scroll-behavior:auto!important}';
    win.document.head.append(still);
    await new Promise((done) => win.requestAnimationFrame(() => win.requestAnimationFrame(done)));
    return win;
  };

  // Avec une feuille de thème lente, rien ne doit s'afficher avant elle, et elle doit être la seule.
  const firstPaint = async (theme) => {
    const failures = [];
    await slow(true);
    try {
      await load(`/index.html?theme=${theme}`);
      const { performance } = frame.contentWindow;
      let paint;
      for (let attempt = 0; attempt < 40 && !paint; attempt += 1) {
        [paint] = performance.getEntriesByName('first-paint');
        if (!paint) await pause(50);
      }
      const sheets = performance.getEntriesByType('resource').filter((entry) => entry.name.includes('/assets/themes/'));
      const names = sheets.map((entry) => entry.name.split('/').pop());
      if (names.join() !== `${theme}.css`) failures.push(`feuilles de thème téléchargées : ${names.join(', ') || 'aucune'}`);
      if (!paint) failures.push('premier affichage non mesuré');
      else if (sheets[0] && paint.startTime < sheets[0].responseEnd - 1) {
        failures.push(`premier affichage à ${Math.round(paint.startTime)} ms, avant la feuille du thème (${Math.round(sheets[0].responseEnd)} ms)`);
      }
    } finally {
      await slow(false);
    }
    return failures;
  };

  const results = [];
  for (const job of jobs) {
    const result = { ...job, problems: [], steps: [], panel: [], firstPaint: [], sticky: [] };
    results.push(result);
    try {
      frame.style.cssText = `width:${job.width}px;height:900px;border:0`;
      if (job.full) result.firstPaint = await firstPaint(job.theme);
      await load(`/index.html?theme=${job.theme}`);
      let win = await settle();
      result.applied = win.document.documentElement.dataset.theme;
      result.sheet = win.document.getElementById('theme-css')?.getAttribute('href');
      result.problems = inspect(win.document, win, minFontSize);
      // Deux hauteurs de fenêtre : une où la colonne dépasse, une où elle tient.
      result.sticky = await checkSticky(frame, win, [720, 1300]);

      if (job.full) {
        result.panel = exercisePanel(win.document, win);
        result.steps = await exerciseSwitcher(win.document, win, storageKey);
        result.lastChoice = result.steps.at(-1).expected;
        // Le dernier choix doit survivre à un rechargement sans paramètre.
        await load('/index.html');
        win = await settle();
        result.reloaded = win.document.documentElement.dataset.theme;
        result.reloadedSheet = win.document.getElementById('theme-css')?.getAttribute('href');
        win.localStorage.removeItem(storageKey);
      }
    } catch (error) {
      result.error = String(error?.stack ?? error);
    }
  }
  await fetch('/__audit', { method: 'POST', body: JSON.stringify(results) });
}

const AUDIT_PAGE = `<!doctype html>
<meta charset="utf-8">
<title>Audit</title>
<style>html,body{margin:0}</style>
<iframe id="page"></iframe>
<script>
${inspect}
${checkSticky}
${exercisePanel}
${exerciseSwitcher}
${runAudit}
runAudit(${JSON.stringify({ jobs, minFontSize: MIN_FONT_SIZE, storageKey: STORAGE_KEY })});
</script>`;

// ---- Côté Node ----

function checkSwitcher(result, failures) {
  for (const step of result.steps) {
    const ok =
      step.applied === step.expected &&
      step.sheets.length === 1 &&
      step.sheets[0].endsWith(`/${step.expected}.css`) &&
      step.pressed.join() === step.expected &&
      step.stored === step.expected &&
      step.address === (step.expected === THEMES[0].id ? null : step.expected);
    if (!ok) failures.push(`sélecteur, ${step.label} : ${JSON.stringify(step)}`);
  }
  if (result.steps.length !== THEMES.length + 1) {
    failures.push(`sélecteur : ${result.steps.length} étapes au lieu de ${THEMES.length + 1}`);
  }
  if (result.reloaded !== result.lastChoice || !result.reloadedSheet?.endsWith(`/${result.lastChoice}.css`)) {
    failures.push(`choix non retrouvé au rechargement : ${result.reloaded} au lieu de ${result.lastChoice}`);
  }
}

// Affiche le résultat d'une vérification et renvoie son nombre d'échecs.
function report(result) {
  const failures = [];
  const warnings = [];
  if (result.error) failures.push(`erreur dans la page : ${result.error}`);
  if (result.applied !== result.theme || !result.sheet?.endsWith(`/${result.theme}.css`)) {
    failures.push(`thème appliqué : ${result.applied} (${result.sheet})`);
  }
  for (const problem of result.problems) {
    const line = `${problem.type} : ${problem.where} « ${problem.text} »${problem.detail ? ` (${problem.detail})` : ''}`;
    (problem.warning ? warnings : failures).push(line);
  }
  failures.push(...result.sticky.map((failure) => `colonne en vue : ${failure}`));
  if (result.full) {
    failures.push(...result.firstPaint.map((failure) => `premier affichage : ${failure}`));
    failures.push(...result.panel.map((failure) => `sélecteur, ${failure}`));
    checkSwitcher(result, failures);
  }

  const mark = failures.length ? '✖' : warnings.length ? '⚠' : '✔';
  console.log(`${mark} ${result.theme} à ${result.width}px${result.full ? ' + sélecteur et premier affichage' : ''}`);
  for (const failure of failures) console.log(`    ${failure}`);
  for (const warning of warnings) console.log(`    à vérifier à l'œil, ${warning}`);
  return failures.length;
}

let slow = false;
let deliver;
const delivered = new Promise((done) => {
  deliver = done;
});
const server = createStaticServer(join(ROOT, 'dist'), {
  pages: { '/__audit.html': AUDIT_PAGE },
  delay: (path) => (slow && path.startsWith('/assets/themes/') ? SLOW_SHEET : 0),
  receive(path, body) {
    if (path === '/__slow') slow = body === 'on';
    if (path === '/__audit') deliver(JSON.parse(body));
  },
});
const port = await listen(server);
const browser = await openBrowser();
const session = browser.start([
  `--window-size=${Math.max(...widths, MIN_WINDOW)},900`,
  `http://127.0.0.1:${port}/__audit.html`,
]);
let timer;
const timeout = new Promise((done) => {
  timer = setTimeout(done, TIMEOUT, null);
});
let failed = 0;

try {
  const results = await Promise.race([delivered, timeout]);
  if (!results) throw new Error(`La page d'audit n'a rien renvoyé en ${TIMEOUT / 1000} s.`);
  for (const result of results) failed += report(result);
} catch (error) {
  console.error(error.message);
  failed += 1;
} finally {
  clearTimeout(timer);
  await session.stop();
  await browser.close();
  server.closeAllConnections();
  server.close();
}

if (failed) {
  console.log(`\n${failed} problème(s).`);
  process.exitCode = 1;
}
