import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { test } from 'node:test';

import { ROOT, loadResume, render } from '../build.mjs';
import { currentJob, escapeHtml, frenchSpaces, isInternship } from '../src/format.mjs';
import { toJsonLd } from '../src/jsonld.mjs';
import { STORAGE_KEY } from '../src/render-html.mjs';
import { THEMES } from '../src/themes.mjs';
import { validate } from '../src/validate.mjs';

const resume = await loadResume();
const files = render(resume);
const html = files['index.html'];
const markdown = files['cv.md'];
// Ce qu'un visiteur lit : le corps de la page, sans les scripts.
const body = html.slice(html.indexOf('<body>')).replace(/<script[\s\S]*?<\/script>/g, '');
// Le texte seul : sans balises pour la page, sans la syntaxe des liens pour le Markdown.
const pageText = body.replace(/<[^>]*>/g, '');
const markdownText = markdown.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

// Tout texte du CV destiné à être lu, avec son chemin pour un message d'erreur utile.
function readableStrings(node, path = '') {
  if (typeof node === 'string') return node.trim() ? [[path, node]] : [];
  if (Array.isArray(node)) return node.flatMap((item, index) => readableStrings(item, `${path}[${index}]`));
  if (!node || typeof node !== 'object') return [];
  const technical = new Set(['$schema', 'meta', 'startDate', 'endDate', 'url', 'contactUrl', 'email', 'image', 'username']);
  // Champs gardés pour la compatibilité JSON Resume, pas affichés tels quels.
  const interop = new Set(['studyType', 'area', 'city', 'postalCode', 'region', 'countryCode']);
  return Object.entries(node)
    .filter(([key]) => !technical.has(key) && !interop.has(key))
    .flatMap(([key, value]) => readableStrings(value, path ? `${path}.${key}` : key));
}

// Un texte tel que la page l'écrit : échappé, avec les espaces insécables.
const shown = (value) => escapeHtml(frenchSpaces(value));

// Les adresses que la page transforme en liens.
function links(data) {
  return [
    !data.basics.email && data.basics.contactUrl,
    ...(data.basics.profiles ?? []).map((profile) => profile.url),
    ...[...data.work, ...data.education, ...(data.projects ?? []), ...(data.organisations ?? [])].map((item) => item.url),
  ].filter(Boolean);
}

const count = (text, pattern) => text.split(pattern).length - 1;

test('le contenu réel est valide', () => {
  assert.deepEqual(validate(resume), []);
});

test('la page affiche tout le contenu du CV', () => {
  for (const [path, value] of readableStrings(resume)) {
    assert.ok(pageText.includes(shown(value)), `${path} absent du corps de index.html : « ${value} »`);
  }
  for (const skill of resume.skills) {
    assert.ok(body.includes(`<span class="skill__name">${shown(skill.name)}</span>`), `compétence ${skill.name}`);
  }
  for (const url of links(resume)) {
    assert.ok(body.includes(`href="${escapeHtml(url)}"`), `lien absent de index.html : ${url}`);
  }
});

