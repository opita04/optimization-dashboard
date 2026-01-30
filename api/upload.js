import { put } from '@vercel/blob';

export const config = {
  api: { bodyParser: false }
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const filename = req.query.filename || `upload_${Date.now()}.csv`;
    const blob = await put(`results/${filename}`, req, {
      access: 'public',
      contentType: 'text/csv'
    });
    return res.status(200).json({ uploaded: filename, url: blob.url });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
