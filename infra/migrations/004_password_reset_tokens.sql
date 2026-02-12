-- migrate:up
-- Password reset tokens table for future password reset flow
-- Created now to avoid touching users table later in production

CREATE TABLE password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL, -- Argon2 hash of token sent to user
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ, -- NULL until used
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX prt_user_expires_idx ON password_reset_tokens(user_id, expires_at);

-- migrate:down
DROP TABLE IF EXISTS password_reset_tokens;
