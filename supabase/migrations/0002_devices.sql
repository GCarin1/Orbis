-- Orbis cloud — phase 4 (change 0066-runner-link, ADR 0023): a phone's hub joins its owner's account as a
-- device with a token of its own. The cloud keeps only the token's SHA-256. The device sends its rows through
-- device_sync, which checks the token and writes them under the device's owner only, bypassing row level
-- security in that one checked way. The account itself reads and revokes its devices (0001's grants).

-- A new device of the signed-in account: its token, answered once.
create or replace function public.register_device(p_name text)
returns table (id uuid, token text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_token text;
  v_id uuid;
begin
  if v_owner is null then
    raise exception 'sign in to register a device' using errcode = '42501';
  end if;
  if p_name is null or length(trim(p_name)) = 0 or length(p_name) > 80 then
    raise exception 'a device name has 1 to 80 characters' using errcode = '22023';
  end if;
  if (select count(*) from public.devices d where d.owner_id = v_owner and d.revoked_at is null) >= 10 then
    raise exception 'this account has 10 devices: revoke one first' using errcode = '53400';
  end if;
  -- 32 random bytes, base64url without padding (43 characters).
  v_token := translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');
  insert into public.devices (owner_id, name, token_hash)
  values (v_owner, trim(p_name), encode(sha256(convert_to(v_token, 'UTF8')), 'hex'))
  returning devices.id into v_id;
  return query select v_id, v_token;
end;
$$;

revoke all on function public.register_device(text) from public, anon;
grant execute on function public.register_device(text) to authenticated;

-- The device behind a token, when it is not revoked; its last sign of life is now.
create or replace function public.device_owner(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_device uuid;
  v_owner uuid;
begin
  if p_token is null or length(p_token) < 40 or length(p_token) > 128 then
    raise exception 'device revoked or unknown' using errcode = '28000';
  end if;
  select d.id, d.owner_id into v_device, v_owner
  from public.devices d
  where d.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') and d.revoked_at is null;
  if v_device is null then
    raise exception 'device revoked or unknown' using errcode = '28000';
  end if;
  update public.devices set last_seen_at = now() where devices.id = v_device;
  return v_owner;
end;
$$;

revoke all on function public.device_owner(text) from public, anon, authenticated;

-- A device's rows of one table: upserted (the device's copy wins) and deleted by primary key, always under
-- the device's owner. Table, columns and keys come from the catalog, never from the payload.
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
    'initiatives', 'health_metrics', 'health_sessions'
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

-- The token is the proof: a phone's hub has no session.
revoke all on function public.device_sync(text, text, jsonb, jsonb) from public;
grant execute on function public.device_sync(text, text, jsonb, jsonb) to anon, authenticated;

-- A device leaves its account: its token stops working at once.
create or replace function public.device_unlink(p_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_token is null or length(p_token) < 40 or length(p_token) > 128 then
    return false;
  end if;
  update public.devices set revoked_at = now()
  where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') and revoked_at is null;
  return found;
end;
$$;

revoke all on function public.device_unlink(text) from public;
grant execute on function public.device_unlink(text) to anon, authenticated;
