# Task File Format Reference

This document defines the structure and formatting rules for the canonical task file at `workspace/tasks/current.md`.

## Required vs Optional Sections

**Required** (must always be present):
- Today
- Next up
- Rules
- Done

**Optional** (add as needed):
- Recurring (weekdays)
- Backlog (with due date)
- Recurring reminders
- Backlog

## Sections

### ## Today

Open and completed tasks for today. This is the active working set.

Syntax:

```
- [ ] Task description
- [x] Task description
```

`- [ ]` marks a pending task. `- [x]` marks a completed task (before it gets moved to Done). Items higher in the list are higher priority.

### ## Next up

Work queued for after today's tasks are done. These are ready to go but not time-bound to today. When today's list clears out, pull from here.

### ## Rules

Standing instructions for task management. These are not tasks — they're policies that govern how the task file is maintained. Examples: "Always check calendar before planning the day," "Ping Craig if a task is blocked for more than 24 hours."

### ## Recurring (weekdays)

Baseline items that repeat every Monday through Friday. The daily-task-prep skill copies these into the Today section each weekday morning. Entries here are templates — they stay in this section permanently.

### ## Backlog (with due date)

Future tasks with specific deadlines. Each entry includes a due date.

Syntax:

```
- [ ] Task description — due YYYY-MM-DD
```

The daily-task-prep skill promotes items to Today on their due date (see Promotion Rules).

### ## Recurring reminders

Parked reminders with recurrence metadata. Unlike recurring weekday tasks, these fire on specific intervals — weekly, monthly, quarterly, etc. The source entry stays in this section even after firing. Only a copy moves to Today when the reminder triggers.

Syntax:

```
- [ ] Task description — every [interval], next YYYY-MM-DD
```

### ## Backlog

Undated someday items. No urgency, no deadline. Review periodically to decide if items should be promoted, given a due date, or removed.

### ## Done

Completed items with timestamps. This is the audit trail.

Syntax:

```
- [x] Task description — completed YYYY-MM-DD HH:MM TZ
```

Never delete items from Done. Never move items out of Done.

## Formatting Rules

### Dates

- All-day dates: `YYYY-MM-DD`
- Specific times: `YYYY-MM-DD HH:MM TZ` (e.g., `2026-04-02 09:00 CT`)

### Ownership

Delegated tasks use an assistant name prefix followed by a colon.

Syntax:

```
- [ ] AssistantName: Task description — due YYYY-MM-DD
```

Example: `- [ ] Hermes: Draft the quarterly report — due 2026-04-15`

### Priority

Within any section, items higher in the list are higher priority. Reorder items to change priority.

### Deduplication

Before adding a task, check for duplicates using normalized text comparison (case-insensitive, ignore leading/trailing whitespace). If a substantially similar task already exists, update it rather than creating a duplicate.

## Promotion Rules

**Backlog (with due date) to Today**: On the due date, the daily-task-prep skill moves the item from Backlog (with due date) to Today. The item is removed from Backlog.

**Recurring (weekdays) to Today**: Each weekday morning, the daily-task-prep skill copies items from Recurring (weekdays) to Today. The source entry stays in Recurring permanently — it is never removed.

**Recurring reminders to Today**: When a recurring reminder triggers, the daily-task-prep skill copies it to Today. The source entry stays in Recurring reminders, and its "next" date is advanced to the next occurrence.
