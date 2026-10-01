import { groupPoints, placeLabels, eraFor, number, power, compactPower, openingRange, escapeHTML as esc } from './core.js';

const SDK = 'https://api.mapbox.com/mapbox-gl-js/v3.30.0';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const duration = reducedMotion ? 0 : 650;

/** Mapbox supplies the basemap; one screen-space overlay owns data, hit targets and labels. */
export async function createAtlasMap({ onChoose, onHover }) {
  const stage = document.getElementById('mapStage');
  const offline = document.getElementById('offlineMap');
  const overlay = document.getElementById('mapOverlay');
  const status = document.getElementById('mapStatus');
  const tip = document.getElementById('hoverTip');
  let rows = [], mode = 'capacity', selected = '', labels = true, groups = [];
  let map = null, ready = false, frame = 0, box = { x: 0, y: 0, w: 1200, h: 704.98 };
  let svg = null, drag = null, dragDistance = 0;
  try {
    if (!offline.querySelector('svg')) {
      const response = await fetch('data/overview.svg');
      if (!response.ok) throw new Error('Overview asset missing');
      offline.innerHTML = await response.text();
    }
    svg = offline.querySelector('svg');
    if (!svg) throw new Error('Invalid overview');
    status.textContent = 'Geographic overview · approximate site centers';
  } catch {
    status.textContent = 'Map unavailable. Plant data remains available in the list and table.';
  }

  function schedule() { if (!frame) frame = requestAnimationFrame(() => { frame = 0; draw(); }); }
  function project(p) {
    if (ready) return map.project([p.longitude, p.latitude]);
    if (!svg) return null;
    const matrix = svg.getScreenCTM();
    if (!matrix) return null;
    const point = new DOMPoint(p.overview_x, p.overview_y).matrixTransform(matrix);
    const rect = stage.getBoundingClientRect();
    return { x: point.x - rect.left, y: point.y - rect.top };
  }
  function hideTip() { tip.hidden = true; onHover([]); }
  function showTip(group, event) {
    const single = group.rows.length === 1, first = group.rows[0];
    tip.innerHTML = `<strong>${single ? esc(first.name) : `${group.rows.length} nearby plants`}</strong><span class="tip-power">${power(group.mw)}</span><small>${single ? `${first.state_name} · ${first.included.length} reactor${first.included.length === 1 ? '' : 's'}` : 'Combined electrical capacity'}</small><small>Unit openings: ${openingRange(group)}<br>${single ? 'Select for exact dates and reactor capacities.' : 'Select to choose a plant or zoom in.'}</small>`;
    tip.hidden = false;
    const rect = stage.getBoundingClientRect();
    const x = event.clientX ? event.clientX - rect.left : group.x;
    const y = event.clientY ? event.clientY - rect.top : group.y;
    tip.style.left = `${Math.max(8, Math.min(x + 16, stage.clientWidth - tip.offsetWidth - 8))}px`;
    tip.style.top = `${Math.max(8, Math.min(y + 16, stage.clientHeight - tip.offsetHeight - 8))}px`;
    onHover(group.rows.map(p => p.id));
  }
  function draw() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    overlay.setAttribute('viewBox', `0 0 ${w} ${h}`);
    if (svg && !ready) svg.style.setProperty('--geo-scale', box.w / w);
    const points = rows.map(plant => ({ plant, ...project(plant) })).filter(p => Number.isFinite(p.x) && p.x > -50 && p.y > -50 && p.x < w + 50 && p.y < h + 50);
    const touch = matchMedia('(pointer: coarse)').matches;
    groups = groupPoints(points, mode, touch ? 30 : 25, matchMedia('(max-width:760px)').matches ? .65 : 1);
    const container = stage.getBoundingClientRect();
    const obstacles = [...stage.querySelectorAll('.map-obstacle')].filter(e => e.offsetWidth).map(e => {
      const r = e.getBoundingClientRect();
      return { x: r.left - container.left - 5, y: r.top - container.top - 5, w: r.width + 10, h: r.height + 10 };
    });
    const limit = w < 550 ? 7 : w < 850 ? 13 : 22;
    const placed = labels ? placeLabels(groups, w, h, obstacles, limit, selected) : [];
    const markerHTML = groups.map((g, i) => {
      const multi = g.rows.length > 1, active = g.rows.some(p => p.id === selected);
      const title = multi ? `${g.rows.length} nearby plants, ${power(g.mw)} combined` : `${g.rows[0].name}, ${power(g.mw)}, unit openings ${openingRange(g)}`;
      const color = mode === 'capacity' ? '#73d9c1' : eraFor(g.since).color;
      const innerPower = multi && mode === 'capacity' && g.radius >= 24;
      return `<g class="map-node${multi ? ' group' : ''}" data-group="${i}" data-plants="${esc(g.key)}" data-mw="${g.mw}" data-group-size="${g.rows.length}" transform="translate(${g.x.toFixed(2)},${g.y.toFixed(2)})" role="button" tabindex="0" aria-label="${esc(title)}"><circle class="hit" r="${Math.max(touch ? 22 : 13, g.radius + 4)}"/>${active ? `<circle class="selection" r="${g.radius + 5}"/>` : ''}${multi ? `<circle class="group-ring" r="${g.radius + 3}"/>` : ''}<circle class="symbol" r="${g.radius}" fill="${color}"/>${multi ? `<text class="count" y="${innerPower ? -6 : 0}">${g.rows.length}</text>${innerPower ? `<text class="cluster-power" y="10">${compactPower(g.mw)}</text>` : ''}` : ''}</g>`;
    }).join('');
    const labelHTML = placed.map(l => {
      const g = l.group, index = groups.indexOf(g), single = g.rows.length === 1;
      const title = single ? g.rows[0].name : `${g.rows.length} nearby plants`;
      const meta = mode === 'dates' && single ? `${openingRange(g)} · ${power(g.mw)}` : `${power(g.mw)} · ${single ? openingRange(g) : 'combined'}`;
      return `<g class="map-label" data-group="${index}" transform="translate(${l.x},${l.y})" role="button" tabindex="-1" aria-label="${esc(title + ', ' + meta)}"><rect width="${l.w}" height="${l.h}"/><text x="8" y="15">${esc(title)}</text><text x="8" y="30" class="label-meta">${esc(meta)}</text></g>`;
    }).join('');
    overlay.innerHTML = markerHTML + labelHTML;
  }
  overlay.addEventListener('click', event => { const target = event.target.closest('[data-group]'); if (target) { hideTip(); onChoose(groups[Number(target.dataset.group)].rows); } });
  overlay.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { const target = event.target.closest('[data-group]'); if (target) { event.preventDefault(); hideTip(); onChoose(groups[Number(target.dataset.group)].rows); } } });
  overlay.addEventListener('pointerover', event => { const target = event.target.closest('[data-group]'); if (target) showTip(groups[Number(target.dataset.group)], event); });
  overlay.addEventListener('pointerout', event => { if (!event.relatedTarget || !event.target.closest('[data-group]')?.contains(event.relatedTarget)) hideTip(); });
  overlay.addEventListener('focusin', event => { const target = event.target.closest('[data-group]'); if (target) showTip(groups[Number(target.dataset.group)], event); });
  overlay.addEventListener('focusout', hideTip);
  function applyBox() { if (svg) svg.setAttribute('viewBox', `${box.x} ${box.y} ${box.w} ${box.h}`); hideTip(); schedule(); }
  function zoom(factor, point) {
    if (ready) { map.zoomTo(map.getZoom() + (factor < 1 ? 1 : -1), { duration }); return; }
    const p = point || { x: box.x + box.w / 2, y: box.y + box.h / 2 };
    const width = Math.max(60, Math.min(1700, box.w * factor)), ratio = width / box.w;
    box = { x: p.x - (p.x - box.x) * ratio, y: p.y - (p.y - box.y) * ratio, w: width, h: box.h * ratio };
    applyBox();
  }
  function toSVG(event) { return svg ? new DOMPoint(event.clientX, event.clientY).matrixTransform(svg.getScreenCTM().inverse()) : { x: 0, y: 0 }; }
  offline.addEventListener('wheel', event => { if (!svg) return; event.preventDefault(); zoom(event.deltaY > 0 ? 1.15 : 1 / 1.15, toSVG(event)); }, { passive: false });
  offline.addEventListener('pointerdown', event => { if (!svg || event.button !== 0) return; drag = { point: toSVG(event), x: event.clientX, y: event.clientY }; dragDistance = 0; offline.setPointerCapture(event.pointerId); });
  offline.addEventListener('pointermove', event => { if (!drag) return; dragDistance = Math.hypot(event.clientX - drag.x, event.clientY - drag.y); if (dragDistance < 4) return; const point = toSVG(event); box.x += drag.point.x - point.x; box.y += drag.point.y - point.y; offline.classList.add('dragging'); applyBox(); });
  function endDrag(event) { drag = null; offline.classList.remove('dragging'); if (offline.hasPointerCapture(event.pointerId)) offline.releasePointerCapture(event.pointerId); }
  offline.addEventListener('pointerup', endDrag); offline.addEventListener('pointercancel', endDrag);
  function fit(fitRows = rows) {
    if (!fitRows.length) return;
    if (ready) {
      const bounds = new window.mapboxgl.LngLatBounds();
      fitRows.forEach(p => bounds.extend([p.longitude, p.latitude]));
      map.fitBounds(bounds, { padding: { left: 75, right: 75, top: 95, bottom: 125 }, maxZoom: 8, duration });
    } else {
      const xs = fitRows.map(p => p.overview_x), ys = fitRows.map(p => p.overview_y);
      const width = stage.clientWidth || 900, height = stage.clientHeight || 550;
      const aspect = height / width;
      const spanX = Math.max(...xs) - Math.min(...xs), spanY = Math.max(...ys) - Math.min(...ys);
      const w = Math.max(120, spanX / .80, spanY / Math.max(.24, aspect * .62));
      box = { x: (Math.min(...xs) + Math.max(...xs)) / 2 - w / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 - w * aspect / 2, w, h: w * aspect };
      applyBox();
    }
  }
  const observer = new ResizeObserver(() => { if (map) map.resize(); schedule(); });
  observer.observe(stage);
  async function startMapbox() {
    const config = window.ATLAS_CONFIG || {}, token = config.mapboxToken || '';
    if (!token) return; // Deployment controls credentials; there is intentionally no token UI.
    if (!/^pk\.[A-Za-z0-9._-]+$/.test(token)) { console.warn('Atlas requires a public pk. Mapbox token. Keeping overview.'); return; }
    let loadTimer;
    function fail(message) {
      clearTimeout(loadTimer); ready = false; stage.classList.remove('is-mapbox');
      if (map) { map.remove(); map = null; }
      document.getElementById('mapboxMap').hidden = true; offline.hidden = false;
      status.textContent = 'Geographic overview · detailed basemap unavailable';
      document.getElementById('mapCredit').hidden = false;
      console.warn(message); schedule();
    }
    try {
      if (!window.mapboxgl) await new Promise((resolve, reject) => {
        const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = `${SDK}/mapbox-gl.css`; document.head.appendChild(css);
        const script = document.createElement('script'); script.src = `${SDK}/mapbox-gl.js`; script.async = true;
        const timeout = setTimeout(() => reject(new Error('Mapbox SDK timed out')), 15000);
        script.onload = () => { clearTimeout(timeout); resolve(); };
        script.onerror = () => { clearTimeout(timeout); reject(new Error('Mapbox SDK unavailable')); };
        document.head.appendChild(script);
      });
      if (!window.mapboxgl?.supported()) throw new Error('WebGL2 unavailable');
      document.getElementById('mapboxMap').hidden = false;
      map = new window.mapboxgl.Map({ container: 'mapboxMap', accessToken: token, style: config.mapboxStyle || 'mapbox://styles/mapbox/dark-v11', projection: 'mercator', center: [-96, 38], zoom: 3, minZoom: 2, maxZoom: 16, renderWorldCopies: false, attributionControl: true, dragRotate: false, pitchWithRotate: false });
      loadTimer = setTimeout(() => fail('Mapbox basemap timed out. Check deployment token, domain restrictions and network.'), 20000);
      map.on('load', () => { clearTimeout(loadTimer); ready = true; stage.classList.add('is-mapbox'); offline.hidden = true; status.textContent = 'Mapbox basemap · 2024 reference data'; document.getElementById('mapCredit').hidden = true; map.resize(); fit(); });
      map.on('move', () => { hideTip(); schedule(); });
      map.on('error', event => { if (event.error?.status === 401 || event.error?.status === 403) fail('Mapbox authorization failed. Check the public token and allowed domain.'); });
    } catch (error) { fail(error.message); }
  }
  const api = {
    update(nextRows, nextMode, nextSelected, showLabels) { rows = nextRows; mode = nextMode; selected = nextSelected; labels = showLabels; hideTip(); schedule(); },
    fit, zoom, resize: schedule,
    highlight(ids) { overlay.querySelectorAll('.map-node').forEach(el => el.classList.toggle('highlight', el.dataset.plants.split('|').some(id => ids.includes(id)))); }
  };
  // Start on the next turn, after the caller supplies rows and filters.
  setTimeout(startMapbox, 0);
  return api;
}
