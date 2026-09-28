const BANK = 'deal-agent';

require('dotenv').config();

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (!process.env.HINDSIGHT_API_KEY) {
    res.status(500).json({ success: false, error: 'HINDSIGHT_API_KEY missing in Vercel env vars' });
    return;
  }

  const { HindsightClient } = require('@vectorize-io/hindsight-client');
  const hindsight = new HindsightClient({
    baseUrl: process.env.HINDSIGHT_API_URL || 'https://api.hindsight.vectorize.io',
    apiKey: process.env.HINDSIGHT_API_KEY
  });

  try {
    const q = (req.query && req.query.q) || 'deal';
    const memRes = await hindsight.recall(BANK, q);
    const results = memRes.results || [];
    res.status(200).json({ success: true, count: results.length, memories: results });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
};
