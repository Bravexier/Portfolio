import {
  currentJob,
  escapeHtml as attr,
  formatMonth,
  frenchSpaces,
  groupBy,
  initials,
  isInternship,
  periodHtml,
  skillRank,
  slug,
} from './format.mjs';
import { jsonForScript, toJsonLd } from './jsonld.mjs';
import { createLinker } from './mentions.mjs';
import { DEFAULT_THEME, THEMES } from './themes.mjs';

export const STORAGE_KEY = 'cv-theme';

// `e` pour le texte affiché (échappé, avec les espaces insécables), `attr` pour une adresse.
const e = (value) => attr(frenchSpaces(value));

const list = (items, render) => (items ?? []).map(render).join('\n');

function section(id, title, body) {
  return `
    <section class="section" id="${id}" data-section="${id}" aria-labelledby="${id}-titre">
      <h2 class="section__title" id="${id}-titre">${e(title)}</h2>
      <div class="section__body">
${body}
      </div>
    </section>`;
}

function tags(keywords) {
  if (!keywords?.length) return '';
  return `
            <ul class="tags" aria-label="Technologies">
${list(keywords, (keyword) => `              <li class="tag">${e(keyword)}</li>`)}
            </ul>`;
}

function bullets(className, items, render = e) {
  if (!items?.length) return '';
  return `
            <ul class="${className}">
${list(items, (item) => `              <li>${render(item)}</li>`)}
            </ul>`;
}

function maybeLink(label, url) {
  return url ? `<a href="${attr(url)}" rel="noopener">${e(label)}</a>` : e(label);
}

// Texte d'un poste : les organisations connues qui y sont citées deviennent des liens.
const withMentions = (link) => (text) =>
  link(frenchSpaces(text))
    .map((part) => (typeof part === 'string' ? attr(part) : `<a class="mention" href="${attr(part.url)}" rel="noopener">${attr(part.name)}</a>`))
    .join('');

// Une ligne de parcours : poste, stage ou formation. Même balisage pour les trois.
// `link` (facultatif) est le lieur d'organisations de cette ligne.
function entry(item, { kind, heading, index, link }) {
  const text = link ? withMentions(link) : e;
  const period = periodHtml(item);
  const meta = [
    period && `<li class="entry__period">${period}</li>`,
    item.contract && `<li class="entry__contract">${e(item.contract)}</li>`,
    item.location && `<li class="entry__place">${e(item.location)}</li>`,
  ].filter(Boolean);
  const current = item.startDate && !item.endDate ? ' data-current' : '';

  return `
          <li class="entry" data-kind="${e(kind)}"${current} style="--i:${index}">
            <article class="entry__card">
              <header class="entry__head">
                <${heading} class="entry__title">${e(item.title)}</${heading}>
                <p class="entry__org">${maybeLink(item.org, item.url)}</p>
                <ul class="entry__meta">
${meta.map((line) => `                  ${line}`).join('\n')}
                </ul>
              </header>${item.about ? `\n              <p class="entry__about">${e(item.about)}</p>` : ''}${item.summary ? `\n              <p class="entry__summary">${text(item.summary)}</p>` : ''}${bullets('entry__highlights', item.highlights, text)}${tags(item.keywords)}
            </article>
          </li>`;
}

const jobEntry = (heading, linker) => (job, index) =>
  entry(
    { ...job, title: job.position, org: job.name, about: job.description },
    { kind: slug(job.contract), heading, index, link: linker() },
  );

