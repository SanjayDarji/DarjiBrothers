-- =============================================================
-- Darji Brothers: database setup for Supabase (free plan)
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- It is safe to run again; it will not delete your products.
--
-- BEFORE RUNNING: change the email on the last line to the email
-- you will use to sign in to the admin page.
-- =============================================================

create extension if not exists pgcrypto;

-- ---------- Tables ----------
create table if not exists public.products (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  category    text not null default 'Kurtis',
  price       numeric(10,2) not null default 0 check (price >= 0),
  mrp         numeric(10,2),
  description text not null default '',
  fabric      text not null default '',
  care        text not null default '',
  sizes       text[] not null default '{}',
  custom_fit  boolean not null default true,
  colors      jsonb not null default '[]'::jsonb,   -- [{ "name": "Rani pink", "hex": "#B0175C", "img": 0 }]
  images      text[] not null default '{}',          -- public photo URLs, first one is the cover
  visible     boolean not null default true,
  in_stock    boolean not null default true,
  is_new      boolean not null default false,
  featured    boolean not null default false,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.offers (
  id         uuid primary key default gen_random_uuid(),
  text       text not null,
  ends_at    timestamptz,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.store_settings (
  id         integer primary key default 1 check (id = 1),
  whatsapp   text,
  instagram  text,
  email      text,
  address    text,
  about      text,
  updated_at timestamptz not null default now()
);
-- Added in version 2: opening hours and the About us story chapters
alter table public.store_settings add column if not exists hours jsonb not null default '{}'::jsonb;  -- { "open": "10:00", "close": "20:30", "closed": ["Sun"] }
alter table public.store_settings add column if not exists story jsonb not null default '[]'::jsonb;  -- [{ "when": "1976", "title": "...", "text": "..." }]

insert into public.store_settings (id, whatsapp, instagram, email)
values (1, '918980223301', 'darjibrothers', 'darjibrother25@gmail.com')
on conflict (id) do nothing;

-- Emails allowed to use the admin page
create table if not exists public.admins (
  email text primary key
);

-- Keep updated_at current
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

drop trigger if exists products_touch on public.products;
create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();
drop trigger if exists settings_touch on public.store_settings;
create trigger settings_touch before update on public.store_settings
  for each row execute function public.touch_updated_at();

-- Is the signed-in person an admin?
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admins
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------- Access for the website ----------
grant usage on schema public to anon, authenticated;
grant select on public.products, public.offers, public.store_settings to anon, authenticated;
grant insert, update, delete on public.products, public.offers to authenticated;
grant insert, update on public.store_settings to authenticated;

-- ---------- Security rules (Row Level Security) ----------
alter table public.products       enable row level security;
alter table public.offers         enable row level security;
alter table public.store_settings enable row level security;
alter table public.admins         enable row level security;  -- no policies: only you, in the dashboard, can edit it

-- Products: everyone sees published products; admins see and edit everything
drop policy if exists "products read"   on public.products;
drop policy if exists "products insert" on public.products;
drop policy if exists "products update" on public.products;
drop policy if exists "products delete" on public.products;
create policy "products read"   on public.products for select using (visible or public.is_admin());
create policy "products insert" on public.products for insert to authenticated with check (public.is_admin());
create policy "products update" on public.products for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "products delete" on public.products for delete to authenticated using (public.is_admin());

-- Offers
drop policy if exists "offers read"  on public.offers;
drop policy if exists "offers write" on public.offers;
create policy "offers read"  on public.offers for select using (true);
create policy "offers write" on public.offers for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Store settings
drop policy if exists "settings read"  on public.store_settings;
drop policy if exists "settings write" on public.store_settings;
create policy "settings read"  on public.store_settings for select using (true);
create policy "settings write" on public.store_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- Photo storage ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = true;

drop policy if exists "admins upload photos" on storage.objects;
drop policy if exists "admins update photos" on storage.objects;
drop policy if exists "admins delete photos" on storage.objects;
drop policy if exists "admins list photos"   on storage.objects;
create policy "admins upload photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and public.is_admin());
create policy "admins update photos" on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and public.is_admin());
create policy "admins delete photos" on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and public.is_admin());
create policy "admins list photos" on storage.objects for select to authenticated
  using (bucket_id = 'product-images' and public.is_admin());

-- ---------- Your admin email (CHANGE THIS) ----------
insert into public.admins (email) values ('darjibrother25@gmail.com')
on conflict (email) do nothing;
