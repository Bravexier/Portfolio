import { CONTRACTS, SKILL_SCALE, isIsoDate } from './format.mjs';
import { citedOrganisations } from './mentions.mjs';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// La photo est un fichier de static/, publié sous assets/.
const IMAGE = /^assets\/[\w.-]+\.(?:jpe?g|png|webp)$/;
const text = (value) => typeof value === 'string' && value.trim() !== '';
const link = (value) => URL.canParse(value) && ['http:', 'https:'].includes(new URL(value).protocol);
const listOf = (value) => (Array.isArray(value) ? value : []);

// Vérifie le contenu avant le rendu. Renvoie la liste des erreurs (vide si tout va bien).
export function validate(resume) {
  const errors = [];
  const need = (condition, message) => {
    if (!condition) errors.push(message);
  };
  const optionalList = (value, where) => need(value === undefined || Array.isArray(value), `${where} : liste attendue`);
  const optionalLink = (value, where) =>
    need(!value || link(value), `${where} : adresse « ${value} » invalide (http ou https attendu)`);
  const dates = (item, where) => {
    for (const key of ['startDate', 'endDate']) {
      if (item[key] !== undefined) need(isIsoDate(item[key]), `${where} : ${key} « ${item[key]} » invalide`);
    }
    if (isIsoDate(item.startDate) && isIsoDate(item.endDate)) {
      // Comparaison sur la précision commune : 2025 et 2025-06 ne se contredisent pas.
      const precision = Math.min(item.startDate.length, item.endDate.length);
      need(item.startDate.slice(0, precision) <= item.endDate.slice(0, precision), `${where} : startDate après endDate`);
    }
  };

  const basics = resume.basics ?? {};
  need(text(basics.name), 'basics.name manquant');
  need(text(basics.label), 'basics.label manquant');
  need(text(basics.summary), 'basics.summary manquant');
  need(
    Array.isArray(basics.status) && basics.status.length > 0 && basics.status.every(text),
    'basics.status : liste de textes non vide attendue',
  );
  need(
    basics.image === undefined || IMAGE.test(basics.image),
    `basics.image « ${basics.image} » invalide (attendu : assets/nom.jpg, .png ou .webp, le fichier étant dans static/)`,
  );
  need(!basics.email || EMAIL.test(basics.email), `basics.email « ${basics.email} » invalide`);
  need(text(basics.email) || text(basics.contactUrl), 'basics : il faut un email ou un contactUrl');
  optionalLink(basics.contactUrl, 'basics.contactUrl');
  optionalLink(basics.url, 'basics.url');
  optionalList(basics.highlights, 'basics.highlights');
  optionalList(basics.profiles, 'basics.profiles');
  for (const [index, profile] of listOf(basics.profiles).entries()) {
    need(text(profile.network), `basics.profiles[${index}] : network manquant`);
    need(link(profile.url), `basics.profiles[${index}] : url « ${profile.url} » invalide (http ou https attendu)`);
  }

  for (const key of ['work', 'education', 'skills', 'languages']) {
    need(Array.isArray(resume[key]) && resume[key].length > 0, `${key} : liste manquante ou vide`);
  }
  optionalList(resume.projects, 'projects');

  for (const [index, job] of listOf(resume.work).entries()) {
    const where = `work[${index}]`;
    need(text(job.name), `${where} : name manquant`);
    need(text(job.position), `${where} : position manquant`);
    need(CONTRACTS.includes(job.contract), `${where} : contract « ${job.contract} » inconnu (${CONTRACTS.join(', ')})`);
    need(job.startDate !== undefined, `${where} : startDate manquant`);
    dates(job, where);
    optionalLink(job.url, `${where}.url`);
    optionalList(job.highlights, `${where}.highlights`);
    optionalList(job.keywords, `${where}.keywords`);
  }

  for (const [index, training] of listOf(resume.education).entries()) {
    const where = `education[${index}]`;
    need(text(training.institution), `${where} : institution manquant`);
    need(text(training.title), `${where} : title manquant`);
    dates(training, where);
    optionalLink(training.url, `${where}.url`);
  }

  for (const [index, skill] of listOf(resume.skills).entries()) {
    const where = `skills[${index}]`;
    need(text(skill.name), `${where} : name manquant`);
    need(text(skill.category), `${where} : category manquant`);
    need(SKILL_SCALE.includes(skill.level), `${where} : level « ${skill.level} » inconnu (${SKILL_SCALE.join(', ')})`);
  }

  for (const [index, language] of listOf(resume.languages).entries()) {
    const where = `languages[${index}]`;
    need(text(language.language), `${where} : language manquant`);
    need(text(language.fluency), `${where} : fluency manquant`);
    optionalList(language.certifications, `${where}.certifications`);
  }

  for (const [index, project] of listOf(resume.projects).entries()) {
    const where = `projects[${index}]`;
    need(text(project.name), `${where} : name manquant`);
    need(text(project.description), `${where} : description manquant`);
    dates(project, where);
    optionalLink(project.url, `${where}.url`);
    optionalList(project.highlights, `${where}.highlights`);
    optionalList(project.keywords, `${where}.keywords`);
  }

  // Organisations citées dans les postes : une adresse valide, et au moins une mention réelle.
  optionalList(resume.organisations, 'organisations');
  const organisations = listOf(resume.organisations);
  for (const [index, organisation] of organisations.entries()) {
    const where = `organisations[${index}]`;
    need(text(organisation.name), `${where} : name manquant`);
    need(link(organisation.url), `${where} : url « ${organisation.url} » invalide (http ou https attendu)`);
  }
  if (organisations.every((organisation) => text(organisation.name)) && Array.isArray(resume.work)) {
    const cited = citedOrganisations(resume);
    for (const organisation of organisations) {
      need(cited.has(organisation.name), `organisations : « ${organisation.name} » n'est citée dans aucun poste`);
    }
  }

  const compact = resume.meta?.compactSkillCategories;
  optionalList(compact, 'meta.compactSkillCategories');
  const categories = new Set(listOf(resume.skills).map((skill) => skill.category));
  for (const name of listOf(compact)) {
    need(categories.has(name), `meta.compactSkillCategories : « ${name} » n'est la catégorie d'aucune compétence`);
  }

  need(isIsoDate(resume.meta?.lastModified), 'meta.lastModified manquant ou invalide');
  return errors;
}
