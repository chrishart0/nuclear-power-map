"""Mapbox adapter contract tests with a fake SDK; not a live Mapbox/network test."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT/'dist/index.html').read_text()
FAKE = '''
window.__mapCreated = 0;
window.mapboxgl = {
  supported: () => true,
  LngLatBounds: class { extend(p) { return this; } },
  Map: class {
    constructor(options) { this.options=options; this.events={}; this.z=3; window.__mapCreated++; window.__mapOptions=options; window.__map=this; }
    on(name, fn) { this.events[name]=fn; if(name==='load') setTimeout(()=>{if(!this.removed)fn();},30); return this; }
    project(p) { const e=document.getElementById('mapStage'); return {x:(p[0]+126)/60*e.clientWidth,y:(50-p[1])/27*e.clientHeight}; }
    resize() {} fitBounds(bounds,options) { window.__fit=options; this.events.move?.(); }
    getZoom() { return this.z; } zoomTo(z) { this.z=z; this.events.move?.(); }
    remove() { this.removed=true; window.__removed=true; }
  }
};
'''
with sync_playwright() as pw:
    options = {'headless': True, 'args': ['--no-sandbox']}
    if os.getenv('CHROMIUM_PATH'): options['executable_path'] = os.environ['CHROMIUM_PATH']
    browser = pw.chromium.launch(**options)
    errors = []
    def make(token, fake=FAKE):
        page = browser.new_page(viewport={'width': 1440, 'height': 1000}, reduced_motion='reduce')
        page.on('pageerror', lambda e: errors.append(str(e)))
        setup = f'<script>window.ATLAS_CONFIG={{mapboxToken:"{token}"}};{fake}</script>'
        page.set_content(HTML.replace('<script src="config.js"></script>', setup))
        page.wait_for_selector('.map-node'); page.wait_for_timeout(200)
        return page
    page=make('pk.test_adapter_only')
    assert page.evaluate('window.__mapCreated') == 1
    assert page.locator('#offlineMap').is_hidden() and page.locator('#mapboxMap').is_visible()
    assert 'Mapbox basemap' in page.locator('#mapStatus').inner_text()
    assert page.evaluate('window.__mapOptions.accessToken') == 'pk.test_adapter_only'
    assert page.evaluate('window.__mapOptions.projection') == 'mercator'
    assert page.locator('.map-node').count() > 0
    page.locator('#tennesseeBtn').click(); page.wait_for_timeout(100)
    assert page.locator('#plantList .plant-row').count() == 2
    page.locator('#zoomIn').click(); assert page.evaluate('window.__map.z') == 4
    page.evaluate('window.__map.events.error({error:{status:403}})');page.wait_for_timeout(100)
    assert page.locator('#offlineMap').is_visible() and page.locator('#mapboxMap').is_hidden()
    assert page.locator('dialog[open]').count() == 0
    assert page.locator('#plantList .plant-row').count() == 2
    secret=make('sk.must_never_be_used'); assert secret.evaluate('window.__mapCreated') == 0
    no_gpu=make('pk.test_adapter_only',FAKE.replace('supported: () => true','supported: () => false'))
    assert no_gpu.evaluate('window.__mapCreated') == 0
    assert no_gpu.locator('#offlineMap').is_visible()
    assert not errors, errors
    browser.close()
print('Passed: configured auto-start, projection, controls, filters, 403 fallback, no token dialogs, secret rejection, WebGL fallback. Fake SDK only.')
