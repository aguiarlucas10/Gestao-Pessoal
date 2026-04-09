# Installation Guide

Step-by-step setup for the Chief of Staff OS on Hermes Agent.

---

## Prerequisites

- [Hermes Agent](https://hermes-agent.nousresearch.com/) installed and configured
- At least one email account accessible via MCP (Gmail recommended)
- Calendar access via MCP (Google Calendar recommended)

## Step 1: Clone the Repo

```bash
git clone https://github.com/TheCraigHewitt/hermes-chief-of-staff.git
cd hermes-chief-of-staff
```

## Step 2: Install Skills

Copy the skills to your Hermes skills directory:

```bash
cp -r skills/* ~/.hermes/skills/
```

Verify they're detected by starting a Hermes session and checking the skill list. The exact command may vary by version — try listing your available skills to confirm the five CoS skills appear.

## Step 3: Set Up the Context File

Copy the template to your project root:

```bash
cp templates/CHIEF_OF_STAFF_CONTEXT.example.md ~/your-project/CHIEF_OF_STAFF_CONTEXT.md
```

Open it and fill in every section:

- **About You**: Name, timezone, role
- **Communication**: Email accounts, calendar accounts, tone preference
- **Authority**: What the assistant can handle vs. what needs your approval
- **Work Hours**: When sweeps should run, quiet hours
- **Tools Available**: Which MCP integrations are connected
- **Follow-up Preferences**: Default cadence, VIP contacts
- **Business Context**: Brief notes to help the assistant make better decisions

## Step 4: Set Up Workspace Files

Copy the workspace directory to your project:

```bash
cp -r workspace/ ~/your-project/workspace/
```

This creates:
- `workspace/tasks/current.md` — Your canonical task file (edit the example entries)
- `workspace/relationships/current.md` — Your follow-up tracking file (edit the examples)
- `workspace/HEARTBEAT.md` — Instructions for automated sweeps
- `workspace/TOOLS.md` — Local tool environment notes (fill in as needed)

## Step 5: Set Up Personality (Optional)

Copy the SOUL template for the CoS personality:

```bash
cp templates/SOUL.example.md ~/.hermes/SOUL.md
```

Copy the USER template for your profile:

```bash
cp templates/USER.example.md ~/.hermes/memories/USER.md
```

Edit both to match your preferences.

## Step 6: Configure MCP Integrations

In `~/.hermes/config.yaml`, set up MCP servers for your email and calendar. Example for Gmail:

```yaml
mcp_servers:
  gmail:
    command: "npx"
    args: ["-y", "@anthropic/mcp-server-gmail"]
  google_calendar:
    command: "npx"
    args: ["-y", "@anthropic/mcp-server-google-calendar"]
```

Reload MCP servers after changes. In a Hermes chat session, use the reload command (e.g., `/reload-mcp`) to pick up the new configuration.

## Step 7: Set Up Cron Schedules

Start the Hermes cron scheduler (exact command may vary — consult Hermes docs for your version):

```bash
hermes cron start
```

Add the recommended schedules (adjust times to your timezone). Example workflow:

```bash
# EA inbox sweep — every 15 min, business hours, weekdays
hermes cron add "*/15 8-21 * * 1-5" "Run the executive-assistant skill in heartbeat mode. Follow workspace/HEARTBEAT.md. Return HEARTBEAT_OK if nothing actionable."

# Daily task prep — 2 AM nightly
hermes cron add "3 2 * * *" "Run the daily-task-prep skill. Enrich tomorrow's task list with recurring items, due dates, and calendar events."

# Follow-up check — twice daily, weekdays
hermes cron add "47 9,14 * * 1-5" "Run the relationship-manager skill. Check for follow-ups due today. Draft messages for any that are overdue."

# Morning briefing — once daily, weekdays
hermes cron add "57 7 * * 1-5" "Run the chief-of-staff skill in morning briefing mode. Summarize today's tasks, inbox highlights, calendar, and due follow-ups."
```

> **Note**: The cron command syntax above follows the Hermes CLI pattern at time of writing. If the exact syntax has changed, consult `hermes cron --help` or the [Hermes cron docs](https://hermes-agent.nousresearch.com/docs/user-guide/features/cron/).

See [cron/README.md](cron/README.md) for details and customization options.

## Validation Checklist

Run through this after setup to confirm everything works:

**Installation**:
- [ ] Skills are installed in `~/.hermes/skills/` (one directory per skill, each containing SKILL.md)
- [ ] `CHIEF_OF_STAFF_CONTEXT.md` is filled out and present in your project root
- [ ] `workspace/tasks/current.md` exists with required sections (Today, Next up, Rules, Done)
- [ ] `workspace/relationships/current.md` exists with sections (Active Follow-ups, Nurture, Archived)
- [ ] `workspace/HEARTBEAT.md` is present

**Integrations**:
- [ ] MCP servers are configured in `~/.hermes/config.yaml`
- [ ] Test email access: ask "check my inbox" — should list recent messages or confirm access
- [ ] Test calendar access: ask "what's on my calendar today" — should list events or confirm access
- [ ] Cron jobs are set up (check with `hermes cron list` or equivalent)

**Functional tests** (run these in a Hermes chat session):
- [ ] "Add a task: test the CoS setup" — should update workspace/tasks/current.md
- [ ] "Run executive-assistant in heartbeat mode" — should return HEARTBEAT_OK or a triage summary
- [ ] "Morning briefing" — should return a structured daily overview
- [ ] "Who do I need to follow up with?" — should check workspace/relationships/current.md
- [ ] "Mark done: test the CoS setup" — should move the task to Done with a timestamp

## Choosing What to Install

You don't need everything. For the fastest high-value setup, see [docs/recommended-founder-setup.md](docs/recommended-founder-setup.md).

For all options, see [docs/maturity-levels.md](docs/maturity-levels.md):

- **Level 1 (Personal EA)**: Steps 2-4 with just `executive-assistant` and `daily-task-manager`
- **Level 2 (Founder)**: Full Steps 2-6, all cron jobs except morning briefing
- **Level 3 (Full CoS)**: Everything above

A filled-out demo context file is available at [templates/CHIEF_OF_STAFF_CONTEXT.demo.md](templates/CHIEF_OF_STAFF_CONTEXT.demo.md) to see what a completed setup looks like.

## Troubleshooting

**Skills not showing up**: Make sure the SKILL.md files are in `~/.hermes/skills/<skill-name>/SKILL.md`. Each skill needs its own directory.

**MCP not connecting**: Reload MCP servers in a Hermes chat session (e.g., `/reload-mcp`). Check `~/.hermes/logs/` for errors.

**Cron not running**: Make sure the cron scheduler is started (e.g., `hermes cron start`). Check status with your cron list command.

**Context file not found**: Skills look for `CHIEF_OF_STAFF_CONTEXT.md` in your project root (the directory where you start Hermes). Make sure it's there.
