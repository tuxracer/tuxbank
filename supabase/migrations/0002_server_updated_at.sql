-- Server-assigned upload watermark for sync pulls.
--
-- The client-stamped updated_at column is an edit time, not an upload time:
-- an offline edit is stamped when it was made and can be uploaded long after
-- another device's pull cursor has moved past that stamp, so cursoring pulls
-- on updated_at silently and permanently misses such rows. server_updated_at
-- is set by the database on every insert and update, giving pulls a watermark
-- in a single clock's domain. updated_at remains the last-write-wins merge
-- key; server_updated_at is only the "what have I not seen yet" cursor.

alter table public.events
  add column server_updated_at timestamptz not null default now();
alter table public.categories
  add column server_updated_at timestamptz not null default now();

create or replace function public.touch_server_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.server_updated_at := now();
  return new;
end
$$;

create trigger events_touch_server_updated_at
  before insert or update on public.events
  for each row execute function public.touch_server_updated_at();
create trigger categories_touch_server_updated_at
  before insert or update on public.categories
  for each row execute function public.touch_server_updated_at();

-- Pulls now filter and order on (user_id, server_updated_at).
drop index if exists public.events_user_updated_idx;
drop index if exists public.categories_user_updated_idx;
create index events_user_server_updated_idx
  on public.events (user_id, server_updated_at);
create index categories_user_server_updated_idx
  on public.categories (user_id, server_updated_at);
