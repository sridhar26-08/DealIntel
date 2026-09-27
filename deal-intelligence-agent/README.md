# Deal Intelligence Agent (Hindsight Memory)

An AI-powered sales intelligence copilot built on the **Hindsight biomimetic memory architecture** (`retain`, `recall`, `search`, `reflect`). It enables sales teams to maintain institutional deal memory, track objection-handling success across past deals, and accelerate closing cycles.

## Architecture

### 1. Hindsight Cognitive Memory Networks
- **`world_facts`**: Objective ground truth (Prospect profiles, company details, tech stacks, industries).
- **`experiences`**: Episodic memories of every call, exact objections raised, responses attempted, and outcomes.
- **`observations`**: Synthesized patterns across interactions (e.g. sensitivity to pricing vs security).
- **`mental_models`**: High-level buyer personas, decision frameworks, and risk appetite models.

### 2. Core Functions
- **`generatePreCallBrief(dealId, prospectName)`**: Gathers full deal context, prior objections, positive signals, and custom battle cards before each call.
- **`processCallOutcome(dealId, callSummary)`**: Extracts learnings, logs objection resolutions, records positive signals and next steps, and updates deal milestones.
- **`suggestObjectionHandling(objectionText, dealContext)`**: Real-time copilot that searches historical wins across other accounts (e.g., TechStart Inc, CloudScale Systems) to recommend high-confidence talk tracks.
- **`analyzeDealProgression(dealId)`**: Compares deal velocity, objection resolution efficiency, and milestones against historical closed-won benchmarks.

---

## Quickstart

```bash
cd deal-intelligence-agent
npm install
node agent.js
```

Or run via npm:
```bash
npm start
```
