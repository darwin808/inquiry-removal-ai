"use strict";

/**
 * POST /api/dispatch-scheduled  (GET also accepted for cron compatibility)
 *
 * Queries INQUIRY_REMOVAL_CASES for records where:
 *   - case_status = "Scheduled"
 *   - ai_call_scheduled_for <= now
 *
 * If within business hours, launches Bland AI calls for each matching case
 * and updates their status to "Calling". Outside business hours the endpoint
 * returns early without dispatching anything.
 *
 * Security: requires Authorization: Bearer <CRON_SECRET> header.
 */

const airtable = require("../src/lib/airtable-client");
const bland = require("../src/lib/bland-client");
const { buildExperianPacket, buildCallMetadata, extractClientData } = require("../src/lib/packet-builder");
const { buildExperianCallConfig } = require("../src/agents/experian-prompt");
const { isBusinessHours } = require("../src/lib/schedule-utils");

// ---------------------------------------------------------------------------
// Table IDs (FUNDHUB MATRIX base)
// ---------------------------------------------------------------------------
const INQUIRY_REMOVAL_CASES_TABLE = "tblYOliwtT0RETm2S";
const CLIENTS_TABLE = "tblmSXx3cL7g43Eyi";
const PII_IDENTITY_TABLE = "tblRwLZR7uHDRb0LW";

// ---------------------------------------------------------------------------
// Call launcher — mirrors schedule-call.js launchCall
// ---------------------------------------------------------------------------
async function launchCall({ caseId, clientId, clientData, bureaus, ghlContactId, inquiryRemoverUserId }) {
  const transfer = process.env.FUNDHUB_REP_NUMBER;
  let lastCallId = null;

  for (const bureau of bureaus) {
    if (bureau !== "EX") {
      console.log(`[dispatch-scheduled] Bureau ${bureau} not yet supported, skipping`);
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

    console.log(`[dispatch-scheduled] Bland call launched: call_id=${call.call_id} case=${caseId} bureau=EX`);

    await airtable.updateRecord(INQUIRY_REMOVAL_CASES_TABLE, caseId, {
      case_status: "Calling",
      ai_call_status: `bland:${call.call_id}`
    });
  }

  return lastCallId;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
module.exports = async function handler(req, res) {
  // Accept both GET (cron) and POST
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Bearer token auth
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[dispatch-scheduled] CRON_SECRET not configured");
    return res.status(500).json({ error: "Server misconfigured" });
  }
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  if (token !== cronSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!process.env.AIRTABLE_API_KEY) {
    return res.status(500).json({ error: "AIRTABLE_API_KEY not configured" });
  }
  if (!process.env.BLAND_API_KEY) {
    return res.status(500).json({ error: "BLAND_API_KEY not configured" });
  }

  const now = new Date();

  // Early-exit if outside business hours
  if (!isBusinessHours(now)) {
    return res.status(200).json({ ok: true, dispatched: 0, reason: "outside_business_hours" });
  }

  // Query for cases that are Scheduled and whose scheduled time has passed
  const nowIso = now.toISOString();
  const formula = `AND({case_status}="Scheduled", IS_BEFORE({ai_call_scheduled_for}, "${nowIso}"))`;

  let records;
  try {
    const result = await airtable.listRecords(INQUIRY_REMOVAL_CASES_TABLE, {
      filterByFormula: formula,
      maxRecords: 10
    });
    records = result.records || [];
  } catch (err) {
    console.error("[dispatch-scheduled] Failed to query Airtable:", err.message);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }

  console.log(`[dispatch-scheduled] Found ${records.length} scheduled case(s) to dispatch`);

  const results = [];
  let dispatched = 0;
  let failed = 0;

  for (const record of records) {
    const caseId = record.id;
    const caseFields = record.fields;

    try {
      // 1. Resolve linked client
      const clientLinks = caseFields.client;
      if (!clientLinks || clientLinks.length === 0) {
        throw new Error("Case has no linked client record");
      }
      const clientId = clientLinks[0];

      // 2. Fetch CLIENTS record for identity link
      const clientRecord = await airtable.getRecord(CLIENTS_TABLE, clientId);
      const identityLinks = clientRecord.fields.identity;
      if (!identityLinks || identityLinks.length === 0) {
        throw new Error("Client has no linked PII_IDENTITY record");
      }

      // 3. Fetch PII_IDENTITY
      const piiRecord = await airtable.getRecord(PII_IDENTITY_TABLE, identityLinks[0]);
      const clientData = extractClientData(piiRecord.fields, clientRecord.fields);

      if (!clientData.ssn) {
        throw new Error("Client SSN not available");
      }

      // 4. Parse bureaus from case fields (default EX)
      const bureaus = (caseFields.selected_bureaus || "EX")
        .split(",")
        .map((b) => b.trim().toUpperCase())
        .filter(Boolean);

      // 5. Launch call
      const callId = await launchCall({
        caseId,
        clientId,
        clientData,
        bureaus,
        ghlContactId: caseFields.ghl_contact_id,
        inquiryRemoverUserId: caseFields.inquiry_remover_user_id
      });

      results.push({ case_id: caseId, status: "dispatched", call_id: callId });
      dispatched++;
    } catch (err) {
      console.error(`[dispatch-scheduled] Failed for case ${caseId}:`, err.message);
      results.push({ case_id: caseId, status: "failed", error: "call_failed" });
      failed++;
    }
  }

  return res.status(200).json({ ok: true, dispatched, failed, results });
};
