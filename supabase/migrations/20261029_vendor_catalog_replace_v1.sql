-- Pep Shop Texas: vendor price lists can be replaced, cleared, or trimmed one item at a time (v1, Oct 29 2026).
-- Additive only: three new functions. The existing pst_admin_import_vendor_catalog is unchanged ("Only add and update").
-- Why: the import only upserts on (vendor, SKU, strength), so a newer catalog with different SKUs or strength
-- wording left the old rows in place and the list looked duplicated.
-- No foreign keys point at pst_vendor_catalog_items (vendor-only POs copy name/SKU/cost into incoming_inventory).

-- 1. Replace: save the new list, then remove this vendor's rows that aren't in it
create or replace function public.pst_admin_replace_vendor_catalog(p_vendor_id uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare n int; removed int; unlinked int;
begin
  if not exists (select 1 from public.admin_users where user_id = auth.uid() and is_active = true) then raise exception 'Admin only'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'The new list is empty'; end if;
  n := public.pst_admin_import_vendor_catalog(p_vendor_id, p_rows);   -- same checks + upsert as today
  with keep as (
    select coalesce(r->>'vendor_item_number', '') || '|' || coalesce(r->>'strength', '') as k from jsonb_array_elements(p_rows) r
  ), gone as (
    delete from public.pst_vendor_catalog_items c
     where c.vendor_id = p_vendor_id
       and coalesce(c.vendor_item_number, '') || '|' || coalesce(c.strength, '') not in (select k from keep)
    returning 1)
  select count(*) into removed from gone;
  with keys as (
    select distinct nullif(trim(r->>'product_key'), '') as k from jsonb_array_elements(p_rows) r
  ), gone as (
    delete from public.pst_vendor_prices p
     where p.vendor_id = p_vendor_id
       and p.product_key not in (select k from keys where k is not null)
    returning 1)
  select count(*) into unlinked from gone;
  return jsonb_build_object('saved', n, 'removed', removed, 'unlinked', unlinked);
end $$;

-- 2. Clear: empty one vendor's list (and the prices it fed into new purchase orders)
create or replace function public.pst_admin_clear_vendor_catalog(p_vendor_id uuid)
returns integer language plpgsql security definer set search_path to '' as $$
declare n int;
begin
  if not exists (select 1 from public.admin_users where user_id = auth.uid() and is_active = true) then raise exception 'Admin only'; end if;
  if not exists (select 1 from public.vendors where id = p_vendor_id) then raise exception 'Invalid vendor'; end if;
  delete from public.pst_vendor_prices where vendor_id = p_vendor_id;
  delete from public.pst_vendor_catalog_items where vendor_id = p_vendor_id;
  get diagnostics n = row_count;
  return n;
end $$;

-- 3. Remove one item (and its price link, unless another row of the same vendor still matches that product)
create or replace function public.pst_admin_delete_vendor_catalog_item(p_item_id uuid)
returns boolean language plpgsql security definer set search_path to '' as $$
declare i public.pst_vendor_catalog_items%rowtype;
begin
  if not exists (select 1 from public.admin_users where user_id = auth.uid() and is_active = true) then raise exception 'Admin only'; end if;
  delete from public.pst_vendor_catalog_items where id = p_item_id returning * into i;
  if not found then return false; end if;
  if i.product_key is not null and not exists (select 1 from public.pst_vendor_catalog_items where vendor_id = i.vendor_id and product_key = i.product_key) then
    delete from public.pst_vendor_prices where vendor_id = i.vendor_id and product_key = i.product_key;
  end if;
  return true;
end $$;

revoke all on function public.pst_admin_replace_vendor_catalog(uuid, jsonb) from public, anon;
revoke all on function public.pst_admin_clear_vendor_catalog(uuid) from public, anon;
revoke all on function public.pst_admin_delete_vendor_catalog_item(uuid) from public, anon;
grant execute on function public.pst_admin_replace_vendor_catalog(uuid, jsonb) to authenticated, service_role;
grant execute on function public.pst_admin_clear_vendor_catalog(uuid) to authenticated, service_role;
grant execute on function public.pst_admin_delete_vendor_catalog_item(uuid) to authenticated, service_role;
notify pgrst, 'reload schema';
