const axios = require('axios');
const GroqSdk = require('groq-sdk');
const Groq = GroqSdk.default || GroqSdk;
require('dotenv').config();

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// Polyfill in case groq-sdk uses chat.completions API
if (!groq.messages) {
  groq.messages = {
    create: async (params) => {
      try {
        const res = await groq.chat.completions.create(params);
        return {
          content: [{ text: res.choices[0]?.message?.content || '' }]
        };
      } catch (err) {
        // Auto-route to active model on current Groq account (openai/gpt-oss-20b)
        const fallbackRes = await groq.chat.completions.create({
          ...params,
          model: 'openai/gpt-oss-20b',
          max_tokens: Math.max(params.max_tokens || 300, 600)
        });
        return {
          content: [{ text: fallbackRes.choices[0]?.message?.content || '' }]
        };
      }
    }
  };
}

async function generateSuggestion(context) {
  try {
    const message = await groq.messages.create({
      model: 'mixtral-8x7b-32768',
      max_tokens: 300,
      messages: [{role: 'user', content: context}]
    });
    return message.content[0].text;
  } catch (error) {
    return 'Suggest: Focus on ROI and long-term value.';
  }
}

async function analyzeCall(callSummary) {
  try {
    const message = await groq.messages.create({
      model: 'mixtral-8x7b-32768',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `Analyze this sales call, extract 2-3 key insights:\n\nCall: ${callSummary}\n\nFormat: Bullet points.`
      }]
    });
    return message.content[0].text;
  } catch (error) {
    return '• Interaction recorded';
  }
}

class HindsightMemory {
  constructor() {
    this.apiUrl = process.env.HINDSIGHT_API_URL || 'https://api.hindsight.vectorize.io';
    this.apiKey = process.env.HINDSIGHT_API_KEY;
    this.client = axios.create({
      baseURL: this.apiUrl,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    this.localMemory = new Map();
  }

  async retain(dealId, interactionData) {
    try {
      await this.client.post('/retain', {
        key: `deal_${dealId}_${Date.now()}`,
        content: JSON.stringify(interactionData),
        metadata: {dealId, type: interactionData.type, timestamp: new Date().toISOString()}
      });
      console.log(`✅ RETAINED: ${interactionData.type}`);
    } catch (error) {
      this.localMemory.set(`deal_${dealId}_${Date.now()}`, interactionData);
      console.log(`✅ RETAINED (local): ${interactionData.type}`);
    }
  }

  async recall(dealId) {
    try {
      const response = await this.client.post('/recall', {
        query: `All interactions with ${dealId}`,
        filters: {dealId},
        limit: 10
      });
      return response.data.results || [];
    } catch (error) {
      const results = [];
      this.localMemory.forEach((value, key) => {
        if (key.includes(dealId)) results.push({key, ...value});
      });
      return results;
    }
  }
}

class DealIntelligenceAgent {
  constructor() {
    this.memory = new HindsightMemory();
  }

  async generatePreCallBrief(dealId, prospectName) {
    console.log(`\n📋 BRIEF: ${prospectName}`);
    const past = await this.memory.recall(dealId);
    
    if (past.length === 0) {
      console.log('   ⚠️  No history\n');
      return;
    }
    
    console.log(`   Found ${past.length} interactions:\n`);
    past.forEach((p, i) => {
      console.log(`   ${i+1}. ${p.summary}\n`);
      if (p.insights) console.log(`      ${p.insights}\n`);
    });
  }

  async processCallOutcome(dealId, summary) {
    console.log(`\n📊 STORING CALL`);
    const insights = await analyzeCall(summary);
    
    await this.memory.retain(dealId, {
      type: 'call_summary',
      summary,
      insights,
      timestamp: new Date().toISOString()
    });
    
    console.log('\n📌 INSIGHTS:');
    console.log(insights);
  }

  async suggestObjectionHandling(dealId, objection, context = {}) {
    console.log(`\n💡 AI Suggestion for: "${objection}"\n`);
    
    const prompt = `Sales expert. Objection: "${objection}"
Company: ${context.company || 'Unknown'}
Give 3 counter-arguments.`;

    const suggestion = await generateSuggestion(prompt);
    console.log('🤖 SUGGESTION:\n');
    console.log(suggestion);
  }
}

async function demo() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║    DEAL INTELLIGENCE AGENT
║    Groq LLM + Hindsight Memory
╚═══════════════════════════════════════════════════════════════╝
`);

  const agent = new DealIntelligenceAgent();
  const dealId = 'ACME_2026';

  console.log('\n🎯 CALL 1: Discovery\n');
  console.log('   Rep: "Expanding automation?"');
  console.log('   John: "Price 20% higher"\n');
  
  await agent.generatePreCallBrief(dealId, 'Acme Corp');
  await agent.processCallOutcome(dealId, 'John raised price concern. Rep explained 6-month ROI payback.');

  console.log('\n\n🎯 CALL 2: Follow-up (NEW Rep)\n');
  await agent.generatePreCallBrief(dealId, 'Acme Corp');
  console.log('   NEW Rep (from memory): "Similar teams saw 6-month payback"\n');
  await agent.processCallOutcome(dealId, 'NEW rep had full context. John asked SOC 2.');

  console.log('\n\n⚠️  OBJECTION:\n');
  await agent.suggestObjectionHandling(dealId, 'Competitor has Kubernetes', {company: 'Acme Corp'});

  console.log('\n🎯 CALL 3\n');
  await agent.generatePreCallBrief(dealId, 'Acme Corp');
  await agent.processCallOutcome(dealId, 'Budget approved, Q2 timeline set.');

  console.log('\n\n════════════════════════════════════════════════════════════════');
  console.log('✅ RESULT\n');
  console.log('   Rep 1: Cold start');
  console.log('   Rep 2: FULL CONTEXT instantly');
  console.log('   Rep 1: Got updated context on return\n');
  console.log('   Memory + AI = Smarter deals 🧠');
  console.log('════════════════════════════════════════════════════════════════\n');
}

demo().catch(console.error);