// Vérifie que chaque adresse du CV répond encore : employeurs, clients, profils, projets.
//   npm run links
// Un site qui refuse les robots (401, 403, 429) est signalé par ⚠ sans faire échouer la
// commande : il faut alors l'ouvrir à la main. Une adresse morte ou introuvable échoue.
import { loadResume } from '../build.mjs';

const TIMEOUT = 20_000;
const BLOCKED = new Set([401, 403, 429]);
// Certains sites ne répondent qu'à ce qui ressemble à un navigateur.
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'fr-FR,fr;q=0.9',
};

// Toutes les adresses du CV, avec ce qu'elles désignent.
export function collectLinks(resume) {
  const { basics } = resume;
  const named = (items, label) => (items ?? []).map((item) => [label(item), item.url]);
  return [
    ['Contact', basics.contactUrl],
    ['Site', basics.url],
    ...named(basics.profiles, (profile) => profile.network),
    ...named(resume.work, (job) => job.name),
    ...named(resume.education, (training) => training.institution),
    ...named(resume.organisations, (organisation) => organisation.name),
    ...named(resume.projects, (project) => project.name),
  ].filter(([, url]) => url);
}

async function check(url) {
  try {
    const response = await fetch(url, { headers: HEADERS, redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT) });
    await response.body?.cancel();
    return { status: response.status, final: response.url };
  } catch (error) {
    return { error: error.cause?.code ?? error.name };
  }
}

const links = collectLinks(await loadResume());
const unique = [...new Set(links.map(([, url]) => url))];
const results = new Map(await Promise.all(unique.map(async (url) => [url, await check(url)])));
let failed = 0;

for (const [label, url] of links) {
  const { status, final, error } = results.get(url);
  const moved = final && new URL(final).host !== new URL(url).host ? ` → ${final}` : '';
  if (error || status >= 400) {
    const blocked = BLOCKED.has(status);
    if (!blocked) failed += 1;
    console.log(`${blocked ? '⚠' : '✖'} ${label} : ${url} (${error ?? status}${blocked ? ', refuse les robots : à ouvrir à la main' : ''})`);
  } else {
    console.log(`✔ ${label} : ${url}${moved}`);
  }
}

if (failed) {
  console.log(`\n${failed} adresse(s) en échec.`);
  process.exitCode = 1;
}
