# Virtual Warehouse

Live stock visualiser for the Ryderwear warehouse, fed by Peoplevox WMS.

The frontend (`index.html`, `app.js`, `styles.css`) is a static SPA that renders aisles, bays, levels and slots as a walkable 3D-ish layout. The backend (`server/`) is a tiny Express app that polls Peoplevox every 5 minutes via SOAP, stores the snapshot in Postgres, and serves it back to the frontend at `GET /api/inventory`.

## Architecture

```
PVX (SOAP) ─5m─> sync worker ─> Postgres ─> /api/inventory ─> bootstrap.js ─> app.js
```

- **`server/pvx.js`** — SOAP client. Authenticates, caches the session, re-auths on `Invalid Session`, pages `GetReportData` (1000 rows/page) for the `Item inventory by location` template.
- **`server/sync.js`** — runs on boot and every `SYNC_INTERVAL_MS` (default 5 min). Truncate + bulk insert inside a transaction; records each run in `sync_runs`.
- **`server/shape.js`** — turns DB rows into the `WAREHOUSE_DATA` shape the frontend already consumes. Locations matching `A{n}.B{n}.L{n}.S{n}` go into `grid`; everything else into `other`.
- **`bootstrap.js`** — fetches `/api/inventory`, sets `window.WAREHOUSE_DATA`, then loads `app.js`. Falls back to the static `inventory.js` blob if the API is down (so the GitHub Pages mirror still works).

## Local dev

```bash
# 1. Postgres
docker run -d --name vw-pg -p 5432:5432 -e POSTGRES_PASSWORD=pg postgres:16

# 2. Env
cp .env.example .env
# fill in PVX_PASSWORD_B64 — `printf '%s' 'yourpassword' | base64`

# 3. Install + run
npm install
npm start
```

Then open <http://localhost:3000>.

To trigger a one-off sync without booting the server:

```bash
npm run sync:once
```

## Deploy to Railway

1. Create a new Railway project from this repo. Railway picks up `railway.json` and uses `node server/index.js` as the start command. The healthcheck is wired to `/api/health`.
2. Click **+ New** → **Database** → **Add PostgreSQL**. Railway auto-injects `DATABASE_URL`.
3. Open the service's **Variables** tab and add:

   | Variable           | Value                                                                                                                                  |
   | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
   | `PVX_URL`          | `https://ap.peoplevox.net/ryd1039/resources/integrationservicev4.asmx`                                                                 |
   | `PVX_CLIENT_ID`    | `ryd1039`                                                                                                                              |
   | `PVX_USERNAME`     | Your PVX API username                                                                                                                  |
   | `PVX_PASSWORD_B64` | Base64-encoded password                                                                                                                |
   | `PVX_TEMPLATE`     | `Item inventory by location` (default; only change if your template name differs)                                                      |
   | `PVX_COLUMNS`      | `[Item Code],[Name],[Stock Count],[Container Barcode],[Location barcode],[Site reference],[Location type],[Item type group]` (default) |
   | `SYNC_INTERVAL_MS` | `300000` (5 min)                                                                                                                       |

4. Deploy. First sync runs on boot; subsequent syncs every 5 min. Watch logs for `[sync] run #N ok — X rows in Yms`.
5. Generate a public domain in **Settings → Networking** and open it. The frontend will fetch from `/api/inventory` automatically.

### Operational endpoints

- `GET /api/health` — DB ping.
- `GET /api/inventory` — current snapshot in the frontend's `WAREHOUSE_DATA` shape.
- `GET /api/sync-status` — last 10 sync runs.
- `POST /api/sync-now` — kick off a sync manually (no auth — keep this private or add one before exposing publicly).

## Known gotchas, baked in

- Sessions die after 30 min of inactivity. The client pre-emptively re-auths after 25 min and on any `Invalid Session` response.
- `ItemsPerPage=0` would return the whole warehouse in one call and the docs warn it'll time out. We page at 1000 with a 400ms pause between pages — comfortably under the 15-req/15-sec rate limit.
- Location parsing tolerates non-padded slot numbers (`S6` vs `S04`). The frontend's location codes are written zero-padded for consistency.
- `Container Barcode` and `Site reference` default to empty string (not NULL) so the composite primary key on `stock_items` works.

## Security notes

- Rotate the PVX password before any long-running deploy and ideally move off the shared `Customer Service` admin login — set up a dedicated API user under **Setup → Users** in PVX (read-only scope is enough for this read pipeline).
- `POST /api/sync-now` has no auth. If you expose this to the internet without a reverse proxy in front, slap an auth header check on it.
