require('dotenv').config();

const BANK = 'deal-agent';

const SYSTEM_PROMPT = `You are DealIntel, an intelligent, friendly, and expert sales co-pilot.
You work directly with sales representatives, account executives, and sales leaders.

Your Personality & Behavior:
- Warm, natural, and encouraging — like a sharp, supportive sales colleague sitting right next to the rep.
- Respond naturally to greetings ("Hi", "Hello!", "How are you?").
- When asked about a deal, company, or person (e.g., Acme, John, Nike, Elon), use the provided Hindsight Memories to give a crisp, actionable briefing.
- When the rep describes a call or prospect objection, provide practical, high-impact counter-arguments and clear next steps.
- If the rep mentions logging a call or speaking with someone, confirm that the details are noted and saved into team memory.
- Format responses cleanly with readable markdown (bolding, concise bullet points) so reps can read them at a glance.`;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  if (!process.env.GROQ_API_KEY) {
    res.status(500).json({ success: false, error: 'GROQ_API_KEY missing in Vercel env vars' });
    return;
  }

  const GroqSdk = require('groq-sdk');
  const Groq = GroqSdk.default || GroqSdk;
  const { HindsightClient } = require('@vectorize-io/hindsight-client');
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const hindsight = new HindsightClient({
    baseUrl: process.env.HINDSIGHT_API_URL || 'https://api.hindsight.vectorize.io',
    apiKey: process.env.HINDSIGHT_API_KEY
  });

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

  try {
    let body = req.body;
    if (typeof body === 'string') {
      body = JSON.parse(body || '{}');
    }
    const { message, history = [] } = body || {};
    if (!message) {
      res.status(400).json({ error: 'Message is required' });
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

    res.status(200).json({
      success: true,
      reply,
      memorySaved,
      dealHint,
      memoriesUsed: memoriesFound.length
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
