# Chief of Staff OS

AI skills that run your day — inbox, tasks, follow-ups, and the operating rhythm that holds it together.

Built for [Hermes Agent](https://hermes-agent.nousresearch.com/). Inspired by [clawchief](https://github.com/snarktank/clawchief).

---

## What This Is

A set of Hermes skills that turn your AI agent into a Chief of Staff. It manages your inbox, tracks your tasks, follows up on conversations, and gives you a daily briefing — so nothing falls through the cracks.

Three pillars:
- **Tasks** — A canonical task file that stays current across sessions
- **Communications** — Inbox triage with authority-based decisions
- **Follow-ups** — Time-based follow-up cadence so no thread dies silently

## Skills

| Skill | What it does |
|-------|-------------|
| `executive-assistant` | Inbox triage, email drafting, calendar management, scheduling |
| `daily-task-manager` | Canonical task file — add, complete, prioritize, review |
| `daily-task-prep` | Nightly automation — enrich tomorrow's tasks with recurring items, due dates, calendar |
| `relationship-manager` | Follow-up tracking, outreach cadence, relationship health |
| `chief-of-staff` | Orchestrator — morning briefings, EOD reviews, ad-hoc triage |

## Quick Start

```bash
# Clone the repo
git clone https://github.com/TheCraigHewitt/hermes-chief-of-staff.git

# Copy skills to your Hermes installation
cp -r hermes-chief-of-staff/skills/* ~/.hermes/skills/

# Copy workspace files to your project
cp -r hermes-chief-of-staff/workspace/ ~/your-project/workspace/

# Copy and fill out the context file
cp hermes-chief-of-staff/templates/CHIEF_OF_STAFF_CONTEXT.example.md ~/your-project/CHIEF_OF_STAFF_CONTEXT.md

# (Optional) Set up the CoS personality
cp hermes-chief-of-staff/templates/SOUL.example.md ~/.hermes/SOUL.md
```

Then fill in `CHIEF_OF_STAFF_CONTEXT.md` with your details. See [INSTALL.md](INSTALL.md) for the full setup guide.

## How It Works

The system runs on a daily rhythm:

1. **2 AM** — `daily-task-prep` prepares tomorrow's task list
2. **8 AM** — `chief-of-staff` delivers a morning briefing
3. **All day** — `executive-assistant` sweeps inbox every 15 minutes
4. **Twice daily** — `relationship-manager` checks for due follow-ups
5. **End of day** — `chief-of-staff` reviews what got done and captures what's next

When nothing needs attention, the system stays silent (`HEARTBEAT_OK`). Every message means something needs your attention.

See [docs/operating-model.md](docs/operating-model.md) for the full picture.

## Choose Your Level

You don't have to use everything. Pick the level that fits:

| Level | Skills | What you get |
|-------|--------|-------------|
| **Personal EA** | executive-assistant, daily-task-manager | Inbox triage + task management |
| **Founder** | + relationship-manager, daily-task-prep | + follow-up tracking + daily prep |
| **Full CoS** | + chief-of-staff | + morning briefings + EOD reviews |

See [docs/maturity-levels.md](docs/maturity-levels.md) for details.

## v1 Scope

v1 focuses on operational CoS foundations: tasks, communications, and follow-ups. It is strongest as an executive assistant and founder ops system. Strategic planning, decision logs, delegation tracking, and meeting prep are future layers (see [docs/maturity-levels.md](docs/maturity-levels.md)).

## Configuration

All owner-specific settings live in one file: `CHIEF_OF_STAFF_CONTEXT.md`. Each skill is written to read this file at the start of relevant runs — it's the canonical owner config. No scattered config, no environment variables to manage.

The context file covers: your name, email accounts, calendar accounts, authority levels (what the assistant can do without asking), work hours, follow-up preferences, and available tools.

- [templates/CHIEF_OF_STAFF_CONTEXT.example.md](templates/CHIEF_OF_STAFF_CONTEXT.example.md) — Template to fill out
- [templates/CHIEF_OF_STAFF_CONTEXT.demo.md](templates/CHIEF_OF_STAFF_CONTEXT.demo.md) — Filled-out example with fake data

## Docs

- [INSTALL.md](INSTALL.md) — Step-by-step setup guide
- [docs/recommended-founder-setup.md](docs/recommended-founder-setup.md) — Fastest path to a working setup
- [PHILOSOPHY.md](PHILOSOPHY.md) — Operating principles
- [docs/operating-model.md](docs/operating-model.md) — How the system works end-to-end
- [docs/example-outputs.md](docs/example-outputs.md) — What good output looks like
- [docs/adaptation-guide.md](docs/adaptation-guide.md) — How to customize for your workflow
- [docs/maturity-levels.md](docs/maturity-levels.md) — Personal EA to Full CoS progression
- [cron/README.md](cron/README.md) — Recommended cron schedules

## About

Built by [Craig Hewitt](https://twitter.com/croighewitt). Ported from the [clawchief](https://github.com/snarktank/clawchief) operating model, rebuilt for [Hermes Agent](https://hermes-agent.nousresearch.com/).

## License

MIT
