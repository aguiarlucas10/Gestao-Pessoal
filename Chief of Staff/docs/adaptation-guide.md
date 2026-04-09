# Adaptation Guide

How to customize the Chief of Staff OS for your workflow.

---

## Start with the Context File

Everything flows from `CHIEF_OF_STAFF_CONTEXT.md`. Before tweaking skills, make sure your context file accurately reflects:
- Your email accounts and calendar setup
- Your authority preferences (what the assistant can do without asking)
- Your work hours and quiet hours
- Your follow-up style and VIP contacts

Most customization happens here, not in the skill files.

## Adjusting Authority Levels

The default authority framework is conservative — the assistant drafts most replies for your review. To expand what it handles autonomously:

1. Open your `CHIEF_OF_STAFF_CONTEXT.md`
2. Move items from "Draft for review" to "Act autonomously"
3. Be specific: "Reply to scheduling confirmations" is better than "handle routine emails"

Start conservative. Expand as you build trust.

## Changing the Follow-up Cadence

The default cadence is 2 → 5 → 7 days. To change it:

1. Update the "Follow-up Preferences" section in `CHIEF_OF_STAFF_CONTEXT.md`
2. The relationship-manager skill reads this on every run

For different cadences per contact type, add notes in the Business Context section.

## Modifying the Daily Rhythm

### Change sweep frequency
Edit the cron schedule. For less frequent sweeps:
```bash
hermes cron add "0 9,12,15,18 * * 1-5" "Run executive-assistant in heartbeat mode..."
```

### Change task prep time
If you're a night owl and 2 AM prep is too early:
```bash
hermes cron add "0 5 * * *" "Run daily-task-prep..."
```

### Skip the morning briefing
Simply don't set up the morning briefing cron job. The other skills work independently.

## Adding Task Sections

The task file format is flexible. To add custom sections:

1. Open `workspace/tasks/current.md`
2. Add a new `##` section wherever it makes sense
3. Update the "Rules" section to explain the new section
4. If the section should be checked by daily-task-prep, note that in the skill's procedure

## Adding New Email Accounts

1. Add the account to CHIEF_OF_STAFF_CONTEXT.md under "Additional email accounts"
2. Add the corresponding calendar under "Calendar accounts"
3. Configure the MCP server for the new account in `~/.hermes/config.yaml`

## Integrating External Tools

The CoS skills are tool-agnostic — they describe what to do, not which specific tool to use. To add integrations:

1. Set up the MCP server in `~/.hermes/config.yaml`
2. Check the box in CHIEF_OF_STAFF_CONTEXT.md under "Tools Available"
3. Add notes in `workspace/TOOLS.md` about any quirks

## Building Custom Skills

The five included skills cover the core operating model. To add your own:

1. Create a new directory under `skills/` with a `SKILL.md`
2. Use the same YAML frontmatter pattern (name, description, version, author, license)
3. Reference `CHIEF_OF_STAFF_CONTEXT.md` if it needs owner configuration
4. Add a cron schedule if it should run automatically

Examples of skills you might add:
- **meeting-prep**: Generate briefing docs before important meetings
- **weekly-digest**: Produce a weekly summary of activity
- **content-calendar**: Track publishing schedules
- **business-development**: Pipeline tracking with Google Sheets

## Removing Skills You Don't Need

Each skill is independent. To run a lighter setup:

- **Minimal (EA only)**: Keep just `executive-assistant` and `daily-task-manager`
- **Standard (3 pillars)**: Add `relationship-manager` and `daily-task-prep`
- **Full CoS**: Add `chief-of-staff` orchestrator

Remove the cron jobs for skills you're not using.
