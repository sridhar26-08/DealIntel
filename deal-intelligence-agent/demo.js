const readline = require('readline');
const GroqSdk = require('groq-sdk');
const Groq = GroqSdk.default || GroqSdk;
const { HindsightClient } = require('@vectorize-io/hindsight-client');
require('dotenv').config();

// ─── Setup ───────────────────────────────────────────────────
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const hindsight = new HindsightClient({
  baseUrl: process.env.HINDSIGHT_API_URL || 'https://api.hindsight.vectorize.io',
  apiKey: process.env.HINDSIGHT_API_KEY
});
const BANK = 'deal-agent';

// Model helper with fallback
async function getChatCompletion(messages, maxTokens = 600) {
  try {
    const res = await groq.chat.completions.create({
      model: 'openai/gpt-oss-120b',
      messages,
      max_tokens: maxTokens,
      temperature: 0.7
    });
    return res.choices[0]?.message?.content || '';
  } catch {
    const res = await groq.chat.completions.create({
      model: 'openai/gpt-oss-20b',
      messages,
      max_tokens: maxTokens,
      temperature: 0.7
    });
    return res.choices[0]?.message?.content || '';
  }
}

// ─── Colors ──────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', yellow: '\x1b[33m', blue: '\x1b[34m',
  magenta: '\x1b[35m', cyan: '\x1b[36m', red: '\x1b[31m',
  bgBlue: '\x1b[44m', white: '\x1b[37m', gray: '\x1b[90m'
};

function banner() {
  console.log(`
${C.cyan}${C.bold}╔═══════════════════════════════════════════════════════════════════════╗
║                                                                       ║
║   🧠  DEAL INTELLIGENCE AGENT  —  NATURAL CONVERSATION & MEMORY      ║
║   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━        ║
║   Groq AI (gpt-oss-120b)  ⚡  Hindsight Memory Cloud                  ║
║                                                                       ║
╚═══════════════════════════════════════════════════════════════════════╝${C.reset}

${C.yellow}${C.bold}💬 TALK NATURALLY LIKE A TEAMMATE:${C.reset}
  ${C.gray}•${C.reset} ${C.white}"Hi! How are you?"${C.reset}
  ${C.gray}•${C.reset} ${C.white}"What do we know about Acme Corp and John?"${C.reset}
  ${C.gray}•${C.reset} ${C.white}"I just had a call with Acme, they asked for SOC 2 reports."${C.reset}
  ${C.gray}•${C.reset} ${C.white}"The prospect says we are 20% more expensive than competitor."${C.reset}

${C.yellow}${C.bold}OR USE SHORTCUT COMMANDS (OPTIONAL):${C.reset}
  ${C.green}brief   ${C.dim}<deal_id> <prospect>${C.reset}  — Pre-call brief from memory
  ${C.green}call    ${C.dim}<deal_id> <summary>${C.reset}   — Log call outcome & AI analysis
  ${C.green}obj     ${C.dim}<deal_id> <objection>${C.reset} — Get instant counter-arguments
  ${C.green}recall  ${C.dim}<deal_id>${C.reset}            — Raw memory graph inspect
  ${C.green}reflect ${C.dim}<deal_id> <question>${C.reset} — Deep memory reflection
  ${C.green}exit${C.reset}                        — Quit demo

${C.gray}─────────────────────────────────────────────────────────────────────────${C.reset}
`);
}

// ─── Conversational Handler ──────────────────────────────────
const SYSTEM_PROMPT = `You are DealIntel, an intelligent, friendly, and expert sales co-pilot.
You work directly with sales reps, account executives, and sales leaders.

Your Personality & Behavior:
- Warm, natural, and encouraging — like a sharp, supportive sales colleague sitting right next to the rep.
- Respond naturally to greetings ("Hi", "Hello!", "How are you?").
- When asked about a deal, company, or person (e.g., Acme, John, Nike, Elon), use the provided Hindsight Memories to give a crisp, actionable briefing.
- When the rep describes a call or prospect objection, provide practical, high-impact counter-arguments and clear next steps.
- If the rep mentions logging a call or speaking with someone, confirm that the details are noted and saved into team memory.
- Keep responses easy to digest during or between calls.`;

