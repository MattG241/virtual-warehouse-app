import { XMLParser } from 'fast-xml-parser';

const xml = new XMLParser({ ignoreAttributes: true });

function soapEnvelope(action, bodyXml, sessionHeader = null) {
  const header = sessionHeader
    ? `<soap:Header>
    <UserSessionCredentials xmlns="http://www.peoplevox.net/">
      <UserId>0</UserId>
      <ClientId>${sessionHeader.clientId}</ClientId>
      <SessionId>${sessionHeader.sessionId}</SessionId>
    </UserSessionCredentials>
  </soap:Header>`
    : '';

  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
 xmlns:xsd="http://www.w3.org/2001/XMLSchema"
 xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  ${header}
  <soap:Body>
    ${bodyXml}
  </soap:Body>
</soap:Envelope>`;
}

async function post(url, action, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: `"http://www.peoplevox.net/${action}"`,
    },
    body,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`PVX ${action} HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  return text;
}

function extractResult(parsed, responseKey, resultKey) {
  const env = parsed['soap:Envelope'] || parsed.Envelope;
  const inner = env?.['soap:Body']?.[responseKey]?.[resultKey];
  if (!inner) {
    throw new Error(`PVX response missing ${responseKey}.${resultKey}`);
  }
  return inner;
}

export class PvxClient {
  constructor({ url, clientId, username, passwordB64 }) {
    this.url = url;
    this.clientId = clientId;
    this.username = username;
    this.passwordB64 = passwordB64;
    this.sessionId = null;
    this.sessionMintedAt = 0;
  }

  async authenticate() {
    const body = `<Authenticate xmlns="http://www.peoplevox.net/">
      <clientId>${this.clientId}</clientId>
      <username>${escapeXml(this.username)}</username>
      <password>${this.passwordB64}</password>
    </Authenticate>`;

    const envelope = soapEnvelope('Authenticate', body);
    const responseText = await post(this.url, 'Authenticate', envelope);
    const parsed = xml.parse(responseText);
    const result = extractResult(parsed, 'AuthenticateResponse', 'AuthenticateResult');

    if (String(result.ResponseId) !== '0') {
      throw new Error(`PVX Authenticate failed: ${result.Detail || 'unknown'}`);
    }
    const detail = String(result.Detail || '');
    const parts = detail.split(',');
    if (parts.length < 2 || !parts[1]) {
      throw new Error(`PVX Authenticate returned unexpected Detail: ${detail}`);
    }
    this.sessionId = parts[1];
    this.sessionMintedAt = Date.now();
    return this.sessionId;
  }

  async ensureSession() {
    // Sessions die after 30 min idle. Pre-emptively refresh at 25 min just in case.
    const stale = !this.sessionId || Date.now() - this.sessionMintedAt > 25 * 60 * 1000;
    if (stale) await this.authenticate();
    return this.sessionId;
  }

  async getReportPage({ template, columns, pageNo, pageSize, orderBy = '[Item Code]' }) {
    const fire = async () => {
      await this.ensureSession();
      const body = `<GetReportData xmlns="http://www.peoplevox.net/">
        <getReportRequest>
          <TemplateName>${escapeXml(template)}</TemplateName>
          <PageNo>${pageNo}</PageNo>
          <SearchClause></SearchClause>
          <ItemsPerPage>${pageSize}</ItemsPerPage>
          <FilterClause></FilterClause>
          <OrderBy>${escapeXml(orderBy)}</OrderBy>
          <Columns>${escapeXml(columns)}</Columns>
        </getReportRequest>
      </GetReportData>`;
      const envelope = soapEnvelope('GetReportData', body, {
        clientId: this.clientId,
        sessionId: this.sessionId,
      });
      return post(this.url, 'GetReportData', envelope);
    };

    let responseText = await fire();
    let parsed = xml.parse(responseText);
    let result = extractResult(parsed, 'GetReportDataResponse', 'GetReportDataResult');

    // Invalid Session — re-auth once and retry.
    if (
      String(result.ResponseId) !== '0' &&
      String(result.Detail || '').toLowerCase().includes('invalid session')
    ) {
      this.sessionId = null;
      responseText = await fire();
      parsed = xml.parse(responseText);
      result = extractResult(parsed, 'GetReportDataResponse', 'GetReportDataResult');
    }

    if (String(result.ResponseId) !== '0') {
      throw new Error(`PVX GetReportData failed: ${result.Detail || 'unknown'}`);
    }

    const totalCount = Number(result.TotalCount || 0);
    const csv = String(result.Detail || '');
    return { totalCount, csv };
  }

  async *iterateAllRows({ template, columns, pageSize, pageDelayMs }) {
    let pageNo = 1;
    let totalCount = Infinity;
    let yielded = 0;
    let headerYielded = false;

    while (yielded < totalCount) {
      const { totalCount: tc, csv } = await this.getReportPage({
        template,
        columns,
        pageNo,
        pageSize,
      });
      totalCount = tc;
      const rows = parseCsv(csv);
      if (rows.length === 0) break; // truly empty response
      const [header, ...data] = rows;
      // Yield the header as soon as we have it — even if data is empty,
      // so the caller can distinguish "0 rows" from "template broken".
      if (!headerYielded) {
        yield { header, totalCount };
        headerYielded = true;
      }
      for (const row of data) {
        yield { row };
        yielded++;
      }
      if (data.length === 0) break;
      pageNo++;
      if (pageDelayMs > 0 && yielded < totalCount) {
        await sleep(pageDelayMs);
      }
    }
  }
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field);
        field = '';
      } else if (c === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else if (c === '\r') {
        // skip
      } else {
        field += c;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 0 && !(r.length === 1 && r[0] === ''));
}
