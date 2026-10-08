-- Orbis in the cloud (ADR 0020, change 0063-cloud-database): each account's data in Supabase Postgres,
-- every row owned by one user and readable only by them (row level security). The phone runner keeps its
-- own SQLite and syncs here; secrets never come here: no `secrets` table, no `secret:` setting, no routine
-- webhook secret.

-- --- accounts -------------------------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

-- A runner (the hub on a phone) linked to an account: only the SHA-256 of its token is kept.
create table public.devices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  token_hash text not null unique check (length(token_hash) = 64),
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index devices_owner on public.devices (owner_id);

-- --- the hub's data, one copy per account ---------------------------------------------------------------

create table public.bots (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  handle text not null,
  name text not null,
  role text not null default '',
  description text not null default '',
  avatar_color text not null,
  avatar_shape text not null default 'orb',
  brain jsonb not null,
  policy jsonb not null,
  computer jsonb not null,
  tools jsonb not null default '["*"]',
  skills jsonb not null,
  reports_to text,
  squad_id text,
  spend_cap_usd double precision,
  cap_includes_subscription boolean not null default false,
  pinned boolean not null default false,
  hidden boolean not null default false,
  initiative jsonb,
  state text not null default 'idle',
  last_message_text text,
  last_message_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (owner_id, id),
  unique (owner_id, handle)
);

create table public.conversations (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  kind text not null check (kind in ('direct', 'group')),
  title text not null,
  lead_bot_id text,
  direct_bot_id text,
  description text not null default '',
  photo text,
  muted boolean not null default false,
  created_at timestamptz not null,
  last_item_at timestamptz,
  primary key (owner_id, id),
  unique (owner_id, direct_bot_id),
  foreign key (owner_id, direct_bot_id) references public.bots (owner_id, id) on delete cascade
);

create table public.conversation_members (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  conversation_id text not null,
  bot_id text not null,
  position integer not null,
  primary key (owner_id, conversation_id, bot_id),
  foreign key (owner_id, conversation_id) references public.conversations (owner_id, id) on delete cascade,
  foreign key (owner_id, bot_id) references public.bots (owner_id, id) on delete cascade
);

create table public.items (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  seq bigint generated always as identity,
  conversation_id text not null,
  kind text not null check (kind in ('message', 'event', 'card')),
  author_type text not null check (author_type in ('user', 'bot', 'system')),
  author_id text,
  text text not null default '',
  parent_id text,
  mentions jsonb not null default '[]',
  attachments jsonb not null default '[]',
  reactions jsonb not null default '{}',
  run_id text,
  card jsonb,
  event jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (owner_id, id),
  foreign key (owner_id, conversation_id) references public.conversations (owner_id, id) on delete cascade
);
create index items_by_conversation on public.items (owner_id, conversation_id, seq);

create table public.runs (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  bot_id text not null,
  conversation_id text,
  trigger_type text not null,
  trigger_ref text,
  depth integer not null default 0,
  chain_id text,
  retry_of text,
  input text not null,
  skill text,
  status text not null,
  steps jsonb not null default '[]',
  reply text,
  error text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cached_tokens integer not null default 0,
  cost_usd double precision not null default 0,
  subscription boolean not null default false,
  created_at timestamptz not null,
  started_at timestamptz,
  finished_at timestamptz,
  primary key (owner_id, id),
  foreign key (owner_id, bot_id) references public.bots (owner_id, id) on delete cascade
);
create index runs_by_bot on public.runs (owner_id, bot_id, created_at);

create table public.brain_sessions (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  bot_id text not null,
  conversation_id text not null,
  kind text not null,
  session_id text not null,
  updated_at timestamptz not null,
  primary key (owner_id, bot_id, conversation_id, kind),
  foreign key (owner_id, bot_id) references public.bots (owner_id, id) on delete cascade
);

create table public.memory (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  bot_id text,
  kind text not null check (kind in ('preference', 'role', 'fact', 'summary')),
  text text not null,
  source text not null default '',
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (owner_id, id),
  foreign key (owner_id, bot_id) references public.bots (owner_id, id) on delete cascade
);

-- A routine's webhook secret stays on the runner: it signs the calls a routine receives.
create table public.routines (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  bot_id text not null,
  name text not null,
  trigger jsonb not null,
  instruction text not null,
  approval text not null default 'normal',
  enabled boolean not null default false,
  paused boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (owner_id, id),
  foreign key (owner_id, bot_id) references public.bots (owner_id, id) on delete cascade
);

create table public.routine_runs (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  routine_id text not null,
  run_id text,
  test boolean not null default false,
  status text not null,
  summary text,
  called_by text,
  started_at timestamptz not null,
  primary key (owner_id, id),
  foreign key (owner_id, routine_id) references public.routines (owner_id, id) on delete cascade
);

create table public.approvals (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  run_id text not null,
  bot_id text not null,
  conversation_id text,
  item_id text,
  tool text not null,
  input jsonb not null,
  reason text,
  status text not null,
  decision text,
  note text,
  created_at timestamptz not null,
  decided_at timestamptz,
  primary key (owner_id, id),
  foreign key (owner_id, run_id) references public.runs (owner_id, id) on delete cascade
);

