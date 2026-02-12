-- migrate:up
ALTER TABLE workflow_steps
  ADD COLUMN sensitivity_level TEXT NOT NULL DEFAULT 'NORMAL';

-- migrate:down
ALTER TABLE workflow_steps
  DROP COLUMN sensitivity_level;