async function handleNaturalChat(text, history) {
  // Check if call log to save to Hindsight
  const lower = text.toLowerCase();
  const isCall = lower.includes('called') || lower.includes('spoke with') || lower.includes('met with') || lower.includes('call outcome') || lower.includes('had a call') || lower.includes('talked to');
  
  if (isCall) {
    try {
      const match = text.match(/\b(ACME_\w+|Acme|Nike|Tesla|Elon|Apple)\b/i);
      const dealId = match ? match[0].toUpperCase() : 'GENERAL';
      await hindsight.retain(BANK, `[Deal: ${dealId}] ${text}`, {
        metadata: { dealId, type: 'call_summary', timestamp: new Date().toISOString() }
      });
      console.log(`\n   ${C.magenta}💾 Stored call notes in Hindsight Cloud${C.reset}`);
    } catch (e) {
      // Non-blocking
    }
  }

  // Retrieve memories
  let memoryText = '';
  try {
    const memRes = await hindsight.recall(BANK, text);
    const memories = (memRes.results || []).slice(0, 6);
    if (memories.length > 0) {
      memoryText = `\n\n[RELEVANT HINDSIGHT TEAM MEMORIES]:\n` + memories.map((m, i) => `${i + 1}. ${m.text}`).join('\n');
    }
  } catch (e) {
    // Non-blocking
  }

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT + memoryText },
    ...history,
    { role: 'user', content: text }
  ];

  return await getChatCompletion(messages, 650);
}

// ─── Shortcut Commands ───────────────────────────────────────
async function cmdBrief(dealId, prospect) {
  console.log(`\n${C.blue}${C.bold}📋 PRE-CALL BRIEF: ${prospect} (Deal: ${dealId})${C.reset}\n`);
  try {
    const response = await hindsight.recall(BANK, `All interactions with deal ${dealId}`);
    const memories = response.results || [];
    if (memories.length === 0) {
      console.log(`   ${C.yellow}⚠️  No history found for this deal.${C.reset}\n`);
      return;
    }
    console.log(`   ${C.green}Found ${memories.length} memories in Hindsight:${C.reset}\n`);
    memories.forEach((m, i) => {
      console.log(`   ${C.bold}${i+1}.${C.reset} ${m.text}`);
      if (m.entities?.length) {
        console.log(`      ${C.cyan}🏷️  ${m.entities.join(', ')}${C.reset}`);
      }
      console.log();
    });
  } catch (e) {
    console.log(`   ${C.red}Error: ${e.message}${C.reset}\n`);
  }
}

async function cmdCall(dealId, summary) {
  console.log(`\n${C.magenta}${C.bold}📊 PROCESSING CALL (Deal: ${dealId})${C.reset}`);
  console.log(`${C.dim}   Summary: "${summary}"${C.reset}\n`);

  try {
    await hindsight.retain(BANK, `[Deal: ${dealId}] ${summary}`, {
      metadata: { dealId, type: 'call_summary', timestamp: new Date().toISOString() }
    });
    console.log(`   ${C.green}✅ Stored in Hindsight Cloud${C.reset}\n`);
  } catch (e) {
    console.log(`   ${C.red}⚠️  Storage error: ${e.message}${C.reset}\n`);
  }

  console.log(`   ${C.yellow}⏳ Analyzing with Groq AI...${C.reset}\n`);
  try {
    const reply = await getChatCompletion([
      { role: 'user', content: `Analyze this sales call, extract 2-3 key insights:\n\nCall: ${summary}\n\nFormat: Bullet points, concise.` }
    ], 300);
    console.log(`   ${C.cyan}${C.bold}📌 AI INSIGHTS:${C.reset}`);
    console.log(`   ${reply}\n`);
  } catch (e) {
    console.log(`   ${C.red}AI error: ${e.message}${C.reset}\n`);
  }
}

async function cmdObjection(dealId, objection) {
  console.log(`\n${C.red}${C.bold}⚠️  OBJECTION HANDLING (Deal: ${dealId})${C.reset}`);
  console.log(`${C.dim}   Objection: "${objection}"${C.reset}\n`);
  console.log(`   ${C.yellow}⏳ Generating counter-arguments...${C.reset}\n`);

  try {
    const reply = await getChatCompletion([
      { role: 'user', content: `You are an elite sales coach. A rep just heard this objection: "${objection}" for deal ${dealId}. Provide 3 specific, persuasive counter-arguments they can say immediately.` }
    ], 450);
    console.log(`   ${C.green}${C.bold}🤖 AI COUNTER-ARGUMENTS:${C.reset}\n`);
    console.log(`   ${reply}\n`);
  } catch (e) {
    console.log(`   ${C.red}AI error: ${e.message}${C.reset}\n`);
  }
}

