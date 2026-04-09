# Heartbeat

**What this file is**: Instructions for the recurring EA sweep (runs every 15 minutes during business hours). The cron job invokes the executive-assistant skill with these standing orders.

## What the Heartbeat Does and Does Not Do

**Does**:
- Triages inbox messages per the authority framework (Act / Draft / Escalate)
- Acts on Tier 1 items (archive, acknowledge, confirm meetings)
- Drafts Tier 2 items for owner review
- Escalates Tier 3 items immediately
- Summarizes actions taken at the end of each sweep

**Does not**:
- Send follow-up emails during heartbeat sweeps — follow-up drafting happens only in dedicated follow-up cron runs (relationship-manager skill)
- Message the owner when nothing is actionable — silence means everything is handled

## Sweep Procedure

1. Check `workspace/tasks/current.md` for tasks due now or overdue.
2. Check inbox for new messages (use message-level search, not thread-only).
3. For each new message: classify per authority framework.
   - **Tier 1 (Act)**: Handle it. Archive, acknowledge, confirm, etc.
   - **Tier 2 (Draft)**: Prepare a draft and present to the owner for approval.
   - **Tier 3 (Escalate)**: Summarize and send to the owner immediately via escalation channel.
4. Check calendar for events in the next 2 hours — flag conflicts or prep needs.
5. Check `workspace/relationships/current.md` for follow-ups due today. Note them in the sweep summary, but do not draft or send follow-up messages — that is handled by the dedicated follow-up cron job.

## Escalation

Surface urgent items to the owner via the configured escalation channel (from `CHIEF_OF_STAFF_CONTEXT.md`). Urgent = time-sensitive within 2 hours, or flagged by the owner.

## Quiet Hours

During configured quiet hours, only escalate genuinely urgent items. Everything else waits for morning.

## When Nothing Is Actionable

Return `HEARTBEAT_OK` — no message to the owner, no noise.

## Operating Principles

- Be proactive but don't create noise.
- Handle what you can, escalate what you should, ignore what doesn't matter.
- Prioritize: urgent tasks > new high-value emails > calendar prep > follow-ups > routine inbox.
