-- migrate:up
ALTER TABLE workflow_steps
  ADD COLUMN hidden BOOLEAN NOT NULL DEFAULT false;

-- migrate:down
ALTER TABLE workflow_steps
  DROP COLUMN hidden;
