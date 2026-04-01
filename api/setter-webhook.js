"use strict";

/**
 * POST /api/setter-webhook
 *
 * Receives webhook events from Bland AI after setter calls complete.
 * Updates GHL contact with call outcome and disposition.
 *
 * Dispositions:
 *   booked              → appointment was scheduled
 *   interested_callback  → lead wants a callback later
 *   not_interested       → lead declined
 *   voicemail            → left voicemail
 *   wrong_number         → not the right person
 *   no_answer            → phone rang, no pickup
 */

const bland = require("../src/lib/bland-client");
const { SETTER_ANALYSIS_QUESTIONS } = require("../src/agents/setter-prompt");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Webhook signature verification (same pattern as call-webhook.js)
  const webhookSecret = process.env.BLAND_WEBHOOK_SECRET;
  if (webhookSecret) {
    const crypto = require("crypto");
    const signature = req.headers["x-webhook-signature"] || "";
    const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    const expected = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
    if (signature !== expected) {
      console.error("[setter-webhook] Invalid webhook signature");
      return res.status(401).json({ error: "Invalid signature" });
    }
  }

  const payload = req.body;
  if (!payload || !payload.call_id) {
    return res.status(400).json({ error: "Invalid webhook payload" });
  }

  const {
    call_id,
    status,
    completed,
    call_length,
    transcripts,
    summary,
    metadata,
    answered_by,
    transferred_to
  } = payload;

  console.log(`[setter-webhook] call_id=${call_id}, status=${status}, completed=${completed}, length=${call_length}s`);

  const disposition = determineDisposition(payload);
  const contactId = metadata?.contact_id;

  console.log(`[setter-webhook] disposition=${disposition}, contact=${contactId || "none"}`);

  // Update GHL contact
  if (contactId) {
    try {
      await updateGhlAfterSetterCall(contactId, {
        call_id,
        disposition,
        summary,
        call_length,
        transferred_to
      });
      console.log(`[setter-webhook] Updated GHL contact ${contactId}`);
    } catch (err) {
      console.error(`[setter-webhook] Failed to update GHL: ${err.message}`);
    }
  }

  // Post-call analysis (async, non-blocking)
  if (call_id && status === "completed") {
    triggerSetterAnalysis(call_id, contactId).catch((err) => {
      console.error(`[setter-webhook] Analysis failed: ${err.message}`);
    });
  }

  return res.status(200).json({
    ok: true,
    disposition,
    contact_id: contactId || null
  });
};

// ---------------------------------------------------------------------------
// GHL update
// ---------------------------------------------------------------------------

async function updateGhlAfterSetterCall(contactId, { call_id, disposition, summary, call_length, transferred_to }) {
  const ghl = require("../src/lib/ghl-client");

  if (!ghl.isConfigured()) {
    console.log("[setter-webhook] GHL not configured, skipping");
    return;
  }

  // Update custom fields
  const customFields = {
    setter_call_disposition: disposition,
    setter_call_status: disposition === "booked" ? "Appointment Set" : "Follow Up"
  };

  await ghl.updateContactCustomFields(contactId, customFields);

  // Add activity note
  const noteLines = [
    "AI Setter Call — " + disposition.replace(/_/g, " "),
    "Duration: " + (call_length ? Math.round(call_length) + "s" : "N/A"),
    transferred_to ? "Transferred to: " + transferred_to : null,
    summary ? "\n" + summary : null
  ]
    .filter(Boolean)
    .join("\n");

  await ghl.addContactNote(contactId, noteLines);

  // Tag contact based on disposition
  const tagMap = {
    booked: ["setter-booked"],
    interested_callback: ["setter-callback"],
    not_interested: ["setter-declined"],
    voicemail: ["setter-voicemail"]
  };
  const tags = tagMap[disposition];
  if (tags) {
    await ghl.addContactTags(contactId, tags).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Disposition classification
// ---------------------------------------------------------------------------

function determineDisposition(payload) {
  if (payload.transferred_to) return "booked";
  if (payload.answered_by === "voicemail") return "voicemail";
  if (payload.status === "no-answer") return "no_answer";
  if (payload.status === "busy") return "no_answer";
  if (payload.status === "failed") return "no_answer";

  // If the call was answered and lasted long enough, try to infer from summary
  if (payload.completed && payload.call_length > 60) {
    const summary = (payload.summary || "").toLowerCase();
    if (summary.includes("appointment") || summary.includes("booked") || summary.includes("scheduled")) {
      return "booked";
    }
    if (summary.includes("not interested") || summary.includes("declined") || summary.includes("remove")) {
      return "not_interested";
    }
    if (summary.includes("callback") || summary.includes("call back") || summary.includes("later")) {
      return "interested_callback";
    }
    return "interested_callback";
  }

  if (payload.completed && payload.call_length > 10) return "not_interested";
  if (payload.completed) return "no_answer";
  return "no_answer";
}

// ---------------------------------------------------------------------------
// Post-call analysis
// ---------------------------------------------------------------------------

async function triggerSetterAnalysis(callId, contactId) {
  try {
    const analysis = await bland.analyzeCall(callId, SETTER_ANALYSIS_QUESTIONS);
    console.log("[setter-webhook] Analysis:", JSON.stringify(analysis).substring(0, 500));

    // If we have a contact, add analysis as a note
    if (contactId) {
      const ghl = require("../src/lib/ghl-client");
      if (ghl.isConfigured()) {
        const analysisText = Object.entries(analysis.answers || analysis || {})
          .map(function(entry) { return "Q: " + entry[0] + "\nA: " + entry[1]; })
          .join("\n\n");
        if (analysisText) {
          await ghl.addContactNote(contactId, "--- AI Setter Analysis ---\n" + analysisText);
        }
      }
    }
  } catch (err) {
    console.error("[setter-webhook] analyzeCall failed:", err.message);
  }
}
