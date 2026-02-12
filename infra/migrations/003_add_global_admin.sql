-- migrate:up
ALTER TABLE users ADD COLUMN is_global_admin boolean not null default false;

-- migrate:down
ALTER TABLE users DROP COLUMN is_global_admin;
