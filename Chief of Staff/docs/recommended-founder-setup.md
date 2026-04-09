# Recommended Founder Setup

The fastest path to a working Chief of Staff. This gets you inbox triage, task management, follow-up tracking, and daily task prep — without the full orchestrator layer.

---

## Install These 4 Skills

```bash
cp -r skills/executive-assistant ~/.hermes/skills/
cp -r skills/daily-task-manager ~/.hermes/skills/
cp -r skills/daily-task-prep ~/.hermes/skills/
cp -r skills/relationship-manager ~/.hermes/skills/
```

Skip `chief-of-staff` for now — it adds morning briefings and EOD reviews, which you can add later if you want them.

## Fill Out These Context Fields First

Copy the template:

```bash
cp templates/CHIEF_OF_STAFF_CONTEXT.example.md ~/your-project/CHIEF_OF_STAFF_CONTEXT.md
```

The fields that matter most for getting started:

- **Name** and **timezone**
- **Primary email** (the inbox the assistant will triage)
- **Calendar accounts** (all calendars to check before booking)
- **Authority rules** (what the assistant can handle vs. what needs your approval)
- **Escalation channel** (where urgent items go — Telegram DM, Slack, etc.)

Everything else can be filled in later. See [templates/CHIEF_OF_STAFF_CONTEXT.demo.md](../templates/CHIEF_OF_STAFF_CONTEXT.demo.md) for a filled-out example.

## Copy Workspace Files

```bash
cp -r workspace/ ~/your-project/workspace/
```

Edit the example entries in:
- `workspace/tasks/current.md` — replace with your real tasks
- `workspace/relationships/current.md` — replace with your real follow-ups

## Create These 3 Cron Jobs

```bash
# EA inbox sweep — every 15 min, business hours, weekdays
hermes cron add "*/15 8-21 * * 1-5" "Run the executive-assistant skill in heartbeat mode. Follow workspace/HEARTBEAT.md. Return HEARTBEAT_OK if nothing actionable."

# Daily task prep — 2 AM nightly
hermes cron add "3 2 * * *" "Run the daily-task-prep skill. Enrich tomorrow's task list with recurring items, due dates, and calendar events."

# Follow-up check — twice daily, weekdays
hermes cron add "47 9,14 * * 1-5" "Run the relationship-manager skill. Check for follow-ups due today. Draft messages for any that are overdue."
```

## What You Get

- Inbox triaged every 15 minutes with authority-based decisions
- Task list automatically prepped each morning
- Follow-ups tracked with a 2/5/7-day cadence
- No conversation falls through the cracks
- `HEARTBEAT_OK` silence when nothing needs attention

## When to Add the Orchestrator

Add the `chief-of-staff` skill when you want:
- A morning briefing that summarizes tasks, calendar, inbox, and follow-ups in one view
- An end-of-day review that captures what got done and what carries forward
- Ad-hoc "what should I focus on right now?" triage

```bash
cp -r skills/chief-of-staff ~/.hermes/skills/

# Morning briefing cron — once daily, weekdays
hermes cron add "57 7 * * 1-5" "Run the chief-of-staff skill in morning briefing mode."
```
