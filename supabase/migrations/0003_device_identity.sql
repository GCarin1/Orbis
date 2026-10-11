-- Orbis cloud relay (change 0068-cloud-relay, specs/cloud, ADR 0024): the cloud's Worker asks which account a
-- device's token belongs to before it hands the device's WebSocket to that account's Durable Object. Like
-- device_sync, the token is the only proof: the function finds the device by the token's hash, not revoked,
-- notes when it was last seen, and answers only the owner and the device's id — never the hash.
create or replace function public.device_identity(p_token text)
returns table (owner_id uuid, device_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  v_owner := public.device_owner(p_token);
  return query
    select d.owner_id, d.id
    from public.devices d
    where d.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') and d.revoked_at is null;
end;
$$;

revoke all on function public.device_identity(text) from public;
grant execute on function public.device_identity(text) to anon, authenticated;