function identity(resume) {
  const { basics } = resume;
  const job = currentJob(resume);
  const careerStart = resume.work
    .filter((item) => !isInternship(item))
    .map((item) => item.startDate.slice(0, 4))
    .sort()[0];

  const facts = [
    job && { key: 'poste', label: 'Poste actuel', value: `${job.position}, ${job.name}` },
    basics.location?.label && { key: 'lieu', label: 'Localisation', value: basics.location.label },
    basics.mobility && { key: 'mobilite', label: 'Mobilité', value: basics.mobility },
  ].filter(Boolean);

  const contact = basics.email
    ? { href: `mailto:${basics.email}`, label: basics.email }
    : { href: basics.contactUrl, label: 'Me contacter' };

  const links = [
    `<li><a class="action" data-kind="contact" href="${attr(contact.href)}" rel="noopener">${e(contact.label)}</a></li>`,
    ...(basics.profiles ?? []).map(
      (profile) =>
        `<li><a class="action" data-kind="${e(slug(profile.network))}" href="${attr(profile.url)}" rel="noopener">${e(profile.network)}</a></li>`,
    ),
    `<li data-requires-js hidden><button type="button" class="action" data-kind="print" data-action="print">Imprimer / PDF</button></li>`,
  ];

  return `
    <header class="identity" data-initials="${e(initials(basics.name))}"${careerStart ? ` data-since="${e(careerStart)}"` : ''}>${
      basics.image
        ? `\n      <img class="identity__photo" src="${attr(basics.image)}" alt="Portrait de ${e(basics.name)}" decoding="async">`
        : ''
    }
      <div class="identity__heading">
        <h1 class="identity__name">${e(basics.name)}</h1>
        <p class="identity__title">${e(basics.label)}</p>${basics.tagline ? `\n        <p class="identity__tagline">${e(basics.tagline)}</p>` : ''}
      </div>
      <ul class="identity__status" aria-label="Situation professionnelle">
${list(basics.status, (status) => `        <li>${e(status)}</li>`)}
      </ul>
      <dl class="facts">
${list(
  facts,
  (fact) => `        <div class="fact" data-key="${fact.key}">
          <dt>${e(fact.label)}</dt>
          <dd>${e(fact.value)}</dd>
        </div>`,
)}
      </dl>
      <ul class="identity__links">
${links.map((link) => `        ${link}`).join('\n')}
      </ul>
    </header>`;
}

function profile({ basics }) {
  return section(
    'profil',
    'Profil',
    `        <p class="profile__summary">${e(basics.summary)}</p>${bullets('profile__highlights', basics.highlights)}`,
  );
}

function skills(resume) {
  const groups = groupBy(resume.skills, 'category');
  // Les catégories « compactes » (meta.compactSkillCategories) passent au second plan.
  const compact = new Set(resume.meta.compactSkillCategories ?? []);
  return section(
    'competences',
    'Compétences',
    list(
      groups,
      (group) => `        <div class="skill-group" data-group="${e(slug(group.name))}"${compact.has(group.name) ? ' data-display="compact"' : ''}>
          <h3 class="skill-group__title">${e(group.name)}</h3>
          <ul class="skills">
${list(group.entries, (skill) => {
  const rank = skillRank(skill.level);
  return `            <li class="skill" data-level="${rank}" style="--level:${rank}">
              <span class="skill__name">${e(skill.name)}</span>
              <span class="skill__level">${e(skill.level)}</span>
              <span class="skill__meter" aria-hidden="true"></span>
            </li>`;
})}
          </ul>
        </div>`,
    ),
  );
}

function languages(resume) {
  return section(
    'langues',
    'Langues',
    `        <ul class="languages">
${list(
  resume.languages,
  (language) => `          <li class="language">
            <span class="language__name">${e(language.language)}</span>
            <span class="language__fluency">${e(language.fluency)}</span>${
              language.certifications?.length
                ? `\n            <span class="language__certs">${e(language.certifications.join(', '))}</span>`
                : ''
            }
          </li>`,
)}
        </ul>`,
  );
}

function experiences(resume) {
  const jobs = resume.work.filter((job) => !isInternship(job));
  const internships = resume.work.filter(isInternship);
  const linker = createLinker(resume.organisations);
  const internshipsBlock = internships.length
    ? `
        <div class="subsection" id="stages" data-subsection="stages">
          <h3 class="subsection__title">Stages</h3>
          <ol class="timeline timeline--stages">
${list(internships, jobEntry('h4', linker))}
          </ol>
        </div>`
    : '';

  return section(
    'experiences',
    'Expériences',
    `        <ol class="timeline timeline--postes">
${list(jobs, jobEntry('h3', linker))}
        </ol>${internshipsBlock}`,
  );
}

function education(resume) {
  return section(
    'formations',
    'Formations',
    `        <ol class="timeline timeline--formations">
${list(resume.education, (training, index) =>
  entry({ ...training, org: training.institution }, { kind: 'formation', heading: 'h3', index }),
)}
        </ol>`,
  );
}

function projects(resume) {
  if (!resume.projects?.length) return '';
  return section(
    'projets',
    'Projets personnels',
    `        <ul class="projects">
${list(resume.projects, (project, index) => {
  const period = periodHtml(project);
  return `          <li class="project" style="--i:${index}">
            <article class="project__card">
              <h3 class="project__name">${e(project.name)}</h3>${period ? `\n              <p class="project__period">${period}</p>` : ''}
              <p class="project__desc">${e(project.description)}</p>${bullets('project__highlights', project.highlights)}${tags(project.keywords)}${
                project.url
                  ? `\n              <p class="project__link"><a href="${attr(project.url)}" rel="noopener">Voir le code</a></p>`
                  : ''
              }
            </article>
          </li>`;
})}
        </ul>`,
  );
}

