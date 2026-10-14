alter table public.site_promotions add column if not exists promotion_type text not null default 'banner';
alter table public.site_promotions add column if not exists reward_product_key text;
alter table public.site_promotions add column if not exists reward_quantity integer not null default 1;
alter table public.site_promotions add column if not exists minimum_paid_quantity integer not null default 1;
alter table public.site_promotions add column if not exists redemption_limit text not null default 'once_per_customer';
alter table public.site_promotions add column if not exists max_redemptions integer;
alter table public.site_promotions add column if not exists require_available_inventory boolean not null default true;
create table if not exists public.promotion_redemptions (
 id uuid primary key default gen_random_uuid(),
 promotion_id uuid not null references public.site_promotions(id),
 order_id uuid not null references public.orders(id),
 customer_id uuid not null references auth.users(id),
 reward_product_key text not null,
 quantity integer not null check (quantity > 0),
 status text not null default 'reserved',
 created_at timestamptz not null default now(),
 unique(promotion_id,order_id)
);
create unique index if not exists promotion_redemptions_customer_once on public.promotion_redemptions(promotion_id,customer_id) where status in ('reserved','fulfilled');
alter table public.promotion_redemptions enable row level security;

-- Reward allocation is executed in one database transaction.
create or replace function public.pst_claim_free_product(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare
 v_order public.orders%rowtype;
 v_promo public.site_promotions%rowtype;
 v_stock public.product_inventory%rowtype;
 v_paid integer;
 v_count integer;
 v_item_id uuid;
begin
 select * into v_order from public.orders where id=p_order_id for update;
 if not found then raise exception 'Order not found'; end if;
 if v_order.customer_id is null or v_order.customer_id <> auth.uid() then raise exception 'Unauthorized order'; end if;
 if lower(coalesce(v_order.order_status,v_order.status,'')) in ('rejected','cancelled','canceled') then return jsonb_build_object('awarded',false); end if;
 select coalesce(sum(quantity),0) into v_paid from public.order_items
 where order_id=p_order_id and unit_price>0 and coalesce(product_category,'Peptide') ilike '%peptide%';
 for v_promo in select * from public.site_promotions
 where promotion_type='free_product' and is_active=true
 and (starts_at is null or starts_at<=now()) and (ends_at is null or ends_at>=now())
 order by sort_order,created_at
 loop
  if v_paid<v_promo.minimum_paid_quantity then continue; end if;
  if exists(select 1 from public.promotion_redemptions where promotion_id=v_promo.id and order_id=p_order_id and status<>'released') then continue; end if;
  if v_promo.redemption_limit='once_per_customer' and exists(
   select 1 from public.promotion_redemptions where promotion_id=v_promo.id and customer_id=v_order.customer_id and status in ('reserved','fulfilled')
  ) then continue; end if;
  if v_promo.max_redemptions is not null then
   select count(*) into v_count from public.promotion_redemptions where promotion_id=v_promo.id and status in ('reserved','fulfilled');
   if v_count>=v_promo.max_redemptions then continue; end if;
  end if;
  select * into v_stock from public.product_inventory where product_key=v_promo.reward_product_key for update;
  if not found or coalesce(v_stock.current_inventory,0)<v_promo.reward_quantity then continue; end if;
  update public.product_inventory set current_inventory=current_inventory-v_promo.reward_quantity where id=v_stock.id;
  insert into public.order_items(order_id,product_id,product_key,product_name,product_strength,product_category,quantity,unit_price,line_total)
  values(p_order_id,v_stock.id::text,v_stock.product_key,v_stock.display_name,v_stock.strength,v_stock.category,v_promo.reward_quantity,0,0)
  returning id into v_item_id;
  insert into public.promotion_redemptions(promotion_id,order_id,customer_id,reward_product_key,quantity)
  values(v_promo.id,p_order_id,v_order.customer_id,v_stock.product_key,v_promo.reward_quantity);
  return jsonb_build_object('awarded',true,'product_key',v_stock.product_key,'quantity',v_promo.reward_quantity,'order_item_id',v_item_id);
 end loop;
 return jsonb_build_object('awarded',false);
end $$;
revoke all on function public.pst_claim_free_product(uuid) from public,anon;
grant execute on function public.pst_claim_free_product(uuid) to authenticated;
