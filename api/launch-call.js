"use strict";

/**
 * POST /api/launch-call
 *
 * Launches an outbound Experian dispute call via Retell AI.
 *
 * Request body:
 * {
 *   "clientData": { firstName, middleName, lastName, ssn, dob, phone, address: { line1, city, state, zip } },
 *   "inquiries": [{ creditorName, date }],
 *   "transferNumber": "+1xxxxxxxxxx",
 *   "clientId": "airtable_record_id"
 * }
 */

const retell = require("../src/lib/retell-client");
const { buildExperianPacket, buildCallMetadata } = require("../src/lib/packet-builder");

const EXPERIAN_AGENT_ID = process.env.RETELL_EXPERIAN_AGENT_ID;
const FROM_NUMBER = process.env.RETELL_FROM_NUMBER;
const EXPERIAN_NUMBER = process.env.EXPERIAN_DISPUTE_NUMBER || "+18003111784";
const DEFAULT_TRANSFER = process.env.FUNDHUB_REP_NUMBER;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Validate config
  if (!EXPERIAN_AGENT_ID) {
    return res.status(500).json({ error: "RETELL_EXPERIAN_AGENT_ID not configured" });
  }
  if (!FROM_NUMBER) {
    return res.status(500).json({ error: "RETELL_FROM_NUMBER not configured" });
  }

  const { clientData, inquiries, transferNumber, clientId } = req.body || {};

  if (!clientData) {
    return res.status(400).json({ error: "clientData is required" });
  }

  const transfer = transferNumber || DEFAULT_TRANSFER;
  if (!transfer) {
    return res.status(400).json({ error: "transferNumber is required (or set FUNDHUB_REP_NUMBER env var)" });
  }

  try {
    // Build the call packet (dynamic variables for the agent)
    const dynamicVariables = buildExperianPacket(clientData, inquiries || [], transfer);
    const metadata = buildCallMetadata(clientId || "unknown", "EX");

    // Launch the call via Retell
    const call = await retell.createPhoneCall({
      fromNumber: FROM_NUMBER,
      toNumber: EXPERIAN_NUMBER,
      agentId: EXPERIAN_AGENT_ID,
      dynamicVariables,
      metadata
    });

    return res.status(200).json({
      ok: true,
      callId: call.call_id,
      status: call.call_status,
      bureau: "EX",
      metadata
    });
  } catch (err) {
    console.error("Launch call failed:", err.message);
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
};
