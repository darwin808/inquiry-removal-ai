"use strict";

/**
 * retell-client.js — Retell AI API Client
 *
 * Thin wrapper around the Retell REST API for agent management
 * and outbound call operations.
 */

const RETELL_API_BASE = "https://api.retellai.com";
const RETELL_API_KEY = process.env.RETELL_API_KEY;

function authHeaders() {
  return {
    Authorization: `Bearer ${RETELL_API_KEY}`,
    "Content-Type": "application/json"
  };
}

async function retellFetch(path, options = {}) {
  const url = `${RETELL_API_BASE}${path}`;
  const resp = await fetch(url, {
    ...options,
    headers: { ...authHeaders(), ...options.headers }
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Retell API ${options.method || "GET"} ${path} failed: ${resp.status} ${text.substring(0, 300)}`);
  }

  return resp.json();
}

// ---------------------------------------------------------------------------
// Response Engine (LLM) Operations
// ---------------------------------------------------------------------------

async function createLLM(config) {
  return retellFetch("/create-retell-llm", {
    method: "POST",
    body: JSON.stringify(config)
  });
}

async function updateLLM(llmId, config) {
  return retellFetch(`/update-retell-llm/${llmId}`, {
    method: "PATCH",
    body: JSON.stringify(config)
  });
}

async function getLLM(llmId) {
  return retellFetch(`/get-retell-llm/${llmId}`);
}

// ---------------------------------------------------------------------------
// Agent Operations
// ---------------------------------------------------------------------------

async function createAgent(config) {
  return retellFetch("/create-agent", {
    method: "POST",
    body: JSON.stringify(config)
  });
}

async function updateAgent(agentId, config) {
  return retellFetch(`/update-agent/${agentId}`, {
    method: "PATCH",
    body: JSON.stringify(config)
  });
}

async function getAgent(agentId) {
  return retellFetch(`/get-agent/${agentId}`);
}

async function listAgents() {
  return retellFetch("/list-agents");
}

// ---------------------------------------------------------------------------
// Phone Call Operations
// ---------------------------------------------------------------------------

async function createPhoneCall({ fromNumber, toNumber, agentId, metadata, dynamicVariables }) {
  const body = {
    from_number: fromNumber,
    to_number: toNumber
  };

  if (agentId) body.override_agent_id = agentId;
  if (metadata) body.metadata = metadata;
  if (dynamicVariables) body.retell_llm_dynamic_variables = dynamicVariables;

  return retellFetch("/v2/create-phone-call", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

async function getCall(callId) {
  return retellFetch(`/v2/get-call/${callId}`);
}

async function listCalls(filters = {}) {
  return retellFetch("/v2/list-calls", {
    method: "POST",
    body: JSON.stringify(filters)
  });
}

// ---------------------------------------------------------------------------
// Phone Number Operations
// ---------------------------------------------------------------------------

async function listPhoneNumbers() {
  return retellFetch("/list-phone-numbers");
}

// ---------------------------------------------------------------------------
// Web Call Operations (browser-based testing, no phone number needed)
// ---------------------------------------------------------------------------

async function createWebCall({ agentId, dynamicVariables, metadata }) {
  const body = { agent_id: agentId };
  if (dynamicVariables) body.retell_llm_dynamic_variables = dynamicVariables;
  if (metadata) body.metadata = metadata;

  return retellFetch("/v2/create-web-call", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  createLLM,
  updateLLM,
  getLLM,
  createAgent,
  updateAgent,
  getAgent,
  listAgents,
  createPhoneCall,
  getCall,
  listCalls,
  listPhoneNumbers,
  createWebCall
};
