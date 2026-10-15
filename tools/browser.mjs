// Lance Chrome ou Edge sans fenêtre, avec un profil jetable : ne touche pas au
// navigateur déjà ouvert ni à ses préférences.
import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

// Sous Windows, la fenêtre sans affichage ne descend pas sous cette largeur.
export const MIN_WINDOW = 500;

export function findBrowser() {
  const forced = process.env.CHROME_PATH;
  if (forced) {
    if (!existsSync(forced)) throw new Error(`CHROME_PATH introuvable : ${forced}`);
    return forced;
  }
  const path = CANDIDATES.find((candidate) => existsSync(candidate));
  if (!path) throw new Error('Chrome ou Edge introuvable. Indique son chemin dans la variable CHROME_PATH.');
  return path;
}

// Ouvre une session. `run(args)` lance le navigateur et attend qu'il ait fini (capture, PDF).
// `start(args)` le laisse ouvert et renvoie de quoi l'arrêter.
export async function openBrowser() {
  const path = findBrowser();
  const work = await mkdtemp(join(tmpdir(), 'cv-navigateur-'));
  const flags = (args) => [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--force-device-scale-factor=1',
    `--user-data-dir=${join(work, 'profil')}`,
    ...args,
  ];

  function run(args) {
    return new Promise((done, fail) => {
      execFile(path, flags(args), { timeout: 60_000 }, (error, stdout) => (error ? fail(error) : done(stdout)));
    });
  }

  function start(args) {
    const child = spawn(path, flags(args), { stdio: 'ignore' });
    const exited = new Promise((done) => child.once('exit', done));
    return {
      async stop() {
        child.kill();
        await exited;
      },
    };
  }

  const close = () => rm(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  return { run, start, close, work };
}
