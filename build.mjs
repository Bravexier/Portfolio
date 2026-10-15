// Construit le site statique dans dist/ à partir de content/resume.json.
// Aucune dépendance : bibliothèque standard de Node uniquement.
import { existsSync, realpathSync } from 'node:fs';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { renderHtml } from './src/render-html.mjs';
import { renderLlmsTxt, renderMarkdown } from './src/render-text.mjs';
import { validate } from './src/validate.mjs';

export const ROOT = dirname(fileURLToPath(import.meta.url));

export async function loadResume(root = ROOT) {
  // Certains éditeurs Windows ajoutent une marque d'ordre d'octets en tête de fichier.
  const raw = await readFile(join(root, 'content', 'resume.json'), 'utf8');
  const source = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  let resume;
  try {
    resume = JSON.parse(source);
  } catch (error) {
    throw new Error(`content/resume.json illisible : ${error.message}`);
  }
  const errors = validate(resume);
  const image = resume.basics?.image;
  if (typeof image === 'string' && !existsSync(join(root, 'static', image.replace(/^assets\//, '')))) {
    errors.push(`basics.image : fichier « static/${image.replace(/^assets\//, '')} » introuvable`);
  }
  if (errors.length) {
    throw new Error(`content/resume.json invalide :\n- ${errors.join('\n- ')}`);
  }
  return resume;
}

// Les fichiers produits, sans rien écrire : pratique pour les tests.
export function render(resume) {
  // Les champs laissés vides (email, url) ne sont pas publiés : JSON Resume les veut valides ou absents.
  const published = JSON.stringify(resume, (key, value) => (value === '' ? undefined : value), 2);
  return {
    'index.html': renderHtml(resume),
    'cv.md': renderMarkdown(resume),
    'llms.txt': renderLlmsTxt(resume),
    'resume.json': `${published}\n`,
  };
}

// Retire de la cible les fichiers qui n'existent plus dans la source (thème supprimé ou renommé).
async function pruneStale(source, target) {
  for (const item of await readdir(target, { recursive: true, withFileTypes: true })) {
    if (!item.isFile()) continue;
    const file = join(item.parentPath, item.name);
    if (!existsSync(join(source, relative(target, file)))) await rm(file);
  }
}

export async function build({ root = ROOT, outDir = join(root, 'dist') } = {}) {
  const files = render(await loadResume(root));
  const assets = join(outDir, 'assets');
  await mkdir(assets, { recursive: true });
  await cp(join(root, 'static'), assets, { recursive: true });
  await pruneStale(join(root, 'static'), assets);
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(outDir, name), content);
  }
  return { outDir, files: Object.keys(files) };
}

// Vrai aussi quand le projet est atteint par un lien ou une jonction de dossiers.
const isEntryPoint = process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;

if (isEntryPoint) {
  try {
    const { outDir, files } = await build();
    console.log(`Site construit dans ${outDir} (${files.join(', ')})`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
