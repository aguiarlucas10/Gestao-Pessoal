-- Migration v5: Add recurrence to tasks
ALTER TABLE cmd_tasks ADD COLUMN IF NOT EXISTS recurrence TEXT DEFAULT NULL;
-- Values: NULL (no recurrence), 'daily', 'weekly', 'monthly'
