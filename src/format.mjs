// Échelle DoYouBuzz, du plus faible au plus fort. Le rang (1 à 5) en découle.
export const SKILL_SCALE = ['Débutant', 'Intermédiaire', 'Bon niveau', 'Avancé', 'Expert'];

export const CONTRACTS = ['CDI', 'CDD', 'Stage'];

const HTML_ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => HTML_ENTITIES[char]);
}

// Espace insécable, construite par son code pour rester visible dans le source.
const NBSP = String.fromCharCode(0xa0);

// Typographie française : espace insécable avant « : ; ? ! » et à l'intérieur des guillemets,
// pour qu'une ligne ne commence jamais par une ponctuation.
export function frenchSpaces(value) {
  return String(value)
    .replace(/ ([:;?!»])/g, `${NBSP}$1`)
    .replace(/« /g, `«${NBSP}`);
}

const MONTH_YEAR = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const ISO_DATE = /^(\d{4})(?:-(0[1-9]|1[0-2])(?:-\d{2})?)?$/;

export function isIsoDate(value) {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  if (value.length !== 10) return true;
  // Avec un jour, la date doit exister : pas de 31 février.
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

// '2023-01' -> 'janvier 2023' ; '2023' -> '2023'
export function formatMonth(iso) {
  const match = ISO_DATE.exec(iso);
  if (!match) throw new Error(`Date invalide : « ${iso} » (attendu AAAA ou AAAA-MM)`);
  const [, year, month] = match;
  if (!month) return year;
  return MONTH_YEAR.format(new Date(Date.UTC(Number(year), Number(month) - 1, 1)));
}

// Une période est une suite de morceaux : du texte, ou une date à formater.
export function periodParts({ startDate, endDate }) {
  if (startDate && !endDate) return [{ text: 'depuis ' }, { date: startDate }];
  // Début et fin dans le même mois : une seule date.
  if (startDate && endDate && startDate.slice(0, 7) === endDate.slice(0, 7)) return [{ date: startDate }];
  if (startDate && endDate) return [{ date: startDate }, { text: ' – ' }, { date: endDate }];
  if (endDate) return [{ date: endDate }];
  return [];
}

export function periodText(item) {
  return periodParts(item)
    .map((part) => (part.date ? formatMonth(part.date) : part.text))
    .join('');
}

export function periodHtml(item) {
  return periodParts(item)
    .map((part) =>
      part.date
        ? `<time datetime="${escapeHtml(part.date)}">${escapeHtml(formatMonth(part.date))}</time>`
        : escapeHtml(part.text),
    )
    .join('');
}

export function skillRank(level) {
  const index = SKILL_SCALE.indexOf(level);
  if (index === -1) {
    throw new Error(`Niveau inconnu : « ${level} » (attendu : ${SKILL_SCALE.join(', ')})`);
  }
  return index + 1;
}

export function slug(value) {
  return String(value)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function initials(name) {
  return String(name)
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase())
    .join('');
}

// Regroupe en conservant l'ordre de première apparition.
export function groupBy(items, key) {
  const groups = new Map();
  for (const item of items) {
    const name = item[key];
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(item);
  }
  return [...groups].map(([name, entries]) => ({ name, entries }));
}

export function isInternship(job) {
  return job.contract === 'Stage';
}

export function currentJob(resume) {
  return resume.work.find((job) => !job.endDate && !isInternship(job));
}
