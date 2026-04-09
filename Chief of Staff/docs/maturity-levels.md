# Maturity Levels

The Chief of Staff OS supports three levels of adoption. Start where you are and add layers as you need them.

> **v1** delivers Levels 1-3 below, covering operational CoS foundations. Future phases add strategic layers (weekly digests, meeting prep, business development, decision logs).

---

## Level 1 — Personal EA

**Who it's for**: Anyone who wants inbox triage and task management without the overhead of a full operating rhythm.

**Skills to install**:
- `executive-assistant` — inbox triage, email drafting, calendar management
- `daily-task-manager` — canonical task file management

**Workspace files**:
- `workspace/tasks/current.md`
- `CHIEF_OF_STAFF_CONTEXT.md` (fill out: name, email, calendar, authority levels)

**Cron jobs** (optional):
- EA inbox sweep every 15 minutes during work hours

**What you get**:
- Automated inbox triage with authority-based decisions
- A single, persistent task list that survives across sessions
- Calendar conflict detection and scheduling assistance
- Email drafting that matches your tone

**Time to set up**: 15-20 minutes

---

## Level 2 — Founder + Relationships

**Who it's for**: Founders, operators, or anyone managing ongoing relationships and outreach who needs follow-up tracking and a daily rhythm.

**Skills to install** (everything from Level 1, plus):
- `relationship-manager` — follow-up tracking and outreach cadence
- `daily-task-prep` — nightly enrichment of the task list

**Additional workspace files**:
- `workspace/relationships/current.md`
- `workspace/HEARTBEAT.md`

**Cron jobs**:
- EA inbox sweep (every 15 min, business hours)
- Daily task prep (2 AM nightly)
- Follow-up check (twice daily)

**What you get** (on top of Level 1):
- Automated follow-up cadence (2 → 5 → 7 days)
- No conversation falls through the cracks
- Task list automatically enriched each morning with recurring items and calendar events
- VIP contact prioritization

**Time to set up**: 30-45 minutes (including relationship file population)

---

## Level 3 — Full Chief of Staff

**Who it's for**: People who want a complete daily operating rhythm — morning briefings, end-of-day reviews, and a single point of coordination across all work.

**Skills to install** (everything from Level 2, plus):
- `chief-of-staff` — orchestrator for briefings, reviews, and ad-hoc triage

**Additional workspace files**:
- `workspace/TOOLS.md` (optional, for tool environment notes)

**Cron jobs** (everything from Level 2, plus):
- Morning briefing (once daily, weekdays)

**What you get** (on top of Level 2):
- Morning briefing: tasks, calendar, inbox, follow-ups, and heads-up items in one view
- End-of-day review: capture what got done, carry forward what didn't
- Ad-hoc triage: "what should I focus on right now?"
- Unified coordination across all skills

**Time to set up**: 45-60 minutes (including cron configuration)

---

## Future Levels

**Phase 2** (planned):
- Weekly digest skill — weekly summary of activity and trends
- Meeting prep skill — generate briefing docs before important meetings
- Business development pipeline — prospect tracking and outreach automation

**Phase 3** (planned):
- Decision log — track key decisions and their context
- Delegation tracking — monitor work assigned to others
- Content calendar — publishing schedule management

---

## Choosing Your Level

| Question | Level 1 | Level 2 | Level 3 |
|----------|---------|---------|---------|
| Do you need inbox triage? | Yes | Yes | Yes |
| Do you track follow-ups with people? | No | Yes | Yes |
| Do you want automated daily task prep? | No | Yes | Yes |
| Do you want morning briefings? | No | No | Yes |
| Do you want end-of-day reviews? | No | No | Yes |

You can always upgrade later. Each level builds on the previous one — nothing needs to be reconfigured.
