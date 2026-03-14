# Inquiry Removal AI — Task Plan

## Goal
Build an AI-powered outbound calling system that navigates Experian's IVR, reaches a live agent, handles identity verification using CRS credit data, and transfers to a FundHub rep for inquiry removal. Experian MVP first.

## Stack
- **Voice:** Retell AI (outbound calls, IVR/DTMF, warm transfer)
- **Middleware:** Node.js + Vercel (serverless)
- **Data:** Airtable (FUNDHUB MATRIX) + GHL (CRM)
- **CRS Integration:** UnderwriteIQ CRS engine provides credit data

## Phases

### Phase 1: Project Scaffolding `in_progress`
- [ ] package.json, .env.example, vercel.json
- [ ] Git init
- [ ] Basic project structure

### Phase 2: Retell Client Module `pending`
- [ ] API wrapper (create agent, create call, list agents, webhooks)
- [ ] Error handling, retry logic

### Phase 3: Experian Voice Agent `pending`
- [ ] Create Retell LLM with Experian IVR prompt
- [ ] Configure press_digit tool for DTMF
- [ ] Create agent with realistic voice
- [ ] Agent has access to client data via dynamic variables
- [ ] Script to create/update agent via API

### Phase 4: Packet Builder `pending`
- [ ] Takes CRS client data → normalized call packet
- [ ] Includes: name, DOB, SSN, addresses, phone, inquiries per bureau
- [ ] Maps to Retell dynamic variables

### Phase 5: Launch Call Endpoint `pending`
- [ ] POST /api/launch-call
- [ ] Validates input, builds packet, creates Retell call
- [ ] Returns call_id for tracking

### Phase 6: Webhook Receiver `pending`
- [ ] POST /api/call-webhook
- [ ] Handles: call_started, call_ended, call_analyzed
- [ ] Updates status in response (GHL/Airtable later)

### Phase 7: Testing & Tuning `pending`
- [ ] Buy Retell phone number (needs payment method)
- [ ] Test call to Experian
- [ ] Tune prompt based on real results
- [ ] Handle edge cases (wrong IVR path, disconnects, long hold)

## Decisions
| Decision | Choice | Reason |
|----------|--------|--------|
| Voice platform | Retell AI | Supports IVR/DTMF, concurrent calls, warm transfer |
| Hosting | Vercel | Same as rest of FundHub stack |
| Experian first | Yes | Chris confirmed, simplest IVR, only one partially mapped |

## Blockers
- Need Retell phone number ($1-2/mo) — Chris needs to add payment or we buy from dashboard
- Only Experian IVR is mapped; EQ/TU TBD

## Files Modified
(updated as we go)
