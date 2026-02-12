-- migrate:up
ALTER TABLE events ADD COLUMN is_system_site BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX events_is_system_site_idx ON events (is_system_site);

-- migrate:down
DROP INDEX events_is_system_site_idx;
ALTER TABLE events DROP COLUMN is_system_site;
