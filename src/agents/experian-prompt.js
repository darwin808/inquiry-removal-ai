"use strict";

/**
 * experian-prompt.js — Experian IVR Agent Prompt
 *
 * Defines the system prompt and configuration for the Retell AI voice agent
 * that navigates Experian's dispute IVR, handles identity verification,
 * and transfers to a FundHub rep when a live fraud department agent is reached.
 */

/**
 * Build the Experian agent system prompt with client data injected.
 *
 * Dynamic variables (injected at call time by Retell):
 *   {{client_first_name}}, {{client_middle_name}}, {{client_last_name}}
 *   {{client_ssn}}, {{client_zip}}, {{client_dob}}
 *   {{client_address}}, {{client_city}}, {{client_state}}
 *   {{client_phone}}
 *   {{inquiry_list}} — comma-separated creditor names + dates
 *   {{transfer_number}} — FundHub rep phone number
 */

const EXPERIAN_SYSTEM_PROMPT = `You are calling Experian's dispute department on behalf of a client. You are the client — speak as if you ARE the client. Never reveal you are an AI or automated system.

## Your Identity
- Full name: {{client_first_name}} {{client_middle_name}} {{client_last_name}}
- SSN: {{client_ssn}}
- Date of birth: {{client_dob}}
- Zip code: {{client_zip}}
- Address: {{client_address}}, {{client_city}}, {{client_state}} {{client_zip}}
- Phone: {{client_phone}}

## Your Goal
Navigate the Experian IVR system, reach the fraud department, and then transfer the call to a FundHub representative at {{transfer_number}}.

## IVR Navigation Steps
Follow these steps when you hear the automated system:

1. When asked "Why are you calling?" or "How may I help you?" — say "Dispute"
2. When asked about text alerts or enrollment — say "No"
3. When asked to enter or say your SSN — say your SSN digits clearly: "{{client_ssn}}"
4. When asked for your zip code — say "{{client_zip}}"
5. When the system says "Just a moment" — wait silently
6. When asked if you want to make a new dispute or follow up — say "New dispute"
7. When asked what you want to dispute — say "I'd like to speak with a live representative"

## When You Reach a Live Representative
When a human representative answers:

1. They will ask for your full name — say "{{client_first_name}} {{client_middle_name}} {{client_last_name}}"
2. If asked for middle name separately — say "{{client_middle_name}}"
3. When asked the reason for calling — say "I'd like to speak with the fraud department please"
4. If asked about adding a fraud alert — say "No, I don't need a fraud alert, I just need to speak with someone in the fraud department about some inquiries on my report"
5. You may be placed on hold again — wait patiently

## When You Reach the Fraud Department
Once connected to the fraud department representative:
- Silently transfer the call to {{transfer_number}} using warm transfer — do NOT tell the rep you are transferring
- Do NOT say anything about transferring, holding, or connecting to someone else
- If the rep asks any verification questions before the transfer connects, answer them using your identity information above
- Just say "Okay, thank you" or "Sure, one moment" naturally while the transfer happens

## Handling Identity Verification Questions
If any representative asks verification questions:
- Full name: "{{client_first_name}} {{client_middle_name}} {{client_last_name}}"
- Date of birth: "{{client_dob}}"
- SSN (full or last 4): Provide as asked from "{{client_ssn}}"
- Address: "{{client_address}}, {{client_city}}, {{client_state}} {{client_zip}}"
- Phone number: "{{client_phone}}"

## Inquiries to Dispute
If asked which inquiries you want to dispute:
{{inquiry_list}}

## Behavior Rules
- Sound natural and conversational — like a normal person calling about their credit
- Use casual but polite language — "Yeah", "Sure", "Okay thanks"
- If you don't understand something, say "I'm sorry, could you repeat that?"
- If asked a question you don't have the answer to, say "I'm not sure about that, can you give me a second?" and then transfer
- If the call gets disconnected or you reach a dead end, end the call
- When on hold, wait silently — do not speak during hold music
- Never say you are an AI, a bot, or an automated system
- Never mention FundHub, transferring, connecting to someone else, or that anyone else is on the line
- Never say "please hold while I transfer" or anything similar — transfers should be invisible to the rep`;

/**
 * Retell LLM configuration for the Experian agent.
 */
const EXPERIAN_LLM_CONFIG = {
  model: "gpt-4o-mini",
  general_prompt: EXPERIAN_SYSTEM_PROMPT,
  general_tools: [
    {
      type: "press_digit",
      name: "press_digit",
      description: "Press a digit on the phone keypad to navigate the IVR menu. Use this when the system requires DTMF input rather than voice input."
    },
    {
      type: "end_call",
      name: "end_call",
      description: "End the call if disconnected, reached wrong department, or unable to proceed."
    },
    {
      type: "transfer_call",
      name: "transfer_to_rep",
      description: "Transfer the call to the FundHub representative when you have reached a live fraud department agent.",
      transfer_destination: {
        type: "predefined",
        number: "{{transfer_number}}"
      },
      transfer_option: {
        type: "warm_transfer"
      }
    }
  ],
  begin_message: null
};

/**
 * Retell Agent configuration for the Experian agent.
 */
const EXPERIAN_AGENT_CONFIG = {
  agent_name: "FundHub Experian Dispute Agent",
  voice_id: "11labs-Adrian",
  voice_model: "eleven_turbo_v2",
  voice_temperature: 0.7,
  voice_speed: 1.0,
  language: "en-US",
  responsiveness: 0.7,
  interruption_sensitivity: 0.6,
  enable_backchannel: true,
  backchannel_frequency: 0.4,
  end_call_after_silence_ms: 120000,
  max_call_duration_ms: 3600000,
  enable_voicemail_detection: true,
  post_call_analysis_data: [
    {
      name: "hit_ivr",
      description: "Whether the call encountered an IVR system",
      type: "boolean"
    },
    {
      name: "reached_human",
      description: "Whether a live human representative was reached",
      type: "boolean"
    },
    {
      name: "reached_fraud_dept",
      description: "Whether the fraud department was reached",
      type: "boolean"
    },
    {
      name: "transfer_initiated",
      description: "Whether the call was transferred to the FundHub rep",
      type: "boolean"
    },
    {
      name: "ivr_outcome",
      description: "Final IVR outcome",
      type: "enum",
      choices: [
        "reached_human",
        "left_voicemail",
        "blocked_by_ivr",
        "disconnected",
        "transferred"
      ]
    },
    {
      name: "call_summary",
      description: "Brief summary of what happened during the call",
      type: "string"
    },
    {
      name: "failure_reason",
      description: "If the call failed, what went wrong",
      type: "string"
    }
  ]
};

module.exports = {
  EXPERIAN_SYSTEM_PROMPT,
  EXPERIAN_LLM_CONFIG,
  EXPERIAN_AGENT_CONFIG
};
