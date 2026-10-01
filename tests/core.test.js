import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initialFilters, filterPlants, summarize, radiusFor, groupPoints, placeLabels, overlaps, openingRange } from '../core.js';
const data = JSON.parse(readFileSync(new URL('../data/plants.json', import.meta.url)));
const all = filterPlants(data.sites, initialFilters());
test('reference fleet reconciles exactly', () => assert.deepEqual(summarize(all), { sites: 54, units: 94, mw: 96823, states: 28 }));
test('unique unit IDs and site totals reconcile', () => {
  assert.equal(new Set(all.map(p => p.id)).size, 54);
  for (const p of all) { assert.equal(p.mw, p.capacity_mw); assert.equal(p.included.length, new Set(p.included.map(u => u.unit)).size); }
});
test('Tennessee remains two sites, four units, 4523 MW', () => assert.deepEqual(summarize(filterPlants(data.sites, { ...initialFilters(), state: 'TN' })), { sites: 2, units: 4, mw: 4523, states: 1 }));
test('Vogtle dates and year cutoff do not imply all capacity existed in 1987', () => {
  const p = all.find(p => p.id === 'vogtle');
  assert.equal(openingRange(p), '1987–2024'); assert.equal(p.mw, 4530);
  const old = filterPlants(data.sites, { ...initialFilters(), query: 'vogtle', year: 1988 });
  assert.equal(old.length, 1); assert.equal(old[0].mw, 1150); assert.equal(old[0].included.length, 1);
});
test('minimum capacity is applied after the unit date filter', () => assert.equal(filterPlants(data.sites, { ...initialFilters(), query: 'vogtle', year: 1988, min: 2000 }).length, 0));
test('empty and case-insensitive searches', () => { assert.equal(filterPlants(data.sites, { ...initialFilters(), query: 'none-such' }).length, 0); assert.equal(filterPlants(data.sites, { ...initialFilters(), query: ' TENNESSEE ' }).length, 2); });
test('bubble area is proportional, date symbols are equal size', () => { assert.equal(radiusFor(4000, 'capacity') ** 2 / radiusFor(1000, 'capacity') ** 2, 4); assert.equal(radiusFor(4000, 'dates'), radiusFor(1000, 'dates')); });
test('proximity groups conserve power and plant membership', () => {
  const points = all.slice(0, 4).map((plant, i) => ({ plant, x: i < 3 ? i * 5 : 200, y: 100 }));
  const groups = groupPoints(points);
  assert.equal(groups.length, 2); assert.ok(groups.some(g => g.rows.length === 3));
  assert.equal(groups.reduce((n, g) => n + g.mw, 0), points.reduce((n, p) => n + p.plant.mw, 0));
  assert.equal(new Set(groups.flatMap(g => g.rows.map(p => p.id))).size, 4);
});
test('labels avoid obstacles, other labels and screen edges', () => {
  const groups = groupPoints(all.slice(0, 10).map((plant, i) => ({ plant, x: 100 + (i % 5) * 160, y: 160 + Math.floor(i / 5) * 170 })));
  const obstacle = { x: 0, y: 0, w: 280, h: 90 };
  const labels = placeLabels(groups, 1000, 500, [obstacle]);
  assert.ok(labels.length > 0);
  for (const l of labels) { assert.ok(l.x >= 8 && l.y >= 8 && l.x + l.w <= 992 && l.y + l.h <= 492); assert.ok(!overlaps(l, obstacle)); }
  for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) assert.ok(!overlaps(labels[i], labels[j]));
});
test('latest-unit sort recognizes expansions at older sites', () => assert.equal(filterPlants(data.sites, { ...initialFilters(), sort: 'newest' })[0].id, 'vogtle'));

test('nearby chains cannot swallow a whole region', () => {
  const points = all.slice(0, 3).map((plant, i) => ({ plant, x: i * 20, y: 100 }));
  const groups = groupPoints(points, 'capacity', 25);
  assert.equal(groups.length, 2);
  for (const g of groups) for (const a of g.members) for (const b of g.members) assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<25);
});
