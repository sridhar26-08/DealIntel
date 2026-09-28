const readline = require('readline');
const GroqSdk = require('groq-sdk');
const Groq = GroqSdk.default || GroqSdk;
const { HindsightClient } = require('@vectorize-io/hindsight-client');
require('dotenv').config();

// ─── Setup Groq & Hindsight ────────────────────────────────────
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const hindsight = new HindsightClient({
  baseUrl: process.env.HINDSIGHT_API_URL || 'https://api.hindsight.vectorize.io',
  apiKey: process.env.HINDSIGHT_API_KEY
});
const BANK = 'deal-agent';

// Model selection with fallback
const PRIMARY_MODEL = 'openai/gpt-oss-120b';
const FALLBACK_MODEL = 'openai/gpt-oss-20b';

async function callGroqChat(messages, maxTokens = 600) {
  try {
    const res = await groq.chat.completions.create({
      model: PRIMARY_MODEL,
      messages,
      max_tokens: maxTokens,
      temperature: 0.7
    });
    return res.choices[0]?.message?.content || '';
  } catch (err) {
    try {
      const fallbackRes = await groq.chat.completions.create({
        model: FALLBACK_MODEL,
        messages,
        max_tokens: maxTokens,
        temperature: 0.7
      });
      return fallbackRes.choices[0]?.message?.content || '';
    } catch (e2) {
      throw new Error(`AI generation error: ${e2.message}`);
    }
  }
}

// ─── Terminal Styling ──────────────────────────────────────────
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  white: '\x1b[37m',
  gray: '\x1b[90m'
};

// ─── Memory Helpers ───────────────────────────────────────────
async function queryMemories(queryText) {
  try {
    const response = await hindsight.recall(BANK, queryText);
    const results = response.results || [];
    return results.slice(0, 8); // Top 8 relevant memories
  } catch (err) {
    console.error(`[Memory Recall Error]: ${err.message}`);
    return [];
  }
}

async function saveMemory(summary, dealId = 'GENERAL', type = 'interaction') {
  try {
    await hindsight.retain(BANK, `[Deal: ${dealId}] ${summary}`, {
      metadata: { dealId, type, timestamp: new Date().toISOString() }
    });
    return true;
  } catch (err) {
    console.error(`[Memory Retain Error]: ${err.message}`);
    return false;
  }
}

// Check if message looks like logging a call / meeting
function isCallUpdate(text) {
  const lower = text.toLowerCase();
  return (
    lower.includes('called') ||
    lower.includes('spoke with') ||
    lower.includes('met with') ||
    lower.includes('call outcome') ||
    lower.includes('had a call') ||
    lower.includes('call with') ||
    lower.includes('meeting with') ||
    lower.includes('talked to') ||
    lower.includes('discussed with') ||
    lower.includes('i just spoke') ||
    lower.includes('just finished a call')
  );
}

// Extract company or deal ID hint
function extractDealHint(text) {
  const match = text.match(/\b(ACME_\w+|Acme|Nike|Tesla|Elon|Apple|Google)\b/i);
  return match ? match[0].toUpperCase() : 'GENERAL';
}

// ─── Conversational Engine ─────────────────────────────────────
const SYSTEM_PROMPT = `You are DealIntel, an intelligent, friendly, and expert sales co-pilot.
You work directly with sales representatives, account executives, and sales leaders.

Your Personality & Tone:
- Natural, conversational, warm, and highly supportive — like a sharp, experienced sales mentor or partner sitting right next to the rep.
- Respond normally and naturally to greetings ("Hi", "Hey", "Good morning", "How are you doing?").
- When a rep asks about a prospect, deal, or company (e.g. Acme, John, Nike, Elon), review the provided Hindsight Memories and brief them clearly in seconds. Highlight key players, what worked previously, open objections, and current stage.
- When a rep shares call feedback or updates, acknowledge what they learned, highlight key strategic takeaways, and suggest concrete next steps.
- When a rep brings up an objection (e.g., pricing, competitor features, compliance), provide 2-3 practical, high-converting talk tracks or counter-arguments they can say immediately.
- Format responses cleanly with brief bullet points or short paragraphs so it's effortless to read in a terminal or between sales calls.
- NEVER talk like a robotic command-line tool. Speak like a real human colleague.`;

