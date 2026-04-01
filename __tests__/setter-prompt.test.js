"use strict";

const { buildSetterCallConfig, SETTER_TASK, SETTER_ANALYSIS_QUESTIONS } = require("../src/agents/setter-prompt");

// ---- helpers ----
const BASE_REQUEST_DATA = {
  lead_first_name: "John",
  lead_last_name: "Doe",
  lead_phone: "+15551234567",
  rep_name: "Chris",
  company_name: "FundHub",
  contact_id: "ghl_1",
  calendar_id: "cal_abc",
  transfer_number: "+15559990000"
};

beforeEach(() => {
  delete process.env.BLAND_VOICE;
  delete process.env.WEBHOOK_BASE_URL;
  delete process.env.BLAND_TOOL_SLOTS_ID;
  delete process.env.BLAND_TOOL_BOOK_ID;
  delete process.env.FUNDHUB_REP_NUMBER;
});

describe("buildSetterCallConfig", () => {
  // ---- Config structure ----

  test("returns object with phoneNumber from requestData", () => {
    const config = buildSetterCallConfig(BASE_REQUEST_DATA);
    expect(config.phoneNumber).toBe("+15551234567");
  });

  test("returns object with task set to SETTER_TASK", () => {
    const config = buildSetterCallConfig(BASE_REQUEST_DATA);
    expect(config.task).toBe(SETTER_TASK);
  });

  test("returns object with requestData passed through", () => {
    const config = buildSetterCallConfig(BASE_REQUEST_DATA);
    expect(config.requestData).toBe(BASE_REQUEST_DATA);
  });

  test("sets waitForGreeting to true", () => {
    const config = buildSetterCallConfig(BASE_REQUEST_DATA);
    expect(config.waitForGreeting).toBe(true);
  });

  test("sets default voice to 'mason' when BLAND_VOICE env is not set", () => {
    const config = buildSetterCallConfig(BASE_REQUEST_DATA);
    expect(config.voice).toBe("mason");
  });

  test("uses BLAND_VOICE env when set", () => {
    process.env.BLAND_VOICE = "david";
    const config = buildSetterCallConfig(BASE_REQUEST_DATA);
    expect(config.voice).toBe("david");
  });

  // ---- Webhook URL ----

  test("sets webhookUrl when WEBHOOK_BASE_URL env is set", () => {
    process.env.WEBHOOK_BASE_URL = "https://inquiry-removal.vercel.app";
    const config = buildSetterCallConfig(BASE_REQUEST_DATA);
    expect(config.webhookUrl).toBe("https://inquiry-removal.vercel.app/api/setter-webhook");
  });

  test("webhookUrl is undefined when WEBHOOK_BASE_URL env is not set", () => {
    const config = buildSetterCallConfig(BASE_REQUEST_DATA);
    expect(config.webhookUrl).toBeUndefined();
  });

  // ---- Tools injection ----

  test("does not include tools when tool IDs are not set", () => {
    const config = buildSetterCallConfig(BASE_REQUEST_DATA);
    expect(config.tools).toBeUndefined();
  });

  test("includes slots tool when BLAND_TOOL_SLOTS_ID is set", () => {
    process.env.BLAND_TOOL_SLOTS_ID = "tool_slots_1";
    const config = buildSetterCallConfig(BASE_REQUEST_DATA);
    expect(config.tools).toContain("tool_slots_1");
  });

  test("includes book tool when BLAND_TOOL_BOOK_ID is set", () => {
    process.env.BLAND_TOOL_BOOK_ID = "tool_book_1";
    const config = buildSetterCallConfig(BASE_REQUEST_DATA);
    expect(config.tools).toContain("tool_book_1");
  });

  test("includes both tools when both IDs are set", () => {
    process.env.BLAND_TOOL_SLOTS_ID = "tool_slots_1";
    process.env.BLAND_TOOL_BOOK_ID = "tool_book_1";
    const config = buildSetterCallConfig(BASE_REQUEST_DATA);
    expect(config.tools).toEqual(["tool_slots_1", "tool_book_1"]);
  });

  // ---- Transfer number ----

  test("sets transferNumber from requestData.transfer_number", () => {
    const config = buildSetterCallConfig(BASE_REQUEST_DATA);
    expect(config.transferNumber).toBe("+15559990000");
  });

  test("falls back to FUNDHUB_REP_NUMBER env when transfer_number not in requestData", () => {
    process.env.FUNDHUB_REP_NUMBER = "+15558880000";
    const data = { ...BASE_REQUEST_DATA, transfer_number: "" };
    const config = buildSetterCallConfig(data);
    expect(config.transferNumber).toBe("+15558880000");
  });

  test("does not set transferNumber when neither source is available", () => {
    const data = { ...BASE_REQUEST_DATA, transfer_number: "" };
    const config = buildSetterCallConfig(data);
    expect(config.transferNumber).toBeUndefined();
  });

  // ---- Metadata overrides ----

  test("applies metadata from overrides", () => {
    const meta = { contact_id: "ghl_1", call_type: "setter" };
    const config = buildSetterCallConfig(BASE_REQUEST_DATA, { metadata: meta });
    expect(config.metadata).toEqual(meta);
  });

  test("defaults metadata to empty object when no overrides", () => {
    const config = buildSetterCallConfig(BASE_REQUEST_DATA);
    expect(config.metadata).toEqual({});
  });

  // ---- Overrides spread ----

  test("allows overrides to add extra fields", () => {
    const config = buildSetterCallConfig(BASE_REQUEST_DATA, { customField: "test" });
    expect(config.customField).toBe("test");
  });
});

describe("SETTER_TASK", () => {
  test("is a non-empty string", () => {
    expect(typeof SETTER_TASK).toBe("string");
    expect(SETTER_TASK.length).toBeGreaterThan(100);
  });

  test("contains placeholder variables for company_name and lead_first_name", () => {
    expect(SETTER_TASK).toContain("{{company_name}}");
    expect(SETTER_TASK).toContain("{{lead_first_name}}");
  });

  test("includes identity as Alex", () => {
    expect(SETTER_TASK).toContain("Alex");
  });

  test("includes voicemail script", () => {
    expect(SETTER_TASK).toContain("VOICEMAIL");
  });

  test("includes objection handling instructions", () => {
    expect(SETTER_TASK).toContain("OBJECTION HANDLE");
  });

  test("includes behavior rules", () => {
    expect(SETTER_TASK).toContain("BEHAVIOR RULES");
  });
});

describe("SETTER_ANALYSIS_QUESTIONS", () => {
  test("is an array of strings", () => {
    expect(Array.isArray(SETTER_ANALYSIS_QUESTIONS)).toBe(true);
    expect(SETTER_ANALYSIS_QUESTIONS.length).toBeGreaterThan(0);
    for (const q of SETTER_ANALYSIS_QUESTIONS) {
      expect(typeof q).toBe("string");
    }
  });

  test("includes disposition question", () => {
    const hasDisposition = SETTER_ANALYSIS_QUESTIONS.some(
      (q) => q.toLowerCase().includes("disposition")
    );
    expect(hasDisposition).toBe(true);
  });

  test("includes appointment question", () => {
    const hasAppointment = SETTER_ANALYSIS_QUESTIONS.some(
      (q) => q.toLowerCase().includes("appointment")
    );
    expect(hasAppointment).toBe(true);
  });
});
