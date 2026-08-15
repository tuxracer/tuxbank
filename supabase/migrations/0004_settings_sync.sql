-- Synced user settings.
--
-- Display preferences (currency, week start) used to be device-local, which
-- left no way for a signed-in user to tell which of their choices followed
-- them across devices. They are now ordinary synced rows, and this table is
-- structurally identical to events/categories so the existing client merge
-- engine handles it with no special cases.
--
-- id is text, not uuid: settings are keyed by a stable name ('currency') the
-- client assigns, not by a generated id. The composite (user_id, id) primary
-- key matches the other tables, confining PostgREST's ON CONFLICT resolution
-- to the caller's own rows.
--
-- One row per setting rather than one blob per user, so two devices that each
-- change a different setting both keep their change under last-write-wins.

create table public.settings (
  id text not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  updated_at timestamptz not null,
  server_updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  nonce text not null,
  ciphertext text not null,
  primary key (user_id, id)
);

create index settings_user_server_updated_idx
  on public.settings (user_id, server_updated_at);

create trigger settings_touch_server_updated_at
  before insert or update on public.settings
  for each row execute function public.touch_server_updated_at();

alter table public.settings enable row level security;
create policy "settings require aal2"
  on public.settings as restrictive to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');
create policy "settings are owner-scoped"
  on public.settings for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
