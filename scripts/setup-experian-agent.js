"use strict";

/**
 * setup-experian-agent.js — Create or update the Experian dispute agent in Retell
 *
 * Usage: RETELL_API_KEY=key_xxx node scripts/setup-experian-agent.js
 */

require("dotenv/config");
const retell = require("../src/lib/retell-client");
const { EXPERIAN_LLM_CONFIG, EXPERIAN_AGENT_CONFIG } = require("../src/agents/experian-prompt");

const AGENT_NAME = "FundHub Experian Dispute Agent";

async function main() {
  console.log("Setting up Experian agent in Retell...\n");

  // 1. Check for existing agent
  const agents = await retell.listAgents();
  const existing = agents.find(a => a.agent_name === AGENT_NAME);

  if (existing) {
    console.log(`Found existing agent: ${existing.agent_id}`);
    console.log("Updating agent configuration...");

    await retell.updateAgent(existing.agent_id, EXPERIAN_AGENT_CONFIG);
    console.log("Agent updated successfully.");
    console.log(`\nAgent ID: ${existing.agent_id}`);
    return;
  }

  // 2. Create LLM (response engine)
  console.log("Creating Retell LLM (response engine)...");
  const llm = await retell.createLLM(EXPERIAN_LLM_CONFIG);
  console.log(`LLM created: ${llm.llm_id}`);

  // 3. Create Agent
  console.log("Creating voice agent...");
  const agent = await retell.createAgent({
    ...EXPERIAN_AGENT_CONFIG,
    response_engine: {
      type: "retell-llm",
      llm_id: llm.llm_id
    }
  });
  console.log(`Agent created: ${agent.agent_id}`);

  // 4. Check phone numbers
  const numbers = await retell.listPhoneNumbers();
  if (numbers.length === 0) {
    console.log("\n⚠️  No phone numbers found in Retell account.");
    console.log("   You need to purchase a number from the Retell dashboard");
    console.log("   before making outbound calls.");
    console.log("   https://dashboard.retellai.com/phone-numbers");
  } else {
    console.log(`\nAvailable phone numbers: ${numbers.map(n => n.phone_number).join(", ")}`);
  }

  console.log("\n--- Setup Complete ---");
  console.log(`Agent ID: ${agent.agent_id}`);
  console.log(`LLM ID:   ${llm.llm_id}`);
  console.log("\nAdd these to your .env:");
  console.log(`RETELL_EXPERIAN_AGENT_ID=${agent.agent_id}`);
  console.log(`RETELL_EXPERIAN_LLM_ID=${llm.llm_id}`);
}

main().catch(err => {
  console.error("Setup failed:", err.message);
  process.exit(1);
});
