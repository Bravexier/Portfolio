// Animation de construction : au chargement et à chaque changement de thème, la fiche s'assemble
// calque par calque, dans le style du thème (son « habillage », voir SKINS) :
//   pro   une nuée de curseurs d'agents nommés (Instance-1, Designer-2…) livre la page ;
//   tech  personne : la page arrive par à-coups, comme une image numérique qui décroche ;
//   jdr   des feux follets tracent des cercles d'invocation et alignent les arcanes.
//   manga personne : la planche se crayonne, puis s'encre dans le sens de lecture japonais.
// C'est un effet, rien de plus : la page est complète sans lui (sans JavaScript, à l'impression,
// avec « réduire les animations »), et « Passer » ou Échap le termine aussitôt.
//
// Un calque est le plus haut élément de la fiche qui peint du contenu : texte propre, image,
// ou pièce décorative sans enfant (jauge). Les cadres et les fonds (sections, cartes) ne sont
// pas des calques : ils restent affichés et servent d'échafaudage. Seuls les calques visibles
// à l'écran sont animés, les autres s'affichent tout de suite.
//
// État publié pour les feuilles de style et l'audit :
//   html[data-build]      pending (posé par le script de démarrage, avant le premier affichage)
//                         puis running, retiré à la fin ;
//   [data-layer]          wait (masqué) puis in (apparition), retiré à la fin ;
//   [data-build-skip]     le bouton qui termine tout de suite.
// Les dessins vivent dans .cv-build (pendant la construction) et .cv-build-flash (salut final,
// une seconde au plus) : la feuille du thème les habille.
(() => {
  'use strict';

  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const SCOPE = 'main, .colophon';
  // Cadres esquissés pendant la construction.
  const FRAMES = '.identity, .section, .skill-group, .entry, .project';
  // Au-delà, le visiteur a déjà trop attendu la page : elle s'affiche sans animation.
  const LATE_START = 2500;
  // Durée maximale de la construction, en millisecondes.
  const LONGEST = 3600;
  const HUD_LINGER = 2600;
  const WATCHDOG = 1000;
  const CURSOR =
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 1.5v11.6l3.1-2.9 2.2 4.6 2-.9-2.2-4.6h4.3z"/></svg>';

  let run = null;
  let hud = null;
  let flash = null;

  // ---------- Outils ----------

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const plural = (count, word) => (count > 1 ? `${word}s` : word);
  const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);
  const random = (min, max) => min + Math.random() * (max - min);
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const shuffle = (list) => list.map((item) => [Math.random(), item]).sort((a, b) => a[0] - b[0]).map(([, item]) => item);
  // Espace fine insécable devant la ponctuation haute, écrite par son code (voir les tests).
  const fr = (text) => text.replace(/ ([?!:;%€»])/g, '\u202f$1').replace(/« /g, '«\u202f');
  // Couleurs bien distinctes, aussi nombreuses qu'il en faut (angle d'or).
  const hues = (count, saturation, lightness) =>
    Array.from({ length: count }, (_, index) => `hsl(${Math.round((index * 137.5) % 360)} ${saturation}% ${lightness}%)`);

  function element(tag, className, parent) {
    const node = document.createElement(tag);
    node.className = className;
    parent?.append(node);
    return node;
  }

  const place = (node, rect) => {
    node.style.left = `${rect.x}px`;
    node.style.top = `${rect.y}px`;
    node.style.width = `${rect.w}px`;
    node.style.height = `${rect.h}px`;
  };

  // Petit dessin éphémère posé dans la page : il s'efface de lui-même à la fin de son animation.
  function spark(className, point, color, world) {
    const node = element('span', className, world);
    node.style.left = `${point.x}px`;
    node.style.top = `${point.y}px`;
    node.style.setProperty('--_c', color);
    node.addEventListener('animationend', () => node.remove(), { once: true });
    return node;
  }

  // ---------- Calques ----------

  const ownText = (node) => [...node.childNodes].some((child) => child.nodeType === Node.TEXT_NODE && child.nodeValue.trim());

  const paints = (node) => node.matches('img, svg, video, canvas, picture, hr') || ownText(node) || node.childElementCount === 0;

  function collectLayers() {
    const layers = [];
    const walk = (parent) => {
      for (const child of parent.children) {
        const style = getComputedStyle(child);
        if (style.display === 'none') continue;
        if (style.display !== 'contents' && paints(child)) {
          if (style.visibility === 'visible') layers.push(child);
          continue;
        }
        walk(child);
      }
    };
    for (const scope of document.querySelectorAll(SCOPE)) walk(scope);
    return layers;
  }

  const inView = (box) =>
    box.width >= 4 && box.height >= 4 && box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth;

  // Rectangle en coordonnées de la page : le calque de dessin suit le défilement.
  const toPage = (box) => ({ x: box.left + scrollX, y: box.top + scrollY, w: box.width, h: box.height });

  function label(node) {
    const name = node.classList[0];
    return `${node.tagName.toLowerCase()}${name ? `.${name}` : ''}`.slice(0, 28);
  }

  // ---------- Habillages ----------
  // Chaque thème choisit son équipe (crew), dessine ses agents (agent), ses cadres de travail
  // (box), son geste d'apparition (reveal) et ses décors propres (begin, frame, finale).
  // Un habillage sans équipe fournit son propre calendrier (schedule) et peut se passer des
  // cadres esquissés (frames: false) et des cadres de travail (boxes: false).
  // Tout est piloté par l'horloge de l'animation : rien ne survit à stop().

  const DEFAULT = {
    colors: ['#ff4d8d', '#ffb020', '#2ee6a6', '#38bdf8', '#a78bfa', '#f97316', '#e879f9', '#facc15', '#22d3ee', '#fb7185', '#4ade80', '#818cf8'],
    crew: (count) => ({ builders: Math.min(12, Math.max(4, Math.ceil(count / 6))), idlers: 0 }),
    agent(node) {
      node.innerHTML = CURSOR;
    },
    tag: (unit) => label(unit.element),
    reveal(unit, point, world) {
      spark('cv-build__ripple', point, unit.color, world);
    },
    status: (state) =>
      `${state.builders} ${plural(state.builders, 'agent')} · ${state.built} / ${state.total} ${plural(state.total, 'calque')}`,
    done: (state, seconds) => `Page construite par ${state.builders} ${plural(state.builders, 'agent')} en ${seconds} s`,
  };

  // Pro : la page livrée par une équipe d'agents. Chaque curseur porte son nom d'agent, un rôle
  // et un numéro (Instance-1, Designer-2…). Les relecteurs (gris) ne posent aucun calque : ils
  // passent d'un calque à l'autre.
  const PRO_ROLES = ['Instance', 'Designer', 'Développeur', 'Intégrateur', 'Rédacteur', 'Testeur'];
  const PRO_REVIEWER = 'Relecteur';

  const PRO = {
    colors: hues(28, 78, 50),
    crew: (count) => ({ builders: clamp(Math.ceil(count / 2), 8, 24), idlers: count >= 12 ? 4 : 2 }),
    begin(state) {
      state.roles = shuffle(PRO_ROLES);
    },
    // Numéros uniques dans l'équipe : les agents d'abord, puis les relecteurs.
    agent(node, agent, state) {
      node.innerHTML = CURSOR;
      const name = element('span', 'cv-build__name', node);
      name.textContent = agent.idle
        ? `${PRO_REVIEWER}-${state.builders + agent.rank + 1}`
        : `${state.roles[agent.rank % state.roles.length]}-${agent.rank + 1}`;
    },
    status: (state) =>
      `${state.builders} agents · ${state.idlers} ${plural(state.idlers, 'relecteur')} · ${state.built} / ${state.total} ${plural(state.total, 'calque')}`,
    done: (state, seconds) => `Page livrée par ${state.builders} agents en ${seconds} s`,
  };

  // Tech : la page arrive comme l'image d'un jeu vidéo qui charge, sans personne pour la
  // monter. Elle reste nette entre deux salves de distorsion ; une salve dure un dixième de
  // seconde : la page entière est découpée en tranches décalées de côté, le rouge et le cyan se
  // séparent (filtre SVG, html[data-glitch]) et des blocs de couleur corrompus la traversent.
  // La première salve découpe l'écran noir ; les blocs apparaissent ensuite de haut en bas,
  // par salves, chacun avec ses ratés.
  const TECH_HUES = ['#ff2bd6', '#22d3ee', '#4bef88', '#f5f749'];
  // Les blocs commencent à apparaître juste après la première salve.
  const SIGNAL_START = 160;
  // Durée d'une salve, puis attente avant la suivante (millisecondes).
  const BURST = [80, 130];
  const CALM = [220, 600];

  // Filtre de distorsion posé sur la page pendant une salve : un bruit en bandes horizontales,
  // ramené à quelques paliers, décale chaque tranche de côté (bords nets) ; puis le rouge part
  // d'un côté, le vert et le bleu de l'autre. distort() tire de nouvelles tranches.
  function glitchFilter(parent) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'cv-build__fx');
    svg.innerHTML = `<filter id="cv-glitch" x="-10%" y="0" width="120%" height="100%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="0 0.02" numOctaves="2" seed="1"/>
      <feComponentTransfer result="bands">
        <feFuncR type="discrete" tableValues="0 0.5 0.5 0.15 0.5 0.85 0.5 0.3 0.5 0.7 0.5 1"/>
        <feFuncG type="linear" slope="0" intercept="0.5"/>
      </feComponentTransfer>
      <feDisplacementMap in="SourceGraphic" in2="bands" scale="60" xChannelSelector="R" yChannelSelector="G" result="sliced"/>
      <feColorMatrix in="sliced" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"/>
      <feOffset dx="-4" result="red"/>
      <feColorMatrix in="sliced" values="0 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0"/>
      <feOffset dx="4" result="cyan"/>
      <feBlend in="red" in2="cyan" mode="screen"/>
    </filter>`;
    parent.append(svg);
    return { noise: svg.querySelector('feTurbulence'), map: svg.querySelector('feDisplacementMap'), split: svg.querySelectorAll('feOffset') };
  }

  // Nouvelles tranches : hauteur des bandes, ampleur et sens du décalage, écart des couleurs.
  function distort(fx) {
    fx.noise.setAttribute('seed', String(Math.floor(random(1, 10000))));
    fx.noise.setAttribute('baseFrequency', `0 ${random(0.003, 0.03).toFixed(4)}`);
    fx.map.setAttribute('scale', String(Math.round(random(30, 110)) * pick([-1, 1])));
    const gap = Math.round(random(2, 8));
    fx.split[0].setAttribute('dx', String(-gap));
    fx.split[1].setAttribute('dx', String(gap));
  }

  // Bande de déchirure, sur toute la largeur ou en bloc corrompu : elle recolore ce qu'elle
  // couvre (feuille du thème) et s'efface d'elle-même en une fraction de seconde.
  function tear(overlay) {
    const node = element('span', 'cv-build__tear', overlay);
    const height = Math.random() < 0.7 ? random(2, 14) : random(18, 56);
    node.style.top = `${Math.round(random(0, innerHeight - height))}px`;
    node.style.height = `${Math.round(height)}px`;
    if (Math.random() < 0.45) {
      const width = random(40, Math.min(420, innerWidth * 0.6));
      node.style.left = `${Math.round(random(0, innerWidth - width))}px`;
      node.style.width = `${Math.round(width)}px`;
    }
    node.style.setProperty('--_c', pick(TECH_HUES));
    node.style.setProperty('--_shift', `${Math.round(random(-28, 28))}px`);
    node.style.setProperty('--_hue', `${Math.round(random(90, 270))}deg`);
    node.style.animationDuration = `${Math.round(random(70, 170))}ms`;
    node.addEventListener('animationend', () => node.remove(), { once: true });
  }

  const TECH = {
    colors: ['#4bef88', '#22d3ee', '#ff2bd6', '#f5f749', '#a3ff5c'],
    frames: false,
    boxes: false,
    // Personne ne construit : les blocs arrivent de haut en bas, un peu dans le désordre, par
    // salves irrégulières (les blocs voisins d'une même salve s'allument ensemble). Le tout
    // tient en 3,3 s au plus, sous LONGEST.
    schedule(units) {
      const span = clamp(units.length * 24, 1000, 1900);
      const order = units
        .map((unit) => ({ unit, key: unit.rect.y + random(-90, 90) }))
        .sort((a, b) => a.key - b.key);
      let burst = SIGNAL_START;
      order.forEach(({ unit }, index) => {
        const due = SIGNAL_START + (index / units.length) * span;
        while (burst < due) burst += random(50, 190);
        unit.color = pick(TECH_HUES);
        unit.arrive = burst;
        unit.reveal = burst;
        unit.done = burst + 520;
      });
      return { agents: [], end: Math.max(...units.map((unit) => unit.done)) + 200 };
    },
    begin(state) {
      state.fx = glitchFilter(state.overlay);
      // Écran noir, que la première salve découpe en tranches (feuille du thème).
      element('span', 'cv-build__blackout', state.overlay);
      state.burstAt = 0;
      state.burstEnd = 0;
      state.shiftAt = 0;
    },
    reveal(unit, point, world) {
      // Un éclat de pixels corrompus sur une partie des blocs qui apparaissent.
      if (Math.random() > 0.45) return;
      const { x, y, w, h } = unit.rect;
      const width = random(0.2, 0.9) * w;
      const node = element('span', 'cv-build__shard', world);
      node.style.left = `${Math.round(x + random(-12, w - width + 12))}px`;
      node.style.top = `${Math.round(y + random(0, h))}px`;
      node.style.width = `${Math.round(width)}px`;
      node.style.height = `${Math.round(random(2, 7))}px`;
      node.style.setProperty('--_c', unit.color);
      node.addEventListener('animationend', () => node.remove(), { once: true });
    },
    frame(state, t) {
      if (state.burstEnd && t >= state.burstEnd) {
        delete root.dataset.glitch;
        state.burstEnd = 0;
      }
      if (!state.burstEnd && t >= state.burstAt && t < state.end - 300) {
        state.burstEnd = t + random(...BURST);
        state.burstAt = state.burstEnd + random(...CALM);
        state.shiftAt = t;
        root.dataset.glitch = pick(['a', 'b', 'c']);
        for (let count = Math.floor(random(2, 6)); count > 0; count -= 1) tear(state.overlay);
      }
      // Pendant une salve, l'image décroche autrement toutes les deux ou trois images.
      if (state.burstEnd && t >= state.shiftAt) {
        state.shiftAt = t + random(28, 50);
        distort(state.fx);
      }
    },
    finale() {
      const node = element('div', 'cv-build-flash', document.body);
      node.setAttribute('aria-hidden', 'true');
      node.dataset.text = 'ACCÈS AUTORISÉ';
      node.textContent = 'ACCÈS AUTORISÉ';
      return node;
    },
    status: (state) => `Synchronisation du signal · ${state.built} / ${state.total} ${plural(state.total, 'bloc')}`,
    done: (state, seconds) => `Signal stable · page chargée en ${seconds} s`,
  };

  // JDR : un grand cercle d'invocation se trace au centre de l'écran ; des feux follets portent
  // un sceau sur chaque calque et le relient au cercle par une ligne d'arcane.
  const ARCANA = [
    'Ignis', 'Aqua', 'Terra', 'Aer', 'Æther', 'Sol', 'Luna', 'Mercurius', 'Sal', 'Sulphur', 'Vitriol', 'Azoth',
    'Quintessence', 'Astra', 'Umbra', 'Lux', 'Arcanum', 'Sigillum',
  ];
  // Runes tracées dans un carré de 8 unités centré sur l'origine.
  const RUNES = [
    'M0-4v8M0-4l3 2M0 0l3 2', 'M-2-4v8M-2-4l4 4-4 4', 'M-3 4l3-8 3 8', 'M0-4v8M-3-1l6 2', 'M-3-4l6 8M3-4l-6 8',
    'M-3-4v8M-3 0h6M3-4v8', 'M0-4l3 4-3 4-3-4z', 'M-3-4h6l-6 8h6', 'M-2-4v8l4-4z', 'M0-4v8M-3-4l3 3 3-3',
    'M-3-4v8h6', 'M-3 4v-8l3 4 3-4v8',
  ];

  // Cercle d'invocation tiré au sort : anneaux, runes, étoile à n branches, sceau central.
  // Chaque tracé a une longueur de 1 (pathLength) : la feuille du thème les « dessine ».
  function sigil(runeCount) {
    const n = pick([5, 6, 7, 8]);
    const k = n === 8 ? 3 : 2;
    const at = (index, radius, turn = 0) => {
      const angle = (index / n) * Math.PI * 2 - Math.PI / 2 + turn;
      return `${(Math.cos(angle) * radius).toFixed(2)} ${(Math.sin(angle) * radius).toFixed(2)}`;
    };
    const star = Array.from({ length: n }, (_, index) => `${index ? 'L' : 'M'}${at((index * k) % n, 36)}`).join('') + 'Z';
    const gon = Array.from({ length: n }, (_, index) => `${index ? 'L' : 'M'}${at(index, 36)}`).join('') + 'Z';
    const inner = (36 * Math.cos((Math.PI * k) / n)).toFixed(2);
    const runes = Array.from({ length: runeCount }, (_, index) => {
      const angle = (index / runeCount) * 360;
      return `<path d="${pick(RUNES)}" transform="rotate(${angle.toFixed(1)}) translate(0 -45) scale(.9)"/>`;
    }).join('');
    const nodes = Array.from({ length: n }, (_, index) => `<circle r="3.2" transform="translate(${at(index, 36)})"/>`).join('');
    const center = pick([
      '<circle r="6" pathLength="1"/><circle r="1.6"/>',
      '<path d="M0-8 7 4H-7z" pathLength="1"/>',
      '<path d="M0 8-7-4H7z" pathLength="1"/><path d="M-5 1h10"/>',
      '<path d="M0-8v16M-6-2h12" pathLength="1"/>',
    ]);
    return `<svg viewBox="-60 -60 120 120" aria-hidden="true"><g class="ring"><circle r="56" pathLength="1"/><circle r="51" pathLength="1"/><circle r="39" pathLength="1"/></g><g class="runes">${runes}</g><path class="star" d="${star}" pathLength="1"/><path class="gon" d="${gon}" pathLength="1"/><circle class="inner" r="${inner}" pathLength="1"/><g class="nodes">${nodes}</g><g class="center">${center}</g></svg>`;
  }

  const JDR = {
    colors: ['#f5c451', '#b48cff', '#6fd3ff', '#ff8a3d', '#5ee6a0', '#ffe08a', '#ff6fa8', '#c9a6ff', '#8fe3ff'],
    crew: (count) => ({ builders: clamp(Math.ceil(count / 6), 4, 9), idlers: 0 }),
    begin(state) {
      const circle = element('div', 'cv-build__circle', state.overlay);
      circle.innerHTML = sigil(24);
      state.center = { x: scrollX + innerWidth / 2, y: scrollY + innerHeight / 2 };
      state.arcana = shuffle(ARCANA);
      state.named = 0;
    },
    agent(node) {
      node.innerHTML = '<span class="cv-build__wisp"></span>';
    },
    tag(unit, state) {
      state.named += 1;
      return `Sceau de ${state.arcana[state.named % state.arcana.length]}`;
    },
    box(unit, box) {
      const seal = element('span', 'cv-build__seal', box);
      seal.innerHTML = sigil(12);
      const size = clamp(unit.rect.h * 1.8, 34, 96);
      seal.style.setProperty('--_size', `${Math.round(size)}px`);
    },
    reveal(unit, point, world, state) {
      spark('cv-build__ripple', point, unit.color, world);
      // Ligne d'arcane du grand cercle jusqu'au calque.
      const dx = point.x - state.center.x;
      const dy = point.y - state.center.y;
      const ley = spark('cv-build__ley', state.center, unit.color, world);
      ley.style.width = `${Math.hypot(dx, dy)}px`;
      ley.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
    },
    frame(state, t) {
      for (const agent of state.agents) {
        if (!agent.point || t > agent.leave - 120 || t - (agent.spark ?? -1e9) < 55) continue;
        agent.spark = t;
        const point = { x: agent.point.x + random(-4, 4), y: agent.point.y + random(-4, 4) };
        spark('cv-build__spark', point, agent.color, state.world);
      }
    },
    status: (state) => `Rituel · ${state.builders} arcanistes · ${state.built} / ${state.total} ${state.total > 1 ? 'sceaux' : 'sceau'}`,
    done: (state, seconds) => `Fiche invoquée par ${state.builders} arcanistes en ${seconds} s`,
  };

  // Manga : la page se fabrique comme une planche, sans personne à l'écran. Le crayonné bleu
  // des cases d'abord, puis l'encrage, case par case dans le sens de lecture japonais (de
  // droite à gauche, puis de haut en bas), ponctué d'onomatopées. À la fin, les lignes de
  // vitesse convergent et le titre de l'épisode traverse l'écran de droite à gauche.
  const MANGA_SFX = ['ドン！', 'バン！', 'ズバッ', 'シャキーン', 'キラッ', 'ドドド', 'ゴゴゴ', 'ババン！', 'ピカッ', 'ガッ', 'シュッ', 'ドキッ'];
  const MANGA_HUES = ['#d1193f', '#111111', '#0a64a4', '#ffe066', '#ff8fa6'];
  // L'encrage commence une fois les cases crayonnées.
  const INK_START = 520;
  // Les cases de la page, du plus grand cadre au plus petit : un calque est encré avec sa case.
  const PANELS = '.identity, .section, .colophon';

  // Lignes de concentration (集中線) : de fines pointes qui convergent vers le centre de l'écran
  // en laissant un cœur vide. Tracées dans un carré de 200 unités centré sur l'origine.
  function speedLines(count) {
    const at = (angle, radius) => `${(Math.cos(angle) * radius).toFixed(1)} ${(Math.sin(angle) * radius).toFixed(1)}`;
    let path = '';
    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2 + random(-0.03, 0.03);
      const spread = random(0.004, 0.014);
      path += `M${at(angle - spread, 150)}L${at(angle, random(34, 62))}L${at(angle + spread, 150)}Z`;
    }
    return `<svg viewBox="-100 -100 200 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><path d="${path}"/></svg>`;
  }

  const MANGA = {
    colors: MANGA_HUES,
    boxes: false,
    // Ordre de lecture d'un manga : les cases par rangées de haut en bas, de droite à gauche
    // dans une rangée ; dans une case, ligne par ligne, de droite à gauche. Le tout tient en
    // 3,2 s au plus, sous LONGEST.
    schedule(units) {
      const panels = new Map();
      for (const unit of units) {
        const frame = unit.element.closest(PANELS);
        const box = frame ? toPage(frame.getBoundingClientRect()) : unit.rect;
        if (!panels.has(frame)) panels.set(frame, { box, units: [] });
        panels.get(frame).units.push(unit);
      }
      const rightToLeft = (a, b) => b.x + b.w - (a.x + a.w);
      const rows = (items, rectOf, tolerance) => {
        const sorted = [...items].sort((a, b) => rectOf(a).y - rectOf(b).y);
        const grouped = [];
        for (const item of sorted) {
          const row = grouped.at(-1);
          if (row && rectOf(item).y - row.top < tolerance) row.items.push(item);
          else grouped.push({ top: rectOf(item).y, items: [item] });
        }
        return grouped.flatMap((row) => row.items.sort((a, b) => rightToLeft(rectOf(a), rectOf(b))));
      };
      const order = rows([...panels.values()], (panel) => panel.box, 40).flatMap((panel) =>
        rows(panel.units, (unit) => unit.rect, 8),
      );
      const step = Math.min(70, 1900 / order.length);
      order.forEach((unit, index) => {
        unit.color = pick([MANGA_HUES[0], MANGA_HUES[1], MANGA_HUES[2]]);
        unit.arrive = INK_START + index * step;
        unit.reveal = unit.arrive;
        unit.done = unit.reveal + 450;
      });
      return { agents: [], end: INK_START + (order.length - 1) * step + 700 };
    },
    begin(state) {
      state.t = 0;
      state.sfxAt = INK_START;
    },
    reveal(unit, point, world, state) {
      // Une onomatopée de temps en temps, plantée au-dessus du bloc qui vient d'être encré.
      if (state.t < state.sfxAt || unit.rect.w < 60 || Math.random() > 0.55) return;
      state.sfxAt = state.t + random(220, 380);
      const spot = { x: unit.rect.x + unit.rect.w * random(0.35, 0.95), y: unit.rect.y + random(-4, unit.rect.h * 0.4) };
      const sfx = spark('cv-build__sfx', spot, unit.color, world);
      sfx.textContent = pick(MANGA_SFX);
      sfx.style.setProperty('--_r', `${random(-16, 16).toFixed(1)}deg`);
    },
    frame(state, t) {
      state.t = t;
    },
    // Fin de l'épisode : lignes de vitesse et titre de l'épisode, une seconde et demie.
    finale() {
      const node = element('div', 'cv-build-flash', document.body);
      node.setAttribute('aria-hidden', 'true');
      element('div', 'cv-build-flash__lines', node).innerHTML = speedLines(140);
      const band = element('div', 'cv-build-flash__band', node);
      element('span', 'cv-build-flash__episode', band).textContent = '第1話';
      element('strong', 'cv-build-flash__title', band).textContent = '開発者、参上！';
      element('span', 'cv-build-flash__subtitle', band).textContent = fr('Épisode 1 : le développeur entre en scène !');
      return node;
    },
    status: (state) =>
      state.built
        ? `Encrage · ${state.built} / ${state.total} ${plural(state.total, 'bloc')} · sens de lecture ←`
        : 'Crayonné des cases…',
    done: (state, seconds) => `Chapitre 1 encré en ${seconds} s · lu de droite à gauche`,
  };

  const SKINS = { pro: PRO, tech: TECH, jdr: JDR, manga: MANGA };
  const skinOf = (theme) => ({ ...DEFAULT, ...SKINS[theme] });

  // ---------- Plan : qui construit quoi, et quand ----------

  function pointIn(rect) {
    return {
      x: rect.x + Math.min(rect.w - 4, 10 + Math.random() * Math.min(rect.w * 0.5, 90)),
      y: rect.y + Math.min(rect.h - 2, Math.max(6, rect.h * 0.6)),
    };
  }

  // Trajet courbe entre deux points : un agent ne se déplace jamais en ligne droite.
  function leg(from, to, start, duration) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const bend = (Math.random() - 0.5) * 0.5;
    const control = { x: from.x + dx / 2 - dy * bend, y: from.y + dy / 2 + dx * bend };
    return { from, to, control, start, arrive: start + duration };
  }

  function plan(units, home, crew, colors) {
    const count = clamp(crew.builders, 1, units.length);
    const span = clamp(units.length * 28, 1500, 2600);
    // Grande équipe : les départs se resserrent pour tenir la durée.
    const stagger = Math.min(45, 900 / count);
    const agents = [];
    for (let k = 0; k < count; k += 1) {
      // Chaque agent prend une tranche continue de la page : ils travaillent partout à la fois.
      const mine = units.slice(Math.floor((k * units.length) / count), Math.floor(((k + 1) * units.length) / count));
      const step = span / mine.length;
      const travel = clamp(step * 0.55, 60, 380);
      const hold = clamp(step * 0.3, 40, 200);
      const start = { x: home.x + (k - count / 2) * 6, y: home.y };
      const color = colors[k % colors.length];
      const legs = [];
      let position = start;
      mine.forEach((unit, index) => {
        const target = pointIn(unit.rect);
        const current = leg(position, target, 80 + k * stagger + index * step, travel);
        unit.agent = k;
        unit.color = color;
        unit.arrive = current.arrive;
        unit.reveal = current.arrive + hold;
        unit.done = unit.reveal + 320;
        legs.push(current);
        position = target;
      });
      // Retour à la barre d'état une fois la tranche finie.
      const back = leg(position, start, mine.at(-1).reveal + 140, 480);
      legs.push(back);
      agents.push({ color, legs, index: 0, start, leave: back.arrive, rank: k, idle: false });
    }
    let end = Math.max(...agents.map((agent) => agent.leave)) + 60;

    // Agents sans tranche : ils passent d'un calque à l'autre sans rien poser, et rentrent à l'heure.
    for (let j = 0; j < crew.idlers; j += 1) {
      const start = { x: home.x + (j - crew.idlers / 2) * 10, y: home.y + 8 };
      const legs = [];
      let position = start;
      let time = 160 + j * 120;
      while (time + 700 < end - 560) {
        const target = pointIn(pick(units).rect);
        const travel = random(420, 700);
        legs.push(leg(position, target, time, travel));
        position = target;
        time += travel + random(120, 360);
      }
      if (!legs.length) continue;
      const back = leg(position, start, Math.max(time, legs.at(-1).arrive + 60), 480);
      legs.push(back);
      agents.push({ color: '#5b6474', legs, index: 0, start, leave: back.arrive, rank: j, idle: true });
      end = Math.max(end, back.arrive + 60);
    }

    // Une très grande page ou une très grande équipe tiendrait plus longtemps : tout le plan
    // est alors resserré pour finir à l'heure.
    const squeeze = Math.min(1, LONGEST / end);
    if (squeeze < 1) {
      for (const agent of agents) {
        for (const current of agent.legs) {
          current.start *= squeeze;
          current.arrive *= squeeze;
        }
        agent.leave *= squeeze;
      }
      for (const unit of units) {
        unit.arrive *= squeeze;
        unit.reveal *= squeeze;
        unit.done *= squeeze;
      }
    }
    return { agents, end: end * squeeze };
  }

  function positionOf(agent, t) {
    const { legs } = agent;
    while (agent.index < legs.length - 1 && t >= legs[agent.index + 1].start) agent.index += 1;
    const current = legs[agent.index];
    if (t <= current.start) return current.from;
    if (t >= current.arrive) return current.to;
    const u = ease((t - current.start) / (current.arrive - current.start));
    const a = (1 - u) ** 2;
    const b = 2 * (1 - u) * u;
    const c = u ** 2;
    return {
      x: a * current.from.x + b * current.control.x + c * current.to.x,
      y: a * current.from.y + b * current.control.y + c * current.to.y,
    };
  }

  // ---------- Dessin ----------

  function drawBox(unit, state) {
    const box = element('div', 'cv-build__box', state.world);
    // Un peu plus grand que le calque, pour ne pas rogner le bord des lettres.
    const { x, y, w, h } = unit.rect;
    place(box, { x: x - 3, y: y - 3, w: w + 6, h: h + 6 });
    box.style.setProperty('--_c', unit.color);
    box.style.setProperty('--_life', `${Math.round(unit.done - unit.arrive)}ms`);
    unit.update = state.skin.box?.(unit, box, state);
    if (unit.rect.w >= 70) element('span', 'cv-build__tag', box).textContent = state.skin.tag(unit, state);
    return box;
  }

  // ---------- Barre d'état ----------

  function showHud(colors) {
    hideHud();
    hud = element('div', 'cv-build-hud', document.body);
    hud.setAttribute('role', 'group');
    hud.setAttribute('aria-label', 'Animation de construction de la page');
    const dots = element('span', 'cv-build-hud__dots', hud);
    dots.setAttribute('aria-hidden', 'true');
    for (const color of colors.slice(0, 5)) element('i', '', dots).style.background = color;
    const text = element('span', 'cv-build-hud__text', hud);
    const bar = element('span', 'cv-build-hud__bar', hud);
    bar.setAttribute('aria-hidden', 'true');
    const replay = element('button', 'cv-build-hud__button', hud);
    replay.type = 'button';
    replay.textContent = 'Rejouer';
    replay.hidden = true;
    replay.addEventListener('click', () => start());
    const skip = element('button', 'cv-build-hud__button', hud);
    skip.type = 'button';
    skip.dataset.buildSkip = '';
    skip.textContent = 'Passer';
    skip.addEventListener('click', () => finish());
    return { text, bar, replay, skip, timer: 0 };
  }

  function hideHud() {
    if (!hud) return;
    const node = hud;
    hud = null;
    node.remove();
  }

  function hideFlash() {
    flash?.remove();
    flash = null;
  }

  // ---------- Déroulé ----------

  // Rend la page dans son état normal, d'après le document lui-même : vaut aussi après une
  // construction interrompue par une erreur à mi-chemin.
  function stop() {
    if (run) {
      cancelAnimationFrame(run.frame);
      clearInterval(run.watchdog);
    }
    run = null;
    for (const node of document.querySelectorAll('[data-layer]')) delete node.dataset.layer;
    for (const node of document.querySelectorAll('.cv-build')) node.remove();
    root.removeAttribute('data-build');
    // À-coup de page en cours (habillage Tech).
    root.removeAttribute('data-glitch');
  }

  // Termine tout de suite : page complète, rien par-dessus.
  function finish() {
    stop();
    hideHud();
    hideFlash();
  }

  function start() {
    const refocus = Boolean(hud?.contains(document.activeElement));
    finish();
    try {
      begin();
    } catch (error) {
      finish();
      console.error('Animation de construction interrompue :', error);
    }
    if (refocus) run?.hud.skip.focus();
  }

  function begin() {
    root.dataset.build = 'running';
    const units = [];
    for (const layer of collectLayers()) {
      const box = layer.getBoundingClientRect();
      if (!inView(box)) continue;
      layer.dataset.layer = 'wait';
      units.push({ element: layer, rect: toPage(box) });
    }
    if (!units.length) {
      root.removeAttribute('data-build');
      return;
    }

    const skin = skinOf(root.dataset.theme);
    const overlay = element('div', 'cv-build');
    overlay.setAttribute('aria-hidden', 'true');
    const world = element('div', 'cv-build__world', overlay);
    const frames = [...(skin.frames === false ? [] : document.querySelectorAll(FRAMES))]
      .map((frame) => frame.getBoundingClientRect())
      .filter(inView)
      .slice(0, 40)
      .map((box, index) => {
        const frame = element('div', 'cv-build__frame', world);
        place(frame, toPage(box));
        frame.style.animationDelay = `${Math.min(index * 30, 450)}ms`;
        return frame;
      });

    const home = { x: scrollX + innerWidth / 2, y: scrollY + innerHeight - 44 };
    const { agents, end } = skin.schedule ? skin.schedule(units) : plan(units, home, skin.crew(units.length), skin.colors);
    const builders = agents.filter((agent) => !agent.idle).length;

    run = {
      skin,
      units,
      agents,
      frames,
      end,
      overlay,
      world,
      builders,
      idlers: agents.length - builders,
      built: 0,
      total: units.length,
      width: innerWidth,
      hud: null,
      // Le chrono part de la première image affichée : un onglet ouvert en arrière-plan joue
      // l'animation quand on y revient, pas dans le vide.
      started: null,
      frame: 0,
      // Garde-fou : une page visible qui cesse de dessiner des images (rendu sans écran, robot,
      // capture) ne doit pas rester masquée.
      alive: performance.now(),
      watchdog: 0,
    };
    skin.begin?.(run);
    for (const agent of agents) {
      agent.node = element('div', 'cv-build__agent', world);
      agent.node.style.setProperty('--_c', agent.color);
      if (agent.idle) agent.node.dataset.idle = '';
      skin.agent(agent.node, agent, run);
    }
    document.body.append(overlay);
    run.hud = showHud(agents.length ? agents.map((agent) => agent.color) : skin.colors);
    run.watchdog = setInterval(() => {
      if (run && document.visibilityState === 'visible' && performance.now() - run.alive > WATCHDOG) finish();
    }, 250);
    run.frame = requestAnimationFrame(tick);
  }

  function tick(now) {
    if (!run) return;
    run.started ??= now;
    run.alive = performance.now();
    const t = now - run.started;
    run.world.style.transform = `translate(${-scrollX}px, ${-scrollY}px)`;

    for (const agent of run.agents) {
      const point = positionOf(agent, t);
      agent.point = point;
      agent.node.style.transform = `translate(${point.x}px, ${point.y}px)`;
      agent.node.toggleAttribute('data-out', t > agent.leave - 120);
    }
    for (const unit of run.units) {
      if (run.skin.boxes !== false && !unit.box && !unit.drawn && t >= unit.arrive && t < unit.done) {
        unit.box = drawBox(unit, run);
        unit.drawn = true;
      }
      if (unit.box) unit.update?.(t);
      if (!unit.revealed && t >= unit.reveal) {
        unit.revealed = true;
        unit.element.dataset.layer = 'in';
        run.built += 1;
        // Sans équipe, le geste d'apparition part du centre du calque.
        const point = run.agents[unit.agent]?.point ?? { x: unit.rect.x + unit.rect.w / 2, y: unit.rect.y + unit.rect.h / 2 };
        run.skin.reveal(unit, point, run.world, run);
      }
      if (unit.box && t >= unit.done) {
        unit.box.remove();
        unit.box = null;
      }
    }
    if (t > run.end - 500) {
      for (const frame of run.frames) frame.dataset.out = '';
      run.overlay.dataset.out = '';
    }
    run.skin.frame?.(run, t);

    const { text, bar } = run.hud;
    text.textContent = run.skin.status(run);
    bar.style.setProperty('--p', String(run.built / run.total));

    if (t >= run.end) complete();
    else run.frame = requestAnimationFrame(tick);
  }

  // Fin naturelle : la page est rendue, la barre d'état annonce le résultat puis s'efface.
  // Durée annoncée : celle du plan, sans le temps éventuellement passé dans un autre onglet.
  function complete() {
    const state = run;
    const panel = run.hud;
    stop();
    const seconds = (state.end / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    panel.text.textContent = state.skin.done(state, seconds);
    panel.bar.style.setProperty('--p', '1');
    panel.replay.hidden = false;
    panel.skip.textContent = '×';
    panel.skip.setAttribute('aria-label', 'Fermer');
    // Salut final propre au thème : il s'efface de lui-même, Échap ou « × » l'ôtent aussitôt.
    flash = state.skin.finale?.() ?? null;
    if (flash) {
      const node = flash;
      node.addEventListener('animationend', () => flash === node && hideFlash(), { once: true });
      setTimeout(() => flash === node && hideFlash(), 1600);
    }
    const node = hud;
    panel.timer = setTimeout(() => {
      if (hud !== node) return;
      node.dataset.out = '';
      setTimeout(() => {
        if (hud === node) hideHud();
      }, 320);
    }, HUD_LINGER);
    // Un survol ou le clavier sur la barre la garde affichée.
    const keep = () => clearTimeout(panel.timer);
    node.addEventListener('pointerenter', keep, { once: true });
    node.addEventListener('focusin', keep, { once: true });
  }

  // ---------- Déclencheurs ----------

  document.addEventListener('cv:theme', () => {
    if (!reduced.matches) start();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && (run || hud || flash)) finish();
  });
  addEventListener('resize', () => {
    if (run && innerWidth !== run.width) finish();
  });
  addEventListener('beforeprint', finish);
  // De retour sur l'onglet, les images reprennent : le garde-fou leur laisse le temps d'arriver.
  document.addEventListener('visibilitychange', () => {
    if (run && document.visibilityState === 'visible') run.alive = performance.now();
  });

  if (root.dataset.build === 'pending') {
    if (reduced.matches || performance.now() > LATE_START) root.removeAttribute('data-build');
    else start();
  }
})();
