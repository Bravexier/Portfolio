// Décor animé propre à chaque thème, peint derrière la fiche et visible dans l'espace libre de
// part et d'autre :
//   pro   vagues « corporate » et phrases de recruteur qui défilent sur les côtés ;
//   tech  pluie de glyphes, terminaux qui défilent, éditeurs de code qui vont et viennent ;
//   jdr   paysage de fantasy au crépuscule, un dragon dans le ciel, un archimage dans le coin.
// Pure décoration : le calque est aria-hidden, ne capte jamais la souris et reste sous la fiche,
// opaque (z-index négatif, voir static/base.css). Rien à l'impression, sans JavaScript ni pour qui
// a demandé moins d'animations. Les éléments de côté n'apparaissent que là où la place existe ;
// les minuteurs se taisent quand l'onglet est caché.
(() => {
  'use strict';

  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const sheet = document.querySelector('main');
  // Largeur libre minimale d'un côté pour y poser un élément de décor.
  const ROOM = 150;

  let layer = null;
  let scene = null;
  const room = { left: 0, right: 0, width: 0, height: 0 };

  // ---------- Outils ----------

  const random = (min, max) => min + Math.random() * (max - min);
  const int = (min, max) => Math.floor(random(min, max + 1));
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  // Espace fine insécable devant la ponctuation haute, écrite par son code (voir les tests).
  const fr = (text) => text.replace(/ ([?!:;%€»])/g, '\u202f$1').replace(/« /g, '«\u202f');
  const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function element(tag, className, parent) {
    const node = document.createElement(tag);
    node.className = className;
    parent?.append(node);
    return node;
  }

  // Les côtés qui ont la place, du plus large au plus étroit.
  const sides = (min = ROOM) => ['left', 'right'].filter((side) => room[side] >= min);

  // Retire un élément à la fin de son animation de sortie (ou tout de suite s'il n'en a pas).
  function leave(node) {
    node.dataset.out = '';
    const gone = () => node.remove();
    node.addEventListener('animationend', gone, { once: true });
    setTimeout(gone, 1200);
  }

  // ---------- Pro : vagues et phrases de recruteur ----------

  const PRO_WORDS = [
    'Synergie', 'Agilité', 'Résilience', 'Impact', 'Bienveillance', 'Leadership', 'Excellence', 'Innovation',
    'Engagement', 'Talent', 'Ownership', 'Disruption', 'Scalabilité', 'Proactivité', 'Polyvalence', 'Alignement',
    'Co-construction', 'Transversalité', 'Empowerment', 'Savoir-être', 'Mindset', 'Valeur ajoutée',
  ];
  const PRO_TAGS = [
    'Force de proposition', 'Esprit d\'équipe', 'Orienté solutions', 'Rigueur et autonomie', 'Capacité d\'adaptation',
    'Sens du résultat', 'Culture du feedback', 'Intelligence collective', 'Leadership bienveillant', 'Soft skills validées',
    'Sort de sa zone de confort', 'Montée en compétences', 'Vision à 360°', 'Fit culturel', 'Team player', 'Growth mindset',
    'Esprit start-up', 'Excellence opérationnelle', 'Agile à l\'échelle', 'Marque employeur', 'Transformation digitale',
    'Quick wins', 'Approche holistique', 'Pensée out of the box', 'Conduite du changement', 'Valeurs partagées',
    'Expérience collaborateur', 'Être moteur', 'Sait rebondir', 'Prise de hauteur', 'Création de valeur', 'Pro-activité',
  ];
  const PRO_KPIS = [
    ['Fit culturel', '98 %'], ['Synergie', '+38 %'], ['Engagement', '+24 %'], ['Soft skills', '5/5'], ['Matching IA', '97 %'],
    ['Potentiel', 'Élevé'], ['Bienveillance', '100 %'], ['Time-to-hire', '−12 j'], ['NPS candidat', '9,8'],
    ['Proactivité', '+42 %'], ['Leadership', 'A+'], ['Onboarding', 'Fluide'],
  ];
  const PRO_QUOTES = [
    'Ici, on ne travaille pas : on co-construit.', 'Une équipe, une vision, un impact.', 'Le talent, c\'est l\'humain augmenté.',
    'Nous sommes une famille agile.', 'Seul on va vite, ensemble on scale.', 'L\'échec est une opportunité d\'apprendre.',
    'Pensez client, agissez collectif.', 'Votre potentiel, notre ADN.', 'Chez nous, chaque idée compte (après validation).',
  ];

  // Vague périodique : la somme de sinus revient au même point toutes les 1440 unités, le tracé
  // de 2880 se répète donc sans couture en glissant de la moitié de sa largeur.
  function wave(base, terms, filled) {
    let path = '';
    for (let x = 0; x <= 2880; x += 16) {
      const y = terms.reduce((sum, [k, amplitude, phase]) => sum + amplitude * Math.sin((2 * Math.PI * k * x) / 1440 + phase), base);
      path += `${x ? 'L' : 'M'}${x} ${y.toFixed(1)}`;
    }
    if (filled) path += 'L2880 320L0 320Z';
    return `<svg class="cv-ambient__wave" viewBox="0 0 2880 320" preserveAspectRatio="none"><path d="${path}"/></svg>`;
  }

  // Une phrase toutes les 1,7 s, en alternant les côtés.
  const SPAWN = 1700;

  function pro(stage) {
    stage.innerHTML = [
      '<div class="cv-ambient__glow"></div>',
      wave(150, [[1, 34, 0], [2, 14, 1.3]], false),
      wave(170, [[1, 26, 2.1], [3, 10, 0.4]], false),
      wave(190, [[1, 30, 0.7], [2, 12, 2.4]], true),
      wave(220, [[1, 22, 3.1], [2, 16, 0.2]], true),
      wave(250, [[2, 14, 1.7], [1, 18, 4.2]], true),
    ].join('');
    let turn = 0;

    const phrase = (delay = 0) => {
      const free = sides();
      if (!free.length) return;
      const side = free[turn++ % free.length];
      const roll = Math.random();
      const kind = roll < 0.45 ? 'tag' : roll < 0.7 ? 'word' : roll < 0.85 ? 'kpi' : 'quote';
      const node = element('p', 'cv-ambient__phrase', stage);
      node.dataset.kind = kind;
      if (kind === 'kpi') {
        const [name, value] = pick(PRO_KPIS);
        element('span', 'cv-ambient__kpi-name', node).textContent = name;
        element('strong', 'cv-ambient__kpi-value', node).textContent = fr(value);
      } else if (kind === 'quote') {
        node.textContent = fr(`« ${pick(PRO_QUOTES)} »`);
      } else {
        node.textContent = fr(pick(kind === 'word' ? PRO_WORDS : PRO_TAGS));
      }
      const width = room[side] - 32;
      node.style.maxWidth = `${width}px`;
      node.style[side] = `${Math.round(random(16, Math.max(16, room[side] - 16 - Math.min(width, node.offsetWidth))))}px`;
      node.style.animationDelay = `${delay}s`;
      node.addEventListener('animationend', () => node.remove(), { once: true });
    };

    // Toutes montent à la même vitesse : l'écart entre deux phrases d'un même côté ne se
    // referme jamais. L'écran n'est pas vide à l'arrivée : quelques-unes sont déjà en chemin.
    for (let index = 8; index > 0; index -= 1) phrase(-index * SPAWN * 0.001 - random(0, 0.4));
    return { timers: [setInterval(() => !document.hidden && phrase(), SPAWN)] };
  }

  // ---------- Tech : pluie, terminaux et éditeurs ----------

  const GLYPHS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ01234567892Z:.=*+<>';
  const ip = () => `${int(10, 223)}.${int(0, 255)}.${int(0, 255)}.${int(1, 254)}`;
  const fixed = (min, max, digits = 1) => random(min, max).toFixed(digits);
  const hexByte = () => int(0, 255).toString(16).padStart(2, '0');

  // Sessions de terminal : une commande, puis sa sortie, ligne à ligne.
  const SESSIONS = [
    () => ['$ npm ci', `added ${int(800, 1500)} packages in ${fixed(2, 9)}s`, `${int(80, 200)} packages are looking for funding`, '$ npm run build', '> vite build', `✓ ${int(120, 400)} modules transformed.`, `dist/index.js  ${fixed(40, 180)} kB │ gzip: ${fixed(10, 60)} kB`, `✓ built in ${fixed(1, 4, 2)}s`],
    () => ['$ docker build -t cv:latest .', 'Step 1/7 : FROM node:24-alpine', ' ---> 4f2a9c11d0e3', 'Step 4/7 : RUN make synergy', ` ---> Running in ${hexByte()}${hexByte()}${hexByte()}`, 'Step 7/7 : CMD ["node", "server.js"]', 'Successfully built 8e1f00c3b2a7', 'Successfully tagged cv:latest'],
    () => ['$ kubectl get pods -n prod', 'NAME                 READY  STATUS', ...Array.from({ length: 4 }, () => `cv-web-${hexByte()}${hexByte()}-x${int(1, 9)}k  1/1    Running`), '$ kubectl rollout status deploy/cv', '[+] deployment "cv" successfully rolled out'],
    () => [`$ ssh root@${ip()}`, '[*] Warning: Permanently added (ED25519)', 'root@mainframe:~# whoami', 'root', 'root@mainframe:~# ./crack --shadow', '[*] 3 hashes · rainbow table…', '[+] mot de passe : hunter2', '[+] ACCÈS AUTORISÉ'],
    () => [`$ nmap -sS ${int(10, 192)}.${int(0, 168)}.13.0/24`, `Nmap scan report for ${ip()}`, '22/tcp    open   ssh', '80/tcp    open   http', '443/tcp   open   https', '1337/tcp  open   waste', '[*] 3 hosts up · 7 ports filtrés'],
    () => ['$ git push origin main', 'Enumerating objects: 42, done.', 'Counting objects: 100% (42/42), done.', 'Writing objects: 100% (42/42), 6.66 KiB', `   ${hexByte()}${hexByte()}a1c..${hexByte()}${hexByte()}f5d  main -> main`],
    () => ['$ tail -f /var/log/nginx/access.log', ...Array.from({ length: 12 }, () => `${ip()} "GET /${pick(['', 'cv.md', 'resume.json', 'assets/app.js', 'wp-admin', '.env'])} HTTP/2" ${pick([200, 200, 200, 304, 404, 403])}`)],
    () => ['$ ping -c 5 1.1.1.1', ...Array.from({ length: 5 }, (_, index) => `64 bytes from 1.1.1.1: icmp_seq=${index + 1} ttl=57 time=${fixed(9, 16)} ms`), '5 packets transmitted, 5 received, 0% packet loss'],
    () => ['$ cargo build --release', '   Compiling libc v0.2.155', '   Compiling neural-link v0.4.2', '   Compiling ice-breaker v1.3.0', `    Finished release [optimized] in ${fixed(8, 30)}s`, '$ ./target/release/ice-breaker --target ICE', '[*] daemon injecté dans le noeud 7', '[+] ICE neutralisé'],
    () => ['$ python3 train.py --epochs 42', ...Array.from({ length: 6 }, (_, index) => `Epoch ${index + 1}/42 ━━━━━━━━━━ loss: ${(0.7 / (index + 1.4)).toFixed(4)}`), '[*] early stopping : la synergie a convergé'],
  ];

  const SNIPPETS = [
    {
      file: 'swarm.ts',
      code: [
        'import { swarm } from "./agents";',
        '',
        'const crew = await swarm.spawn(24);',
        'for (const layer of page.layers) {',
        '  const agent = crew.next();',
        '  await agent.build(layer, { synergy: true });',
        '}',
        '// TODO: retirer les managers',
        'export default page.ship();',
      ],
    },
    {
      file: 'hack.py',
      code: [
        'def breach(target: str) -> bool:',
        '    payload = forge(target, cipher="aes-4096")',
        '    for proxy in chain(7):',
        '        payload = proxy.bounce(payload)',
        '    if ice.detect(payload):',
        '        return False  # flatline',
        '    return mainframe.inject(payload)',
      ],
    },
    {
      file: 'main.rs',
      code: [
        'fn main() -> Result<(), Ice> {',
        '    let mut link = NeuralLink::open("/dev/brain0")?;',
        '    link.jack_in()?;',
        '    loop {',
        '        link.upload(conscience())?;',
        '    }',
        '}',
      ],
    },
    {
      file: 'talents.sql',
      code: [
        'SELECT nom, competences',
        'FROM candidats',
        'WHERE passion = \'code\'',
        '  AND cafes_par_jour > 3',
        'ORDER BY curiosite DESC',
        'LIMIT 1;',
        '-- 1 ligne : le bon profil',
      ],
    },
    {
      file: 'deck.go',
      code: [
        'func (c *Cyberdeck) Breach(ice *ICE) error {',
        '\tfor _, port := range c.Scan(ice) {',
        '\t\tif port.Open {',
        '\t\t\treturn c.Inject(port, payload)',
        '\t\t}',
        '\t}',
        '\treturn ErrFlatlined',
        '}',
      ],
    },
  ];

  const TOKENS =
    /(\/\/.*|#.*|--.*)|("[^"]*"?|'[^']*'?)|\b(import|from|const|let|mut|await|for|of|in|if|return|export|default|def|fn|loop|func|range|SELECT|FROM|WHERE|AND|ORDER|BY|DESC|LIMIT|true|false)\b|\b(\d[\d.]*)\b/g;
  const KINDS = ['', 'c', 's', 'k', 'n'];

  // Coloration syntaxique d'une ligne, sur du texte déjà échappé.
  const highlight = (line) =>
    escape(line.replace(/\t/g, '  ')).replace(TOKENS, (...match) => {
      const index = match.slice(1, 5).findIndex(Boolean) + 1;
      return `<span class="${KINDS[index]}">${match[0]}</span>`;
    });

  // Classe d'une ligne de terminal, d'après son début.
  const tone = (line) =>
    /^(\$|root@|>)/.test(line) ? 'p' : /^(✓|\[\+\]|Successfully)/.test(line) ? 'ok' : /^\[\*\]/.test(line) ? 'warn' : /404|403|ERR/.test(line) ? 'err' : '';

  // Une fenêtre : barre de titre, écran. `tick` avance son contenu ; elle part seule à la fin.
  function frame(stage, slot, kind, title) {
    const node = element('div', 'cv-ambient__win', stage);
    node.dataset.kind = kind;
    node.style[slot.side] = `${slot.x}px`;
    node.style.top = `${slot.y}px`;
    node.style.width = `${slot.w}px`;
    node.style.height = `${slot.h}px`;
    const bar = element('div', 'cv-ambient__bar', node);
    element('span', 'cv-ambient__title', bar).textContent = title;
    const screen = element('div', 'cv-ambient__screen', node);
    return { node, screen, rows: Math.max(3, Math.floor((slot.h - 30) / 14)) };
  }

  function shell(stage, slot) {
    const lines = [...pick(SESSIONS)(), ...pick(SESSIONS)()];
    const win = frame(stage, slot, 'shell', pick(['bash — deploy@prod', 'zsh — ~/ops', 'root@mainframe', 'ssh — node-07', 'fish — ~/cv']));
    let line = 0;
    let typed = 0;
    let current = null;
    let wait = 0;
    return {
      ...win,
      life: 15000,
      tick() {
        if (wait-- > 0 || line >= lines.length) return;
        const text = lines[line];
        if (!current) {
          current = element('div', tone(text), win.screen);
          while (win.screen.childElementCount > win.rows) win.screen.firstElementChild.remove();
        }
        // Les commandes se tapent, les sorties tombent d'un bloc.
        typed = tone(text) === 'p' ? Math.min(text.length, typed + int(1, 3)) : text.length;
        current.textContent = fr(text.slice(0, typed));
        if (typed >= text.length) {
          line += 1;
          typed = 0;
          current = null;
          wait = tone(lines[line] ?? '') === 'p' ? int(6, 12) : int(0, 3);
        }
      },
    };
  }

  function top(stage, slot) {
    const win = frame(stage, slot, 'top', 'htop — mainframe');
    const tasks = ['ice-breaker', 'neural-linkd', 'synergyd', 'node', 'matrix-rain', 'kubelet', 'sshd', 'cyberdeck', 'chrome'];
    const bar = (value, width) => `[${'|'.repeat(Math.round(value * width)).padEnd(width)}]`;
    const width = clamp(Math.floor((slot.w - 90) / 7), 6, 24);
    let every = 0;
    return {
      ...win,
      life: random(10000, 14000),
      tick() {
        if (every-- > 0) return;
        every = 7;
        const cpus = Array.from({ length: 4 }, (_, index) => {
          const value = random(0.1, 0.98);
          return `<div><span class="k">CPU${index}</span> ${bar(value, width)} ${Math.round(value * 100)}%</div>`;
        });
        const memory = random(0.4, 0.9);
        const rows = tasks
          .map((name) => [int(1, 9999), random(0, 60), name])
          .sort((a, b) => b[1] - a[1])
          .slice(0, Math.max(1, win.rows - 6))
          .map(([pid, cpu, name]) => `<div>${String(pid).padStart(4)} root ${cpu.toFixed(1).padStart(4)} <span class="ok">${name}</span></div>`);
        win.screen.innerHTML = [
          ...cpus,
          `<div><span class="k">MEM </span> ${bar(memory, width)} ${(memory * 16).toFixed(1)}G</div>`,
          '<div class="warn"> PID USER CPU% CMD</div>',
          ...rows,
        ].join('');
      },
    };
  }

  function dump(stage, slot) {
    const win = frame(stage, slot, 'hex', pick(['xxd /dev/mem', 'gdb — ice-breaker', 'hexdump — payload.bin']));
    const bytes = clamp(Math.floor((slot.w - 90) / 21), 2, 8);
    let address = int(0x10000, 0xfffff) * 16;
    return {
      ...win,
      life: random(8000, 12000),
      tick() {
        const row = element('div', '', win.screen);
        if (Math.random() < 0.06) {
          row.className = 'ok';
          row.textContent = fr(`>> signature trouvée : 0x${hexByte()}${hexByte()}BEEF`);
        } else {
          const data = Array.from({ length: bytes }, hexByte);
          const ascii = data.map((byte) => (parseInt(byte, 16) > 32 && parseInt(byte, 16) < 127 ? String.fromCharCode(parseInt(byte, 16)) : '.')).join('');
          row.innerHTML = `<span class="k">${address.toString(16).padStart(8, '0')}</span> ${data.join(' ')} <span class="c">${escape(ascii)}</span>`;
          address += bytes;
        }
        while (win.screen.childElementCount > win.rows) win.screen.firstElementChild.remove();
      },
    };
  }

  function editor(stage, slot) {
    const { file, code } = pick(SNIPPETS);
    const flavor = Math.random() < 0.3 ? 'vim' : 'code';
    const win = frame(stage, slot, 'ide', flavor === 'vim' ? `vim ${file}` : `${file} — Visual Studio Code`);
    win.node.dataset.flavor = flavor;
    const status = element('div', 'cv-ambient__status', win.node);
    status.textContent = flavor === 'vim' ? '-- INSERT --' : `main ✓  Ln 1, Col 1  UTF-8  ${file.split('.').pop()}`;
    const rows = code.map((_, index) => {
      const row = element('div', '', win.screen);
      row.dataset.line = String(index + 1);
      return row;
    });
    let line = 0;
    let typed = 0;
    return {
      ...win,
      life: 16000,
      tick() {
        if (line >= code.length) {
          win.node.dataset.done = '';
          return;
        }
        typed = Math.min(code[line].length, typed + int(1, 4));
        rows[line].innerHTML = highlight(code[line].slice(0, typed));
        rows[line].dataset.active = '';
        if (flavor === 'code') status.textContent = `main ✓  Ln ${line + 1}, Col ${typed + 1}  UTF-8`;
        if (typed >= code[line].length) {
          delete rows[line].dataset.active;
          line += 1;
          typed = 0;
        }
      },
    };
  }

  const WINDOWS = [shell, shell, shell, editor, editor, editor, top, dump, dump];

  function tech(stage) {
    stage.innerHTML = '<canvas class="cv-ambient__rain"></canvas><div class="cv-ambient__grid"></div>';
    const canvas = stage.querySelector('canvas');
    const context = canvas.getContext('2d');
    const windows = new Set();
    let columns = [];
    let slots = [];
    let frameId = 0;
    let last = 0;

    // Colonnes de pluie et emplacements des fenêtres, dans l'espace libre de chaque côté.
    const layout = () => {
      const ratio = Math.min(devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(room.width * ratio);
      canvas.height = Math.round(room.height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.font = '14px ui-monospace, Consolas, "MS Gothic", monospace';
      context.textBaseline = 'top';
      columns = [];
      for (const [from, to] of [[0, room.left], [room.width - room.right, room.width]]) {
        for (let x = from + 4; x + 14 <= to - 4; x += 18) {
          columns.push({
            x,
            y: random(-room.height, 0),
            speed: random(0.5, 1.1),
            tint: Math.random() < 0.15 ? pick(['#22d3ee', '#ff2bd6']) : '#4bef88',
          });
        }
      }
      for (const win of windows) leave(win.node);
      windows.clear();
      slots = [];
      const count = clamp(Math.floor(room.height / 240), 2, 5);
      const height = room.height / count;
      for (const side of sides(170)) {
        const w = Math.min(room[side] - 28, 400);
        for (let index = 0; index < count; index += 1) {
          slots.push({ side, x: Math.round((room[side] - w) / 2), y: Math.round(index * height + 12), w, h: Math.round(Math.min(height - 24, 300)), busy: false });
        }
      }
      cancelAnimationFrame(frameId);
      context.clearRect(0, 0, room.width, room.height);
      if (columns.length) frameId = requestAnimationFrame(rain);
    };

    function rain(now) {
      frameId = requestAnimationFrame(rain);
      if (now - last < 50) return;
      last = now;
      context.globalCompositeOperation = 'destination-out';
      context.fillStyle = 'rgb(0 0 0 / 0.1)';
      context.fillRect(0, 0, room.width, room.height);
      context.globalCompositeOperation = 'source-over';
      for (const column of columns) {
        context.fillStyle = column.tint;
        context.fillText(pick(GLYPHS), column.x, column.y - 18);
        context.fillStyle = '#e9fff0';
        context.fillText(pick(GLYPHS), column.x, column.y);
        column.y += 18 * column.speed;
        if (column.y > room.height + 40 && Math.random() > 0.96) column.y = random(-200, 0);
      }
    }

    const open = () => {
      const free = slots.filter((slot) => !slot.busy);
      if (!free.length || free.length < slots.length * 0.4) return;
      const slot = pick(free);
      const win = pick(WINDOWS)(stage, slot);
      slot.busy = true;
      win.slot = slot;
      win.born = performance.now();
      windows.add(win);
    };

    const step = () => {
      const now = performance.now();
      for (const win of windows) {
        win.tick();
        if (now - win.born > win.life) {
          windows.delete(win);
          win.slot.busy = false;
          leave(win.node);
        }
      }
    };

    layout();
    for (let index = 0; index < 2; index += 1) open();
    return {
      resize: layout,
      stop: () => cancelAnimationFrame(frameId),
      timers: [setInterval(() => !document.hidden && open(), 1600), setInterval(() => !document.hidden && step(), 80)],
    };
  }

  // ---------- JDR : paysage, dragon, archimage ----------

  function jdr(stage) {
    stage.innerHTML = [
      '<div class="cv-ambient__sky"></div>',
      '<div class="cv-ambient__stars"></div>',
      '<div class="cv-ambient__moon"></div>',
      '<div class="cv-ambient__clouds"></div>',
      '<div class="cv-ambient__dragon"><i></i></div>',
      '<div class="cv-ambient__mountains"></div>',
      '<div class="cv-ambient__castle"></div>',
      '<div class="cv-ambient__forest"></div>',
      '<div class="cv-ambient__mist"></div>',
      '<div class="cv-ambient__mage"></div>',
    ].join('');
    const dragon = stage.querySelector('.cv-ambient__dragon');
    // À chaque passage, le dragon change d'altitude et de distance.
    const course = () => {
      dragon.style.setProperty('--alt', `${random(4, 26).toFixed(1)}vh`);
      dragon.style.setProperty('--size', random(0.7, 1.15).toFixed(2));
    };
    course();
    dragon.addEventListener('animationiteration', course);

    const mote = () => {
      const free = sides(60);
      if (!free.length) return;
      const side = pick(free);
      const node = element('span', 'cv-ambient__mote', stage);
      node.style[side] = `${random(8, room[side] - 8).toFixed(0)}px`;
      node.style.top = `${random(35, 95).toFixed(1)}%`;
      node.style.setProperty('--d', `${random(5, 9).toFixed(1)}s`);
      node.style.setProperty('--dx', `${random(-40, 40).toFixed(0)}px`);
      node.addEventListener('animationend', () => node.remove(), { once: true });
    };
    return { timers: [setInterval(() => !document.hidden && mote(), 450)] };
  }

  const SCENES = { pro, tech, jdr };

  // ---------- Montage ----------

  function measure() {
    if (!layer) return;
    const box = sheet.getBoundingClientRect();
    room.width = root.clientWidth;
    room.height = innerHeight;
    room.left = Math.max(0, Math.round(box.left));
    room.right = Math.max(0, Math.round(room.width - box.right));
    layer.style.setProperty('--room-left', `${room.left}px`);
    layer.style.setProperty('--room-right', `${room.right}px`);
    layer.toggleAttribute('data-wide', room.left >= 220);
  }

  function unmount() {
    if (scene) {
      scene.stop?.();
      for (const timer of scene.timers ?? []) clearInterval(timer);
    }
    layer?.remove();
    layer = null;
    scene = null;
  }

  function mount() {
    unmount();
    const make = SCENES[root.dataset.theme];
    if (!make || reduced.matches || !sheet) return;
    layer = element('div', 'cv-ambient');
    layer.setAttribute('aria-hidden', 'true');
    layer.dataset.scene = root.dataset.theme;
    document.body.prepend(layer);
    measure();
    try {
      scene = make(layer);
    } catch (error) {
      unmount();
      console.error('Décor animé interrompu :', error);
    }
  }

  let pending = 0;
  const resized = () => {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => {
      const before = `${room.left} ${room.right} ${room.height}`;
      measure();
      if (layer && before !== `${room.left} ${room.right} ${room.height}`) scene?.resize?.();
    });
  };

  document.addEventListener('cv:theme', mount);
  reduced.addEventListener('change', mount);
  addEventListener('resize', resized);
  if (sheet && 'ResizeObserver' in window) new ResizeObserver(resized).observe(sheet);
  mount();
})();