async function cmdRecall(dealId) {
  console.log(`\n${C.cyan}${C.bold}🔍 RAW RECALL: ${dealId}${C.reset}\n`);
  try {
    const response = await hindsight.recall(BANK, `deal ${dealId}`);
    const memories = response.results || [];
    console.log(`   ${C.green}${memories.length} memories found${C.reset}\n`);
    memories.forEach((m, i) => {
      console.log(`   ${C.bold}[${i+1}]${C.reset} ${m.text}`);
      if (m.entities?.length) console.log(`       ${C.cyan}Entities: ${m.entities.join(', ')}${C.reset}`);
      console.log();
    });
  } catch (e) {
    console.log(`   ${C.red}Error: ${e.message}${C.reset}\n`);
  }
}

async function cmdReflect(dealId, question) {
  console.log(`\n${C.yellow}${C.bold}💭 HINDSIGHT REFLECTION (Deal: ${dealId})${C.reset}`);
  console.log(`${C.dim}   Question: "${question}"${C.reset}\n`);
  console.log(`   ${C.yellow}⏳ Reflecting...${C.reset}\n`);

  try {
    const response = await hindsight.reflect(BANK, `Regarding deal ${dealId}: ${question}`);
    const text = response.text || response;
    console.log(`   ${C.green}${C.bold}🧠 REFLECTION:${C.reset}`);
    console.log(`   ${text}\n`);
  } catch (e) {
    console.log(`   ${C.red}Error: ${e.message}${C.reset}\n`);
  }
}

// ─── Main REPL Loop ──────────────────────────────────────────
async function main() {
  banner();

  const conversationHistory = [];

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${C.green}${C.bold}deal-agent ❯ ${C.reset}`
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();
    if (!input) { rl.prompt(); return; }

    const parts = input.split(/\s+/);
    const cmd = parts[0].toLowerCase();

    try {
      if (cmd === 'exit' || cmd === 'quit') {
        console.log(`\n${C.cyan}👋 DealIntel: Always here to help you close. Take care!${C.reset}\n`);
        process.exit(0);
      } else if (cmd === 'help') {
        banner();
      } else if (cmd === 'clear' || cmd === 'cls') {
        console.clear();
        banner();
      } else if (cmd === 'brief' && parts.length > 1) {
        const dealId = parts[1];
        const prospect = parts.slice(2).join(' ') || dealId;
        await cmdBrief(dealId, prospect);
      } else if (cmd === 'call' && parts.length > 2) {
        const dealId = parts[1];
        const summary = parts.slice(2).join(' ');
        await cmdCall(dealId, summary);
      } else if (cmd === 'obj' && parts.length > 2) {
        const dealId = parts[1];
        const objection = parts.slice(2).join(' ');
        await cmdObjection(dealId, objection);
      } else if (cmd === 'recall' && parts.length > 1) {
        const dealId = parts[1];
        await cmdRecall(dealId);
      } else if (cmd === 'reflect' && parts.length > 2) {
        const dealId = parts[1];
        const question = parts.slice(2).join(' ');
        await cmdReflect(dealId, question);
      } else {
        // Natural Conversation Mode for anything else (Greetings, questions, talk tracks)
        process.stdout.write(`\n   ${C.dim}DealIntel is thinking...${C.reset}\r`);
        const reply = await handleNaturalChat(input, conversationHistory);
        readline.clearLine(process.stdout, 0);
        readline.cursorTo(process.stdout, 0);

        console.log(`\n${C.cyan}${C.bold}DealIntel 🤖${C.reset}\n${reply}\n`);

        conversationHistory.push({ role: 'user', content: input });
        conversationHistory.push({ role: 'assistant', content: reply });
        if (conversationHistory.length > 10) conversationHistory.splice(0, 2);
      }
    } catch (e) {
      console.log(`\n   ${C.red}Error: ${e.message}${C.reset}\n`);
    }

    rl.prompt();
  });

  rl.on('close', () => {
    console.log(`\n${C.cyan}👋 DealIntel: Happy closing!${C.reset}\n`);
    process.exit(0);
  });
}

main();
