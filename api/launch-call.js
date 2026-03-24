"use strict";

/**
 * POST /api/launch-call
 *
 * Launches an outbound Experian dispute call via Bland AI.
 *
 * Request body:
 * {
 *   "clientData": { firstName, middleName, lastName, ssn, dob, phone, address: { line1, city, state, zip } },
 *   "inquiries": [{ creditorName, date }],
 *   "transferNumber": "+1xxxxxxxxxx",
 *   "clientId": "airtable_record_id"
 * }
 */

const bland = require("../src/lib/bland-client");
const { buildExperianPacket, buildCallMetadata } = require("../src/lib/packet-builder");
const { buildExperianCallConfig } = require("../src/agents/experian-prompt");
const { requireAuth } = require("../src/lib/auth");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!requireAuth(req, res)) return;

  if (!process.env.BLAND_API_KEY) {
    return res.status(500).json({ error: "BLAND_API_KEY not configured" });
  }

  const { clientData, inquiries, transferNumber, clientId } = req.body || {};

  if (!clientData) {
    return res.status(400).json({ error: "clientData is required" });
  }

  const transfer = transferNumber || process.env.FUNDHUB_REP_NUMBER;
  if (!transfer) {
    return res.status(400).json({ error: "transferNumber is required (or set FUNDHUB_REP_NUMBER env var)" });
  }

  try {
    // Build the call packet (dynamic variables for the agent)
    const requestData = buildExperianPacket(clientData, inquiries || [], transfer);
    const metadata = buildCallMetadata(clientId || "unknown", "EX");

    // Build Bland AI call config from prompt template
    const callConfig = buildExperianCallConfig(requestData, { metadata });

    // Launch the call via Bland AI
    const call = await bland.createCall(callConfig);

    return res.status(200).json({
      ok: true,
      callId: call.call_id,
      status: call.status || "queued",
      bureau: "EX",
      metadata
    });
  } catch (err) {
    console.error("Launch call failed:", err.message);
    return res.status(500).json({
      ok: false,
      error: "Internal server error"
    });
  }
};
