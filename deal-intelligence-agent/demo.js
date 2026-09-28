const readline = require('readline');
const GroqSdk = require('groq-sdk');
const Groq = GroqSdk.default || GroqSdk;
const { HindsightClient } = require('@vectorize-io/hindsight-client');
require('dotenv').config();

// ─── Setup ───────────────────────────────────────────────────
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
if (!groq.messages) {
  groq.messages = {
    create: async (params) => {
      try {
        const res = await groq.chat.completions.create(params);
        return { content: [{ text: res.choices[0]?.message?.content || '' }] };
      } catch {
        const res = await groq.chat.completions.create({ ...params, model: 'openai/gpt-oss-20b', max_tokens: 600 });
        return { content: [{ text: res.choices[0]?.message?.content || '' }] };
      }
    }
  };
}

const hindsight = new HindsightClient({
  baseUrl: process.env.HINDSIGHT_API_URL || 'https://api.hindsight.vectorize.io',
  apiKey: process.env.HINDSIGHT_API_KEY
});
const BANK = 'deal-agent';

// ─── Colors ──────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', yellow: '\x1b[33m', blue: '\x1b[34m',
  magenta: '\x1b[35m', cyan: '\x1b[36m', red: '\x1b[31m',
  bgBlue: '\x1b[44m', white: '\x1b[37m'
};

function banner() {
  console.log(`
${C.cyan}${C.bold}╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   🧠  DEAL INTELLIGENCE AGENT  —  LIVE DEMO                 ║
║   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━                  ║
║   Groq AI  ⚡  Hindsight Memory Cloud                        ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝${C.reset}

${C.yellow}${C.bold}COMMANDS:${C.reset}
  ${C.green}brief ${C.dim}<deal_id> <prospect>${C.reset}    — Generate pre-call brief from memory
  ${C.green}call  ${C.dim}<deal_id> <summary>${C.reset}     — Process a call outcome (AI analysis)
  ${C.green}obj   ${C.dim}<deal_id> <objection>${C.reset}   — Get AI objection counter-arguments
  ${C.green}recall${C.dim} <deal_id>${C.reset}              — Raw recall from Hindsight memory
  ${C.green}reflect${C.dim} <deal_id> <question>${C.reset}  — Ask Hindsight to reflect on a deal
  ${C.green}help${C.reset}                          — Show this menu
  ${C.green}exit${C.reset}                          — Quit

${C.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}
`);
}

// ─── Commands ────────────────────────────────────────────────

