"use strict";

/**
 * POST /api/call-webhook
 *
 * Receives webhook events from Retell AI after calls.
 * Events: call_started, call_ended, call_analyzed
 *
 * Updates call tracking and triggers next workflow steps.
 */

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const event = req.body;
  if (!event || !event.event) {
    return res.status(400).json({ error: "Invalid webhook payload" });
  }

  const { event: eventType, call } = event;

  console.log(`[webhook] ${eventType} — call_id=${call?.call_id || "unknown"}`);

  switch (eventType) {
    case "call_started":
      await handleCallStarted(call);
      break;

    case "call_ended":
      await handleCallEnded(call);
      break;

    case "call_analyzed":
      await handleCallAnalyzed(call);
      break;

    default:
      console.log(`[webhook] Unknown event type: ${eventType}`);
  }

  return res.status(200).json({ ok: true });
};

async function handleCallStarted(call) {
  console.log(`[call_started] call_id=${call.call_id}, to=${call.to_number}`);
  // TODO: Update Airtable INQUIRY_LOG.call_state = "dialing"
  // TODO: Update GHL ai_call_master_status = "calling"
}

async function handleCallEnded(call) {
  const duration = call.end_timestamp && call.start_timestamp
    ? Math.round((call.end_timestamp - call.start_timestamp) / 1000)
    : null;

  console.log(`[call_ended] call_id=${call.call_id}, duration=${duration}s, status=${call.call_status}`);
  console.log(`[call_ended] disconnect_reason=${call.disconnection_reason || "unknown"}`);

  // TODO: Update Airtable INQUIRY_LOG with call results
  // TODO: Update GHL ai_call_master_status based on outcome
  // TODO: If transfer succeeded, update ai_transfer_status = "connected"
}

async function handleCallAnalyzed(call) {
  const analysis = call.call_analysis || {};

  console.log(`[call_analyzed] call_id=${call.call_id}`);
  console.log(`[call_analyzed] hit_ivr=${analysis.hit_ivr}`);
  console.log(`[call_analyzed] reached_human=${analysis.reached_human}`);
  console.log(`[call_analyzed] reached_fraud_dept=${analysis.reached_fraud_dept}`);
  console.log(`[call_analyzed] transfer_initiated=${analysis.transfer_initiated}`);
  console.log(`[call_analyzed] ivr_outcome=${analysis.ivr_outcome}`);
  console.log(`[call_analyzed] summary=${analysis.call_summary}`);

  if (analysis.failure_reason) {
    console.log(`[call_analyzed] FAILURE: ${analysis.failure_reason}`);
  }

  // TODO: Write analysis to Airtable INQUIRY_LOG
  // TODO: If transfer succeeded → update GHL ai_handoff_at
  // TODO: If failed → check retry logic, maybe re-queue
}
