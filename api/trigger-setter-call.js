"use strict";

/**
 * POST /api/trigger-setter-call
 *
 * Called by a GHL workflow when an appointment is booked AND the UnderwriteIQ
 * analyzer gate has passed. Inspects the lead grade, selects the appropriate
 * setter prompt variant, then dispatches an outbound Bland AI call.
 *
 * Lead grading (driven by cf_analyzer_recommendation):
 *   Grade 1 — "disqualified" → skip; do not call
 *   Grade 2 — "repair"       → repair-focused variant (Josh, repair path)
 *   Grade 3 — "funding" AND prequal_amount < $50,000  → standard setter
 *   Grade 4 — "funding" AND prequal_amount >= $50,000 → VIP setter (same prompt,
 *                                                        higher priority metadata)
 *
 * Expected GHL webhook payload:
 * {
 *   "contact_id":              "GHL contact ID",
 *   "first_name":              "John",
 *   "phone":                   "+1xxxxxxxxxx",
 *   "appointment_time":        "ISO 8601 timestamp",
 *   "analyzer_recommendation": "funding" | "repair" | "disqualified",
 *   "prequal_amount":          "125000",    // string from GHL merge tag
 *   "primary_fico":            "720",
 *   "closer_name":             "Chris"      // Opportunity Owner / assigned advisor
 * }
 *
 * Auth: Authorization: Bearer <API_SECRET>
 */

const bland = require("../src/lib/bland-client");
const { buildSetterCallConfig } = require("../src/agents/setter-prompt");
const { requireAuth } = require("../src/lib/auth");

// Grade thresholds
const VIP_PREQUAL_THRESHOLD = 50000;

// Human-readable grade labels (used in logs + metadata)
const GRADE_LABELS = {
  1: "disqualified",
  2: "repair",
  3: "funding_standard",
  4: "funding_vip"
};

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!requireAuth(req, res)) return;

  if (!process.env.BLAND_API_KEY) {
    return res.status(500).json({ error: "BLAND_API_KEY not configured" });
  }

  const body = req.body || {};

  // -------------------------------------------------------------------------
  // Extract and validate required fields from GHL webhook payload
  // -------------------------------------------------------------------------
  const {
    contact_id: contactId,
    first_name: firstName,
    phone,
    appointment_time: appointmentTime,
    analyzer_recommendation: analyzerRecommendation,
    prequal_amount: prequalAmountRaw,
    primary_fico: primaryFico,
    closer_name: closerName
  } = body;

  if (!contactId) {
    return res.status(400).json({ error: "contact_id is required" });
  }
  if (!firstName) {
    return res.status(400).json({ error: "first_name is required" });
  }
  if (!phone) {
    return res.status(400).json({ error: "phone is required" });
  }

  const prequalAmount = parseFloat(String(prequalAmountRaw || "0").replace(/[^0-9.]/g, "")) || 0;
  const recommendation = (analyzerRecommendation || "").toLowerCase().trim();

  // -------------------------------------------------------------------------
  // Grade classification
  // -------------------------------------------------------------------------
  const grade = classifyGrade(recommendation, prequalAmount);
  const gradeLabel = GRADE_LABELS[grade];

  console.log(
    `[trigger-setter-call] contact=${contactId} recommendation=${recommendation} ` +
      `prequal=$${prequalAmount} grade=${grade} (${gradeLabel})`
  );

  // Grade 1 — disqualified: cancel the call entirely
  if (grade === 1) {
    console.log(`[trigger-setter-call] Grade 1 (disqualified) — skipping call for contact ${contactId}`);
    return res.status(200).json({
      ok: true,
      skipped: true,
      reason: "grade_1_disqualified",
      contact_id: contactId
    });
  }

  // -------------------------------------------------------------------------
  // Build Bland AI call config
  // -------------------------------------------------------------------------
  try {
    // request_data is injected into the prompt as {{key}} variables
    const requestData = buildRequestData({
      firstName,
      phone,
      prequalAmount,
      primaryFico: primaryFico || "",
      analyzerRecommendation: recommendation,
      appointmentTime: appointmentTime || "",
      closerName: closerName || "your Senior Advisor",
      grade
    });

    // metadata is passed through on the webhook callback (not injected into prompt)
    const metadata = {
      ghl_contact_id: contactId,
      first_name: firstName,
      appointment_time: appointmentTime || null,
      analyzer_recommendation: recommendation,
      prequal_amount: String(prequalAmountRaw || ""),
      primary_fico: String(primaryFico || ""),
      closer_name: closerName || "",
      grade,
      grade_label: gradeLabel,
      call_type: "setter",
      initiated_at: new Date().toISOString()
    };

    const callConfig = buildSetterCallConfig(requestData, { metadata });

    // -------------------------------------------------------------------------
    // Setter-specific Bland AI overrides from spec addendum
    // -------------------------------------------------------------------------
    // max_duration: 10 minutes per spec (setter calls should be brief)
    callConfig.maxDuration = 10;

    // AMD: detect answering machine, drop voicemail if detected
    callConfig.amd = true;

    // first_sentence from spec
    callConfig.firstSentence = `Hey, is this ${firstName}?`;

    const call = await bland.createCall(callConfig);

    console.log(
      `[trigger-setter-call] Bland call launched: call_id=${call.call_id} ` +
        `contact=${contactId} grade=${grade}`
    );

    return res.status(200).json({
      ok: true,
      call_id: call.call_id,
      status: call.status || "queued",
      contact_id: contactId,
      grade,
      grade_label: gradeLabel
    });
  } catch (err) {
    console.error(`[trigger-setter-call] Failed to launch call for contact ${contactId}:`, err.message);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
};

