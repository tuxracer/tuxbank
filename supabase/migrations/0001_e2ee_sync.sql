-- Applied to project udwxiovhnlvezzcpqzht (tuxbank). E2EE sync tables + RLS.

create table public.events (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  updated_at timestamptz not null,
  deleted boolean not null default false,
  nonce text not null,
  ciphertext text not null
);
create index events_user_updated_idx on public.events (user_id, updated_at);

create table public.categories (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  updated_at timestamptz not null,
  deleted boolean not null default false,
  nonce text not null,
  ciphertext text not null
);
create index categories_user_updated_idx on public.categories (user_id, updated_at);

create table public.key_material (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  wrapped_dek text not null,
  wrapped_dek_nonce text not null,
  recovery_wrapped_dek text not null,
  recovery_nonce text not null,
  kdf_version integer not null,
  created_at timestamptz not null default now()
);

-- events
alter table public.events enable row level security;
create policy "events require aal2"
  on public.events as restrictive to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');
create policy "events are owner-scoped"
  on public.events for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- categories
alter table public.categories enable row level security;
create policy "categories require aal2"
  on public.categories as restrictive to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');
create policy "categories are owner-scoped"
  on public.categories for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- key_material
alter table public.key_material enable row level security;
create policy "key_material require aal2"
  on public.key_material as restrictive to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');
create policy "key_material is owner-scoped"
  on public.key_material for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
