-- migrate:up
-- Email verification tokens table + unique index on password_reset_tokens

-- Email verification tokens
CREATE TABLE email_verification_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX evt_user_expires_idx ON email_verification_tokens(user_id, expires_at);
CREATE UNIQUE INDEX evt_token_hash_uq ON email_verification_tokens(token_hash);

-- Add unique index on password_reset_tokens.token_hash (missing from 004)
CREATE UNIQUE INDEX prt_token_hash_uq ON password_reset_tokens(token_hash);

-- migrate:down
DROP INDEX IF EXISTS prt_token_hash_uq;
DROP TABLE IF EXISTS email_verification_tokens;
