"""Browser regression checks. Install playwright and its Chromium browser first."""
from pathlib import Path
import json, os, threading, tempfile
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(os.environ.get('ATLAS_TEST_OUTPUT', tempfile.mkdtemp(prefix='atlas-tests-')))
OUT.mkdir(parents=True, exist_ok=True)
class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_): pass

server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
URL = f'http://127.0.0.1:{server.server_port}/dist/'
EMBEDDED = os.environ.get('ATLAS_EMBEDDED_TEST') == '1'
def navigate(page, fragment=''):
    if EMBEDDED:
        page.evaluate('(hash)=>history.replaceState(null,"","about:blank"+hash)', fragment)
        html = (ROOT/'dist/index.html').read_text().replace('<script src="config.js"></script>', '<script>window.ATLAS_CONFIG={mapboxToken:""};</script>')
        page.set_content(html)
    else: page.goto(URL + fragment)
try:
    with sync_playwright() as pw:
        launch = {'headless': True, 'args': ['--no-sandbox']}
        if os.environ.get('CHROMIUM_PATH'): launch['executable_path'] = os.environ['CHROMIUM_PATH']
        browser = pw.chromium.launch(**launch)
        page = browser.new_page(viewport={'width': 1440, 'height': 1000}, reduced_motion='reduce')
        errors, requests = [], []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('request', lambda r: requests.append(r.url))
        navigate(page); page.wait_for_selector('.map-node'); page.wait_for_timeout(200)
        assert page.locator('#plantList .plant-row').count() == 54
        assert '96.82' in page.locator('#metrics').inner_text()
        assert page.get_by_role('button', name='Connect Mapbox').count() == 0
        assert not any('mapbox.com' in u for u in requests)
        assert page.locator('.map-label').count() >= 5
        page.screenshot(path=str(OUT/'desktop-capacity.png'))
        page.locator('#datesMode').click(); page.wait_for_timeout(150)
        radii = page.locator('.map-node[data-group-size="1"] .symbol').evaluate_all('(els) => els.map(e=>e.getAttribute("r"))')
        assert len(set(radii)) == 1 and radii[0] == '8'
        assert 'Oldest included' in page.locator('#legend').inner_text()
        page.screenshot(path=str(OUT/'desktop-dates.png'))
        page.locator('#showLabels').uncheck(); page.wait_for_timeout(100); assert page.locator('.map-label').count() == 0
        page.locator('#showLabels').check()
        page.locator('#tennesseeBtn').click(); page.wait_for_timeout(150)
        assert page.locator('#plantList .plant-row').count() == 2
        assert '4.52' in page.locator('#metrics').inner_text()
        page.locator('#plantList [data-plant="watts-bar"]').click()
        assert '1996' in page.locator('#detailPanel').inner_text() and '2016' in page.locator('#detailPanel').inner_text()
        assert page.locator('#detailPanel .unit-row').count() == 2
        side = page.locator('#detailPanel').bounding_box(); stage = page.locator('#mapStage').bounding_box()
        assert side['x'] + side['width'] <= stage['x'] + 1
        page.screenshot(path=str(OUT/'tennessee-details.png'))
        deep_link = page.url
        navigate(page, '#' + deep_link.split('#',1)[1]); page.wait_for_selector('#detailPanel:not([hidden])')
        assert 'Watts Bar' in page.locator('#detailPanel').inner_text()
        page.locator('#resetBtn').click(); page.locator('#search').fill('vogtle')
        page.locator('#plantList .plant-row').click()
        assert '4,530' in page.locator('#detailPanel').inner_text()
        page.locator('#yearFilter').evaluate('(e) => {e.value="1988";e.dispatchEvent(new Event("input",{bubbles:true}));}')
        assert '1,150' in page.locator('#detailPanel').inner_text()
        assert page.locator('#detailPanel .excluded').count() == 3
        page.locator('#exportBtn').click()
        with page.expect_download() as info: page.locator('#csvExport').click()
        csv = Path(info.value.path()).read_text(encoding='utf-8-sig')
        assert len(csv.splitlines()) == 2 and '1150' in csv
        with page.expect_download() as info: page.locator('#geoExport').click()
        geo = json.loads(Path(info.value.path()).read_text())
        assert geo['metadata']['exported_summary']['mw'] == 1150
        assert len(geo['features']) == 1 and 'mapboxToken' not in json.dumps(geo)
        page.locator('#exportDialog [data-close]').click()
        page.locator('#resetBtn').click(); page.locator('#search').fill('zzzz-no-result')
        assert page.locator('#emptyMap').is_visible()
        page.locator('#emptyReset').click(); page.wait_for_timeout(150)
        group = page.locator('.map-node.group').first
        assert group.count() == 1
        group.click(); assert 'nearby plants' in page.locator('#detailPanel h2').inner_text()
        assert page.locator('#detailPanel .plant-row').count() >= 2
        page.locator('#detailPanel .plant-row').first.click()
        assert page.locator('#detailPanel .unit-row').count() > 0
        page.keyboard.press('Escape'); assert page.locator('#detailPanel').is_hidden()
        page.locator('#playTimeline').click(); page.wait_for_timeout(510)
        assert int(page.locator('#yearOutput').inner_text()) >= 1970
        page.locator('#playTimeline').click(); stopped = page.locator('#yearOutput').inner_text(); page.wait_for_timeout(510)
        assert page.locator('#yearOutput').inner_text() == stopped
        page.locator('#allYearsBtn').click(); page.locator('#tableViewBtn').click()
        assert page.locator('#tableBody tr').count() == 54
        page.locator('#mapViewBtn').click(); page.keyboard.press('/')
        assert page.locator('#search').evaluate('(el)=>el===document.activeElement')
        assert not errors, errors
        mobile = browser.new_page(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, reduced_motion='reduce')
        mobile.on('pageerror', lambda e: errors.append(str(e)))
        navigate(mobile); mobile.wait_for_selector('.map-node'); mobile.wait_for_timeout(200)
        assert mobile.evaluate('document.documentElement.scrollWidth <= innerWidth')
        mobile.screenshot(path=str(OUT/'mobile-capacity.png'), full_page=True)
        mobile.locator('#tennesseeBtn').click(); mobile.wait_for_timeout(200)
        mobile.locator('#plantList .plant-row').first.click(); assert mobile.locator('#detailPanel').is_visible()
        mobile.screenshot(path=str(OUT/'mobile-details.png'), full_page=True)
        assert not errors, errors
        browser.close()
    print(json.dumps({'result': 'passed', 'checks': ['fleet totals', 'no token UI or Mapbox requests without config', 'capacity/date encodings', 'labels', 'Tennessee', 'unobstructed details', 'deep links', 'date filtering', 'CSV/GeoJSON', 'empty state', 'groups', 'keyboard', 'timeline playback', 'map/table', 'mobile'], 'screenshots': str(OUT)}, indent=2))
finally:
    server.shutdown(); server.server_close()
