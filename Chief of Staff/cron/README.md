# Cron Schedules

Automated jobs that keep the Chief of Staff OS running in the background.

## How to Set Up

Use Hermes's built-in cron scheduler. The example commands below follow the Hermes CLI pattern at time of writing — consult `hermes cron --help` or the [Hermes cron docs](https://hermes-agent.nousresearch.com/docs/user-guide/features/cron/) if the exact syntax has changed.

Start the scheduler (e.g., `hermes cron start`), then add jobs.

## Recommended Schedules

### 1. EA Inbox Sweep

Every 15 minutes, business hours, weekdays.

- **Cron**: `*/15 8-21 * * 1-5`
- **Command**:
  ```
  hermes cron add "*/15 8-21 * * 1-5" "Run the executive-assistant skill in heartbeat mode. Follow the instructions in workspace/HEARTBEAT.md. Return HEARTBEAT_OK if nothing actionable."
  ```
- **Purpose**: Continuous inbox and calendar monitoring during work hours.

### 2. Daily Task Prep

Nightly.

- **Cron**: `3 2 * * *`
- **Command**:
  ```
  hermes cron add "3 2 * * *" "Run the daily-task-prep skill. Enrich tomorrow's task list with recurring items, due dates, and calendar events."
  ```
- **Purpose**: Prepare clean task list before morning.

### 3. Follow-up Check

Twice daily, weekdays.

- **Cron**: `47 9,14 * * 1-5`
- **Command**:
  ```
  hermes cron add "47 9,14 * * 1-5" "Run the relationship-manager skill. Check for follow-ups due today. Draft messages for any that are overdue."
  ```
- **Purpose**: Ensure no follow-ups slip through.

### 4. Morning Briefing

Once daily, weekdays.

- **Cron**: `57 7 * * 1-5`
- **Command**:
  ```
  hermes cron add "57 7 * * 1-5" "Run the chief-of-staff skill in morning briefing mode. Summarize today's tasks, inbox highlights, calendar, and due follow-ups."
  ```
- **Purpose**: Start the day with a clear picture.

> **Note**: Minutes are intentionally offset from :00 and :30 to avoid clustering multiple jobs at the same time.

## Managing Jobs

Common cron management commands (exact syntax may vary by version):

- **List all jobs**: `hermes cron list`
- **Pause a job**: `hermes cron pause <id>`
- **Resume a job**: `hermes cron resume <id>`
- **Delete a job**: `hermes cron delete <id>`
- **Manual trigger**: `hermes cron trigger <id>`

## Customization

Adjust schedules to match your timezone and work hours. The cron expressions above assume the system clock matches your timezone.
