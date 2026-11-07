// Animation de construction : au chargement et à chaque changement de thème, des « agents »
// (curseurs de couleur) assemblent la fiche calque par calque. C'est un effet, rien de plus :
// la page est complète sans lui (sans JavaScript, à l'impression, avec « réduire les
// animations »), et « Passer » ou Échap le termine aussitôt.
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
(() => {
  'use strict';

  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const SCOPE = 'main, .colophon';
  // Cadres esquissés en pointillés pendant la construction.
  const FRAMES = '.identity, .section, .skill-group, .entry, .project';
  const COLORS = ['#ff4d8d', '#ffb020', '#2ee6a6', '#38bdf8', '#a78bfa', '#f97316', '#e879f9', '#facc15', '#22d3ee', '#fb7185', '#4ade80', '#818cf8'];
  // Au-delà, le visiteur a déjà trop attendu la page : elle s'affiche sans animation.
  const LATE_START = 2500;
  const HUD_LINGER = 2600;
  const WATCHDOG = 1000;
  const CURSOR =
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 1.5v11.6l3.1-2.9 2.2 4.6 2-.9-2.2-4.6h4.3z"/></svg>';

  let run = null;
  let hud = null;

  // ---------- Calques ----------

  const ownText = (element) =>
    [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.nodeValue.trim());

  const paints = (element) =>
    element.matches('img, svg, video, canvas, picture, hr') || ownText(element) || element.childElementCount === 0;

  function collectLayers() {
    const layers = [];
    const walk = (parent) => {
      for (const element of parent.children) {
        const style = getComputedStyle(element);
        if (style.display === 'none') continue;
        if (style.display !== 'contents' && paints(element)) {
          if (style.visibility === 'visible') layers.push(element);
          continue;
        }
        walk(element);
      }
    };
    for (const scope of document.querySelectorAll(SCOPE)) walk(scope);
    return layers;
  }

  const inView = (box) =>
    box.width >= 4 && box.height >= 4 && box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth;

  // Rectangle en coordonnées de la page : le calque de dessin suit le défilement.
  const toPage = (box) => ({ x: box.left + scrollX, y: box.top + scrollY, w: box.width, h: box.height });

  function label(element) {
    const name = element.classList[0];
    return `${element.tagName.toLowerCase()}${name ? `.${name}` : ''}`.slice(0, 28);
  }

  // ---------- Plan : qui construit quoi, et quand ----------

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const plural = (count, word) => (count > 1 ? `${word}s` : word);
  const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);

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

  function plan(units, home) {
    const agentCount = Math.min(units.length, COLORS.length, Math.max(4, Math.ceil(units.length / 6)));
    const span = clamp(units.length * 28, 1500, 2600);
    const agents = [];
    for (let k = 0; k < agentCount; k += 1) {
      // Chaque agent prend une tranche continue de la page : ils travaillent partout à la fois.
      const mine = units.slice(Math.floor((k * units.length) / agentCount), Math.floor(((k + 1) * units.length) / agentCount));
      const step = span / mine.length;
      const travel = clamp(step * 0.55, 60, 380);
      const hold = clamp(step * 0.3, 40, 200);
      const start = { x: home.x + (k - agentCount / 2) * 6, y: home.y };
      const legs = [];
      let position = start;
      mine.forEach((unit, index) => {
        const target = pointIn(unit.rect);
        const current = leg(position, target, 80 + k * 45 + index * step, travel);
        unit.agent = k;
        unit.color = COLORS[k];
        unit.arrive = current.arrive;
        unit.reveal = current.arrive + hold;
        unit.done = unit.reveal + 320;
        legs.push(current);
        position = target;
      });
      // Retour à la barre d'état une fois la tranche finie.
      const back = leg(position, start, mine.at(-1).reveal + 140, 480);
      legs.push(back);
      agents.push({ color: COLORS[k], legs, index: 0, start, leave: back.arrive });
    }
    const end = Math.max(...agents.map((agent) => agent.leave)) + 60;
    return { agents, end };
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

  function drawBox(unit, world) {
    const box = element('div', 'cv-build__box', world);
    // Un peu plus grand que le calque, pour ne pas rogner le bord des lettres.
    const { x, y, w, h } = unit.rect;
    place(box, { x: x - 3, y: y - 3, w: w + 6, h: h + 6 });
    box.style.setProperty('--_c', unit.color);
    box.style.setProperty('--_life', `${Math.round(unit.done - unit.arrive)}ms`);
    if (unit.rect.w >= 70) element('span', 'cv-build__tag', box).textContent = label(unit.element);
    return box;
  }

  function ripple(point, color, world) {
    const ring = element('span', 'cv-build__ripple', world);
    ring.style.left = `${point.x}px`;
    ring.style.top = `${point.y}px`;
    ring.style.setProperty('--_c', color);
    ring.addEventListener('animationend', () => ring.remove(), { once: true });
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
    const { agents, end } = plan(units, home);
    for (const agent of agents) {
      agent.node = element('div', 'cv-build__agent', world);
      agent.node.style.setProperty('--_c', agent.color);
      agent.node.innerHTML = CURSOR;
    }
    document.body.append(overlay);

    run = {
      units,
      agents,
      frames,
      end,
      overlay,
      world,
      built: 0,
      width: innerWidth,
      hud: showHud(agents),
      // Le chrono part de la première image affichée : un onglet ouvert en arrière-plan joue
      // l'animation quand on y revient, pas dans le vide.
      started: null,
      frame: 0,
      // Garde-fou : une page visible qui cesse de dessiner des images (rendu sans écran, robot,
      // capture) ne doit pas rester masquée.
      alive: performance.now(),
      watchdog: setInterval(() => {
        if (document.visibilityState === 'visible' && performance.now() - run.alive > WATCHDOG) finish();
      }, 250),
    };
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
        unit.box = drawBox(unit, run.world);
        unit.drawn = true;
      }
      if (!unit.revealed && t >= unit.reveal) {
        unit.revealed = true;
        unit.element.dataset.layer = 'in';
        run.built += 1;
        ripple(run.agents[unit.agent].point, unit.color, run.world);
      }
      if (unit.box && t >= unit.done) {
        unit.box.remove();
        unit.box = null;
      }
    }
    if (t > run.end - 500) for (const frame of run.frames) frame.dataset.out = '';

    const { text, bar } = run.hud;
    const agents = run.agents.length;
    const total = run.units.length;
    text.textContent = `${agents} ${plural(agents, 'agent')} · ${run.built} / ${total} ${plural(total, 'calque')}`;
    bar.style.setProperty('--p', String(run.built / run.units.length));

    if (t >= run.end) complete();
    else run.frame = requestAnimationFrame(tick);
  }

  // Fin naturelle : la page est rendue, la barre d'état annonce le résultat puis s'efface.
  // Durée annoncée : celle du plan, sans le temps éventuellement passé dans un autre onglet.
  function complete() {
    const agents = run.agents.length;
    const panel = run.hud;
    const elapsed = run.end;
    stop();
    const seconds = (elapsed / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    panel.text.textContent = `Page construite par ${agents} ${plural(agents, 'agent')} en ${seconds} s`;
    panel.bar.style.setProperty('--p', '1');
    panel.replay.hidden = false;
    panel.skip.textContent = '×';
    panel.skip.setAttribute('aria-label', 'Fermer');
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
    if (event.key === 'Escape' && (run || hud)) finish();
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
