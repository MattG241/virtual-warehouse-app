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
      // --- Picking leaderboard (optional) ---------------------------------
      // Leave PVX_PICK_TEMPLATE blank to disable pick sync entirely.
      // PVX_PICK_*_COL values name the columns inside PVX_PICK_COLUMNS used
      // for picker, units and timestamp — defaults are guesses; override to
      // match the actual report template in your PVX tenant.
      pickTemplate: process.env.PVX_PICK_TEMPLATE || '',
      pickColumns:
        process.env.PVX_PICK_COLUMNS ||
        '[Picked by],[Order Number],[Item Code],[Quantity],[Picked on]',
      pickUserCol: process.env.PVX_PICK_USER_COL || 'Picked by',
      pickUnitsCol: process.env.PVX_PICK_UNITS_COL || 'Quantity',
      pickTimestampCol: process.env.PVX_PICK_TIMESTAMP_COL || 'Picked on',
      pickOrderCol: process.env.PVX_PICK_ORDER_COL || 'Order Number',
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
