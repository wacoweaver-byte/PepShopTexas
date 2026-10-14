-- Replacement allocation model: payment-confirmed, submission-ordered, two-hour scarcity priority.
-- Review against existing inventory deduction/restoration before applying to production.
create or replace function public.pst_allocate_paid_free_vial(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare o public.orders%rowtype; p public.site_promotions%rowtype; v public.product_inventory%rowtype;
 earlier_unpaid integer; issued integer; purchased integer;
begin
 select * into o from public.orders where id=p_order_id for update;
 if not found then raise exception 'Order not found'; end if;
 if lower(coalesce(o.payment_status,'')) not in ('paid','completed','confirmed') then
   return jsonb_build_object('awarded',false,'reason','payment_pending');
 end if;
 if lower(coalesce(o.order_status,o.status,'')) in ('rejected','cancelled','canceled') then
   return jsonb_build_object('awarded',false,'reason','order_cancelled');
 end if;
 select coalesce(sum(quantity),0) into purchased from public.order_items
 where order_id=o.id and unit_price>0 and (coalesce(product_category,'') ilike '%peptide%' or coalesce(product_category,'') ilike '%glp%');
 for p in select * from public.site_promotions where promotion_type='free_product' and is_active
 and (starts_at is null or o.created_at>=starts_at) and (ends_at is null or o.created_at<=ends_at)
 order by sort_order,created_at loop
   if purchased<p.minimum_paid_quantity or coalesce(o.customer_id,o.user_id) is null then continue; end if;
   perform pg_advisory_xact_lock(hashtextextended(p.id::text,0));
   if exists(select 1 from public.promotion_redemptions r where r.promotion_id=p.id and r.order_id=o.id and r.status in ('reserved','fulfilled')) then continue; end if;
   if p.redemption_limit='once_per_customer' and exists(
     select 1 from public.promotion_redemptions r where r.promotion_id=p.id and r.customer_id=coalesce(o.customer_id,o.user_id) and r.status in ('reserved','fulfilled')
   ) then continue; end if;
   if p.max_redemptions is not null then
     select count(*) into issued from public.promotion_redemptions r where r.promotion_id=p.id and r.status in ('reserved','fulfilled');
     if issued>=p.max_redemptions then continue; end if;
   end if;
   select * into v from public.product_inventory where product_key=p.reward_product_key for update;
   if not found or coalesce(v.current_inventory,0)<p.reward_quantity then continue; end if;
   -- Protect earlier unpaid qualifying orders only while scarce and within their two-hour window.
   select count(*) into earlier_unpaid from public.orders e
   where e.created_at<o.created_at and e.created_at>now()-interval '2 hours'
     and lower(coalesce(e.payment_status,'')) not in ('paid','completed','confirmed')
     and lower(coalesce(e.order_status,e.status,'')) not in ('rejected','cancelled','canceled')
     and coalesce(e.customer_id,e.user_id) is not null
     and (p.starts_at is null or e.created_at>=p.starts_at)
     and (p.ends_at is null or e.created_at<=p.ends_at)
     and (select coalesce(sum(ei2.quantity),0) from public.order_items ei2 where ei2.order_id=e.id and ei2.unit_price>0 and coalesce(ei2.product_category,'') ilike '%peptide%')>=p.minimum_paid_quantity
     and exists(select 1 from public.order_items ei where ei.order_id=e.id and ei.unit_price>0
       and (coalesce(ei.product_category,'') ilike '%peptide%' or coalesce(ei.product_category,'') ilike '%glp%'))
     and not exists(select 1 from public.promotion_redemptions er where er.promotion_id=p.id and er.order_id=e.id and er.status in ('reserved','fulfilled'));
   -- If earlier unpaid orders still have a live two-hour claim, leave enough stock for them.
   -- Expired orders no longer block the queue; later submitted paid orders are eligible.
   if v.current_inventory < (earlier_unpaid+1)*p.reward_quantity then continue; end if;
   -- Inventory is deducted here, and the standard order RPC excludes zero-price promotional lines.
   update public.product_inventory set current_inventory=current_inventory-p.reward_quantity where id=v.id;
   insert into public.order_items(order_id,product_id,product_key,product_name,product_strength,product_category,quantity,unit_price,line_total)
   values(o.id,v.id::text,v.product_key,v.display_name,v.strength,v.category,p.reward_quantity,0,0);
   insert into public.promotion_redemptions(promotion_id,order_id,customer_id,reward_product_key,quantity,status)
   values(p.id,o.id,coalesce(o.customer_id,o.user_id),v.product_key,p.reward_quantity,'fulfilled');
   -- Inventory is locked in this transaction; the last awarded vial ends the campaign.
   if (select current_inventory from public.product_inventory where id=v.id)<p.reward_quantity then
     update public.site_promotions set is_active=false where id=p.id;
   end if;
   return jsonb_build_object('awarded',true,'product_key',v.product_key,'quantity',p.reward_quantity);
 end loop;
 return jsonb_build_object('awarded',false,'reason','not_eligible_or_no_unreserved_inventory');
end $$;
revoke all on function public.pst_allocate_paid_free_vial(uuid) from public,anon,authenticated;
-- Trigger runs when staff confirm payment in the order manager.
create or replace function public.pst_paid_order_reward_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if lower(coalesce(new.payment_status,'')) in ('paid','completed','confirmed')
 and lower(coalesce(old.payment_status,'')) not in ('paid','completed','confirmed') then
   perform public.pst_allocate_paid_free_vial(new.id);
 end if;
 return new;
end $$;
drop trigger if exists pst_paid_order_reward on public.orders;
create trigger pst_paid_order_reward after update of payment_status on public.orders
for each row execute function public.pst_paid_order_reward_trigger();
