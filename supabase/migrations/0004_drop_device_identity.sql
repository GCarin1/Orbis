-- Oracle only (change 0070-oracle-only, ADR 0026): the Cloudflare relay is gone, and with it the one caller of
-- device_identity. One function fewer open to anon: dropped.
drop function if exists public.device_identity(text);
