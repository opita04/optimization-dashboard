import { list, put } from '@vercel/blob';

function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',');
  return lines.slice(1).map(line => {
    const values = [];
    let current = '', inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { values.push(current); current = ''; continue; }
      current += ch;
    }
    values.push(current);
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
        const rows = parseCSV(text);
        const file = blob.pathname.replace('results/', '');
        const isRenko = file.startsWith('renko_');
        const timestamp = file.replace(/^(parallel|renko)_results_/, '').replace('.csv', '');
        rows.forEach(r => {
          r.source_file = file;
          r.run_timestamp = timestamp;
          r.type = isRenko ? 'Renko' : 'Parallel';
          r.archived = false;
          if (isRenko && !r.timeframe) r.timeframe = 'Renko_' + r.brick_size;
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