-- Hub settings; the hub keeps its encrypted secrets under `secret:` keys, which never come here.
create table public.settings (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null check (key not like 'secret:%'),
  value text not null,
  primary key (owner_id, key)
);

-- Connected MCP servers, without their keys, tokens or sign-ins (those stay in the runner's vault).
create table public.mcp_servers (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  name text not null,
  icon text not null,
  catalog_id text,
  transport text not null,
  url text,
  command text,
  args jsonb not null default '[]',
  env_keys jsonb not null default '[]',
  auth text not null,
  read_only boolean not null default false,
  status text not null,
  error text,
  tools jsonb not null default '[]',
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (owner_id, id)
);

create table public.hiring_rounds (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  basis text not null,
  brief text not null default '',
  group_id text,
  recruiter_id text,
  requested integer not null,
  status text not null,
  error text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd double precision not null default 0,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (owner_id, id)
);

create table public.hiring_candidates (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  round_id text not null,
  position integer not null,
  name text not null,
  role text not null,
  headline text not null,
  strengths jsonb not null,
  tools jsonb not null,
  status text not null default 'open',
  error text,
  bot_id text,
  created_at timestamptz not null,
  primary key (owner_id, id),
  foreign key (owner_id, round_id) references public.hiring_rounds (owner_id, id) on delete cascade
);

create table public.squads (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  name text not null,
  handle text not null,
  description text not null default '',
  color text not null,
  representative_id text,
  manager_id text,
  conversation_id text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (owner_id, id),
  unique (owner_id, handle)
);

-- A conversation's files: their bytes go to the account's private object storage (R2), under `object_key`.
create table public.files (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  conversation_id text not null,
  item_id text,
  name text not null,
  mime text not null,
  size bigint not null check (size >= 0 and size <= 26214400),
  author_type text not null,
  author_id text,
  object_key text,
  created_at timestamptz not null,
  primary key (owner_id, id),
  foreign key (owner_id, conversation_id) references public.conversations (owner_id, id) on delete cascade
);

create table public.initiatives (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  bot_id text not null,
  kind text not null,
  run_id text,
  posted boolean not null default false,
  posted_at timestamptz,
  created_at timestamptz not null,
  primary key (owner_id, id),
  foreign key (owner_id, bot_id) references public.bots (owner_id, id) on delete cascade
);

create table public.health_metrics (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  metric text not null,
  value double precision not null check (value >= 0),
  unit text not null,
  updated_at timestamptz not null,
  primary key (owner_id, date, metric)
);

create table public.health_sessions (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  type text not null,
  title text,
  source text,
  updated_at timestamptz not null,
  primary key (owner_id, id)
);

-- --- row level security: every table, only the owner --------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'devices', 'bots', 'conversations', 'conversation_members', 'items', 'runs', 'brain_sessions', 'memory',
    'routines', 'routine_runs', 'approvals', 'settings', 'mcp_servers', 'hiring_rounds', 'hiring_candidates',
    'squads', 'files', 'initiatives', 'health_metrics', 'health_sessions'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('create policy "%1$s: owner reads" on public.%1$I for select to authenticated using (owner_id = (select auth.uid()))', t);
    execute format('create policy "%1$s: owner inserts" on public.%1$I for insert to authenticated with check (owner_id = (select auth.uid()))', t);
    execute format('create policy "%1$s: owner updates" on public.%1$I for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))', t);
    execute format('create policy "%1$s: owner deletes" on public.%1$I for delete to authenticated using (owner_id = (select auth.uid()))', t);
  end loop;
end
$$;

-- A device's token hash is never read nor written by the web app: the edge Worker (service role) links a
-- device; the user sees its name and dates, renames it or revokes it.
revoke all on public.devices from authenticated;
grant select (id, owner_id, name, last_seen_at, revoked_at, created_at) on public.devices to authenticated;
grant update (name, revoked_at) on public.devices to authenticated;
grant delete on public.devices to authenticated;

alter table public.profiles enable row level security;
alter table public.profiles force row level security;
revoke all on public.profiles from anon;
create policy "profiles: owner reads" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "profiles: owner updates" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- A profile for each new account.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name) values (new.id, coalesce(new.raw_user_meta_data ->> 'name', ''));
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Indexes for the foreign keys (Supabase's performance advisor).
create index approvals_by_run on public.approvals (owner_id, run_id);
create index members_by_bot on public.conversation_members (owner_id, bot_id);
create index files_by_conversation on public.files (owner_id, conversation_id);
create index candidates_by_round on public.hiring_candidates (owner_id, round_id);
create index initiatives_by_bot on public.initiatives (owner_id, bot_id);
create index memory_by_bot on public.memory (owner_id, bot_id);
create index routine_runs_by_routine on public.routine_runs (owner_id, routine_id);
create index routines_by_bot on public.routines (owner_id, bot_id);
