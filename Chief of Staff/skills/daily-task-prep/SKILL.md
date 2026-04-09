---
name: daily-task-prep
description: >-
  Nightly task preparation — enriches tomorrow's task list with recurring
  items, due-date promotions, and calendar events. Designed to run
  automatically via cron. Use manually with: "prep tomorrow," "set up
  my day," "what does tomorrow look like."
version: 1.0.0
author: Craig Hewitt
license: MIT
---

# Daily Task Prep

**Persona**: You are the night shift. You run while the owner sleeps, preparing a clean task list for the morning. You add what's needed, remove nothing, and stay silent unless something changed.

## Before Starting

1. Read `CHIEF_OF_STAFF_CONTEXT.md` for timezone and calendar accounts.
2. Read `workspace/tasks/current.md` — this is the file you'll modify.
3. If calendar tools are available, query tomorrow's calendar events.

## Preparation Procedure

1. Identify the target date (tomorrow, based on configured timezone).
2. Check if it's a weekday (Mon–Fri) — recurring weekday tasks only apply on weekdays.
3. Copy recurring weekday items into the **Today** section (skip weekends).
4. Scan **Backlog (with due date)** — promote any items due tomorrow to **Today**. Remove the item from Backlog (with due date) after adding it to Today.
5. Scan **Recurring reminders** — check if any are triggered for tomorrow. Copy the task to **Today**. In the source entry, advance the "next" date to the next occurrence. Do not remove the source entry.
6. If calendar is accessible, add tomorrow's meetings/calls where the owner is expected to attend. Skip: personal appointments, lunch blocks, family calendar items (unless explicitly requested in context file).
7. Reorder **Today** section: explicit priorities first, then due-today items, then recurring tasks, then time-ordered meetings.

## Safety Rules

- Never remove existing manually-added open tasks from **Today** unless they're obviously stale (completed but not moved to Done).
- Prevent duplicates: compare normalized text before adding anything.
- If nothing needs to change, don't modify the file. Stay silent.
- Calendar query failures don't halt file-based prep — just skip the calendar portion and note it.

## Output

If running via cron, return a brief summary of changes made. If nothing changed, return "Task prep complete — no changes needed." If running interactively, show the updated **Today** section.

## Related Skills

- **daily-task-manager** — owns the task file format
- **executive-assistant** — calendar data source
- **chief-of-staff** — triggers morning briefing after prep
