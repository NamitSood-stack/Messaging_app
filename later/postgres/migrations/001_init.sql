CREATE TABLE users (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9_]{3,20}$'),
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Prefix search (username LIKE 'ab%') needs a pattern-ops index
CREATE INDEX users_username_prefix_idx ON users (username text_pattern_ops);

CREATE TABLE sessions (
  token_hash  TEXT PRIMARY KEY,          -- sha256 of the cookie token; raw token is never stored
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX sessions_user_id_idx ON sessions (user_id);

CREATE TABLE conversations (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_a          BIGINT NOT NULL REFERENCES users(id),
  user_b          BIGINT NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ,
  CHECK (user_a < user_b),               -- one row per pair, order fixed
  UNIQUE (user_a, user_b)
);
CREATE INDEX conversations_user_b_idx ON conversations (user_b);

CREATE TABLE messages (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       BIGINT NOT NULL REFERENCES users(id),
  client_msg_id   UUID NOT NULL,
  body            TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sender_id, client_msg_id)      -- a retried send never creates a duplicate
);
CREATE INDEX messages_conversation_id_idx ON messages (conversation_id, id DESC);
