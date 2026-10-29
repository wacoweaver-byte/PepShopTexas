-- Pep Shop Texas: keep each vendor's price-list file (PDF / Excel / CSV), like lab reports (v1, Oct 29 2026).
-- One current file per vendor: a new upload replaces the old one.
-- Additive only. Private bucket (vendor costs are not public): admins only, opened with short-lived links.

-- 1. Private storage bucket, 20 MB per file
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vendor-price-lists', 'vendor-price-lists', false, 20971520,
        array['application/pdf','text/csv','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/octet-stream'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Admins read vendor price lists" on storage.objects;
drop policy if exists "Admins add vendor price lists" on storage.objects;
drop policy if exists "Admins delete vendor price lists" on storage.objects;
create policy "Admins read vendor price lists" on storage.objects for select to authenticated
  using (bucket_id = 'vendor-price-lists' and exists (select 1 from public.admin_users a where a.user_id = auth.uid() and a.is_active = true));
create policy "Admins add vendor price lists" on storage.objects for insert to authenticated
  with check (bucket_id = 'vendor-price-lists' and exists (select 1 from public.admin_users a where a.user_id = auth.uid() and a.is_active = true));
drop policy if exists "Admins update vendor price lists" on storage.objects;
create policy "Admins update vendor price lists" on storage.objects for update to authenticated
  using (bucket_id = 'vendor-price-lists' and exists (select 1 from public.admin_users a where a.user_id = auth.uid() and a.is_active = true));
create policy "Admins delete vendor price lists" on storage.objects for delete to authenticated
  using (bucket_id = 'vendor-price-lists' and exists (select 1 from public.admin_users a where a.user_id = auth.uid() and a.is_active = true));

-- 2. The current file for each vendor
create table if not exists public.pst_vendor_price_files (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null unique references public.vendors(id) on delete cascade,
  file_name text not null,
  storage_path text not null unique,
  content_type text,
  size_bytes bigint,
  item_count integer,              -- items saved from it (null = file kept without importing)
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid default auth.uid()
);
alter table public.pst_vendor_price_files enable row level security;
drop policy if exists "Admins manage vendor price files" on public.pst_vendor_price_files;
create policy "Admins manage vendor price files" on public.pst_vendor_price_files for all to authenticated
  using (exists (select 1 from public.admin_users a where a.user_id = auth.uid() and a.is_active = true))
  with check (exists (select 1 from public.admin_users a where a.user_id = auth.uid() and a.is_active = true));
revoke all on public.pst_vendor_price_files from anon;
grant select, insert, update, delete on public.pst_vendor_price_files to authenticated;
notify pgrst, 'reload schema';
