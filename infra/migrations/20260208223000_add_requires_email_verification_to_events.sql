-- migrate:up
ALTER TABLE events
  ADD COLUMN description TEXT,
  ADD COLUMN capacity INT,
  ADD COLUMN requires_email_verification BOOLEAN NOT NULL DEFAULT false;

-- migrate:down
ALTER TABLE events
  DROP COLUMN requires_email_verification,
  DROP COLUMN capacity,
  DROP COLUMN description;
