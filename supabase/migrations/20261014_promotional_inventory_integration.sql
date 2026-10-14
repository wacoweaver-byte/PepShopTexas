-- Exclude zero-price promotional order lines from regular stock movements.
-- Promotional reward quantities are handled transactionally by pst_allocate_paid_free_vial.
CREATE OR REPLACE FUNCTION public.deduct_inventory_for_order(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_order record;
  v_problem_count integer := 0;
  v_problems jsonb := '[]'::jsonb;
  v_item record;
begin
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'order_not_found', 'message', 'Order was not found.');
  end if;

  if auth.uid() is not null and v_order.customer_id is not null and v_order.customer_id <> auth.uid() then
    return jsonb_build_object('success', false, 'reason', 'not_order_owner', 'message', 'This order does not belong to the current user.');
  end if;

  if coalesce(v_order.inventory_deducted, false) then
    return jsonb_build_object('success', true, 'already_deducted', true, 'message', 'Inventory was already deducted for this order.');
  end if;

  perform 1
  from public.product_inventory pi
  join (
    select coalesce(nullif(btrim(oi.product_key), ''), pc.product_key, direct_pi.product_key) as product_key,
           sum(oi.quantity)::integer as requested_qty
    from public.order_items oi
    left join public.product_catalog pc on pc.id::text = oi.product_id
    left join public.product_inventory direct_pi on direct_pi.product_key = oi.product_id
    where oi.order_id = p_order_id and oi.unit_price > 0
    group by coalesce(nullif(btrim(oi.product_key), ''), pc.product_key, direct_pi.product_key)
  ) resolved on resolved.product_key = pi.product_key
  order by pi.product_key
  for update of pi;

  for v_item in
    select resolved.stored_product_id,
           resolved.product_key,
           resolved.requested_qty,
           pi.id as inventory_id,
           pi.display_name,
           pi.current_inventory,
           pi.is_active
    from (
      select min(oi.product_id) as stored_product_id,
             coalesce(nullif(btrim(oi.product_key), ''), pc.product_key, direct_pi.product_key) as product_key,
             sum(oi.quantity)::integer as requested_qty
      from public.order_items oi
      left join public.product_catalog pc on pc.id::text = oi.product_id
      left join public.product_inventory direct_pi on direct_pi.product_key = oi.product_id
      where oi.order_id = p_order_id and oi.unit_price > 0
      group by coalesce(nullif(btrim(oi.product_key), ''), pc.product_key, direct_pi.product_key)
    ) resolved
    left join public.product_inventory pi on pi.product_key = resolved.product_key
    order by resolved.product_key nulls first
  loop
    if v_item.product_key is null or v_item.inventory_id is null then
      v_problem_count := v_problem_count + 1;
      v_problems := v_problems || jsonb_build_array(jsonb_build_object(
        'product_id', v_item.stored_product_id,
        'product_name', v_item.stored_product_id,
        'requested', v_item.requested_qty,
        'available', 0,
        'message', 'No exact PST item-number mapping exists for order item ' || coalesce(v_item.stored_product_id, '(blank)') || '.'
      ));
    elsif coalesce(v_item.is_active, true) = false then
      v_problem_count := v_problem_count + 1;
      v_problems := v_problems || jsonb_build_array(jsonb_build_object(
        'product_id', v_item.product_key,
        'product_name', coalesce(v_item.display_name, v_item.product_key),
        'requested', v_item.requested_qty,
        'available', 0,
        'message', coalesce(v_item.display_name, v_item.product_key) || ' is no longer available.'
      ));
    elsif coalesce(v_item.current_inventory, 0) < v_item.requested_qty then
      v_problem_count := v_problem_count + 1;
      v_problems := v_problems || jsonb_build_array(jsonb_build_object(
        'product_id', v_item.product_key,
        'product_name', coalesce(v_item.display_name, v_item.product_key),
        'requested', v_item.requested_qty,
        'available', coalesce(v_item.current_inventory, 0),
        'message', coalesce(v_item.display_name, v_item.product_key) || ': only ' || coalesce(v_item.current_inventory, 0) || ' available.'
      ));
    end if;
  end loop;

  if v_problem_count > 0 then
    update public.orders
    set inventory_failure_reason = v_problems::text, updated_at = now()
    where id = p_order_id;
    return jsonb_build_object('success', false, 'reason', 'inventory_match_failed', 'message', 'Inventory could not be matched by exact PST item number.', 'problems', v_problems);
  end if;

  for v_item in
    select resolved.product_key,
           resolved.requested_qty,
           pi.id as inventory_id,
           pi.display_name,
           pi.current_inventory
    from (
      select coalesce(nullif(btrim(oi.product_key), ''), pc.product_key, direct_pi.product_key) as product_key,
             sum(oi.quantity)::integer as requested_qty
      from public.order_items oi
      left join public.product_catalog pc on pc.id::text = oi.product_id
      left join public.product_inventory direct_pi on direct_pi.product_key = oi.product_id
      where oi.order_id = p_order_id and oi.unit_price > 0
      group by coalesce(nullif(btrim(oi.product_key), ''), pc.product_key, direct_pi.product_key)
    ) resolved
    join public.product_inventory pi on pi.product_key = resolved.product_key
    order by resolved.product_key
  loop
    update public.product_inventory
    set current_inventory = current_inventory - v_item.requested_qty, updated_at = now()
    where id = v_item.inventory_id;

    insert into public.inventory_movements (
      product_id, product_key, movement_type, quantity_change,
      previous_quantity, new_quantity, admin_note, created_by, created_by_email
    ) values (
      v_item.inventory_id, v_item.product_key, 'sold_checkout', -v_item.requested_qty,
      v_item.current_inventory, v_item.current_inventory - v_item.requested_qty,
      'Inventory automatically deducted by exact PST item number for order ' || p_order_id::text,
      auth.uid(), auth.jwt() ->> 'email'
    );
  end loop;

  update public.orders
  set inventory_deducted = true,
      inventory_restored = false,
      inventory_deducted_at = now(),
      inventory_failure_reason = null,
      updated_at = now()
  where id = p_order_id;

  return jsonb_build_object('success', true, 'message', 'Inventory deducted successfully by exact PST item number.', 'order_id', p_order_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.restore_inventory_for_order(p_order_id uuid, p_reason text DEFAULT 'Inventory restored by admin action'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_order record;
  v_is_admin boolean := false;
  v_item record;
begin
  select exists (
    select 1 from public.admin_users au
    where (au.user_id = auth.uid() or au.email = auth.jwt() ->> 'email')
      and au.is_active = true
  ) into v_is_admin;

  if not v_is_admin then
    return jsonb_build_object('success', false, 'reason', 'not_admin', 'message', 'Only an active admin can restore inventory.');
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'order_not_found', 'message', 'Order was not found.');
  end if;

  if coalesce(v_order.inventory_deducted, false) = false then
    return jsonb_build_object('success', true, 'already_restored', false, 'message', 'Inventory was never deducted for this order, so nothing needed to be restored.');
  end if;

  if coalesce(v_order.inventory_restored, false) then
    return jsonb_build_object('success', true, 'already_restored', true, 'message', 'Inventory was already restored for this order.');
  end if;

  perform 1
  from public.product_inventory pi
  join (
    select coalesce(nullif(btrim(oi.product_key), ''), pc.product_key, direct_pi.product_key) as product_key,
           sum(oi.quantity)::integer as restore_qty
    from public.order_items oi
    left join public.product_catalog pc on pc.id::text = oi.product_id
    left join public.product_inventory direct_pi on direct_pi.product_key = oi.product_id
    where oi.order_id = p_order_id and oi.unit_price > 0
    group by coalesce(nullif(btrim(oi.product_key), ''), pc.product_key, direct_pi.product_key)
  ) resolved on resolved.product_key = pi.product_key
  order by pi.product_key
  for update of pi;

  if exists (
    select 1
    from public.order_items oi
    left join public.product_catalog pc on pc.id::text = oi.product_id
    left join public.product_inventory direct_pi on direct_pi.product_key = oi.product_id
    left join public.product_inventory pi on pi.product_key = coalesce(nullif(btrim(oi.product_key), ''), pc.product_key, direct_pi.product_key)
    where oi.order_id = p_order_id and oi.unit_price > 0 and pi.id is null
  ) then
    return jsonb_build_object('success', false, 'reason', 'inventory_match_failed', 'message', 'Inventory restoration was blocked because an order item has no exact PST item-number mapping.');
  end if;

  for v_item in
    select resolved.product_key,
           resolved.restore_qty,
           pi.id as inventory_id,
           pi.display_name,
           pi.current_inventory
    from (
      select coalesce(nullif(btrim(oi.product_key), ''), pc.product_key, direct_pi.product_key) as product_key,
             sum(oi.quantity)::integer as restore_qty
      from public.order_items oi
      left join public.product_catalog pc on pc.id::text = oi.product_id
      left join public.product_inventory direct_pi on direct_pi.product_key = oi.product_id
      where oi.order_id = p_order_id and oi.unit_price > 0
      group by coalesce(nullif(btrim(oi.product_key), ''), pc.product_key, direct_pi.product_key)
    ) resolved
    join public.product_inventory pi on pi.product_key = resolved.product_key
    order by resolved.product_key
  loop
    update public.product_inventory
    set current_inventory = current_inventory + v_item.restore_qty, updated_at = now()
    where id = v_item.inventory_id;

    insert into public.inventory_movements (
      product_id, product_key, movement_type, quantity_change,
      previous_quantity, new_quantity, admin_note, created_by, created_by_email
    ) values (
      v_item.inventory_id, v_item.product_key, 'restored_order', v_item.restore_qty,
      v_item.current_inventory, v_item.current_inventory + v_item.restore_qty,
      coalesce(p_reason, 'Inventory restored by admin action') || ' | Exact PST item-number match | Order ' || p_order_id::text,
      auth.uid(), auth.jwt() ->> 'email'
    );
  end loop;

  update public.orders
  set inventory_restored = true, inventory_restored_at = now(), updated_at = now()
  where id = p_order_id;

  return jsonb_build_object('success', true, 'message', 'Inventory restored successfully by exact PST item number.', 'order_id', p_order_id);
end;
$function$
;
