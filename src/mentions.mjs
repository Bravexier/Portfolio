// Organisations citées dans les textes d'un poste (clients, donneur d'ordre) : chaque nom
// connu devient un lien. La liste vit à un seul endroit, `organisations` dans resume.json.

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Renvoie une fabrique : un lieur neuf par bloc (un poste), pour ne lier chaque organisation
// qu'à sa première mention dans ce bloc. Le lieur découpe un texte en morceaux : du texte,
// ou { name, url } pour un nom à lier.
export function createLinker(organisations = []) {
  const urls = new Map(organisations.map((organisation) => [organisation.name, organisation.url]));
  if (!urls.size) return () => (text) => [text];

  // Les noms les plus longs d'abord, et jamais au milieu d'un mot.
  const names = [...urls.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp);
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(?:${names.join('|')})(?![\\p{L}\\p{N}])`, 'gu');

  return () => {
    const linked = new Set();
    return (text) => {
      const parts = [];
      let cursor = 0;
      for (const match of text.matchAll(pattern)) {
        const [name] = match;
        if (linked.has(name)) continue;
        linked.add(name);
        parts.push(text.slice(cursor, match.index), { name, url: urls.get(name) });
        cursor = match.index + name.length;
      }
      parts.push(text.slice(cursor));
      return parts.filter((part) => part !== '');
    };
  };
}

// Les textes d'un poste où une organisation peut être citée, dans l'ordre d'affichage.
export const jobTexts = (job) => [job.summary, ...(job.highlights ?? [])].filter(Boolean);

// Noms d'organisations réellement cités dans au moins un poste.
export function citedOrganisations(resume) {
  const cited = new Set();
  const linker = createLinker(resume.organisations);
  for (const job of resume.work ?? []) {
    const link = linker();
    for (const text of jobTexts(job)) {
      for (const part of link(text)) {
        if (typeof part !== 'string') cited.add(part.name);
      }
    }
  }
  return cited;
}
