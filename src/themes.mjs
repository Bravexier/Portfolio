// Liste unique des thèmes. Chaque id correspond à static/themes/<id>.css.
// Le premier est celui affiché par défaut et sans JavaScript.
export const THEMES = [
  { id: 'pro', label: 'Pro' },
  { id: 'tech', label: 'Tech' },
  { id: 'jdr', label: 'JDR' },
];

export const DEFAULT_THEME = THEMES[0].id;
