// Captures d'écran et PDF de chaque thème, pour vérifier un habillage d'un coup d'œil.
//   npm run shots
//   node tools/shots.mjs --theme tech --view mobile --anchor experiences --height 1600
// La capture couvre la fenêtre, pas la page entière : --anchor fait défiler jusqu'à une section.
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { THEMES } from '../src/themes.mjs';
import { MIN_WINDOW, openBrowser } from './browser.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const VIEWS = {
  desktop: { width: 1280, height: 3600 },
  mobile: { width: 390, height: 6400 },
  fold: { width: 1280, height: 800 },
  pdf: { width: 1280, height: 800 },
};

const { values } = parseArgs({
  options: {
    theme: { type: 'string', multiple: true },
    view: { type: 'string', multiple: true },
    anchor: { type: 'string' },
    width: { type: 'string' },
    height: { type: 'string' },
    out: { type: 'string', default: join(ROOT, 'shots') },
  },
});

const themes = values.theme ?? THEMES.map((theme) => theme.id);
const views = values.view ?? ['desktop', 'mobile', 'pdf'];
const page = pathToFileURL(join(ROOT, 'dist', 'index.html')).href;
// Chemin absolu : le navigateur ne résout pas un chemin relatif depuis le dossier courant.
const out = resolve(values.out);
const browser = await openBrowser();

// La page est rendue dans un cadre quand la vue est plus étroite que la fenêtre minimale
// (la bande grise à droite de la capture est alors hors page) ou quand une ancre est
// demandée : la capture directe d'une page défilée laisse le haut de l'image vide.
async function target(url, width, height, framed) {
  if (width >= MIN_WINDOW && !framed) return { url, width };
  const frame = join(browser.work, `cadre-${width}.html`);
  await writeFile(
    frame,
    `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#888}iframe{display:block;border:0;width:${width}px;height:${height}px}</style><iframe src="${url}"></iframe>`,
  );
  return { url: pathToFileURL(frame).href, width: Math.max(width, MIN_WINDOW) };
}

try {
  await mkdir(out, { recursive: true });
  for (const theme of themes) {
    for (const view of views) {
      const size = VIEWS[view];
      if (!size) throw new Error(`Vue inconnue : ${view} (${Object.keys(VIEWS).join(', ')})`);
      const width = Number(values.width) || size.width;
      const height = Number(values.height) || size.height;
      const pdf = view === 'pdf';
      const name = [theme, view, !pdf && values.anchor].filter(Boolean).join('-');
      const file = join(out, `${name}.${pdf ? 'pdf' : 'png'}`);
      const anchor = !pdf && values.anchor ? `#${values.anchor}` : '';
      const { url, width: windowWidth } = await target(`${page}?theme=${theme}${anchor}`, width, height, Boolean(anchor));
      // Le navigateur sort sans erreur même s'il n'a rien écrit : on part d'une cible absente et on vérifie.
      await rm(file, { force: true });
      await browser.run([
        '--virtual-time-budget=4000',
        '--run-all-compositor-stages-before-draw',
        `--window-size=${windowWidth},${height}`,
        ...(pdf ? [`--print-to-pdf=${file}`, '--no-pdf-header-footer'] : [`--screenshot=${file}`]),
        url,
      ]);
      const written = await stat(file).catch(() => null);
      if (!written?.size) throw new Error(`Capture non écrite : ${file}`);
      console.log(file);
    }
  }
} finally {
  await browser.close();
}
