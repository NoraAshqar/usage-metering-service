CREATE TABLE accounts (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  api_key_hash TEXT NOT NULL UNIQUE,
  plan_id      INT  NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- account_id NULL = predefined plan
CREATE TABLE plans (
  id                    SERIAL PRIMARY KEY,
  account_id            INT REFERENCES accounts(id),
  name                  TEXT NOT NULL,
  scope                 TEXT NOT NULL CHECK (scope IN ('account', 'user')),
  monthly_limit         INT  NOT NULL CHECK (monthly_limit >= 0),
  max_units_per_request INT  NOT NULL CHECK (max_units_per_request > 0),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX plans_predefined_name_unique ON plans (name, scope) WHERE account_id IS NULL;
CREATE UNIQUE INDEX plans_custom_name_unique ON plans (account_id, name, scope) WHERE account_id IS NOT NULL;

ALTER TABLE accounts
  ADD CONSTRAINT accounts_plan_fk FOREIGN KEY (plan_id) REFERENCES plans(id);

CREATE TABLE users (
  id          SERIAL PRIMARY KEY,
  account_id  INT  NOT NULL REFERENCES accounts(id),
  external_id TEXT NOT NULL,
  plan_id     INT  NOT NULL REFERENCES plans(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, external_id),
  UNIQUE (id, account_id)
);

CREATE TABLE account_usage (
  account_id INT  NOT NULL REFERENCES accounts(id),
  month      DATE NOT NULL CHECK (EXTRACT(DAY FROM month) = 1),
  used       INT  NOT NULL DEFAULT 0 CHECK (used >= 0),
  PRIMARY KEY (account_id, month)
);

CREATE TABLE user_usage (
  user_id INT  NOT NULL REFERENCES users(id),
  month   DATE NOT NULL CHECK (EXTRACT(DAY FROM month) = 1),
  used    INT  NOT NULL DEFAULT 0 CHECK (used >= 0),
  PRIMARY KEY (user_id, month)
);

CREATE TABLE consume_requests (
  id                BIGSERIAL PRIMARY KEY,
  account_id        INT  NOT NULL REFERENCES accounts(id),
  user_id           INT  NOT NULL,
  request_id        TEXT NOT NULL,
  units             INT  NOT NULL CHECK (units > 0),
  month             DATE NOT NULL CHECK (EXTRACT(DAY FROM month) = 1),
  accepted          BOOLEAN NOT NULL,
  rejected_level    TEXT CHECK (rejected_level IN ('account', 'user')),
  rejected_rule     TEXT CHECK (rejected_rule IN ('monthly_limit', 'max_units_per_request')),
  account_remaining INT  NOT NULL CHECK (account_remaining >= 0),
  user_remaining    INT  NOT NULL CHECK (user_remaining >= 0),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, request_id),
  FOREIGN KEY (user_id, account_id) REFERENCES users (id, account_id),
  CHECK (
    (accepted AND rejected_level IS NULL AND rejected_rule IS NULL)
    OR (NOT accepted AND rejected_level IS NOT NULL AND rejected_rule IS NOT NULL)
  )
);

CREATE INDEX consume_requests_account_history ON consume_requests (account_id, id DESC);
CREATE INDEX consume_requests_user_history    ON consume_requests (user_id, id DESC);
