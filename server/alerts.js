import { pool } from './db.js';

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || '';
const ZERO_STOCK_ALERT_LIMIT = 25;
const LOW_AISLE_THRESHOLD = Number(process.env.LOW_AISLE_THRESHOLD_PCT || 10);

export async function postToSlack(text, blocks) {
  if (!SLACK_WEBHOOK_URL) {
    console.log(`[alerts] SLACK_WEBHOOK_URL not set — would have posted:\n  ${text}`);
    return { delivered: 'logged' };
  }
  const body = blocks ? { text, blocks } : { text };
  const res = await fetch(SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const bodyText = await res.text();
    throw new Error(`Slack ${res.status}: ${bodyText.slice(0, 200)}`);
  }
  return { delivered: 'sent' };
}

export async function postSyncFailure(runId, errorMessage) {
  try {
    await postToSlack(
      `:x: Warehouse sync run #${runId} failed`,
      [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*:x: Sync failure* — run #${runId}\n\`\`\`${(errorMessage || '').slice(0, 1500)}\`\`\``,
          },
        },
      ],
    );
  } catch (e) {
    console.warn('[alerts] postSyncFailure failed:', e.message);
  }
}

export async function postStockDeltas(runId) {
  try {
    const current = await pool.query(`
      SELECT item_code, MAX(item_name) AS item_name
        FROM stock_items
       GROUP BY item_code
      HAVING SUM(stock_count) = 0
    `);
    const currentSet = new Set(current.rows.map((r) => r.item_code));

    const prev = await pool.query(
      `SELECT data FROM alert_state WHERE key = 'zero_stock_skus'`,
    );
    const prevSet = new Set(prev.rows[0]?.data?.skus || []);
    const firstRun = prev.rows.length === 0;

    // Persist current snapshot regardless so the next run has a baseline.
    await pool.query(
      `INSERT INTO alert_state (key, data, updated_at)
       VALUES ('zero_stock_skus', $1::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
      [JSON.stringify({ skus: Array.from(currentSet) })],
    );

    if (firstRun) {
      // No baseline yet — skip alerting on the first run after deploy.
      return;
    }

    const newlyZero = current.rows.filter((r) => !prevSet.has(r.item_code));
    const recovered = [...prevSet].filter((s) => !currentSet.has(s));

    if (newlyZero.length > 0) {
      const sample = newlyZero
        .slice(0, ZERO_STOCK_ALERT_LIMIT)
        .map((r) => `• \`${r.item_code}\` — ${r.item_name || '(unnamed)'}`)
        .join('\n');
      const more =
        newlyZero.length > ZERO_STOCK_ALERT_LIMIT
          ? `\n…and ${newlyZero.length - ZERO_STOCK_ALERT_LIMIT} more`
          : '';
      await postToSlack(
        `:warning: ${newlyZero.length} SKUs went to zero in run #${runId}`,
        [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*:warning: ${newlyZero.length} SKU${newlyZero.length === 1 ? '' : 's'} went to zero stock* — run #${runId}\n${sample}${more}`,
            },
          },
        ],
      );
    }

    if (recovered.length > 0 && recovered.length <= 5) {
      // Only post a recovery message when it's a small batch — otherwise too noisy
      await postToSlack(
        `:white_check_mark: ${recovered.length} SKUs came back from zero stock`,
        [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text:
                `*:white_check_mark: Stock recovered* — run #${runId}\n` +
                recovered.map((c) => `• \`${c}\``).join('\n'),
            },
          },
        ],
      );
    }
  } catch (e) {
    console.warn('[alerts] postStockDeltas failed:', e.message);
  }
}

export async function postAisleFullness(runId) {
  if (LOW_AISLE_THRESHOLD <= 0) return;
  try {
    // Pull the layout to know the total slot count per aisle, plus the actual
    // stocked count, then compute fullness percentage.
    const layoutR = await pool.query(`SELECT data FROM warehouse_layout WHERE id = 1`);
    if (!layoutR.rows[0]) return;
    const aisles = layoutR.rows[0].data?.aisles || [];
    if (!aisles.length) return;

    const stockR = await pool.query(`
      SELECT
        SUBSTRING(location_barcode FROM '^A0*(\\d+)\\.') AS aisle_num,
        COUNT(*) FILTER (WHERE stock_count > 0) AS stocked_slots
        FROM stock_items
       WHERE location_barcode ~ '^A\\d+\\.B\\d+\\.L\\d+\\.S\\d+$'
       GROUP BY aisle_num
    `);
    const stockedByAisle = new Map(
      stockR.rows.map((r) => [String(r.aisle_num), Number(r.stocked_slots)]),
    );

    const low = [];
    for (const aisle of aisles) {
      const totalSlots = aisle.bays.reduce(
        (acc, b) => acc + b.lanes.reduce((a, l) => a + l.slots.length, 0),
        0,
      );
      if (totalSlots === 0) continue;
      const num = aisle.id?.replace(/^A0*/, '');
      const stocked = stockedByAisle.get(num) || 0;
      const pct = (stocked / totalSlots) * 100;
      if (pct < LOW_AISLE_THRESHOLD) {
        low.push({ id: aisle.id, pct: Math.round(pct), stocked, total: totalSlots });
      }
    }
    if (!low.length) return;

    await postToSlack(
      `:bar_chart: ${low.length} aisle${low.length === 1 ? '' : 's'} below ${LOW_AISLE_THRESHOLD}% full`,
      [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text:
              `*:bar_chart: Low aisle fullness* — run #${runId}\n` +
              low
                .sort((a, b) => a.pct - b.pct)
                .map((a) => `• *${a.id}* — ${a.pct}% (${a.stocked}/${a.total})`)
                .join('\n'),
          },
        },
      ],
    );
  } catch (e) {
    console.warn('[alerts] postAisleFullness failed:', e.message);
  }
}

export function attachAlertTestRoute(app) {
  app.post('/api/alerts/test', async (_req, res) => {
    try {
      const result = await postToSlack(
        ':test_tube: Virtual Warehouse webhook test',
        [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*:test_tube: Webhook test* — if you can see this in Slack, alerts are wired correctly.',
            },
          },
        ],
      );
      res.json({ ok: true, ...result });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });
}
