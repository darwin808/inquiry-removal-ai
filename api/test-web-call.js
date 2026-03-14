"use strict";

/**
 * POST /api/test-web-call
 *
 * Creates a web call for testing the Experian agent in the browser.
 * No phone number needed — uses WebRTC through the Retell Web SDK.
 *
 * Returns an access_token that the frontend uses to join the call.
 */

const retell = require("../src/lib/retell-client");
const { buildExperianPacket } = require("../src/lib/packet-builder");

const EXPERIAN_AGENT_ID = process.env.RETELL_EXPERIAN_AGENT_ID;

// Test client data (Willie Booze from sandbox)
const TEST_CLIENT = {
  firstName: "WILLIE",
  middleName: "J",
  lastName: "BOOZE",
  ssn: "666-40-1734",
  dob: "06/15/1979",
  phone: "+12025551234",
  address: {
    line1: "456 OAK AVE",
    city: "DALLAS",
    state: "TX",
    zip: "75201"
  }
};

const TEST_INQUIRIES = [
  { creditorName: "CAPITAL ONE", date: "2025-11-15" },
  { creditorName: "CHASE BANK", date: "2025-10-22" }
];

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!EXPERIAN_AGENT_ID) {
    return res.status(500).json({ error: "RETELL_EXPERIAN_AGENT_ID not configured" });
  }

  // Use provided client data or fall back to test data
  const clientData = req.body?.clientData || TEST_CLIENT;
  const inquiries = req.body?.inquiries || TEST_INQUIRIES;
  const transferNumber = req.body?.transferNumber || "+10000000000";

  try {
    const dynamicVariables = buildExperianPacket(clientData, inquiries, transferNumber);

    const resp = await retell.createWebCall({
      agentId: EXPERIAN_AGENT_ID,
      dynamicVariables
    });

    return res.status(200).json({
      ok: true,
      accessToken: resp.access_token,
      callId: resp.call_id
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};