async function handleMessage(userMessage, conversationHistory) {
  const isCall = isCallUpdate(userMessage);
  let memoryStored = false;
  let dealHint = extractDealHint(userMessage);

  // If rep is reporting a call or outcome, persist it to Hindsight
  if (isCall) {
    memoryStored = await saveMemory(userMessage, dealHint, 'call_update');
  }

  // Retrieve relevant past memories from Hindsight
  const memories = await queryMemories(userMessage);

  let memoryContext = '';
  if (memories.length > 0) {
    memoryContext = `\n\n[RELEVANT HINDSIGHT TEAM MEMORIES]:\n` + 
      memories.map((m, i) => `${i + 1}. ${m.text}`).join('\n');
  }

  const promptMessages = [
    { role: 'system', content: SYSTEM_PROMPT + memoryContext },
    ...conversationHistory,
    { role: 'user', content: userMessage }
  ];

  const reply = await callGroqChat(promptMessages);

  return {
    reply,
    memoryStored,
    memoriesFound: memories.length,
    dealHint
  };
}

// ─── Interactive CLI Loop ──────────────────────────────────────
function showWelcome() {
  console.clear();
  console.log(`
${C.cyan}${C.bold}╔═══════════════════════════════════════════════════════════════════════╗
║                                                                       ║
║   🧠  DEALINTEL  —  Conversational AI Sales Assistant                 ║
║   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━               ║
║   Groq LLM ⚡ Hindsight Persistent Memory                             ║
║                                                                       ║
╚═══════════════════════════════════════════════════════════════════════╝${C.reset}

${C.white}You can talk to DealIntel just like a real teammate! For example:${C.reset}
  ${C.gray}•${C.reset} ${C.yellow}"Hi! How are you?"${C.reset}
  ${C.gray}•${C.reset} ${C.yellow}"Brief me on Acme Corp. What happened last time?"${C.reset}
  ${C.gray}•${C.reset} ${C.yellow}"I just had a call with John at Acme, he asked for SOC 2 reports."${C.reset}
  ${C.gray}•${C.reset} ${C.yellow}"The prospect said our competitor has Kubernetes and is 20% cheaper."${C.reset}
  ${C.gray}•${C.reset} ${C.yellow}"What are our open deals and key challenges?"${C.reset}

${C.dim}(Type 'clear' to reset screen, 'exit' or 'quit' to leave)${C.reset}
${C.gray}─────────────────────────────────────────────────────────────────────────${C.reset}
`);
}

async function main() {
  showWelcome();

  const conversationHistory = [];

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${C.green}${C.bold}You ❯ ${C.reset}`
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      return;
    }

    if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
      console.log(`\n${C.cyan}👋 DealIntel: Always here when you need deal context. Go crush those calls!${C.reset}\n`);
      process.exit(0);
    }

    if (input.toLowerCase() === 'clear' || input.toLowerCase() === 'cls') {
      showWelcome();
      rl.prompt();
      return;
    }

    // Legacy command compatibility (in case someone types "brief ACME_2026")
    let processedInput = input;
    if (input.startsWith('brief ')) {
      processedInput = `Can you brief me on ${input.replace('brief ', '')}? What do we know from our past interactions?`;
    } else if (input.startsWith('call ')) {
      processedInput = `I want to log a call outcome: ${input.replace('call ', '')}`;
    } else if (input.startsWith('obj ')) {
      processedInput = `A prospect raised this objection: "${input.replace('obj ', '')}". How should I respond?`;
    } else if (input.startsWith('recall ')) {
      processedInput = `What memories do we have stored regarding ${input.replace('recall ', '')}?`;
    } else if (input.startsWith('reflect ')) {
      processedInput = `Can you reflect on this deal: ${input.replace('reflect ', '')}?`;
    }

    process.stdout.write(`\n${C.dim}DealIntel is thinking...${C.reset}\r`);

    try {
      const result = await handleMessage(processedInput, conversationHistory);

      // Clear the "thinking..." line
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);

      // Render memory badge if saved
      if (result.memoryStored) {
        console.log(`${C.magenta}${C.bold}[💾 Saved to Hindsight Cloud for ${result.dealHint}]${C.reset}`);
      }

      console.log(`${C.cyan}${C.bold}DealIntel 🤖${C.reset}`);
      console.log(`${result.reply}\n`);

      // Update history (keep last 10 turns)
      conversationHistory.push({ role: 'user', content: processedInput });
      conversationHistory.push({ role: 'assistant', content: result.reply });
      if (conversationHistory.length > 10) {
        conversationHistory.splice(0, 2);
      }
    } catch (err) {
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);
      console.log(`\n${C.red}Error: ${err.message}${C.reset}\n`);
    }

    rl.prompt();
  });

  rl.on('close', () => {
    console.log(`\n${C.cyan}👋 DealIntel: Happy closing!${C.reset}\n`);
    process.exit(0);
  });
}

main();
