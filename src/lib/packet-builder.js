"use strict";

/**
 * packet-builder.js — Build call packets from client/CRS data
 *
 * Takes client information and CRS credit data, produces a normalized
 * packet that maps to Bland AI request_data variables for the voice agent.
 */

/**
 * Sanitize a string for safe inclusion in prompt text.
 * Strips characters that could be used for prompt injection.
 */
function sanitize(str, maxLen = 100) {
  return String(str || "")
    .replace(/[^a-zA-Z0-9\s\-&.,\/()]/g, "")
    .substring(0, maxLen);
}

/**
 * Extract the leading numeric street number from an address line.
 * e.g. "456 Oak Ave" → "456"
 */
function extractStreetNumber(addressLine) {
  const match = String(addressLine || "").match(/^(\d+)/);
  return match ? match[1] : "";
}

/**
 * Build a call packet for an Experian dispute call.
 *
 * @param {Object} clientData - Client identity information
 * @param {string} clientData.firstName
 * @param {string} clientData.middleName
 * @param {string} clientData.lastName
 * @param {string} clientData.ssn - Full 9-digit SSN
 * @param {string} clientData.dob - Date of birth (MM/DD/YYYY)
 * @param {string} clientData.phone - Phone number
 * @param {Object} clientData.address
 * @param {string} clientData.address.line1
 * @param {string} clientData.address.city
 * @param {string} clientData.address.state
 * @param {string} clientData.address.zip
 * @param {Array} inquiries - Experian inquiries to dispute
 * @param {string} inquiries[].creditorName
 * @param {string} inquiries[].date
 * @param {string} transferNumber - FundHub rep phone number (E.164)
 * @returns {Object} Bland AI request_data variables object
 */
function buildExperianPacket(clientData, inquiries, transferNumber) {
  if (!clientData.firstName || !clientData.lastName) {
    throw new Error("Client first and last name are required");
  }
  if (!clientData.ssn || clientData.ssn.replace(/\D/g, "").length !== 9) {
    throw new Error("Valid 9-digit SSN is required");
  }
  if (!clientData.address?.zip) {
    throw new Error("Client zip code is required");
  }
  if (!transferNumber) {
    throw new Error("Transfer number is required");
  }

  const cleanSSN = clientData.ssn.replace(/\D/g, "");
  const ssnFormatted = `${cleanSSN.slice(0, 3)}-${cleanSSN.slice(3, 5)}-${cleanSSN.slice(5)}`;

  const inquiryList = inquiries && inquiries.length > 0
    ? inquiries.map(inq => `- ${sanitize(inq.creditorName)} (${sanitize(inq.date, 10)})`).join("\n")
    : "No specific inquiries listed — dispute all unauthorized inquiries on my Experian report.";

  return {
    client_first_name: clientData.firstName,
    client_middle_name: clientData.middleName || "",
    client_last_name: clientData.lastName,
    client_ssn: ssnFormatted,
    client_dob: clientData.dob || "",
    client_zip: clientData.address.zip,
    client_address: clientData.address.line1 || "",
    client_city: clientData.address.city || "",
    client_state: clientData.address.state || "",
    client_phone: clientData.phone || "",
    client_street_number: extractStreetNumber(clientData.address.line1),
    inquiry_list: inquiryList,
    transfer_number: transferNumber
  };
}

/**
 * Build call metadata for tracking.
 */
function buildCallMetadata(clientId, bureau, batchId) {
  return {
    client_id: clientId,
    bureau: bureau,
    batch_id: batchId || `batch_${Date.now()}`,
    initiated_at: new Date().toISOString()
  };
}

module.exports = {
  buildExperianPacket,
  buildCallMetadata
};
