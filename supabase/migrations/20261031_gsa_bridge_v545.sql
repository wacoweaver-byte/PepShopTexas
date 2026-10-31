-- v545/v546: Gold Standard Analytics bridge. Three private tables, read and written only by the
-- pst-gsa server function (service role). Row level security is on with no policies, so the
-- site and the apps can't read or change them directly; the owner app goes through pst-gsa,
-- which checks admin_users first. The webhook signing secret goes in the existing pst_app_secrets.

-- Every certificate Gold Standard tells us about, and what happened to it.
create table if not exists public.pst_gsa_coas (
  accession     text primary key,                 -- GSA-2026-018432
  coa_id        text,
  submission_id text,
  compound      text,
  lot           text,                             -- as written on the sample: "PSTP100063 · vendor lot"
  verdict       text,                             -- pass / fail / unknown / retracted
  product_key   text,                             -- the product it's attached to
  status        text not null default 'unmatched' check (status in ('attached','suggested','unmatched','failed','retracted','dismissed')),
  candidates    text[] not null default '{}',     -- products it could belong to (when it needs Jimmie's OK)
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.pst_gsa_coas enable row level security;

-- Webhook deliveries already handled (Gold Standard delivers at least once).
create table if not exists public.pst_gsa_events (
  event_id    text primary key,
  type        text,
  received_at timestamptz not null default now()
);
alter table public.pst_gsa_events enable row level security;

-- Test orders placed from the owner app.
create table if not exists public.pst_gsa_orders (
  reference    text primary key,                  -- Gold Standard's order reference
  quote_id     text,
  items        jsonb not null default '[]',       -- [{ product_key, compound, lot }]
  tests        jsonb not null default '[]',
  total_cents  integer,
  payment_url  text,
  status       text,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.pst_gsa_orders enable row level security;

revoke all on public.pst_gsa_coas, public.pst_gsa_events, public.pst_gsa_orders from anon, authenticated;
