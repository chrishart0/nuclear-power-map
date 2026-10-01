/** Pure data and screen-space layout helpers, shared by both map renderers. */
export const YEAR_MIN = 1969;
export const YEAR_MAX = 2024;
export const ERAS = [
  { id: 'early', label: '1969–1979', color: '#e7bb80', min: 1969, max: 1979 },
  { id: 'eighties', label: '1980–1989', color: '#99bcee', min: 1980, max: 1989 },
  { id: 'recent', label: '1990–2024', color: '#73d9c1', min: 1990, max: 2024 }
];
export const initialFilters = () => ({ query: '', state: '', type: '', min: 0, year: YEAR_MAX, sort: 'capacity' });
export const totalMW = units => units.reduce((sum, u) => sum + u.capacity_mw, 0);
export const yearOf = date => Number(date.slice(0, 4));
export const eraFor = date => ERAS.find(e => yearOf(date) <= e.max) || ERAS[2];
export const number = value => new Intl.NumberFormat('en-US').format(value);
export const power = mw => `${number(mw)} MW`;
export const compactPower = mw => `${(mw / 1000).toFixed(2)} GW`;
export const dateLabel = date => new Date(`${date}-01T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
export const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export function filterPlants(plants, filter) {
  const query = filter.query.trim().toLowerCase();
  const rows = plants.map(p => {
    const included = p.units.filter(u => yearOf(u.commercial_operation) <= filter.year);
    const dates = included.map(u => u.commercial_operation).sort();
    return { ...p, included, mw: totalMW(included), since: dates[0], latest: dates.at(-1) };
  }).filter(p => p.included.length && (!query || `${p.name} ${p.state} ${p.state_name}`.toLowerCase().includes(query)) && (!filter.state || p.state === filter.state) && (!filter.type || p.reactor_type === filter.type) && p.mw >= filter.min);
  const comparators = {
    capacity: (a, b) => b.mw - a.mw,
    name: (a, b) => a.name.localeCompare(b.name),
    oldest: (a, b) => a.since.localeCompare(b.since),
    newest: (a, b) => b.latest.localeCompare(a.latest)
  };
  return rows.sort((a, b) => (comparators[filter.sort] || comparators.capacity)(a, b) || a.name.localeCompare(b.name));
}
export function summarize(rows) {
  return { sites: rows.length, units: rows.reduce((n, p) => n + p.included.length, 0), mw: rows.reduce((n, p) => n + p.mw, 0), states: new Set(rows.map(p => p.state)).size };
}
// Radius, not area, must scale with the square root. One consistent scale at every zoom.
export const radiusFor = (mw, mode) => mode === 'dates' ? 8 : Math.sqrt(mw / 10);
export const openingRange = p => p.since.slice(0, 4) === p.latest.slice(0, 4) ? p.since.slice(0, 4) : `${p.since.slice(0, 4)}–${p.latest.slice(0, 4)}`;
export function groupPoints(points, mode = 'capacity', threshold = 25, scale = 1) {
  // Bounded groups, not transitive chains: a dense coast must not become one huge bubble.
  // Sort by ID so changing the sidebar sort never changes the map's groups.
  const groups = [];
  for (const point of [...points].sort((a, b) => a.plant.id.localeCompare(b.plant.id))) {
    const group = groups.find(members => members.every(p => Math.hypot(point.x - p.x, point.y - p.y) < threshold));
    if (group) group.push(point); else groups.push([point]);
  }
  return groups.map(members => {
    const rows = members.map(m => m.plant);
    const mw = rows.reduce((n, p) => n + p.mw, 0);
    const dates = rows.flatMap(p => p.included.map(u => u.commercial_operation)).sort();
    const radius = mode === 'dates' ? (members.length === 1 ? 8 : 15) : radiusFor(mw, mode) * scale;
    return { key: rows.map(p => p.id).sort().join('|'), members, rows, mw, since: dates[0], latest: dates.at(-1), x: members.reduce((n, m) => n + m.x, 0) / members.length, y: members.reduce((n, m) => n + m.y, 0) / members.length, radius };
  });
}
export const overlaps = (a, b, gap = 4) => a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
export function placeLabels(groups, width, height, obstacles = [], limit = 16, selected = '') {
  const occupied = [...obstacles, ...groups.map(g => ({ x: g.x - g.radius, y: g.y - g.radius, w: 2 * g.radius, h: 2 * g.radius }))];
  const placed = [];
  const ordered = [...groups].sort((a, b) => Number(b.rows.some(p => p.id === selected)) - Number(a.rows.some(p => p.id === selected)) || b.mw - a.mw);
  for (const g of ordered) {
    if (placed.length >= limit) break;
    const text = g.rows.length === 1 ? g.rows[0].name : `${g.rows.length} nearby plants`;
    const w = Math.min(200, Math.max(132, text.length * 6.4 + 16)), h = 40, pad = g.radius + 7;
    const candidates = [{ x: g.x + pad, y: g.y - h / 2 }, { x: g.x - pad - w, y: g.y - h / 2 }, { x: g.x - w / 2, y: g.y - pad - h }, { x: g.x - w / 2, y: g.y + pad }];
    for (const c of candidates) {
      const rect = { ...c, w, h };
      if (c.x < 8 || c.y < 8 || c.x + w > width - 8 || c.y + h > height - 8 || occupied.some(o => overlaps(rect, o))) continue;
      placed.push({ ...rect, group: g }); occupied.push(rect); break;
    }
  }
  return placed;
}
