-- ============================================================
-- Usage Metering and Quota Service - database schema
-- Applied once by src/migrate.ts when the service starts.
-- ============================================================

-- An application/company that calls our service.
CREATE TABLE accounts (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  api_key_hash TEXT NOT NULL UNIQUE,          -- sha256 of the API key (we never store the raw key)
  plan_id      INT  NOT NULL,                 -- FK added below (plans references accounts too)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A plan = a named set of rules. account_id NULL means "predefined" (read-only, shared by everyone).
-- NOTE: "an account may only use predefined plans or its own plans, with the right scope"
--       is checked in the service layer (see routes), not here.
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

-- Plan names are unique per owner and scope (one index for predefined plans, one for custom plans,
-- because NULL is never equal to NULL in a normal UNIQUE constraint).
CREATE UNIQUE INDEX plans_predefined_name_unique ON plans (name, scope) WHERE account_id IS NULL;
CREATE UNIQUE INDEX plans_custom_name_unique ON plans (account_id, name, scope) WHERE account_id IS NOT NULL;

ALTER TABLE accounts
  ADD CONSTRAINT accounts_plan_fk FOREIGN KEY (plan_id) REFERENCES plans(id);

-- A user of the calling application. external_id is the id the application uses for them.
CREATE TABLE users (
  id          SERIAL PRIMARY KEY,
  account_id  INT  NOT NULL REFERENCES accounts(id),
  external_id TEXT NOT NULL,
  plan_id     INT  NOT NULL REFERENCES plans(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, external_id),           -- same external_id may exist in two different accounts
  UNIQUE (id, account_id)                     -- needed so consume_requests can reference (user_id, account_id)
);

-- Usage counters: one row per (account, month) and per (user, month).
-- month = first day of the UTC month, e.g. 2026-10-01.
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

-- Every consume request and its decision (accepted or rejected). Never updated, only inserted.
CREATE TABLE consume_requests (
  id                BIGSERIAL PRIMARY KEY,
  account_id        INT  NOT NULL REFERENCES accounts(id),
  user_id           INT  NOT NULL,
  request_id        TEXT NOT NULL,              -- supplied by the caller, used for safe retries
  units             INT  NOT NULL CHECK (units > 0),
  month             DATE NOT NULL CHECK (EXTRACT(DAY FROM month) = 1),
  accepted          BOOLEAN NOT NULL,
  rejected_level    TEXT CHECK (rejected_level IN ('account', 'user')),
  rejected_rule     TEXT CHECK (rejected_rule IN ('monthly_limit', 'max_units_per_request')),
  account_remaining INT  NOT NULL CHECK (account_remaining >= 0),  -- remaining after this decision
  user_remaining    INT  NOT NULL CHECK (user_remaining >= 0),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, request_id),              -- a retry with the same request_id is detected here
  FOREIGN KEY (user_id, account_id) REFERENCES users (id, account_id),  -- user must belong to this account
  -- accepted => no reason; rejected => exactly one reason (level + rule)
  CHECK (
    (accepted AND rejected_level IS NULL AND rejected_rule IS NULL)
    OR (NOT accepted AND rejected_level IS NOT NULL AND rejected_rule IS NOT NULL)
  )
);

CREATE INDEX consume_requests_account_history ON consume_requests (account_id, id DESC);
CREATE INDEX consume_requests_user_history    ON consume_requests (user_id, id DESC);
