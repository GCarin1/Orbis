-- The Library (change 0079-library, ADR 0030): a file may live in the Library alone (no conversation), in a
-- folder, archived, and says where it came from; folders, and the bots and groups that work on them. Each
-- account's rows are its own, closed to everyone else by row level security, like every other table.

alter table public.files alter column conversation_id drop not null;
alter table public.files add column if not exists folder_id text;
alter table public.files add column if not exists archived_at timestamptz;
alter table public.files add column if not exists source text not null default 'chat'
  check (source in ('chat', 'library', 'routine', 'skill', 'task'));

create table public.library_folders (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  name text not null,
  description text not null default '',
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (owner_id, id)
);

create table public.folder_bots (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  folder_id text not null,
  bot_id text not null,
  primary key (owner_id, folder_id, bot_id),
  foreign key (owner_id, folder_id) references public.library_folders (owner_id, id) on delete cascade,
  foreign key (owner_id, bot_id) references public.bots (owner_id, id) on delete cascade
);

create table public.folder_groups (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  folder_id text not null,
  conversation_id text not null,
  primary key (owner_id, folder_id, conversation_id),
  foreign key (owner_id, folder_id) references public.library_folders (owner_id, id) on delete cascade,
  foreign key (owner_id, conversation_id) references public.conversations (owner_id, id) on delete cascade
);

create index files_by_folder on public.files (owner_id, folder_id);
create index folder_bots_by_bot on public.folder_bots (owner_id, bot_id);
create index folder_groups_by_conversation on public.folder_groups (owner_id, conversation_id);

do $$
declare
  t text;
begin
  foreach t in array array['library_folders', 'folder_bots', 'folder_groups'] loop
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

-- A linked device also sends its folders.
create or replace function public.device_sync(p_token text, p_table text, p_upserts jsonb default '[]'::jsonb, p_deletes jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  synced constant text[] := array[
    'settings', 'squads', 'bots', 'conversations', 'conversation_members', 'items', 'runs', 'memory',
    'routines', 'routine_runs', 'approvals', 'mcp_servers', 'hiring_rounds', 'hiring_candidates', 'files',
    'initiatives', 'health_metrics', 'health_sessions', 'library_folders', 'folder_bots', 'folder_groups'
  ];
  v_owner uuid;
  v_pk text[];
  v_cols text;
  v_set text;
  v_match text;
  v_up int := 0;
  v_del int := 0;
begin
  v_owner := public.device_owner(p_token);
  if p_table is null or not (p_table = any (synced)) then
    raise exception 'table % is not synced', p_table using errcode = '22023';
  end if;
  if jsonb_typeof(p_upserts) <> 'array' or jsonb_typeof(p_deletes) <> 'array' then
    raise exception 'upserts and deletes are arrays of rows' using errcode = '22023';
  end if;
  if jsonb_array_length(p_upserts) + jsonb_array_length(p_deletes) > 500 then
    raise exception 'at most 500 rows a call' using errcode = '54000';
  end if;

  select array_agg(a.attname::text order by array_position(i.indkey::int2[], a.attnum))
  into v_pk
  from pg_catalog.pg_index i
  join pg_catalog.pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey::int2[])
  where i.indrelid = format('public.%I', p_table)::regclass and i.indisprimary and a.attname <> 'owner_id';

  select string_agg(format('%I', c.column_name), ', ' order by c.ordinal_position),
         string_agg(format('%I = excluded.%I', c.column_name, c.column_name), ', ' order by c.ordinal_position)
           filter (where not (c.column_name = any (v_pk)))
  into v_cols, v_set
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = p_table and c.column_name <> 'owner_id'
    and c.is_generated = 'NEVER' and c.identity_generation is null;

  if jsonb_array_length(p_upserts) > 0 then
    execute format(
      'insert into public.%I (owner_id, %s) select $1, %s from jsonb_populate_recordset(null::public.%I, $2) on conflict (owner_id, %s) do %s',
      p_table, v_cols, v_cols, p_table,
      (select string_agg(format('%I', k), ', ') from unnest(v_pk) k),
      case when v_set is null then 'nothing' else 'update set ' || v_set end
    ) using v_owner, p_upserts;
    get diagnostics v_up = row_count;
  end if;

  if jsonb_array_length(p_deletes) > 0 then
    select string_agg(format('t.%I = k.%I', k, k), ' and ') into v_match from unnest(v_pk) k;
    execute format(
      'delete from public.%I t using jsonb_populate_recordset(null::public.%I, $2) k where t.owner_id = $1 and %s',
      p_table, p_table, v_match
    ) using v_owner, p_deletes;
    get diagnostics v_del = row_count;
  end if;

  return jsonb_build_object('upserted', v_up, 'deleted', v_del);
end;
$$;
