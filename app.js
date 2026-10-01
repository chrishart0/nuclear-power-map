import { YEAR_MIN, YEAR_MAX, ERAS, initialFilters, filterPlants, summarize, yearOf, eraFor, number, power, compactPower, dateLabel, openingRange, escapeHTML as esc } from './core.js';
import { createAtlasMap } from './map.js';

const $ = id => document.getElementById(id);
const filter = initialFilters();
const ui = { mode: 'capacity', selected: null, table: false, labels: true, group: null };
let data, plants = [], rows = [], atlas, playTimer = null, toastTimer;
const motion = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 4000); }
function syncURL() {
  const params = new URLSearchParams();
  if (filter.state) params.set('state', filter.state);
  if (filter.query) params.set('q', filter.query);
  if (filter.type) params.set('type', filter.type);
  if (filter.min) params.set('min', filter.min);
  if (filter.year !== YEAR_MAX) params.set('year', filter.year);
  if (ui.mode === 'dates') params.set('mode', 'dates');
  if (ui.selected) params.set('plant', ui.selected);
  const url = new URL(location.href); url.hash = params.toString();
  history.replaceState(null, '', url);
}
function rowHTML(p) {
  const color = ui.mode === 'dates' ? eraFor(p.since).color : '#7eae94';
  return `<button class="plant-row" data-plant="${esc(p.id)}" aria-label="${esc(p.name)}, ${power(p.mw)}, unit openings ${openingRange(p)}"><span class="row-top"><i class="row-dot" style="background:${color}"></i><span class="row-name">${esc(p.name)}</span><span class="row-power">${power(p.mw)}</span></span><span class="row-meta"><span>${p.state} · ${p.included.length} reactor${p.included.length === 1 ? '' : 's'}</span><span>${openingRange(p)}</span></span><span class="row-meter"><i style="width:${p.mw / 4530 * 100}%"></i></span></button>`;
}
function renderLegend() {
  $('legend').innerHTML = ui.mode === 'capacity'
    ? `<div class="legend-title">Electrical capacity · MW(e)</div><div class="legend-size">${[1000, 2000, 4000].map(mw => `<span><i style="width:calc(${2 * Math.sqrt(mw / 10)}px * var(--bubble-scale,1));height:calc(${2 * Math.sqrt(mw / 10)}px * var(--bubble-scale,1))"></i>${number(mw)} MW</span>`).join('')}</div><p class="legend-note">Circle area = capacity. Groups add capacities.<br>Numbers inside outlined circles = plant count.</p>`
    : `<div class="legend-title">Oldest included reactor · opening year</div><div class="era-legend">${ERAS.map(e => `<span><i style="background:${e.color}"></i>${e.label}</span>`).join('')}</div><p class="legend-note">Equal-size dots. Labels show oldest–newest unit openings.<br>Outlined groups contain multiple dates; select to explore.</p>`;
  $('modeHint').textContent = ui.mode === 'capacity' ? 'Bigger circle, more electrical capacity.' : 'Color = oldest unit. Date range = all included unit openings.';
  for (const mode of ['capacity', 'dates']) { $(mode + 'Mode').classList.toggle('active', ui.mode === mode); $(mode + 'Mode').setAttribute('aria-pressed', String(ui.mode === mode)); }
}
function render() {
  rows = filterPlants(plants, filter);
  const summary = summarize(rows);
  const filtered = filter.query || filter.state || filter.type || filter.min || filter.year < YEAR_MAX;
  $('scopeTitle').textContent = filtered ? 'FILTERED REFERENCE FLEET' : 'U.S. REFERENCE FLEET';
  $('regionTitle').textContent = filter.state ? plants.find(p => p.state === filter.state).state_name : 'Power, on the map.';
  $('metrics').innerHTML = `<div><strong>${summary.sites}</strong><span>plant sites</span></div><div><strong>${summary.units}</strong><span>reactors</span></div><div><strong>${(summary.mw / 1000).toFixed(2)}<small>GW</small></strong><span>2024 capacity</span></div>`;
  $('metrics').title = `${summary.sites} sites, ${summary.units} reactors, ${power(summary.mw)}; all matching plants, not only the visible map area`;
  $('resultCount').textContent = `${summary.sites} matching plants`;
  $('plantList').innerHTML = rows.length ? rows.map(rowHTML).join('') : '<div class="no-results">No plants match. Try a later opening year or reset the filters.</div>';
  $('emptyMap').hidden = rows.length > 0;
  const filterCount = [filter.state, filter.type, filter.min].filter(Boolean).length;
  $('filterCount').textContent = filterCount ? `${filterCount} applied` : '';
  $('tennesseeBtn').classList.toggle('active', filter.state === 'TN');
  $('allUSBtn').classList.toggle('active', !filtered);
  $('yearOutput').textContent = filter.year;
  $('yearFilter').value = filter.year;
  $('yearFilter').setAttribute('aria-valuetext', `Included reactors opened through ${filter.year}; capacities remain 2024 values`);
  $('timelineNote').textContent = filter.year < YEAR_MAX ? `Opened by ${filter.year}; still using 2024 capacities.` : '94 reference reactors. Not a historical fleet.';
  document.querySelectorAll('#histogram [data-year]').forEach(el => el.classList.toggle('future', Number(el.dataset.year) > filter.year));
  $('tableBody').innerHTML = rows.map(p => `<tr><td><button data-plant="${esc(p.id)}">${esc(p.name)}</button><small>${p.reactor_type}</small></td><td>${p.state}</td><td>${p.included.map(u => `<small>Unit ${u.unit} · ${dateLabel(u.commercial_operation)}</small>`).join('')}</td><td>${p.included.length}</td><td>${number(p.mw)}</td></tr>`).join('') || '<tr><td colspan="5">No matching plants.</td></tr>';
  if (ui.selected && !rows.some(p => p.id === ui.selected)) ui.selected = null;
  ui.group = null;
  renderDetail(); renderLegend(); updateMap(); syncURL();
}
function updateMap() { atlas?.update(rows, ui.mode, ui.selected, ui.labels); }
function selectPlant(id, focus = true) {
  if (!rows.some(p => p.id === id)) return;
  ui.selected = id; ui.group = null; stopPlayback();
  renderDetail(); updateMap(); syncURL();
  if (focus) { $('detailPanel').focus({ preventScroll: true }); if (innerWidth <= 760) $('detailPanel').scrollIntoView({ behavior: motion, block: 'start' }); }
}
function backToList() {
  const id = ui.selected; ui.selected = null; ui.group = null;
  renderDetail(); updateMap(); syncURL();
  if (id) $('plantList').querySelector(`[data-plant="${id}"]`)?.focus({ preventScroll: true });
}
function renderDetail() {
  const p = rows.find(r => r.id === ui.selected);
  const visible = Boolean(p || ui.group);
  $('plantList').hidden = visible; $('listHeader').hidden = visible; $('detailPanel').hidden = !visible;
  if (!visible) return;
  if (ui.group) {
    const groupRows = rows.filter(r => ui.group.includes(r.id));
    $('detailPanel').innerHTML = `<button class="back" data-back>← All matching plants</button><h2>${groupRows.length} nearby plants</h2><span class="capacity">${number(summarize(groupRows).mw)} <small>MW</small></span><p class="group-note">Combined 2024 electrical capacity. Select a plant for its dates and units, or zoom in to separate their locations.</p>${groupRows.map(rowHTML).join('')}<button class="locate" id="groupZoom">Zoom into this area ↗</button>`;
    $('groupZoom').onclick = () => { atlas.fit(groupRows); showMap(); };
    return;
  }
  const rank = [...rows].sort((a, b) => b.mw - a.mw).findIndex(r => r.id === p.id) + 1;
  const fullDates = p.units.map(u => u.commercial_operation).sort();
  const excluded = p.included.length !== p.units.length;
  $('detailPanel').innerHTML = `<button class="back" data-back>← All matching plants</button><h2>${esc(p.name)}</h2><div class="location">${esc(p.state_name)} · ${p.reactor_type === 'PWR' ? 'Pressurized water' : 'Boiling water'}</div><strong class="capacity">${number(p.mw)} <small>MW(e)</small></strong><div class="caption">2024 net summer electrical capacity${excluded ? ' · included units only' : ''}</div><div class="relative-meter"><i style="width:${p.mw / 4530 * 100}%"></i></div><div class="rank">#${rank} by capacity among ${rows.length} matching plants</div><div class="date-pair"><div><strong>${dateLabel(p.since)}</strong><span>Oldest included unit<br>Commercial operation</span></div><div><strong>${dateLabel(p.latest)}</strong><span>Newest included unit<br>Commercial operation</span></div></div><h3>${p.included.length} of ${p.units.length} reactors included</h3>${p.units.map(u => {
    const included = p.included.includes(u);
    return `<div class="unit-row${included ? '' : ' excluded'}"><div><b>Unit ${esc(u.unit)}</b><strong>${power(u.capacity_mw)}</strong></div><div class="unit-meta">${dateLabel(u.commercial_operation)}${included ? '' : ' · outside year filter'}</div><div class="unit-meter"><i style="width:${u.capacity_mw / 1400 * 100}%"></i></div></div>`;
  }).join('')}<div class="notes">${excluded ? `<p>All reference units together: ${power(p.capacity_mw)}. Their opening dates span ${dateLabel(fullDates[0])} to ${dateLabel(fullDates.at(-1))}. Later units are excluded from totals above.</p>` : ''}<p>This is capacity, not live output. Outages and post-snapshot restarts are not represented.</p>${p.notes.map(n => `<p>${esc(n)}</p>`).join('')}</div><div class="source-links"><a href="${esc(data.metadata.sources.capacity.url)}" target="_blank" rel="noopener noreferrer">EIA capacity ↗</a><a href="${esc(data.metadata.sources.commissioning.url)}" target="_blank" rel="noopener noreferrer">IAEA dates ↗</a></div><button class="locate" id="locatePlant">Zoom to plant ↗</button>`;
  $('locatePlant').onclick = () => { showMap(); atlas.fit([p]); };
}
function showMap() { switchView(false); if (innerWidth <= 760) $('mapStage').scrollIntoView({ behavior: motion, block: 'center' }); }
function switchView(table) {
  ui.table = table; $('mapStage').hidden = table; $('tableStage').hidden = !table;
  for (const [id, pressed] of [['mapViewBtn', !table], ['tableViewBtn', table]]) { $(id).classList.toggle('active', pressed); $(id).setAttribute('aria-pressed', String(pressed)); }
  if (!table) requestAnimationFrame(() => atlas?.resize());
}
function reset(state = '') {
  stopPlayback(); Object.assign(filter, initialFilters(), { state }); ui.selected = null; ui.group = null;
  for (const [id, value] of [['search', ''], ['stateFilter', state], ['typeFilter', ''], ['capacityFilter', '0'], ['sortFilter', 'capacity']]) $(id).value = value;
  render(); showMap(); atlas.fit(rows);
}
function stopPlayback() { clearInterval(playTimer); playTimer = null; $('playTimeline').textContent = '▶ Play'; $('playTimeline').setAttribute('aria-label', 'Play commissioning timeline'); }
function download(contents, type, name) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000); toast(`Exported ${name}`);
}
const csvCell = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
function exportCSV() {
  const records = [['plant', 'state', 'unit', 'reactor_type', 'commercial_operation_month', 'net_summer_capacity_mw_2024', 'latitude', 'longitude', 'capacity_source', 'date_source']];
  for (const p of rows) for (const u of p.included) records.push([p.name, p.state, u.unit, u.reactor_type, u.commercial_operation, u.capacity_mw, p.latitude, p.longitude, data.metadata.sources.capacity.url, data.metadata.sources.commissioning.url]);
  download('\ufeff' + records.map(r => r.map(csvCell).join(',')).join('\r\n'), 'text/csv;charset=utf-8', 'nuclear-reactors-2024.csv');
}
function exportGeoJSON() {
  const result = { type: 'FeatureCollection', metadata: { ...data.metadata, filters: { ...filter }, exported_summary: summarize(rows) }, features: rows.map(p => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.longitude, p.latitude] }, properties: { id: p.id, name: p.name, state: p.state, capacity_mw: p.mw, capacity_year: 2024, oldest_included_unit: p.since, newest_included_unit: p.latest, units: p.included, notes: p.notes } })) };
  download(JSON.stringify(result, null, 2), 'application/geo+json', 'nuclear-plants-2024.geojson');
}
async function start() {
  const embedded = $('plantData');
  if (embedded) data = JSON.parse(embedded.textContent);
  else {
    const response = await fetch('data/plants.json');
    if (!response.ok) throw new Error('The plant dataset could not be loaded.');
    data = await response.json();
  }
  plants = data.sites;
  const states = [...new Map(plants.map(p => [p.state, p.state_name]))].sort((a, b) => a[1].localeCompare(b[1]));
  for (const [state, name] of states) $('stateFilter').add(new Option(name, state));
  const params = new URLSearchParams(location.hash.slice(1));
  if (states.some(([s]) => s === params.get('state'))) filter.state = params.get('state');
  if (['PWR', 'BWR'].includes(params.get('type'))) filter.type = params.get('type');
  if ([1000, 2000, 3000, 4000].includes(Number(params.get('min')))) filter.min = Number(params.get('min'));
  if (params.has('q')) filter.query = params.get('q').slice(0, 200);
  const year = Number(params.get('year')); if (Number.isInteger(year) && year >= YEAR_MIN && year <= YEAR_MAX) filter.year = year;
  if (params.get('mode') === 'dates') ui.mode = 'dates';
  if (plants.some(p => p.id === params.get('plant'))) ui.selected = params.get('plant');
  for (const [id, key] of [['search', 'query'], ['stateFilter', 'state'], ['typeFilter', 'type'], ['capacityFilter', 'min']]) $(id).value = filter[key];
  $('sourceLinks').innerHTML = Object.values(data.metadata.sources).map(s => `<div class="source-entry"><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a><p>${esc(s.note)}</p></div>`).join('');
  const years = Array.from({ length: YEAR_MAX - YEAR_MIN + 1 }, (_, i) => YEAR_MIN + i);
  const counts = years.map(y => plants.flatMap(p => p.units).filter(u => yearOf(u.commercial_operation) === y).length);
  const max = Math.max(...counts);
  $('histogram').innerHTML = years.map((y, i) => `<span data-year="${y}" style="height:${Math.max(1, counts[i] / max * 100)}%;background:${eraFor(`${y}-01`).color}" title="${y}: ${counts[i]} reference reactors"></span>`).join('');
  atlas = await createAtlasMap({ onChoose: selectedRows => {
    if (selectedRows.length === 1) selectPlant(selectedRows[0].id);
    else { ui.selected = null; ui.group = selectedRows.map(p => p.id); stopPlayback(); renderDetail(); updateMap(); syncURL(); $('detailPanel').focus({ preventScroll: true }); if (innerWidth <= 760) $('detailPanel').scrollIntoView({ behavior: motion, block: 'start' }); }
  }, onHover: ids => document.querySelectorAll('#plantList [data-plant]').forEach(el => el.classList.toggle('is-hovered', ids.includes(el.dataset.plant))) });
  render(); atlas.fit(rows);
  $('search').addEventListener('input', event => { filter.query = event.target.value; render(); });
  for (const [id, key] of [['stateFilter', 'state'], ['typeFilter', 'type'], ['capacityFilter', 'min'], ['sortFilter', 'sort']]) $(id).addEventListener('change', event => { filter[key] = key === 'min' ? Number(event.target.value) : event.target.value; render(); if (key === 'state') atlas.fit(rows); });
  for (const mode of ['capacity', 'dates']) $(mode + 'Mode').onclick = () => { ui.mode = mode; render(); };
  $('showLabels').onchange = event => { ui.labels = event.target.checked; updateMap(); };
  $('yearFilter').oninput = event => { stopPlayback(); filter.year = Number(event.target.value); render(); };
  $('allYearsBtn').onclick = () => { stopPlayback(); filter.year = YEAR_MAX; render(); };
  $('playTimeline').onclick = () => {
    if (playTimer) { stopPlayback(); return; }
    if (filter.year === YEAR_MAX) { filter.year = YEAR_MIN; render(); }
    $('playTimeline').textContent = 'Ⅱ Pause'; $('playTimeline').setAttribute('aria-label', 'Pause commissioning timeline');
    playTimer = setInterval(() => { filter.year++; render(); if (filter.year >= YEAR_MAX) stopPlayback(); }, 450);
  };
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopPlayback(); });
  $('allUSBtn').onclick = () => reset(); $('tennesseeBtn').onclick = () => reset('TN'); $('resetBtn').onclick = () => reset(); $('emptyReset').onclick = () => reset();
  $('home').onclick = event => { event.preventDefault(); reset(); };
  $('fitBtn').onclick = () => atlas.fit(rows); $('zoomIn').onclick = () => atlas.zoom(.7); $('zoomOut').onclick = () => atlas.zoom(1 / .7);
  $('mapViewBtn').onclick = () => switchView(false); $('tableViewBtn').onclick = () => switchView(true);
  for (const id of ['plantList', 'tableBody', 'detailPanel']) $(id).addEventListener('click', event => { const plant = event.target.closest('[data-plant]'); if (plant) selectPlant(plant.dataset.plant); if (event.target.closest('[data-back]')) backToList(); });
  $('plantList').onpointerover = event => { const plant = event.target.closest('[data-plant]'); if (plant) atlas.highlight([plant.dataset.plant]); };
  $('plantList').onpointerleave = () => atlas.highlight([]);
  $('sourcesBtn').onclick = $('scopeBtn').onclick = () => { stopPlayback(); $('sourcesDialog').showModal(); };
  $('exportBtn').onclick = () => { stopPlayback(); const s = summarize(rows); $('exportNote').textContent = `${s.sites} plants · ${s.units} reactors · ${power(s.mw)} of 2024 capacity.`; $('exportDialog').showModal(); };
  $('csvExport').onclick = exportCSV; $('geoExport').onclick = exportGeoJSON;
  document.querySelectorAll('[data-close]').forEach(el => el.onclick = () => el.closest('dialog').close());
  document.addEventListener('keydown', event => {
    const typing = ['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName);
    if (event.key === '/' && !typing && !document.querySelector('dialog[open]')) { event.preventDefault(); $('search').focus(); }
    if (event.key === 'Escape' && !document.querySelector('dialog[open]')) { stopPlayback(); if (ui.selected || ui.group) backToList(); }
  });
}
start().catch(error => { $('plantList').innerHTML = `<div class="no-results">${esc(error.message)} Please reload, or check the deployed data files.</div>`; $('resultCount').textContent = 'Data unavailable'; $('mapStatus').textContent = 'Map data unavailable'; console.error(error); });
