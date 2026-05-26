const required = ['DATABASE_URL', 'PVX_URL', 'PVX_CLIENT_ID', 'PVX_USERNAME', 'PVX_PASSWORD_B64'];

function loadConfig() {
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(
      `Missing required env vars: ${missing.join(', ')}. Copy .env.example to .env or set them in Railway.`,
    );
  }

  return {
    databaseUrl: process.env.DATABASE_URL,
    pvx: {
      url: process.env.PVX_URL,
      clientId: process.env.PVX_CLIENT_ID,
      username: process.env.PVX_USERNAME,
      passwordB64: process.env.PVX_PASSWORD_B64,
      template: process.env.PVX_TEMPLATE || 'Item inventory by location',
      columns:
        process.env.PVX_COLUMNS ||
        '[Item Code],[Name],[Stock Count],[Container Barcode],[Location barcode],[Site reference],[Location type],[Item type group],[Item Barcode]',
      // --- Picking & packing leaderboard (per-window templates) ----------
      // Each time window (today / week-to-date / month-to-date) is driven
      // by its own PVX report template — that way the filter lives at the
      // template level and we just read the latest per-user totals
      // verbatim. Leave a template empty to disable that window.
      pickTemplates: {
        today: process.env.PVX_PICK_TEMPLATE_TODAY
          // Legacy alias: PVX_PICK_TEMPLATE used to be the only knob.
          || process.env.PVX_PICK_TEMPLATE
          || 'User activity - Today',
        week:  process.env.PVX_PICK_TEMPLATE_WTD   || '',
        month: process.env.PVX_PICK_TEMPLATE_MTD   || 'User activity',
      },
      pickColumns:
        process.env.PVX_PICK_COLUMNS ||
        '[UserName],[Picks completed],[Items picked],[Items skipped],[Containers moved],[Item movements performed],[Items moved],[Orders despatched],[Packages despatched],[Items despatched]',
      pickUserCol: process.env.PVX_PICK_USER_COL || 'UserName',
    },
    sync: {
      intervalMs: Number(process.env.SYNC_INTERVAL_MS || 300000),
      pageSize: Number(process.env.SYNC_PAGE_SIZE || 1000),
      pageDelayMs: Number(process.env.SYNC_PAGE_DELAY_MS || 400),
    },
    port: Number(process.env.PORT || 3000),
  };
}

export const config = loadConfig();
