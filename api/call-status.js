"use strict";

/**
 * GET /api/call-status?call_id=xxx
 *
 * Check the status of an ongoing or completed call.
 */

const retell = require("../src/lib/retell-client");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const callId = req.query?.call_id;
  if (!callId) {
    return res.status(400).json({ error: "call_id query parameter is required" });
  }

  try {
    const call = await retell.getCall(callId);

    const duration = call.end_timestamp && call.start_timestamp
      ? Math.round((call.end_timestamp - call.start_timestamp) / 1000)
      : null;

    return res.status(200).json({
      ok: true,
      callId: call.call_id,
      status: call.call_status,
      direction: call.direction,
      fromNumber: call.from_number,
      toNumber: call.to_number,
      duration,
      disconnectReason: call.disconnection_reason || null,
      analysis: call.call_analysis || null,
      metadata: call.metadata || null
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
};