async function cmdBrief(dealId, prospect) {
  console.log(`\n${C.blue}${C.bold}📋 PRE-CALL BRIEF: ${prospect} (Deal: ${dealId})${C.reset}\n`);
  try {
    const response = await hindsight.recall(BANK, `All interactions with deal ${dealId}`);
    const memories = response.results || [];
    if (memories.length === 0) {
      console.log(`   ${C.yellow}⚠️  No history found for this deal.${C.reset}\n`);
      return;
    }
    console.log(`   ${C.green}Found ${memories.length} memories:${C.reset}\n`);
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

  // Store in Hindsight
  try {
    await hindsight.retain(BANK, `[Deal: ${dealId}] ${summary}`, {
      metadata: { dealId, type: 'call_summary', timestamp: new Date().toISOString() }
    });
    console.log(`   ${C.green}✅ Stored in Hindsight Cloud${C.reset}\n`);
  } catch (e) {
    console.log(`   ${C.red}⚠️  Storage error: ${e.message}${C.reset}\n`);
  }

  // AI Analysis
  console.log(`   ${C.yellow}⏳ Analyzing with Groq AI...${C.reset}\n`);
  try {
    const msg = await groq.messages.create({
      model: 'mixtral-8x7b-32768', max_tokens: 250,
      messages: [{ role: 'user', content: `Analyze this sales call, extract 2-3 key insights:\n\nCall: ${summary}\n\nFormat: Bullet points, concise.` }]
    });
    console.log(`   ${C.cyan}${C.bold}📌 AI INSIGHTS:${C.reset}`);
    console.log(`   ${msg.content[0].text}\n`);
  } catch (e) {
    console.log(`   ${C.red}AI error: ${e.message}${C.reset}\n`);
  }
}

async function cmdObjection(dealId, objection) {
  console.log(`\n${C.red}${C.bold}⚠️  OBJECTION HANDLING (Deal: ${dealId})${C.reset}`);
  console.log(`${C.dim}   Objection: "${objection}"${C.reset}\n`);
  console.log(`   ${C.yellow}⏳ Generating counter-arguments...${C.reset}\n`);

  try {
    const msg = await groq.messages.create({
      model: 'mixtral-8x7b-32768', max_tokens: 400,
      messages: [{ role: 'user', content: `You are a sales expert. A rep just heard this objection:\n\n"${objection}"\n\nDeal: ${dealId}\n\nProvide 3 specific counter-arguments they can use RIGHT NOW.\nFormat: Numbered list, concise, actionable.` }]
    });
    console.log(`   ${C.green}${C.bold}🤖 AI COUNTER-ARGUMENTS:${C.reset}\n`);
    console.log(`   ${msg.content[0].text}\n`);
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
      console.log(`       ${C.dim}Type: ${m.type} | Score: ${m.scores?.final?.toFixed(4)}${C.reset}`);
      if (m.entities?.length) console.log(`       ${C.cyan}Entities: ${m.entities.join(', ')}${C.reset}`);
      console.log();
    });

    // Show entity graph
    if (response.entities && Object.keys(response.entities).length > 0) {
      console.log(`   ${C.magenta}${C.bold}🕸️  ENTITY GRAPH:${C.reset}`);
      for (const [name, info] of Object.entries(response.entities)) {
        console.log(`      ${C.magenta}• ${name}${C.reset}`);
      }
      console.log();
    }
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

// ─── Main Loop ───────────────────────────────────────────────
async function main() {
  banner();

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
      switch (cmd) {
        case 'brief': {
          const dealId = parts[1];
          const prospect = parts.slice(2).join(' ') || 'Unknown';
          if (!dealId) { console.log(`\n   ${C.red}Usage: brief <deal_id> <prospect_name>${C.reset}\n`); break; }
          await cmdBrief(dealId, prospect);
          break;
        }
        case 'call': {
          const dealId = parts[1];
          const summary = parts.slice(2).join(' ');
          if (!dealId || !summary) { console.log(`\n   ${C.red}Usage: call <deal_id> <call summary>${C.reset}\n`); break; }
          await cmdCall(dealId, summary);
          break;
        }
        case 'obj': {
          const dealId = parts[1];
          const objection = parts.slice(2).join(' ');
          if (!dealId || !objection) { console.log(`\n   ${C.red}Usage: obj <deal_id> <objection text>${C.reset}\n`); break; }
          await cmdObjection(dealId, objection);
          break;
        }
        case 'recall': {
          const dealId = parts[1];
          if (!dealId) { console.log(`\n   ${C.red}Usage: recall <deal_id>${C.reset}\n`); break; }
          await cmdRecall(dealId);
          break;
        }
        case 'reflect': {
          const dealId = parts[1];
          const question = parts.slice(2).join(' ');
          if (!dealId || !question) { console.log(`\n   ${C.red}Usage: reflect <deal_id> <question>${C.reset}\n`); break; }
          await cmdReflect(dealId, question);
          break;
        }
        case 'help':
          banner();
          break;
        case 'exit':
        case 'quit':
          console.log(`\n${C.cyan}👋 Goodbye!${C.reset}\n`);
          process.exit(0);
        default:
          console.log(`\n   ${C.red}Unknown command: "${cmd}". Type ${C.bold}help${C.reset}${C.red} for options.${C.reset}\n`);
      }
    } catch (e) {
      console.log(`\n   ${C.red}Error: ${e.message}${C.reset}\n`);
    }

    rl.prompt();
  });

  rl.on('close', () => {
    console.log(`\n${C.cyan}👋 Goodbye!${C.reset}\n`);
    process.exit(0);
  });
}

main();
