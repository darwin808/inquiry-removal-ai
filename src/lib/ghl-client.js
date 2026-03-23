"use strict";

/**
 * ghl-client.js — GoHighLevel CRM API Client
 *
 * Thin wrapper for GHL contact operations.
 * Uses Private API Key (location-level) authentication.
 *
 * Follows the same pattern as the underwrite-iq-lite ghl-contact-service.js
 * but scoped to inquiry-removal needs (custom field updates + notes).
 */

const GHL_API_BASE = "https://services.leadconnectorhq.com";
const GHL_API_VERSION = "2021-07-28";

function getConfig() {
  const apiKey = process.env.GHL_PRIVATE_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;
  if (!apiKey) throw new Error("GHL_PRIVATE_API_KEY not configured");
  if (!locationId) throw new Error("GHL_LOCATION_ID not configured");
  return { apiKey, locationId };
}

function isConfigured() {
  return !!(process.env.GHL_PRIVATE_API_KEY && process.env.GHL_LOCATION_ID);
}

async function ghlFetch(path, options = {}) {
  const { apiKey } = getConfig();
  const url = `${GHL_API_BASE}${path}`;
  const resp = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Version: GHL_API_VERSION,
      ...options.headers
    }
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(
      `GHL ${options.method || "GET"} ${path} failed: ${resp.status} ${text.substring(0, 300)}`
    );
  }

  return resp.json();
}

// ---------------------------------------------------------------------------
// Update Contact Custom Fields
// ---------------------------------------------------------------------------

/**
 * Update custom fields on a GHL contact.
 *
 * @param {string} contactId - GHL contact ID
 * @param {Object} customFields - Key/value pairs to set, e.g. { ai_call_master_status: "completed" }
 * @returns {Promise<Object>} GHL API response
 */
async function updateContactCustomFields(contactId, customFields) {
  if (!contactId) throw new Error("contactId is required");

  // GHL expects: customFields: [{ key: "field_name", field_value: "value" }]
  const customFieldsArray = Object.entries(customFields).map(([key, value]) => ({
    key,
    field_value: String(value)
  }));

  return ghlFetch(`/contacts/${contactId}`, {
    method: "PUT",
    body: JSON.stringify({ customFields: customFieldsArray })
  });
}

// ---------------------------------------------------------------------------
// Add Note to Contact
// ---------------------------------------------------------------------------

/**
 * Add a note to a GHL contact's activity timeline.
 *
 * @param {string} contactId - GHL contact ID
 * @param {string} body - Note text content
 * @returns {Promise<Object>} GHL API response
 */
async function addContactNote(contactId, body) {
  if (!contactId) throw new Error("contactId is required");
  if (!body) throw new Error("Note body is required");

  return ghlFetch(`/contacts/${contactId}/notes`, {
    method: "POST",
    body: JSON.stringify({ body })
  });
}

// ---------------------------------------------------------------------------
// Add Tag to Contact
// ---------------------------------------------------------------------------

/**
 * Add tags to a GHL contact.
 *
 * @param {string} contactId - GHL contact ID
 * @param {string[]} tags - Tags to add
 * @returns {Promise<Object>} GHL API response
 */
async function addContactTags(contactId, tags) {
  if (!contactId) throw new Error("contactId is required");

  return ghlFetch(`/contacts/${contactId}/tags`, {
    method: "POST",
    body: JSON.stringify({ tags })
  });
}

module.exports = {
  isConfigured,
  updateContactCustomFields,
  addContactNote,
  addContactTags
};