test('le contact et la photo du CV sont dans la page', () => {
  const { email, image, name } = resume.basics;
  if (email) {
    assert.ok(body.includes(`href="mailto:${escapeHtml(email)}"`), 'lien mailto');
    assert.ok(pageText.includes(email), 'adresse lisible');
    assert.ok(markdown.includes(email), 'adresse dans cv.md');
  }
  const photos = count(body, '<img class="identity__photo"');
  assert.equal(photos, image ? 1 : 0);
  if (image) {
    assert.ok(body.includes(`<img class="identity__photo" src="${image}" alt="Portrait de ${shown(name)}"`));
    assert.ok(existsSync(join(ROOT, 'static', image.replace(/^assets\//, ''))), `fichier de ${image} dans static/`);
  }
  const without = render({ ...resume, basics: { ...resume.basics, image: undefined } })['index.html'];
  assert.equal(count(without, '<img'), 0, 'pas de photo, pas de balise');
});

test('la version Markdown contient tout le contenu du CV', () => {
  for (const [path, value] of readableStrings(resume)) {
    assert.ok(markdownText.includes(value), `${path} absent de cv.md : « ${value} »`);
  }
  for (const url of links(resume)) {
    assert.ok(markdown.includes(url), `lien absent de cv.md : ${url}`);
  }
});

test('la version Markdown est bien structurée', () => {
  assert.doesNotMatch(markdown, /,,|\[object |undefined|\n{3,}/);
  const rows = markdown.split('\n');
  const between = (from, to) => rows.slice(rows.indexOf(from) + 1, to ? rows.indexOf(to) : undefined);
  const headings = (list, prefix) => list.filter((row) => row.startsWith(prefix)).length;
  const internships = resume.work.filter(isInternship);

  assert.equal(headings(rows, '#### '), internships.length, 'un titre par stage');
  assert.equal(
    headings(between('## Expériences', '## Formations'), '### '),
    resume.work.length - internships.length + (internships.length ? 1 : 0),
    'un titre par poste, plus celui du bloc Stages',
  );
  assert.equal(headings(between('## Formations', '## Projets personnels'), '### '), resume.education.length);
  assert.equal(headings(between('## Projets personnels'), '### '), resume.projects.length);
  for (const [index, row] of rows.entries()) {
    if (!/^#{1,6} /.test(row)) continue;
    assert.equal(rows[index - 1] ?? '', '', `ligne vide attendue avant « ${row} »`);
    assert.equal(rows[index + 1], '', `ligne vide attendue après « ${row} »`);
  }
});

test('aucune ligne de la page ne peut commencer par une ponctuation', () => {
  assert.doesNotMatch(body, / [:;?!»]|« /, 'espace ordinaire devant une ponctuation double');
  assert.ok(body.includes(`${String.fromCharCode(0xa0)}:`), 'espace insécable devant les deux-points');
});

test('une organisation citée dans un poste est liée, une fois par poste', () => {
  const organisations = [
    { name: 'Tessi', url: 'https://tessi.exemple/' },
    { name: 'Crédit Agricole', url: 'https://ca.exemple/' },
  ];
  const job = {
    ...resume.work[0],
    summary: 'Missions pour Tessi et le Crédit Agricole.',
    highlights: ['Tessi : refonte.', 'Tessiture et vitesse : sans rapport.'],
  };
  const out = render({ ...resume, organisations, work: [job, { ...job, name: 'Autre', highlights: [] }] });
  const first = out['index.html'].slice(out['index.html'].indexOf('<li class="entry"'), out['index.html'].indexOf('Autre'));

  assert.equal(count(first, 'href="https://tessi.exemple/"'), 1, 'une seule fois dans le poste');
  assert.equal(count(out['index.html'], 'href="https://tessi.exemple/"'), 2, 'de nouveau dans le poste suivant');
  assert.ok(first.includes('<a class="mention" href="https://ca.exemple/" rel="noopener">Crédit Agricole</a>.'));
  assert.ok(first.includes('<li>Tessi'), 'la seconde mention reste du texte');
  assert.ok(first.includes('Tessiture et vitesse'), 'jamais au milieu d’un mot');
  assert.ok(out['cv.md'].includes('Missions pour [Tessi](https://tessi.exemple/) et le [Crédit Agricole](https://ca.exemple/).'));
});

test('les organisations du CV sont toutes liées dans la page', () => {
  for (const organisation of resume.organisations ?? []) {
    const anchor = `<a class="mention" href="${escapeHtml(organisation.url)}" rel="noopener">${shown(organisation.name)}</a>`;
    assert.ok(body.includes(anchor), `lien absent pour ${organisation.name}`);
  }
});

test('les catégories de compétences compactes sont marquées, les autres non', () => {
  const compact = new Set(resume.meta.compactSkillCategories ?? []);
  const groups = [...body.matchAll(/<div class="skill-group" data-group="[^"]*"( data-display="compact")?>\s*<h3 class="skill-group__title">([^<]*)<\/h3>/g)];
  assert.equal(groups.length, new Set(resume.skills.map((skill) => skill.category)).size);
  for (const [, marked, title] of groups) {
    const name = resume.skills.find((skill) => shown(skill.category) === title).category;
    assert.equal(Boolean(marked), compact.has(name), `catégorie ${name}`);
  }
});

test('llms.txt suit le format llmstxt.org', () => {
  const rows = files['llms.txt'].split('\n');
  assert.match(rows[0], /^# \S/);
  assert.match(rows[2], /^> \S.*\.$/, 'résumé en citation, terminé par un point');
  const sections = rows.slice(rows.findIndex((row) => row.startsWith('## ')));
  assert.ok(sections.length > 1, 'au moins une section de liens');
  for (const row of sections.filter(Boolean)) {
    assert.match(row, /^(## \S|- \[[^\]]+\]\([^)]+\))/, `une section ne contient que des liens : « ${row} »`);
  }
});

test('chaque poste et chaque stage a sa ligne, dans le bon bloc', () => {
  const stages = html.slice(html.indexOf('id="stages"'), html.indexOf('id="formations"'));
  assert.equal(count(stages, 'data-kind="stage"'), resume.work.filter(isInternship).length);
  assert.equal(count(html, '<li class="entry"'), resume.work.length + resume.education.length);
  const ongoing = [...resume.work, ...resume.education].filter((item) => item.startDate && !item.endDate);
  assert.equal(count(html, 'data-current'), ongoing.length, 'une marque par ligne en cours');
});

test('le rendu échappe le HTML venu du contenu', () => {
  const hostile = structuredClone(resume);
  hostile.basics.name = '<script>alert(1)</script>';
  hostile.work[0].summary = '"><img src=x onerror=alert(1)>';
  const page = render(hostile)['index.html'];
  assert.ok(!page.includes('<script>alert(1)</script>'));
  assert.ok(!page.includes('<img src=x'));
  assert.ok(!/<\/script>\s*alert/.test(page));
});

test('les données structurées sont du JSON valide et fidèles au CV', () => {
  const block = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
  assert.ok(block, 'bloc JSON-LD présent');
  const data = JSON.parse(block[1]);
  assert.deepEqual(data, toJsonLd(resume));
  assert.equal(data['@type'], 'Person');
  assert.equal(data.name, resume.basics.name);
  assert.equal(data.worksFor?.name, currentJob(resume)?.name);
  assert.equal(data.email, resume.basics.email || undefined, 'email publié seulement s’il est renseigné');
});

test('le JSON Resume publié ne contient aucun champ vide', () => {
  const published = JSON.parse(files['resume.json']);
  assert.doesNotMatch(files['resume.json'], /: ""/);
  assert.equal(published.basics.name, resume.basics.name);
  assert.equal(published.work.length, resume.work.length);
});

test('chaque thème a sa feuille, son bouton et sa place dans le script de démarrage', () => {
  assert.ok(THEMES.length >= 2);
  for (const theme of THEMES) {
    assert.ok(existsSync(join(ROOT, 'static', 'themes', `${theme.id}.css`)), `static/themes/${theme.id}.css manquant`);
    assert.ok(html.includes(`data-set-theme="${theme.id}"`), `bouton ${theme.id} manquant`);
  }
  assert.ok(html.includes(JSON.stringify(THEMES.map((theme) => theme.id))), 'liste des thèmes du script de démarrage');
  assert.ok(html.includes(`<html lang="fr" data-theme="${THEMES[0].id}">`));
});

test('sans JavaScript, la page charge le thème par défaut', () => {
  assert.ok(
    html.includes(`<noscript><link rel="stylesheet" href="assets/themes/${THEMES[0].id}.css" id="theme-css"></noscript>`),
  );
  // Avec JavaScript, la feuille du thème est écrite par le script de démarrage : une seule balise hors <noscript>.
  assert.equal(count(html.replace(/<noscript>[\s\S]*?<\/noscript>/g, ''), 'id="theme-css"'), 1);
});

test('la page et app.js utilisent la même clé de stockage', async () => {
  const app = await readFile(join(ROOT, 'static', 'app.js'), 'utf8');
  assert.ok(app.includes(`'${STORAGE_KEY}'`));
  assert.ok(html.includes(`"${STORAGE_KEY}"`));
});

test('aucun texte n’est caché aux humains dans la page', () => {
  // Seuls le libellé du bouton de thème et les éléments en attente de JavaScript sont masqués.
  const hidden = html.match(/<[^>]+(?:\shidden|class="[^"]*visually-hidden[^"]*")[^>]*>/g) ?? [];
  assert.equal(hidden.length, 3, hidden.join('\n'));
  assert.ok(!/display\s*:\s*none|font-size\s*:\s*0|color\s*:\s*transparent/.test(html));
});

test('aucun caractère invisible ne traîne dans les sources', async () => {
  // Espace insécable, marque d'ordre d'octets, espaces sans chasse : à écrire par leur code, jamais tels quels.
  const invisible = new Set([0xa0, 0x202f, 0xfeff, 0x200b, 0x200c, 0x200d, 0x2060]);
  const files = ['build.mjs'];
  for (const folder of ['src', 'test', 'tools', 'static']) {
    for (const item of await readdir(join(ROOT, folder), { recursive: true, withFileTypes: true })) {
      // Les fichiers texte seulement : une image est faite d'octets quelconques.
      if (item.isFile() && /\.(?:mjs|js|css|json|md|html)$/.test(item.name)) {
        files.push(relative(ROOT, join(item.parentPath, item.name)));
      }
    }
  }
  for (const file of files) {
    const rows = (await readFile(join(ROOT, file), 'utf8')).split('\n');
    for (const [index, row] of rows.entries()) {
      const found = [...row].filter((char) => {
        const code = char.codePointAt(0);
        return invisible.has(code) || (code >= 0x300 && code <= 0x36f);
      });
      assert.equal(found.length, 0, `${file}:${index + 1} contient un caractère invisible`);
    }
  }
});

test('le rendu est déterministe', () => {
  assert.deepEqual(render(resume), files);
});

test('validate signale un contenu incomplet', () => {
  const broken = structuredClone(resume);
  broken.work[0].contract = 'Freelance';
  broken.skills[0].level = 'Ninja';
  broken.work[1].startDate = '2023-01';
  delete broken.basics.name;
  const errors = validate(broken);
  assert.equal(errors.length, 4, errors.join('\n'));
});

test('validate refuse une section absente ou vide plutôt que de laisser le rendu planter', () => {
  for (const key of ['work', 'education', 'skills', 'languages']) {
    for (const value of [undefined, [], 'texte']) {
      const errors = validate({ ...resume, [key]: value });
      assert.ok(errors.some((error) => error.startsWith(`${key} :`)), `${key} = ${JSON.stringify(value)}`);
    }
  }
  for (const status of [undefined, [], ['']]) {
    const errors = validate({ ...resume, basics: { ...resume.basics, status } });
    assert.ok(errors.some((error) => error.startsWith('basics.status')), `status = ${JSON.stringify(status)}`);
  }
  const errors = validate({ ...resume, work: [{ ...resume.work[0], highlights: 'une phrase' }] });
  assert.ok(errors.some((error) => error.includes('highlights : liste attendue')));
});

test('validate refuse les adresses qui ne mènent nulle part', () => {
  const cases = [
    [{ basics: { ...resume.basics, contactUrl: 'www.exemple.fr/contact' } }, 'basics.contactUrl'],
    [{ basics: { ...resume.basics, contactUrl: 'javascript:alert(1)' } }, 'basics.contactUrl'],
    [{ basics: { ...resume.basics, email: ' ' } }, 'basics.email'],
    [{ basics: { ...resume.basics, email: 'pas-un-email' } }, 'basics.email'],
    [{ basics: { ...resume.basics, email: '', contactUrl: undefined } }, 'basics : il faut'],
    [{ basics: { ...resume.basics, image: 'https://exemple.fr/photo.jpg' } }, 'basics.image'],
    [{ basics: { ...resume.basics, image: 'assets/../secret.txt' } }, 'basics.image'],
    [{ basics: { ...resume.basics, profiles: [{ network: 'GitHub' }] } }, 'basics.profiles[0]'],
    [{ projects: [{ ...resume.projects[0], url: 'github.com/x/y' }] }, 'projects[0].url'],
  ];
  for (const [change, where] of cases) {
    const errors = validate({ ...resume, ...change });
    assert.ok(errors.some((error) => error.startsWith(where)), `${where} accepté : ${JSON.stringify(change)}`);
  }
  assert.deepEqual(validate({ ...resume, basics: { ...resume.basics, email: 'prenom.nom@exemple.fr' } }), []);
});

test('validate refuse une organisation sans adresse valide ou jamais citée', () => {
  const withOrganisations = (organisations) => validate({ ...resume, organisations });
  assert.deepEqual(withOrganisations([{ name: 'Betclic', url: 'https://exemple.fr/' }]), []);
  assert.equal(withOrganisations([{ name: 'Betclic', url: 'exemple.fr' }]).length, 1);
  assert.equal(withOrganisations([{ url: 'https://exemple.fr/' }]).length, 1);
  const unknown = withOrganisations([{ name: 'Entreprise Fantôme', url: 'https://exemple.fr/' }]);
  assert.equal(unknown.length, 1);
  assert.match(unknown[0], /Entreprise Fantôme.*citée dans aucun poste/);
});

test('validate refuse une catégorie compacte inconnue', () => {
  const errors = validate({ ...resume, meta: { ...resume.meta, compactSkillCategories: ['Langage'] } });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /compactSkillCategories.*Langage/);
});

test('validate compare les dates sur leur précision commune', () => {
  const withProject = (dates) => validate({ ...resume, projects: [{ ...resume.projects[0], ...dates }] });
  assert.deepEqual(withProject({ startDate: '2025', endDate: '2025-06' }), []);
  assert.deepEqual(withProject({ startDate: '2025-06', endDate: '2025' }), []);
  assert.equal(withProject({ startDate: '2026', endDate: '2025-06' }).length, 1);
  assert.equal(withProject({ startDate: '2026-02-31' }).length, 1);
});
