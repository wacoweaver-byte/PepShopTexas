-- FIFO catch-up for free-product campaigns.
-- Invoke from a trusted scheduler once per minute and after manual payment confirmation.
-- This function does not allocate to unpaid orders. Earlier unpaid orders within
-- two hours retain scarcity priority through pst_allocate_paid_free_vial().
create or replace function public.pst_process_free_vial_waitlist()
returns jsonb language plpgsql security definer set search_path=public
as $$
declare
 candidate record;
 result jsonb;
 awarded_count integer := 0;
begin
 -- Serialize workers so two invocations cannot process the same queue concurrently.
 perform pg_advisory_xact_lock(hashtextextended('pst_free_vial_waitlist',0));
 for candidate in
   select distinct o.id, o.created_at
   from public.orders o
   join public.order_items oi on oi.order_id=o.id
   where lower(coalesce(o.payment_status,'')) in ('paid','completed','confirmed')
     and lower(coalesce(o.order_status,o.status,'')) not in ('rejected','cancelled','canceled')
     and oi.unit_price>0
     and (coalesce(oi.product_category,'') ilike '%peptide%' or coalesce(oi.product_category,'') ilike '%glp%')
     and exists (
       select 1 from public.site_promotions p
       where p.is_active and p.promotion_type='free_product'
       and (p.starts_at is null or o.created_at>=p.starts_at)
       and (p.ends_at is null or o.created_at<=p.ends_at)
       and not exists (
         select 1 from public.promotion_redemptions r
         where r.promotion_id=p.id and r.order_id=o.id
           and r.status in ('reserved','fulfilled')
       )
     )
   order by o.created_at,o.id
 loop
   result := public.pst_allocate_paid_free_vial(candidate.id);
   if coalesce((result->>'awarded')::boolean,false) then
     awarded_count:=awarded_count+1;
   end if;
 end loop;
 return jsonb_build_object('awarded_count',awarded_count,'processed_at',now());
end $$;
revoke all on function public.pst_process_free_vial_waitlist() from public,anon,authenticated;
grant execute on function public.pst_process_free_vial_waitlist() to service_role;

-- Run catch-up immediately when staff change an order to paid.
create or replace function public.pst_paid_order_reward_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if lower(coalesce(new.payment_status,'')) in ('paid','completed','confirmed')
 and lower(coalesce(old.payment_status,'')) not in ('paid','completed','confirmed') then
   perform public.pst_process_free_vial_waitlist();
 end if;
 return new;
end $$;

-- Supabase project currently does not have pg_cron installed.
-- After enabling pg_cron, run separately:
-- select cron.schedule('pst-free-vial-waitlist','* * * * *',
--   'select public.pst_process_free_vial_waitlist()');
