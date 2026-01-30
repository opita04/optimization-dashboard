import { list } from '@vercel/blob';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const { blobs } = await list({ prefix: 'results/' });
    const csvBlobs = blobs
      .filter(b => b.pathname.endsWith('.csv'))
      .map(b => ({
        file: b.pathname.replace('results/', ''),
        size: b.size,
        modified: b.uploadedAt,
        url: b.url
      }));
    return res.status(200).json(csvBlobs);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
