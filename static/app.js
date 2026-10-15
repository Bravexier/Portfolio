// Sélecteur de thème et bouton d'impression. Sans JavaScript, la page reste
// entièrement lisible dans le thème par défaut.
(() => {
  'use strict';

  const STORAGE_KEY = 'cv-theme';
  const root = document.documentElement;

  for (const element of document.querySelectorAll('[data-requires-js]')) {
    element.hidden = false;
  }
  for (const button of document.querySelectorAll('[data-action="print"]')) {
    button.addEventListener('click', () => window.print());
  }

  // Hauteur réelle de la colonne latérale, publiée dans --side-height : un thème qui la garde
  // en vue pendant le défilement n'a ainsi aucune mesure à tenir à la main. Elle suit le
  // contenu, la police, la largeur et le thème.
  const side = document.querySelector('.sheet__side');
  if (side?.firstElementChild && 'ResizeObserver' in window) {
    const publish = () => {
      const style = getComputedStyle(side);
      const top = side.firstElementChild.getBoundingClientRect().top;
      const bottom = side.lastElementChild.getBoundingClientRect().bottom;
      const height = bottom - top + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      root.style.setProperty('--side-height', `${Math.ceil(height)}px`);
    };
    const observer = new ResizeObserver(publish);
    for (const child of side.children) observer.observe(child);
  }

  const switcher = document.querySelector('[data-theme-switcher]');
  if (!switcher) return;

  const handle = switcher.querySelector('.theme-switcher__handle');
  const options = [...switcher.querySelectorAll('[data-set-theme]')];
  const themes = options.map((option) => option.dataset.setTheme);
  const defaultTheme = themes[0];
  let pending = null;

  function mark(theme) {
    for (const option of options) {
      option.setAttribute('aria-pressed', String(option.dataset.setTheme === theme));
    }
  }

  function remember(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Stockage indisponible (navigation privée, fichier local) : le choix vaut pour cette visite.
    }
    try {
      const url = new URL(location.href);
      if (theme === defaultTheme) url.searchParams.delete('theme');
      else url.searchParams.set('theme', theme);
      history.replaceState(null, '', url);
    } catch {
      // Ouvert en file:// : l'adresse ne peut pas être réécrite, sans conséquence.
    }
  }

  function cancelPending() {
    if (!pending) return;
    pending.link.remove();
    pending = null;
  }

  // La nouvelle feuille se charge sans s'appliquer (media), puis remplace l'ancienne d'un coup :
  // jamais d'instant sans style, jamais deux thèmes mélangés. Le choix n'est mémorisé qu'une
  // fois le thème réellement affiché.
  function apply(theme) {
    if (!themes.includes(theme)) return;
    const active = root.dataset.theme;
    if (theme === (pending ? pending.theme : active)) return;

    cancelPending();
    mark(theme);
    if (theme === active) return;

    const current = document.getElementById('theme-css');
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.media = 'not all';
    link.href = current.getAttribute('href').replace(/[^/]+\.css$/, `${theme}.css`);
    const request = { theme, link };
    pending = request;

    link.addEventListener('load', () => {
      if (pending !== request) return;
      pending = null;
      root.dataset.theme = theme;
      current.remove();
      link.removeAttribute('media');
      link.id = 'theme-css';
      remember(theme);
    });
    link.addEventListener('error', () => {
      link.remove();
      if (pending !== request) return;
      pending = null;
      mark(active);
    });
    current.after(link);
  }

  // Le panneau est ouvert s'il est épinglé (clic ou Entrée sur le bouton) ou survolé à la souris.
  // data-open est la seule chose qui l'affiche : aria-expanded dit donc toujours vrai.
  const panel = { pinned: false, hovered: false };

  function update(change) {
    Object.assign(panel, change);
    const open = panel.pinned || panel.hovered;
    switcher.toggleAttribute('data-open', open);
    handle.setAttribute('aria-expanded', String(open));
  }

  handle.addEventListener('click', () => update({ pinned: !panel.pinned }));
  switcher.addEventListener('pointerenter', (event) => update({ hovered: event.pointerType === 'mouse' }));
  switcher.addEventListener('pointerleave', () => update({ hovered: false }));
  switcher.addEventListener('focusout', (event) => {
    if (!switcher.contains(event.relatedTarget)) update({ pinned: false });
  });
  for (const option of options) {
    option.addEventListener('click', () => apply(option.dataset.setTheme));
  }
  document.addEventListener('click', (event) => {
    if (!switcher.contains(event.target)) update({ pinned: false });
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !switcher.hasAttribute('data-open')) return;
    const inside = switcher.contains(document.activeElement);
    update({ pinned: false, hovered: false });
    if (inside) handle.focus();
  });

  mark(themes.includes(root.dataset.theme) ? root.dataset.theme : defaultTheme);
  switcher.hidden = false;
})();
