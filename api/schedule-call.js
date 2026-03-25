"use strict";

/**
 * POST /api/schedule-call
 *
 * Receives webhook from AX23 automation when an inquiry removal case is created.
 * Fetches client PII from Airtable (CLIENTS → PII_IDENTITY), checks business
 * hours, and either launches the AI caller immediately or marks the case as
 * Scheduled for later dispatch.
 *
 * Request body (from AX23 webhook):
 * {
 *   "case_id": "recXXX",                    // INQUIRY_REMOVAL_CASES record ID
 *   "ghl_contact_id": "xxx",                // GHL contact ID
 *   "round": "recXXX",                      // FUNDING_ROUNDS record ID
 *   "selected_bureaus_raw": "EX",            // Comma-separated bureau codes (EX, EQ, TU)
 *   "inquiry_remover_user_id": "recXXX"      // Assigned inquiry remover
 * }
 *
 * Response:
 * {
 *   "ok": true,
 *   "case_id": "recXXX",
 *   "status": "calling" | "scheduled",
 *   "scheduled_for": "2026-03-23T14:00:00.000Z",
 *   "bureaus": ["EX"],
 *   "call_id": "xxx" | null
 * }
 */

const airtable = require("../src/lib/airtable-client");
const bland = require("../src/lib/bland-client");
const { buildExperianPacket, buildCallMetadata, extractClientData } = require("../src/lib/packet-builder");
const { buildExperianCallConfig } = require("../src/agents/experian-prompt");
const { isBusinessHours, nextBusinessHourSlot } = require("../src/lib/schedule-utils");
const { requireAuth } = require("../src/lib/auth");

// ---------------------------------------------------------------------------
// Table IDs (FUNDHUB MATRIX base)
// ---------------------------------------------------------------------------
const INQUIRY_REMOVAL_CASES_TABLE = "tblYOliwtT0RETm2S";
const CLIENTS_TABLE = "tblmSXx3cL7g43Eyi";
const PII_IDENTITY_TABLE = "tblRwLZR7uHDRb0LW";

// ---------------------------------------------------------------------------
// PII_IDENTITY field mapping (verified against Airtable schema)
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!requireAuth(req, res)) return;

  if (!process.env.AIRTABLE_API_KEY) {
    return res.status(500).json({ error: "AIRTABLE_API_KEY not configured" });
  }
  if (!process.env.BLAND_API_KEY) {
    return res.status(500).json({ error: "BLAND_API_KEY not configured" });
  }

  const {
    case_id,
    ghl_contact_id,
    round,
    selected_bureaus_raw,
    inquiry_remover_user_id
  } = req.body || {};

  if (!case_id) {
    return res.status(400).json({ error: "case_id is required" });
  }

  try {
    // 1. Fetch the case record to get linked client
    const caseRecord = await airtable.getRecord(INQUIRY_REMOVAL_CASES_TABLE, case_id);
    const clientLinks = caseRecord.fields.client;
    if (!clientLinks || clientLinks.length === 0) {
      return res.status(400).json({ error: "Case has no linked client record" });
    }
    const clientId = clientLinks[0];

    // 2. Fetch CLIENTS record to get linked PII_IDENTITY
    const clientRecord = await airtable.getRecord(CLIENTS_TABLE, clientId);
    const identityLinks = clientRecord.fields.identity;
    if (!identityLinks || identityLinks.length === 0) {
      return res.status(400).json({
        error: "Client has no linked PII_IDENTITY record — cannot place bureau call"
      });
    }

    // 3. Fetch PII_IDENTITY for SSN, DOB, address
    const piiRecord = await airtable.getRecord(PII_IDENTITY_TABLE, identityLinks[0]);
    const clientData = extractClientData(piiRecord.fields, clientRecord.fields);

    if (!clientData.ssn) {
      return res.status(400).json({ error: "Client SSN not available — cannot place bureau call" });
    }

    // 4. Parse bureaus
    const bureaus = (selected_bureaus_raw || "EX")
      .split(",")
      .map((b) => b.trim().toUpperCase())
      .filter(Boolean);

    // 5. Compute business-hour schedule
    const now = new Date();
    const inHours = isBusinessHours(now);
    const scheduledFor = inHours ? now : nextBusinessHourSlot(now);

    // 6. Set case_status = Scheduled + record scheduled time
    await airtable.updateRecord(INQUIRY_REMOVAL_CASES_TABLE, case_id, {
      case_status: "Scheduled",
      ai_call_scheduled_for: scheduledFor.toISOString()
    });

    console.log(
      `[schedule-call] case=${case_id} bureaus=${bureaus.join(",")} ` +
        `inHours=${inHours} scheduledFor=${scheduledFor.toISOString()}`
    );

    // 7. If within business hours → launch call immediately
    let callId = null;
    if (inHours) {
      callId = await launchCall({
        caseId: case_id,
        clientId,
        clientData,
        bureaus,
        ghlContactId: ghl_contact_id,
        inquiryRemoverUserId: inquiry_remover_user_id
      });
    }

    return res.status(200).json({
      ok: true,
      case_id,
      status: inHours ? "calling" : "scheduled",
      scheduled_for: scheduledFor.toISOString(),
      bureaus,
      call_id: callId
    });
  } catch (err) {
    console.error("[schedule-call] Error:", err.message);
    return res.status(500).json({
      ok: false,
      error: "Internal server error"
    });
  }
};

// ---------------------------------------------------------------------------
// Call launcher — handles building packet + calling Bland + updating status
// ---------------------------------------------------------------------------

async function launchCall({ caseId, clientId, clientData, bureaus, ghlContactId, inquiryRemoverUserId }) {
  const transfer = process.env.FUNDHUB_REP_NUMBER;
  let lastCallId = null;

  for (const bureau of bureaus) {
    if (bureau !== "EX") {
      // Only Experian is supported in MVP
      console.log(`[schedule-call] Bureau ${bureau} not yet supported, skipping`);
      continue;
    }

    const requestData = buildExperianPacket(clientData, [], transfer);
    const metadata = buildCallMetadata(clientId, "EX", caseId);
    metadata.case_id = caseId;
    metadata.ghl_contact_id = ghlContactId || null;
    metadata.inquiry_remover_user_id = inquiryRemoverUserId || null;

    const callConfig = buildExperianCallConfig(requestData, { metadata });
    const call = await bland.createCall(callConfig);
    lastCallId = call.call_id;

    console.log(`[schedule-call] Bland call launched: call_id=${call.call_id} bureau=EX`);

    // Update case to Calling now that call is live
    await airtable.updateRecord(INQUIRY_REMOVAL_CASES_TABLE, caseId, {
      case_status: "Calling",
      ai_call_status: `bland:${call.call_id}`
    });
  }

  return lastCallId;
}
