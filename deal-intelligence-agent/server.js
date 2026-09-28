const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const GroqSdk = require('groq-sdk');
const Groq = GroqSdk.default || GroqSdk;
const { HindsightClient } = require('@vectorize-io/hindsight-client');
require('dotenv').config();

const PORT = process.env.PORT || 3000;
const BANK = 'deal-agent';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const hindsight = new HindsightClient({
  baseUrl: process.env.HINDSIGHT_API_URL || 'https://api.hindsight.vectorize.io',
  apiKey: process.env.HINDSIGHT_API_KEY
});

// AI chat helper
async function getAIResponse(messages, maxTokens = 600) {
  try {
    const res = await groq.chat.completions.create({
      model: 'openai/gpt-oss-120b',
      messages,
      max_tokens: maxTokens,
      temperature: 0.7
    });
    return res.choices[0]?.message?.content || '';
  } catch (err) {
    const res = await groq.chat.completions.create({
      model: 'openai/gpt-oss-20b',
      messages,
      max_tokens: maxTokens,
      temperature: 0.7
    });
    return res.choices[0]?.message?.content || '';
  }
}

const SYSTEM_PROMPT = `You are DealIntel, an intelligent, friendly, and expert sales co-pilot.
You work directly with sales representatives, account executives, and sales leaders.

Your Personality & Behavior:
- Warm, natural, and encouraging — like a sharp, supportive sales colleague sitting right next to the rep.
- Respond naturally to greetings ("Hi", "Hello!", "How are you?").
- When asked about a deal, company, or person (e.g., Acme, John, Nike, Elon), use the provided Hindsight Memories to give a crisp, actionable briefing.
- When the rep describes a call or prospect objection, provide practical, high-impact counter-arguments and clear next steps.
- If the rep mentions logging a call or speaking with someone, confirm that the details are noted and saved into team memory.
- Format responses cleanly with readable markdown (bolding, concise bullet points) so reps can read them at a glance.`;

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // API: Get recent memories from Hindsight
  if (req.method === 'GET' && pathname === '/api/memories') {
    try {
      const q = parsedUrl.query.q || 'deal';
      const memRes = await hindsight.recall(BANK, q);
      const results = memRes.results || [];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, count: results.length, memories: results }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // API: Conversational Chat
  if (req.method === 'POST' && pathname === '/api/chat') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { message, history = [] } = JSON.parse(body || '{}');
        if (!message) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Message is required' }));
          return;
        }

        const lower = message.toLowerCase();
        const isCall = lower.includes('called') || lower.includes('spoke with') || lower.includes('met with') || lower.includes('call outcome') || lower.includes('had a call') || lower.includes('talked to');
        let memorySaved = false;
        let dealHint = 'GENERAL';

        if (isCall) {
          const match = message.match(/\b(ACME_\w+|Acme|Nike|Tesla|Elon|Apple)\b/i);
          dealHint = match ? match[0].toUpperCase() : 'GENERAL';
          try {
            await hindsight.retain(BANK, `[Deal: ${dealHint}] ${message}`, {
              metadata: { dealId: dealHint, type: 'call_summary', timestamp: new Date().toISOString() }
            });
            memorySaved = true;
          } catch (e) {
            console.error('Retain error:', e.message);
          }
        }

        // Retrieve memories
        let memoryText = '';
        let memoriesFound = [];
        try {
          const memRes = await hindsight.recall(BANK, message);
          memoriesFound = (memRes.results || []).slice(0, 6);
          if (memoriesFound.length > 0) {
            memoryText = `\n\n[RELEVANT HINDSIGHT TEAM MEMORIES]:\n` + memoriesFound.map((m, i) => `${i + 1}. ${m.text}`).join('\n');
          }
        } catch (e) {
          console.error('Recall error:', e.message);
        }

        const messages = [
          { role: 'system', content: SYSTEM_PROMPT + memoryText },
          ...history.slice(-8),
          { role: 'user', content: message }
        ];

        const reply = await getAIResponse(messages, 650);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          reply,
          memorySaved,
          dealHint,
          memoriesUsed: memoriesFound.length
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // Static File Serving
  let filePath = path.join(__dirname, 'public', pathname === '/' ? 'index.html' : pathname);
  const ext = path.extname(filePath);
  const contentTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png'
  };

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'application/octet-stream' });
      res.end(content);
    }
  });
});

if (!process.env.VERCEL) {
  server.listen(PORT, () => {
    console.log(`\n🚀 DealIntel Web Assistant live at: http://localhost:${PORT}`);
  });
}

module.exports = server;
