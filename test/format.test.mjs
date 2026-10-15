import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  escapeHtml,
  formatMonth,
  frenchSpaces,
  groupBy,
  initials,
  isIsoDate,
  periodHtml,
  periodText,
  skillRank,
  slug,
} from '../src/format.mjs';

test('escapeHtml neutralise les caractères spéciaux', () => {
  assert.equal(escapeHtml(`<a href="x">Tom & 'Jerry'</a>`), '&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;');
});

test('frenchSpaces rend insécable l’espace des ponctuations doubles', () => {
  const nbsp = String.fromCharCode(0xa0);
  assert.equal(frenchSpaces('Équipe ABL : oui ; non ? si !'), `Équipe ABL${nbsp}: oui${nbsp}; non${nbsp}? si${nbsp}!`);
  assert.equal(frenchSpaces('« citation »'), `«${nbsp}citation${nbsp}»`);
  assert.equal(frenchSpaces('https://exemple.fr/a?b=1'), 'https://exemple.fr/a?b=1');
});

test('formatMonth écrit le mois en français', () => {
  assert.equal(formatMonth('2023-01'), 'janvier 2023');
  assert.equal(formatMonth('2022-12'), 'décembre 2022');
  assert.equal(formatMonth('2026-10-13'), 'octobre 2026');
  assert.equal(formatMonth('2009'), '2009');
});

test('formatMonth refuse une date mal formée', () => {
  assert.throws(() => formatMonth('janvier 2023'), /Date invalide/);
  assert.throws(() => formatMonth('2023-13'), /Date invalide/);
});

test('periodText couvre les quatre formes de période', () => {
  assert.equal(periodText({ startDate: '2023-01' }), 'depuis janvier 2023');
  assert.equal(periodText({ startDate: '2019-03', endDate: '2022-05' }), 'mars 2019 – mai 2022');
  assert.equal(periodText({ endDate: '2009-06' }), 'juin 2009');
  assert.equal(periodText({ startDate: '2026-09', endDate: '2026-09' }), 'septembre 2026');
  assert.equal(periodText({ startDate: '2026-09-02', endDate: '2026-09-28' }), 'septembre 2026');
  assert.equal(periodText({}), '');
});

test('isIsoDate accepte AAAA, AAAA-MM et une vraie date AAAA-MM-JJ', () => {
  for (const value of ['2009', '2023-01', '2026-10-13', '2024-02-29']) assert.equal(isIsoDate(value), true, value);
  for (const value of ['2023-13', '2026-02-31', '2023-01-99', '2023-01-00', 'janvier 2023', 2023, undefined]) {
    assert.equal(isIsoDate(value), false, String(value));
  }
});

test('periodHtml balise les dates pour les machines', () => {
  assert.equal(
    periodHtml({ startDate: '2019-03', endDate: '2022-05' }),
    '<time datetime="2019-03">mars 2019</time> – <time datetime="2022-05">mai 2022</time>',
  );
});

test('skillRank suit l’échelle et refuse un niveau inconnu', () => {
  assert.equal(skillRank('Expert'), 5);
  assert.equal(skillRank('Intermédiaire'), 2);
  assert.throws(() => skillRank('Ninja'), /Niveau inconnu/);
});

test('slug, initials et groupBy', () => {
  assert.equal(slug('Bases de données'), 'bases-de-donnees');
  assert.equal(initials('Xavier Erb'), 'XE');
  assert.deepEqual(
    groupBy([{ c: 'a', n: 1 }, { c: 'b', n: 2 }, { c: 'a', n: 3 }], 'c').map((group) => [group.name, group.entries.length]),
    [['a', 2], ['b', 1]],
  );
});
