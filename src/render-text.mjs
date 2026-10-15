import { currentJob, formatMonth, groupBy, isInternship, periodText } from './format.mjs';
import { createLinker } from './mentions.mjs';

// Aplatit à toute profondeur et ne garde que le texte : un bloc optionnel s'écrit
// `condition && [...]` et disparaît quand la condition est fausse.
const lines = (...parts) => parts.flat(Infinity).filter((line) => typeof line === 'string');
const bullets = (items) => (items ?? []).map((item) => `- ${item}`);
const joined = (...parts) => parts.filter(Boolean).join(' · ');
const finish = (rows) => `${rows.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;

function contactLine(basics) {
  return basics.email ? `Contact : ${basics.email}` : `Contact : ${basics.contactUrl}`;
}

// Texte d'un poste : les organisations connues qui y sont citées deviennent des liens Markdown.
const withMentions = (link) => (text) =>
  link(text)
    .map((part) => (typeof part === 'string' ? part : `[${part.name}](${part.url})`))
    .join('');

// Même ordre que sur la page : employeur, mission, réalisations, technologies.
// `link` (facultatif) est le lieur d'organisations de cette ligne.
function entry(heading, item, link) {
  const text = link ? withMentions(link) : (value) => value;
  return lines(
    `${heading} ${item.title} — ${item.org}`,
    '',
    joined(periodText(item), item.contract, item.location),
    '',
    item.about && [item.about, ''],
    item.summary && [text(item.summary), ''],
    item.highlights?.length > 0 && [bullets(item.highlights.map(text)), ''],
    item.keywords?.length > 0 && [`Technologies : ${item.keywords.join(', ')}`, ''],
    item.url && [`Site : ${item.url}`, ''],
  );
}

const job = (heading, linker) => (item) =>
  entry(heading, { ...item, title: item.position, org: item.name, about: item.description }, linker());

function project(item) {
  return lines(
    `### ${item.name}`,
    '',
    periodText(item) && [periodText(item), ''],
    item.description,
    '',
    item.highlights?.length > 0 && [bullets(item.highlights), ''],
    item.keywords?.length > 0 && [`Technologies : ${item.keywords.join(', ')}`, ''],
    item.url && [`Code : ${item.url}`, ''],
  );
}

// Le CV complet en Markdown : même contenu que la page, lisible sans navigateur.
export function renderMarkdown(resume) {
  const { basics } = resume;
  const jobs = resume.work.filter((item) => !isInternship(item));
  const internships = resume.work.filter(isInternship);
  const current = currentJob(resume);
  const linker = createLinker(resume.organisations);

  return finish(
    lines(
      `# ${basics.name}`,
      '',
      `**${joined(basics.label, basics.tagline)}**`,
      '',
      bullets(
        lines(
          `Situation : ${joined(...basics.status)}`,
          current && `Poste actuel : ${current.position}, ${current.name}`,
          basics.location?.label && `Localisation : ${basics.location.label}`,
          basics.mobility && `Mobilité : ${basics.mobility}`,
          contactLine(basics),
          (basics.profiles ?? []).map((profile) => `${profile.network} : ${profile.url}`),
        ),
      ),
      '',
      '## Profil',
      '',
      basics.summary,
      '',
      bullets(basics.highlights),
      '',
      '## Compétences',
      '',
      groupBy(resume.skills, 'category').map((group) => [
        `### ${group.name}`,
        '',
        bullets(group.entries.map((skill) => `${skill.name} : ${skill.level}`)),
        '',
      ]),
      '## Langues',
      '',
      bullets(
        resume.languages.map((language) =>
          [`${language.language} : ${language.fluency}`, language.certifications?.join(', ')].filter(Boolean).join(' — '),
        ),
      ),
      '',
      '## Expériences',
      '',
      jobs.map(job('###', linker)),
      internships.length > 0 && ['### Stages', '', internships.map(job('####', linker))],
      '## Formations',
      '',
      resume.education.map((training) => entry('###', { ...training, org: training.institution })),
      resume.projects?.length > 0 && ['## Projets personnels', '', resume.projects.map(project)],
      `Mis à jour en ${formatMonth(resume.meta.lastModified)}.`,
    ),
  );
}

// llms.txt (https://llmstxt.org) : point d'entrée pour un assistant IA qui lit le site.
// Le texte libre précède les sections ; une section ne contient que des liens.
export function renderLlmsTxt(resume) {
  const { basics } = resume;
  const summary = [
    basics.summary,
    `${joined(...basics.status)}.`,
    basics.location?.label && `${basics.location.label}.`,
  ];

  return finish(
    lines(
      `# ${basics.name} — ${basics.label}`,
      '',
      `> ${summary.filter(Boolean).join(' ')}`,
      '',
      `Ce site est le CV de ${basics.name}. Les formats ci-dessous reprennent tout le contenu de la page.`,
      '',
      basics.highlights?.length > 0 && [bullets(basics.highlights), ''],
      '## Formats',
      '',
      '- [CV complet en Markdown](cv.md): parcours, compétences, formations et projets.',
      '- [JSON Resume](resume.json): les mêmes données au format jsonresume.org.',
    ),
  );
}
