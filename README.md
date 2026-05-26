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

### Auth setup (email + password)

Layout edits require authentication. Stock viewing remains public.

Add these to Railway → service → **Variables**:

| Variable         | Value                                                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `JWT_SECRET`     | A 48+ byte random string. Generate locally: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `ALLOWED_DOMAINS` | Comma-separated domains allowed to register, e.g. `ryderwear.com.au`. Anyone with a matching email address can create an account. |
| `ALLOWED_EMAILS` | Optional. Specific emails allowed in addition to (or instead of) `ALLOWED_DOMAINS`. Use `*` in either to allow any.         |
| `NODE_ENV`       | Set to `production` so session cookies are flagged `Secure`.                                                                |

That's it — no external email service required. Passwords are hashed with scrypt (Node built-in) and stored in the `users` table. Anyone whose email is in `ALLOWED_EMAILS` can hit **Sign in → Create one** on first visit, pick a password, and they're in. Subsequent visits use email + password.

### Picking leaderboard

The dashboard ranks pickers by units picked over Today / Last 7d / Last 30d windows. It runs by default against PVX's built-in **`User activity`** report, which returns cumulative per-user totals (Picks completed, Items picked, Items moved, Orders despatched, etc.).

| Variable             | Default                                                                                                                                                                                                                | Notes                                                                                       |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `PVX_PICK_TEMPLATE`  | `User activity`                                                                                                                                                                                                        | Set to empty string to disable the leaderboard entirely.                                    |
| `PVX_PICK_COLUMNS`   | `[UserName],[Picks completed],[Items picked],[Items skipped],[Containers moved],[Item movements performed],[Items moved],[Orders despatched],[Packages despatched],[Items despatched]`                                 | Override if your template renames columns.                                                  |
| `PVX_PICK_USER_COL`  | `UserName`                                                                                                                                                                                                             | The column name holding the picker.                                                         |

**How the time-window leaderboard works.** The User activity report only gives totals, not per-event timestamps. The sync therefore snapshots the whole table into `pick_user_totals` (one row per user per sync, append-only). The `/api/leaderboard` endpoint then computes window activity as:

```
latest_snapshot - newest_snapshot_taken_before_window_start
```

So "Today" = current totals minus whatever the totals were at midnight. "Last 7d" diffs against 7 days ago, etc. Pickers without a pre-window snapshot are excluded for that window (they'll appear once history catches up — typically the next sync). Old snapshots are pruned after 35 days.

Rows where every metric is 0 (Admin, `Pvx*`, dormant accounts) are dropped at ingest, so the leaderboard only shows real activity.

Endpoints:

- `GET /api/leaderboard?window=today|week|month&limit=10` — ranked list `[{picker, units, lines, orders}]`. `units` = Items picked, `lines` = Picks completed, `orders` = Orders despatched. The `configured`, `totalRows`, and `latest` fields help the UI distinguish "not set up" from "no data yet".
- `POST /api/picks/sync-now` — kick off a one-off pick sync (handy after changing the template/columns env vars or to seed an extra snapshot).

If your PVX tenant uses different column headers, override `PVX_PICK_COLUMNS` and (if needed) `PVX_PICK_USER_COL`. The first sync logs the available headers if a required column is missing, so you can copy the exact names.

### Slack alerts (optional)

Create an Incoming Webhook in your Slack workspace (Apps → Incoming Webhooks → Add to Slack → pick a channel). Drop the URL into Railway:

```
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T.../B.../...
LOW_AISLE_THRESHOLD_PCT=10
```

What fires:

- **Sync failure** — immediate alert with the error text
- **New zero-stock SKUs** — after every successful sync, posts the SKUs that just hit zero (sample of 25, count of more)
- **Stock recovery** — small recoveries (≤ 5 SKUs) get a check-mark message; large recoveries are skipped to avoid noise
- **Aisle below threshold** — aisles whose stocked-slot percentage drops below `LOW_AISLE_THRESHOLD_PCT`

Test the wiring:

```
curl -X POST https://your-app.up.railway.app/api/alerts/test
```

If `SLACK_WEBHOOK_URL` is unset, the alerts log to the server console instead so you can see what would have posted.

### Operational endpoints

- `GET /api/health` — DB ping.
- `GET /api/inventory` — current snapshot in the frontend's `WAREHOUSE_DATA` shape.
- `GET /api/sync-status` — last 10 sync runs.
- `POST /api/sync-now` — kick off a sync manually.
- `GET /api/events` — Server-Sent Events stream (sync.started/completed, layout.updated).
- `POST /api/auth/register` — body `{ email, password }`. Email must be in `ALLOWED_EMAILS`.
- `POST /api/auth/login` — body `{ email, password }`. Sets session cookie.
- `GET /api/auth/me` — returns the current user (or null).
- `POST /api/auth/logout` — clears the session cookie.
- `GET /api/audit?limit=N` — audit log (requires auth).
- `PUT /api/layout` — saves the warehouse layout (requires auth).
- `GET /api/leaderboard?window=today|week|month` — picker leaderboard (see Picking leaderboard section).
- `POST /api/picks/sync-now` — kick off a one-off pick activity sync.

## Known gotchas, baked in

- Sessions die after 30 min of inactivity. The client pre-emptively re-auths after 25 min and on any `Invalid Session` response.
- `ItemsPerPage=0` would return the whole warehouse in one call and the docs warn it'll time out. We page at 1000 with a 400ms pause between pages — comfortably under the 15-req/15-sec rate limit.
- Location parsing tolerates non-padded slot numbers (`S6` vs `S04`). The frontend's location codes are written zero-padded for consistency.
- `Container Barcode` and `Site reference` default to empty string (not NULL) so the composite primary key on `stock_items` works.

## Security notes

- Rotate the PVX password before any long-running deploy and ideally move off the shared `Customer Service` admin login — set up a dedicated API user under **Setup → Users** in PVX (read-only scope is enough for this read pipeline).
- `POST /api/sync-now` has no auth. If you expose this to the internet without a reverse proxy in front, slap an auth header check on it.
