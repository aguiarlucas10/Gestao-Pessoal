# Operating Model

How the Chief of Staff OS works end-to-end.

---

## The Daily Rhythm

The system runs on a predictable daily cycle:

**2:00 AM — Task Prep** (automated)
The `daily-task-prep` skill runs via cron. It reads the canonical task file, adds recurring weekday items, promotes due-date backlog items, and pulls tomorrow's calendar events. The owner wakes up to a ready-made task list.

**7:57 AM — Morning Briefing** (automated)
The `chief-of-staff` skill produces a daily briefing: today's tasks, calendar, inbox highlights, due follow-ups, and anything that needs attention. Delivered to the owner's escalation channel.

**8:00 AM - 9:00 PM — Heartbeat Sweeps** (automated, every 15 min)
The `executive-assistant` skill runs in heartbeat mode. Each sweep: checks for overdue tasks, triages new inbox messages (acting on Tier 1, drafting Tier 2, escalating Tier 3), flags calendar conflicts in the next 2 hours, and notes due follow-ups. Follow-up drafting happens in the dedicated follow-up cron, not during heartbeat sweeps. Returns `HEARTBEAT_OK` when nothing needs attention.

**9:47 AM and 2:47 PM — Follow-up Checks** (automated)
The `relationship-manager` skill checks for overdue follow-ups and drafts the next touch in the cadence.

**End of Day — EOD Review** (manual, triggered by owner)
The `chief-of-staff` skill reviews what got done, what's still open, and captures anything new. Updates the task file for tomorrow.

## How Skills Interact

```
chief-of-staff (orchestrator)
  ├── reads → workspace/tasks/current.md
  ├── reads → workspace/relationships/current.md
  ├── reads → inbox (via MCP)
  ├── routes to → executive-assistant (for email actions)
  ├── routes to → daily-task-manager (for task changes)
  └── routes to → relationship-manager (for follow-ups)

executive-assistant
  ├── reads → CHIEF_OF_STAFF_CONTEXT.md (authority, accounts)
  ├── reads/writes → workspace/tasks/current.md (creates tasks from emails)
  ├── writes → workspace/relationships/current.md (creates follow-ups)
  └── reads → workspace/HEARTBEAT.md (sweep instructions)

daily-task-prep
  ├── reads → CHIEF_OF_STAFF_CONTEXT.md (timezone, calendars)
  ├── reads/writes → workspace/tasks/current.md
  └── reads → calendar (via MCP)

daily-task-manager
  └── reads/writes → workspace/tasks/current.md

relationship-manager
  ├── reads → CHIEF_OF_STAFF_CONTEXT.md (cadence, VIPs)
  ├── reads/writes → workspace/relationships/current.md
  └── reads → workspace/tasks/current.md (adds follow-ups as tasks)
```

## Data Flow

**Inbound email → Task**: The executive-assistant triages an email that requires action. It creates a task in workspace/tasks/current.md and optionally a follow-up entry in workspace/relationships/current.md.

**Follow-up due → Draft**: The relationship-manager detects an overdue follow-up. It drafts the next touch per the cadence and presents it for review (or sends it, if authorized).

**Calendar event → Task**: The daily-task-prep skill pulls tomorrow's meetings and adds them as time-blocked items in the task file.

**Task completed → Done**: The daily-task-manager moves completed items to the Done section with a timestamp. The chief-of-staff EOD review captures anything missed.

## The Authority Framework in Practice

Every incoming message goes through three questions:
1. Is this something I can handle without risk? → **Act**
2. Is this something I should prepare but not send? → **Draft for review**
3. Is this something the owner needs to see immediately? → **Escalate**

The owner's CHIEF_OF_STAFF_CONTEXT.md file defines the boundaries. Over time, as the assistant proves reliable, the Act tier expands and the Draft tier shrinks.

## HEARTBEAT_OK

The heartbeat sweep is designed to be silent by default. If a sweep finds nothing actionable — no new urgent emails, no overdue tasks, no calendar conflicts, no due follow-ups — it returns `HEARTBEAT_OK` and the owner hears nothing.

This is intentional. The absence of a message means everything is handled. A message from the assistant always means something needs attention. This prevents notification fatigue and builds trust that every ping matters.
