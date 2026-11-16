// Animation de construction : au chargement et à chaque changement de thème, la fiche s'assemble
// calque par calque, dans le style du thème (son « habillage », voir SKINS) :
//   pro   une nuée de curseurs d'agents, flanqués de managers qui commentent, livrent la page ;
//   tech  des daemons déchiffrent la page sous une pluie de glyphes, façon intrusion de film ;
//   jdr   des feux follets tracent des cercles d'invocation et alignent les arcanes.
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

  // Pro : la page livrée « en mode projet » par une équipe pléthorique. Les managers ne posent
  // aucun calque : ils passent, commentent et comptent les réunions.
  const PRO_TITLES = [
    'Head of Padding', 'Chief Synergy Officer', 'Growth Hacker', 'Scrum Master', 'Product Owner', 'Coach agile',
    'Data Wizard', 'Change Manager', 'Chief Happiness Officer', 'VP Kerning', 'Lead Alignement', 'Brand Ambassador',
    'Ninja CSS', 'Évangéliste UX', 'Talent Partner', 'Consultant senior', 'Architecte solutions', 'Business Partner',
    'Head of Innovation', 'Pixel Officer', 'Agile Champion', 'Directeur de la vision', 'Head of Marges', 'Facilitateur',
    'Stagiaire', 'Office Manager', 'Expert ROI', 'Lead Disruption',
  ];
  const PRO_BOSSES = [
    'Manager · en réunion', 'N+2 · en copie', 'Consultant · 1500 €/j', 'Comité de pilotage', 'DRH · bienveillance',
    'PMO · reporting', 'Directeur · « ASAP »', 'Stagiaire · café',
  ];
  const PRO_WINS = [
    'Livré ✓', 'Quick win !', 'Synergie +12 %', 'KPI au vert', 'Aligné ✓', 'On itère', 'Pixel perfect', 'Validé N+1',
    'Scalable ✓', 'ROI ×3', 'Disruptif', 'Best practice', 'Craft ✓', 'Impact ✓', 'Process ✓', 'Agile ✓',
  ];
  const PRO_TALK = [
    'On cale un point ?', 'Je mets en copie', 'Petit point synchro', 'On en reparle en daily', 'Tu me fais un slide ?',
    'C\'est prioritaire', 'Pour hier', 'On challenge ça', 'Il faut plus de valeur', 'On garde le cap', 'Top, on scale',
    'Quel est le ROI ?', 'On fait un atelier ?', 'Je remonte au COMEX',
  ];

  const PRO = {
    colors: hues(28, 78, 50),
    crew: (count) => ({ builders: clamp(Math.ceil(count / 2), 8, 24), idlers: count >= 12 ? PRO_BOSSES.length : 2 }),
    begin(state) {
      state.titles = shuffle(PRO_TITLES);
      state.bosses = shuffle(PRO_BOSSES);
      state.meetings = 0;
      state.talk = 600;
    },
    agent(node, agent, state) {
      node.innerHTML = CURSOR;
      const name = element('span', 'cv-build__name', node);
      name.textContent = fr(agent.idle ? state.bosses[agent.rank % state.bosses.length] : state.titles[agent.rank % state.titles.length]);
    },
    tag: (unit) => label(unit.element),
    reveal(unit, point, world) {
      spark('cv-build__ripple', point, unit.color, world);
      if (Math.random() < 0.3) spark('cv-build__say', point, unit.color, world).textContent = fr(pick(PRO_WINS));
    },
    frame(state, t) {
      if (t < state.talk) return;
      state.talk = t + random(380, 650);
      const bosses = state.agents.filter((agent) => agent.idle && agent.point && t < agent.leave - 300);
      if (!bosses.length) return;
      const boss = pick(bosses);
      const bubble = spark('cv-build__say', boss.point, boss.color, state.world);
      bubble.dataset.boss = '';
      bubble.textContent = fr(pick(PRO_TALK));
      state.meetings += 1;
    },
    status: (state) =>
      `${state.builders} agents · ${state.idlers} ${plural(state.idlers, 'manager')} · ${state.built} / ${state.total} ${plural(state.total, 'calque')}`,
    done: (state, seconds) =>
      fr(`Page livrée par ${state.builders} agents en ${seconds} s · ${state.meetings} ${plural(state.meetings, 'réunion')} · 0 bug`),
  };

  // Tech : intrusion façon film. Une pluie de glyphes couvre l'écran puis se retire à mesure
  // que les daemons verrouillent et déchiffrent chaque bloc ; un journal égrène les clichés.
  const GLYPHS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789Z:.=*+<>#';
  const TECH_LOG = [
    'Connexion au mainframe…', 'Contournement du pare-feu…', 'ICE noir neutralisé', 'Injection du payload',
    'Déchiffrement AES-4096…', 'Trace IP brouillée', 'Lien neuronal établi', 'Réveille-toi…', 'Suis le lapin blanc',
    'Escalade de privilèges : root', 'Proxy en cascade : 7 nœuds', 'Hack the planet', 'Upload de conscience : 87 %',
  ];
  const glyphs = (count) => Array.from({ length: count }, () => pick(GLYPHS)).join('');
  const hex = () => `0x${Math.floor(random(0x1000, 0xffff)).toString(16).toUpperCase()}`;

  const TECH = {
    colors: ['#4bef88', '#22d3ee', '#ff2bd6', '#4bef88', '#f5f749', '#22d3ee', '#4bef88', '#ff2bd6', '#a3ff5c', '#22d3ee', '#4bef88', '#ff2bd6'],
    crew: (count) => ({ builders: clamp(Math.ceil(count / 5), 4, 12), idlers: 0 }),
    begin(state) {
      const ratio = Math.min(devicePixelRatio || 1, 1.5);
      const canvas = element('canvas', 'cv-build__rain', null);
      state.overlay.prepend(canvas);
      canvas.width = Math.round(innerWidth * ratio);
      canvas.height = Math.round(innerHeight * ratio);
      const context = canvas.getContext('2d');
      context.scale(ratio, ratio);
      context.font = '15px ui-monospace, Consolas, "MS Gothic", monospace';
      context.textBaseline = 'top';
      const columns = Math.ceil(innerWidth / 16);
      state.rain = {
        canvas,
        context,
        // Colonnes déjà en chute à l'arrivée : la pluie couvre l'écran dès la première image.
        drops: Array.from({ length: columns }, () => random(-innerHeight / 32, innerHeight / 20)),
        tints: Array.from({ length: columns }, () => (Math.random() < 0.12 ? pick(['#22d3ee', '#ff2bd6']) : '#4bef88')),
        last: -1,
      };
      state.console = element('ol', 'cv-build__console', state.overlay);
      state.log = shuffle(TECH_LOG).slice(0, 5);
      state.logged = 0;
      element('span', 'cv-build__scan', state.overlay);
    },
    agent(node) {
      node.innerHTML = '<span class="cv-build__reticle"></span>';
      element('span', 'cv-build__name', node).textContent = hex();
    },
    tag: () => `DECRYPT ${hex()}`,
    box(unit, box) {
      const noise = element('span', 'cv-build__noise', box);
      const count = Math.min(400, Math.ceil(unit.rect.w / 8) * Math.max(1, Math.round(unit.rect.h / 14)));
      let next = 0;
      return (t) => {
        if (t < next) return;
        next = t + 70;
        noise.textContent = glyphs(count);
      };
    },
    reveal(unit, point, world) {
      spark('cv-build__ripple', point, unit.color, world);
    },
    frame(state, t) {
      const { rain } = state;
      if (t - rain.last >= 33) {
        rain.last = t;
        const { context, drops, tints } = rain;
        context.globalCompositeOperation = 'destination-out';
        context.fillStyle = 'rgb(0 0 0 / 0.16)';
        context.fillRect(0, 0, innerWidth, innerHeight);
        context.globalCompositeOperation = 'source-over';
        drops.forEach((row, column) => {
          const y = row * 16;
          context.fillStyle = tints[column];
          context.fillText(pick(GLYPHS), column * 16, y - 16);
          context.fillStyle = '#eafff1';
          context.fillText(pick(GLYPHS), column * 16, y);
          drops[column] = y > innerHeight && Math.random() > 0.95 ? random(-8, 0) : row + 1;
        });
        rain.canvas.style.opacity = String(0.9 * (1 - state.built / state.total));
      }
      const due = Math.min(state.log.length, Math.floor(t / (state.end / state.log.length)) + 1);
      while (state.logged < due) {
        state.console.lastElementChild?.setAttribute('data-ok', '');
        element('li', '', state.console).textContent = fr(state.log[state.logged]);
        state.logged += 1;
      }
    },
    finale() {
      const node = element('div', 'cv-build-flash', document.body);
      node.setAttribute('aria-hidden', 'true');
      node.dataset.text = 'ACCÈS AUTORISÉ';
      node.textContent = 'ACCÈS AUTORISÉ';
      return node;
    },
    status: (state) => `${state.builders} daemons · ${state.built} / ${state.total} ${state.total > 1 ? 'blocs déchiffrés' : 'bloc déchiffré'}`,
    done: (state, seconds) => `Accès autorisé · page déchiffrée par ${state.builders} daemons en ${seconds} s`,
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

  const SKINS = { pro: PRO, tech: TECH, jdr: JDR };
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

  function showHud(agents) {
    hideHud();
    hud = element('div', 'cv-build-hud', document.body);
    hud.setAttribute('role', 'group');
    hud.setAttribute('aria-label', 'Animation de construction de la page');
    const dots = element('span', 'cv-build-hud__dots', hud);
    dots.setAttribute('aria-hidden', 'true');
    for (const agent of agents.slice(0, 5)) element('i', '', dots).style.background = agent.color;
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
    const frames = [...document.querySelectorAll(FRAMES)]
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
    const crew = skin.crew(units.length);
    const { agents, end } = plan(units, home, crew, skin.colors);
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
    run.hud = showHud(agents);
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
      if (!unit.box && !unit.drawn && t >= unit.arrive && t < unit.done) {
        unit.box = drawBox(unit, run);
        unit.drawn = true;
      }
      if (unit.box) unit.update?.(t);
      if (!unit.revealed && t >= unit.reveal) {
        unit.revealed = true;
        unit.element.dataset.layer = 'in';
        run.built += 1;
        run.skin.reveal(unit, run.agents[unit.agent].point, run.world, run);
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
