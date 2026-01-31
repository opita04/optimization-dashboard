import { list, put } from '@vercel/blob';

const RENKO_COLUMNS = [
  'asset',
  'block_size',
  'ema_fast',
  'ema_medium',
  'ema_slow',
  'zone',
  'total',
  'up',
  'down',
  'up_ratio',
  'down_ratio',
  'chi2',
  'p_value',
  'significant'
];

function parseCSVLine(line) {
  const values = [];
  let current = '', inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === ',' && !inQuotes) { values.push(current); current = ''; continue; }
    current += ch;
  }
  values.push(current);
  return values;
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = parseCSVLine(lines[0]).map(h => h.trim());
  if (headers[0]) headers[0] = headers[0].replace(/^\uFEFF/, '');
  const rows = lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const row = {};
    headers.forEach((h, idx) => {
      const v = (values[idx] || '').trim();
      if (v !== '' && !isNaN(v) && h !== 'best_params') row[h] = parseFloat(v);
      else if (v === 'True') row[h] = true;
      else if (v === 'False') row[h] = false;
      else row[h] = v;
    });
    return row;
  });
  return { headers, rows };
}

function isRenkoHeaders(headers) {
  const headerSet = new Set(headers.map(h => h.trim().toLowerCase()));
  return RENKO_COLUMNS.every(col => headerSet.has(col));
}

function formatRatio(value) {
  if (value === null || value === undefined || value === '' || Number.isNaN(value)) return '-';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  const pct = numeric <= 1 ? numeric * 100 : numeric;
  return pct.toFixed(1) + '%';
}

function formatNumber(value, decimals) {
  if (value === null || value === undefined || value === '' || Number.isNaN(value)) return '-';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  return numeric.toFixed(decimals);
}

function formatRenkoTimeframe(blockSize) {
  if (blockSize === null || blockSize === undefined || blockSize === '') return undefined;
  const numeric = Number(blockSize);
  if (!Number.isFinite(numeric)) return `Renko_${blockSize}`;
  const normalized = Number.isInteger(numeric) ? String(numeric) : String(numeric);
  return `Renko_${normalized}`;
}

function formatZoneStats(row) {
  const zone = row.zone ?? '-';
  const total = row.total ?? 0;
  const up = row.up ?? 0;
  const down = row.down ?? 0;
  const upRatio = formatRatio(row.up_ratio);
  const downRatio = formatRatio(row.down_ratio);
  const chi2 = formatNumber(row.chi2, 2);
  const pValue = formatNumber(row.p_value, 4);
  const sigLabel = row.significant ? 'Significant' : 'Not significant';
  return `Zone ${zone}: ${total} total (Up ${up}, Down ${down}) • Up ${upRatio}, Down ${downRatio} • chi2 ${chi2}, p ${pValue} • ${sigLabel}`;
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      // List all blobs and parse CSVs
      const { blobs } = await list({ prefix: 'results/' });
      const csvBlobs = blobs.filter(b => b.pathname.endsWith('.csv'));
      
      const allRows = [];
      for (const blob of csvBlobs) {
        const response = await fetch(blob.url);
        const text = await response.text();
      const { headers, rows } = parseCSV(text);
      const file = blob.pathname.replace('results/', '');
      const isRenkoAnalysis = isRenkoHeaders(headers);
      const isRenko = isRenkoAnalysis || file.startsWith('renko_');
      const timestamp = file.replace(/^(parallel|renko)_results_/, '').replace('.csv', '');
      rows.forEach(r => {
        r.source_file = file;
        r.run_timestamp = timestamp;
        r.type = isRenko ? 'Renko' : (r.type || 'Parallel');
        r.archived = false;
        if (isRenkoAnalysis) {
          if (!r.symbol && r.asset) r.symbol = r.asset;
          const blockSize = r.block_size ?? r.brick_size;
          if (!r.timeframe && blockSize !== undefined) r.timeframe = formatRenkoTimeframe(blockSize);
          r.zone_stats = formatZoneStats(r);
        }
      });
      allRows.push(...rows);
    }
      return res.status(200).json(allRows);
    }

    if (req.method === 'POST') {
      // Upload CSV via multipart or raw body
      const contentType = req.headers['content-type'] || '';
      let filename, csvContent;

      if (contentType.includes('application/json')) {
        const body = req.body;
        filename = body.filename;
        csvContent = body.content;
      } else {
        // Raw CSV upload with filename in query
        filename = req.query.filename || `upload_${Date.now()}.csv`;
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        csvContent = Buffer.concat(chunks).toString('utf8');
      }

      const blob = await put(`results/${filename}`, csvContent, {
        access: 'public',
        contentType: 'text/csv'
      });

      return res.status(200).json({ uploaded: filename, url: blob.url });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