function themeSwitcher() {
  return `
  <div class="theme-switcher" data-theme-switcher hidden>
    <button type="button" class="theme-switcher__handle" aria-expanded="false" aria-controls="theme-options">
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/>
        <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>
      </svg>
      <span class="visually-hidden">Changer de thème</span>
    </button>
    <div class="theme-switcher__options" id="theme-options" role="group" aria-label="Thème d'affichage">
${list(
  THEMES,
  (theme) =>
    `      <button type="button" class="theme-switcher__option" data-set-theme="${theme.id}" aria-pressed="${theme.id === DEFAULT_THEME}">${e(theme.label)}</button>`,
)}
    </div>
  </div>`;
}

// Choisit le thème (adresse, sinon dernier choix, sinon thème par défaut) et écrit sa feuille
// de style pendant l'analyse de la page : le navigateur l'attend avant le premier affichage,
// donc pas d'instant sans style, et une seule feuille de thème téléchargée.
function themeBootScript() {
  const ids = JSON.stringify(THEMES.map((theme) => theme.id));
  return `(function(){var a=${ids},t=a[0];try{var q=new URLSearchParams(location.search).get("theme");if(a.indexOf(q)<0)q=localStorage.getItem("${STORAGE_KEY}");if(a.indexOf(q)>0)t=q}catch(e){}document.documentElement.setAttribute("data-theme",t);document.write('<link rel="stylesheet" href="assets/themes/'+t+'.css" id="theme-css">')})();`;
}

function favicon(name) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#1f2a44"/><text x="32" y="42" font-family="Arial,sans-serif" font-size="28" font-weight="700" text-anchor="middle" fill="#fff">${initials(name)}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function renderHtml(resume) {
  const { basics, meta } = resume;
  const title = `${basics.name} — ${basics.label}`;
  const description = [basics.name, basics.label, basics.tagline, ...(basics.status ?? []), basics.location?.label]
    .filter(Boolean)
    .join(' · ');

  return `<!doctype html>
<html lang="fr" data-theme="${DEFAULT_THEME}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${e(title)}</title>
  <meta name="description" content="${e(description)}">
  <meta name="author" content="${e(basics.name)}">
  <meta property="og:type" content="profile">
  <meta property="og:title" content="${e(title)}">
  <meta property="og:description" content="${e(description)}">
  <meta property="og:locale" content="fr_FR">${basics.url ? `\n  <link rel="canonical" href="${attr(basics.url)}">\n  <meta property="og:url" content="${attr(basics.url)}">` : ''}${basics.url && basics.image ? `\n  <meta property="og:image" content="${attr(new URL(basics.image, basics.url).href)}">` : ''}
  <!--
    Lecteurs automatiques (ATS, assistants IA) : le CV complet existe aussi en Markdown (cv.md)
    et au format JSON Resume (resume.json), avec le même contenu que la page affichée.
    Les données structurées schema.org ci-dessous en sont un résumé.
  -->
  <link rel="alternate" type="text/markdown" href="cv.md" title="CV en Markdown">
  <link rel="alternate" type="application/json" href="resume.json" title="CV au format JSON Resume">
  <link rel="icon" href="${favicon(basics.name)}">
  <link rel="stylesheet" href="assets/base.css">
  <script>${themeBootScript()}</script>
  <noscript><link rel="stylesheet" href="assets/themes/${DEFAULT_THEME}.css" id="theme-css"></noscript>
  <script type="application/ld+json">
${jsonForScript(toJsonLd(resume))}
  </script>
  <script src="assets/app.js" defer></script>
</head>
<body>
  <a class="skip-link" href="#main">Aller au contenu</a>
  <main class="sheet" id="main">${identity(resume)}
${profile(resume)}
    <div class="sheet__side">${skills(resume)}
${languages(resume)}
    </div>
    <div class="sheet__main">${experiences(resume)}
${education(resume)}
${projects(resume)}
    </div>
  </main>
  <footer class="colophon">
    <p class="colophon__updated">Mis à jour en <time datetime="${e(meta.lastModified)}">${e(formatMonth(meta.lastModified))}</time>.</p>
    <ul class="colophon__formats" aria-label="Autres formats">
      <li><a href="cv.md">Version Markdown</a></li>
      <li><a href="resume.json">JSON Resume</a></li>
    </ul>
  </footer>
${themeSwitcher()}
</body>
</html>
`;
}
