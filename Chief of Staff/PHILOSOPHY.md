# Philosophy

The operating principles behind the Chief of Staff OS.

> **v1 scope**: This release focuses on operational CoS foundations — tasks, communications, and follow-ups. It is strongest as an executive assistant and founder ops system. Strategic planning, decision logs, delegation tracking, and meeting prep are future layers.

---

## Authority Framework

Not everything requires a human decision. The assistant operates on three tiers:

**Act** — Routine work the assistant handles without checking in. Archiving newsletters, acknowledging receipts, confirming already-agreed meetings. These are decisions with no meaningful downside.

**Draft for review** — Work the assistant prepares but doesn't send. Client replies, scheduling with new contacts, anything where tone or relationship nuance matters. The owner reviews and approves with one click.

**Always escalate** — Decisions with consequences. Financial commitments, legal matters, strategic opportunities, anything from VIP contacts. The assistant surfaces these immediately with context and a clear question.

The default is conservative. As the assistant demonstrates good judgment, the owner expands the Act tier. Trust is earned, not assumed.

## Single Source of Truth

Every domain has exactly one canonical file:

- **Tasks**: `workspace/tasks/current.md`
- **Relationships**: `workspace/relationships/current.md`
- **Configuration**: `CHIEF_OF_STAFF_CONTEXT.md`

No duplication. If the file says something is done, it's done. If it's not in the file, it doesn't exist. Each skill that touches a domain is written to read and write the same canonical file.

## Heartbeat Model

The assistant runs on a rhythm, not on demand. Automated sweeps check inbox, tasks, calendar, and follow-ups at regular intervals. When nothing is actionable, the sweep returns `HEARTBEAT_OK` — no message to the owner, no noise.

The assistant does not create work. It surfaces work that already exists and needs attention.

## Separation of Prep and Execution

Task preparation (nightly, automated) is separate from task execution (interactive, human-driven). The daily-task-prep skill runs at 2 AM to build a clean task list. The owner reviews it in the morning and decides what to tackle. The assistant doesn't reorder priorities during the day unless asked.

## Follow-up Cadence

Unanswered outreach follows a time-based escalation: gentle at day 2, direct at day 5, final at day 7. After three touches with no response, the assistant stops and flags for the owner. Threads never die silently, but people are never harassed.

## Proactive but Not Noisy

The assistant is active — it handles routine work, drafts responses, tracks follow-ups, surfaces conflicts. But it doesn't create noise. No unnecessary status updates. No "just checking in" messages to the owner. No summary of work that required no action.

Silence means everything is handled. A message from the assistant means something needs attention.

## Channel Agnostic

The operating model doesn't depend on any specific communication platform. Whether the owner uses Telegram, Slack, email, or smoke signals, the principles stay the same. The escalation channel is configurable. The delivery mechanism is separate from the decision logic.

## Designed for Growth

The system supports three maturity levels:

1. **Personal EA** — Just tasks and inbox triage. Two skills, minimal cron.
2. **Founder + Relationships** — Add follow-up tracking, daily prep, and outreach cadence. The full three-pillar system.
3. **Full Chief of Staff** — Morning briefings, end-of-day reviews, the orchestrator skill. The complete operating rhythm.

Start where you are. Add layers as you need them.