// ---------------------------------------------------------------------------
// Grade classification
// ---------------------------------------------------------------------------

/**
 * Determine the numeric lead grade from CRM indicators.
 *
 * @param {string} recommendation - Normalized cf_analyzer_recommendation value
 * @param {number} prequalAmount  - Parsed prequal amount in dollars
 * @returns {1|2|3|4}
 */
function classifyGrade(recommendation, prequalAmount) {
  if (recommendation === "disqualified") return 1;
  if (recommendation === "repair") return 2;
  if (recommendation === "funding") {
    return prequalAmount >= VIP_PREQUAL_THRESHOLD ? 4 : 3;
  }
  // Unknown recommendation — default to Grade 2 (repair-path) as conservative fallback
  // rather than skipping a potentially valid lead
  console.warn(`[trigger-setter-call] Unknown recommendation "${recommendation}" — defaulting to grade 2`);
  return 2;
}

// ---------------------------------------------------------------------------
// Request data builder
// ---------------------------------------------------------------------------

/**
 * Build the request_data object passed to buildSetterCallConfig.
 * All fields are injected as {{key}} variables into the Bland AI prompt.
 *
 * Grade-specific variants:
 *   Grade 2 (repair): first_sentence and rep description pivot to repair path
 *   Grade 3/4 (funding): standard / VIP path with prequal emphasis
 */
function buildRequestData({
  firstName,
  phone,
  prequalAmount,
  primaryFico,
  analyzerRecommendation,
  appointmentTime,
  closerName,
  grade
}) {
  // Format prequal for speech ("$125,000" or "$0" if not applicable)
  const prequalFormatted =
    prequalAmount > 0
      ? "$" + prequalAmount.toLocaleString("en-US", { maximumFractionDigits: 0 })
      : "an amount we need to determine together";

  // Repair leads don't have a prequal — pivot framing
  const isRepair = grade === 2;
  const isVip = grade === 4;

  return {
    // Core fields used by current setter-prompt.js template
    lead_first_name: firstName,
    lead_last_name: "",
    lead_phone: phone,
    rep_name: closerName,
    company_name: "FundHub",
    contact_id: null, // not passed — use metadata.ghl_contact_id
    calendar_id: process.env.GHL_CALENDAR_ID || "",
    transfer_number: process.env.FUNDHUB_REP_NUMBER || "",

    // SLO funnel fields (referenced in updated Josh prompt per spec addendum)
    first_name: firstName,
    prequal_amount: isRepair ? "0" : prequalFormatted,
    primary_fico: primaryFico || "not available",
    analyzer_recommendation: analyzerRecommendation,
    appointment_time: appointmentTime || "your scheduled time",
    closer_name: closerName,
    path: isRepair ? "Repair" : "Funding",
    is_vip: isVip ? "true" : "false",

    // Contextual flags that can be used in prompt branching
    repair_path: isRepair ? "true" : "false",
    funding_path: isRepair ? "false" : "true"
  };
}
