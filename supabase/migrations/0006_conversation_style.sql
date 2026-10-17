-- How a conversation talks (change 0082-backstage): short and human or detailed, and whether the team's work
-- stays backstage; null follows the hub's default. An item marked backstage is team work the chat hides.
alter table public.conversations add column if not exists reply_style text check (reply_style in ('chat', 'detailed'));
alter table public.conversations add column if not exists backstage boolean;
alter table public.items add column if not exists backstage boolean not null default false;
