"""Build an S3-ready static atlas, using only Python's standard library."""
from pathlib import Path
import csv, gzip, json, os, re, shutil

ROOT = Path(__file__).resolve().parent

def build():
    metadata = json.loads((ROOT / 'data/metadata.json').read_text())
    units = {}
    with (ROOT / 'data/reactors.csv').open(newline='') as f:
        for row in csv.DictReader(f):
            if not re.fullmatch(r'\d{4}-(0[1-9]|1[0-2])', row['commercial_operation']):
                raise ValueError(f"Invalid operation date: {row['commercial_operation']}")
            units.setdefault(row['site_id'], []).append({
                'unit': row['unit'], 'reactor_type': row['type'],
                'commercial_operation': row['commercial_operation'], 'capacity_mw': int(row['capacity_mw'])
            })
    sites = []
    with (ROOT / 'data/sites.csv').open(newline='') as f:
        for row in csv.DictReader(f):
            reactors = units.pop(row['id'])
            sites.append({**{k: row[k] for k in ['id', 'name', 'state', 'state_name']},
                **{k: float(row[k]) for k in ['latitude', 'longitude', 'overview_x', 'overview_y']},
                'reactor_type': reactors[0]['reactor_type'], 'units': reactors,
                'capacity_mw': sum(u['capacity_mw'] for u in reactors),
                'earliest_included_unit': min(u['commercial_operation'] for u in reactors),
                'notes': json.loads(row['notes'])})
    if units: raise ValueError(f'Orphan reactor sites: {list(units)}')
    actual = (len(sites), sum(len(s['units']) for s in sites), sum(s['capacity_mw'] for s in sites))
    expected = (metadata['site_count'], metadata['reactor_count'], metadata['capacity_mw'])
    if actual != expected: raise ValueError(f'Data totals {actual} do not match metadata {expected}')
    dataset = json.dumps({'metadata': metadata, 'sites': sites}, ensure_ascii=False, separators=(',', ':'))
    (ROOT / 'data/plants.json').write_text(dataset + '\n')
    overview = gzip.decompress((ROOT / 'data/overview.svg.gz').read_bytes()).decode()
    (ROOT / 'data/overview.svg').write_text(overview)
    token = os.environ.get('MAPBOX_ACCESS_TOKEN', '').strip()
    if token and not re.fullmatch(r'pk\.[A-Za-z0-9._-]+', token):
        raise ValueError('MAPBOX_ACCESS_TOKEN must be a public pk. token, never a secret token.')
    style = os.environ.get('MAPBOX_STYLE', 'mapbox://styles/mapbox/dark-v11')
    dist = ROOT / 'dist'; dist.mkdir(exist_ok=True)
    # Keep source files readable; deploy a self-contained document plus runtime config.
    scripts = []
    for name in ['core.js', 'map.js', 'app.js']:
        script = (ROOT / name).read_text()
        script = re.sub(r'^import .*?;\n', '', script, flags=re.M)
        script = re.sub(r'^export ', '', script, flags=re.M)
        scripts.append(script)
        if name == 'core.js': scripts.append('const esc = escapeHTML;')
    html = (ROOT / 'index.html').read_text()
    html = html.replace('<link rel="stylesheet" href="styles.css">', '<style>' + (ROOT / 'styles.css').read_text() + '</style>')
    html = html.replace('<div id="offlineMap" class="basemap"></div>', '<div id="offlineMap" class="basemap">' + overview + '</div>')
    inline_data = '<script id="plantData" type="application/json">' + dataset.replace('<', '\\u003c') + '</script>'
    inline_script = '<script>\n(() => {\n' + '\n'.join(scripts).replace('</script', '<\\/script') + '\n})();\n</script>'
    html = html.replace('<script type="module" src="app.js"></script>', inline_data + inline_script)
    (dist / 'index.html').write_text(html)
    config = {'mapboxToken': token, 'mapboxStyle': style}
    (dist / 'config.js').write_text('// Public browser configuration. No secrets.\nwindow.ATLAS_CONFIG = ' + json.dumps(config) + ';\n')
    (dist / 'data').mkdir(exist_ok=True)
    for name in ['plants.json', 'sites.csv', 'reactors.csv', 'metadata.json']:
        shutil.copyfile(ROOT / 'data' / name, dist / 'data' / name)
    print(f'Built dist/: {actual[0]} plants, {actual[1]} reactors, {actual[2]:,} MW. Mapbox {"configured" if token else "not configured; overview available"}.')

if __name__ == '__main__': build()
