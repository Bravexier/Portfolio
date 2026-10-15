import { currentJob } from './format.mjs';

// Retire les clés vides pour ne publier que ce qui est renseigné.
function prune(value) {
  if (Array.isArray(value)) {
    const items = value.map(prune).filter((item) => item !== undefined);
    return items.length ? items : undefined;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
      .map(([key, item]) => [key, prune(item)])
      .filter(([, item]) => item !== undefined);
    const meaningful = entries.some(([key]) => !key.startsWith('@'));
    return meaningful ? Object.fromEntries(entries) : undefined;
  }
  return value === '' || value === null ? undefined : value;
}

// Données structurées schema.org : un résumé de la page, pour les machines.
export function toJsonLd(resume) {
  const { basics } = resume;
  const job = currentJob(resume);
  const schools = [...new Set((resume.education ?? []).map((training) => training.institution))];

  return prune({
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: basics.name,
    jobTitle: basics.label,
    description: basics.summary,
    url: basics.url,
    // Une image n'est utile aux machines qu'avec une adresse complète : il faut celle du site.
    image: basics.url && basics.image ? new URL(basics.image, basics.url).href : undefined,
    email: basics.email,
    address: {
      '@type': 'PostalAddress',
      addressLocality: basics.location?.city,
      postalCode: basics.location?.postalCode,
      addressRegion: basics.location?.region,
      addressCountry: basics.location?.countryCode,
    },
    worksFor: job && { '@type': 'Organization', name: job.name },
    alumniOf: schools.map((name) => ({ '@type': 'EducationalOrganization', name })),
    knowsAbout: (resume.skills ?? []).map((skill) => skill.name),
    knowsLanguage: (resume.languages ?? []).map((language) => language.language),
    sameAs: (basics.profiles ?? []).map((profile) => profile.url),
  });
}

// JSON sûr à placer dans une balise <script>.
export function jsonForScript(data) {
  return JSON.stringify(data, null, 2).replace(/</g, '\\u003c');
}
