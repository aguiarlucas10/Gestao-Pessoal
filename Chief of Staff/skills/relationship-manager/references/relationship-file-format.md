# Relationship File Format Reference

The relationship tracking file (`workspace/relationships/current.md`) uses structured bullet entries grouped into three sections. Each person gets a `###` heading with fields as bullet items underneath.

## Active Follow-ups

For contacts with an open thread awaiting response.

Format:

```
### Person Name
- Context: Brief description of the relationship or thread
- Last contact: YYYY-MM-DD
- Next follow-up: YYYY-MM-DD
- Touch #: 1, 2, or 3
- Status: Awaiting reply / Meeting scheduled / Replied / Escalated to owner
- Notes: Any additional context
```

Fields:
- **Context**: What the outreach is about (e.g., "Partnership discussion," "Sales intro from Mike").
- **Last contact**: Date of most recent outreach or response.
- **Next follow-up**: When the next follow-up is due.
- **Touch #**: Which follow-up attempt this is (1, 2, or 3).
- **Status**: Current state of the thread.
- **Notes**: Optional. Any relevant detail the assistant should know.

## Nurture

For contacts that don't need active follow-up but should be checked in on periodically.

Format:

```
### Person Name
- Context: Relationship description
- Last contact: YYYY-MM-DD
- Frequency: Weekly / Monthly / Quarterly
- Next check-in: YYYY-MM-DD
- Notes: Any additional context
```

Fields:
- **Frequency**: How often to check in.
- **Next check-in**: When the next check-in is due.

## Archived

Completed or closed-out follow-ups. Keep for reference.

Format:

```
### Person Name
- Context: What the outreach was about
- Resolved: YYYY-MM-DD
- Outcome: What happened
```

## Rules

- One entry per person per active thread (a person can have multiple active follow-ups if they're about different topics).
- Dates always in YYYY-MM-DD format.
- When a follow-up resolves, move the entry to Archived with the outcome.
- When all 3 touches are exhausted with no response, move to Archived with status "No response — escalated."
