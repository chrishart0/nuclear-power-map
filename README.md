# U.S. Nuclear Atlas

A map-first explorer of U.S. commercial nuclear plant capacity and reactor commissioning dates. Static HTML, CSS and JavaScript; Mapbox supplies the hosted basemap. No backend, framework or runtime package installation.

## Run locally

Requires Python 3.10+; Node 20+ is only needed for the data/layout tests.

```sh
python3 build.py
python3 -m http.server 8000 --directory dist
```

Open `http://localhost:8000`. Without deployment configuration, the bundled geographic overview works. Visitors are never asked for credentials.

## Mapbox and S3 deployment

Provide a **public `pk.` token**, not a secret `sk.` token:

```sh
MAPBOX_ACCESS_TOKEN='pk.your_public_token' python3 build.py
```

The build writes the token only to `dist/config.js`; the site starts Mapbox automatically. There is no Connect Mapbox button, token form, browser token storage or token in exported data. Alternatively, edit `dist/config.js` after building. `MAPBOX_STYLE` optionally overrides the default `mapbox://styles/mapbox/dark-v11` style.

Upload the **contents of `dist/`**, not the source directory:

```sh
aws s3 sync dist/ s3://YOUR_BUCKET/ --exclude config.js --cache-control 'max-age=300'
aws s3 cp dist/config.js s3://YOUR_BUCKET/config.js --content-type application/javascript --cache-control 'no-store'
```

These commands do not configure AWS infrastructure or change bucket permissions. For HTTPS, serve a private S3 bucket through CloudFront with origin access control and `index.html` as the default root object. Invalidate cached `index.html` and `config.js` when replacing a deployment if necessary. No S3 or CloudFront deployment has been performed by this repository.

Create an application-specific public Mapbox token and restrict it to the deployed domain (and localhost during development). Browser tokens are visible to visitors by design; secret-scope tokens must never be shipped. Mapbox usage is billed to the account supplying the token.

- [Mapbox token security](https://docs.mapbox.com/help/dive-deeper/how-to-use-mapbox-securely/)
- [Mapbox URL restrictions](https://docs.mapbox.com/accounts/guides/tokens/)
- [S3 and CloudFront access control](https://docs.aws.amazon.com/AmazonS3/latest/user-guide/access-control-overview.html)

## Reading the map

**Capacity:** circle area is proportional to net electrical capacity. The legend uses the same scale as the map. Numbered outlined circles group nearby plants; their area represents combined capacity, not plant count. Mobile uses a smaller scale, also reflected in its legend. Groups are spatially bounded so a chain of nearby sites cannot swallow a whole region.

**Opening dates:** equal-sized plant dots use the oldest included reactor's commissioning era. Labels show the oldest-to-newest included unit opening years, so later expansions are not hidden by a site's original date. Multi-site groups remain neutral rather than assigning one misleading age to several plants.

Labels avoid other labels, markers and map controls. Selecting a plant opens its exact unit dates and capacities in the sidebar, not over the map. Selecting a group offers its plant list and a zoom action. Search, state/type/capacity filters, the table, detail panel, metrics and exports use the same filtered population. Totals describe all matching plants, not just the current viewport. URL fragments retain state, search, type, capacity threshold, year, map mode and selected plant.

The timeline selects included reactors commissioned by a year. It keeps their **2024 capacities**, rather than pretending to reconstruct historical capacity. The histogram always describes the full 94-reactor reference fleet. Playback is optional and pauses when the page is hidden.

## Data scope and provenance

The supplied dataset is preserved: **54 sites, 94 reactors, 28 states and 96,823 MW** in the 2024 reference fleet. This is not a live 2026 operating-status feed. Retired, suspended/out-of-service, planned, construction and research reactors are excluded.

- Capacity: [EIA 2024 net summer electrical capacity](https://www.eia.gov/nuclear/reactors/reactorcapacity.php), not instantaneous output, annual generation, thermal power or nameplate capacity.
- Commercial operation: [IAEA Nuclear Power Reactors in the World, 2025, Table 14](https://www-pub.iaea.org/MTCD/Publications/PDF/RDS-2-45_web.pdf#page=50), retained at month/year precision.
- Approximate coordinates: [Explore Nuclear](https://explorenuclear.com/maps/map-of-us-nuclear-sites/), retained from the supplied atlas. Its dates and status descriptions were not used.
- Offline overview: simplified GSHHG geometry distributed with Basemap, retained from the supplied atlas; approximate site centers. The Mapbox basemap retains Mapbox attribution.

`data/sites.csv`, `data/reactors.csv` and `data/metadata.json` are the readable source of truth. `data/overview.svg.gz` is the compressed fallback graphic. `build.py` reconstructs and checks the dataset, unpacks the graphic, and builds the static site. Generated files and deployment configuration are not committed. No records were added or refreshed during the UX pass.

## Tests

```sh
npm test
python3 -m pip install playwright
python3 -m playwright install chromium
python3 tests/browser.py
python3 tests/mapbox.py
```

`npm test` builds and runs the dependency-free Node data/layout tests. Browser checks cover totals, both visual encodings, filters, unobstructed details, opening-date cutoffs, CSV/GeoJSON exports, nearby groups, keyboard controls, deep links, timeline playback and mobile layouts.

The Mapbox adapter test uses a **fake SDK** to check auto-start, public-token configuration, projection, controls, filtering, authorization failure, secret-token rejection and WebGL fallback. It is not a live basemap test. Real Mapbox rendering still needs verification with the deployment token and allowed domain.

For restricted environments that cannot navigate to localhost, `ATLAS_EMBEDDED_TEST=1 python3 tests/browser.py` tests the generated document through browser `set_content`, with blank deployment configuration inlined. `CHROMIUM_PATH` optionally chooses an installed Chromium binary; `ATLAS_TEST_OUTPUT` chooses the screenshot directory. The delivered UI was checked in Chromium using this embedded-document mode, not through a deployed S3 origin.
