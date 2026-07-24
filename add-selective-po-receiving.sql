-- Atomically receive selected line items from one incoming purchase order.

create or replace function public.receive_incoming_purchase_order_lines(
  p_po_number text,
  p_line_ids text[]
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  line_record public.incoming_inventory%rowtype;
  inventory_record public.product_inventory%rowtype;
  previous_qty integer;
  new_qty integer;
  receipt_time timestamptz := now();
  actor_email text := coalesce(auth.jwt() ->> 'email', '');
  received_lines integer := 0;
  received_vials integer := 0;
  requested_lines integer := 0;
  eligible_lines integer := 0;
  clean_po_number text := btrim(coalesce(p_po_number, ''));
begin
  if not public.is_pst_admin() then
    raise exception 'Active administrator access is required.'
      using errcode = '42501';
  end if;

  if clean_po_number = '' then
    raise exception 'PO number is required.';
  end if;

  select count(distinct requested_id)
  into requested_lines
  from unnest(coalesce(p_line_ids, array[]::text[])) requested_id
  where nullif(btrim(requested_id), '') is not null;

  if requested_lines = 0 then
    raise exception 'Select at least one PO line to receive.';
  end if;

  -- Prevent simultaneous receipts from changing the same PO.
  perform pg_advisory_xact_lock(hashtextextended(lower(clean_po_number), 0));

  select count(*)
  into eligible_lines
  from public.incoming_inventory
  where lower(po_number) = lower(clean_po_number)
    and id::text = any(p_line_ids)
    and lower(coalesce(status, 'ordered')) not in ('received', 'cancelled');

  if eligible_lines <> requested_lines then
    raise exception
      'One or more selected lines do not belong to PO %, were already received, or were cancelled.',
      clean_po_number;
  end if;

  for line_record in
    select *
    from public.incoming_inventory
    where lower(po_number) = lower(clean_po_number)
      and id::text = any(p_line_ids)
      and lower(coalesce(status, 'ordered')) not in ('received', 'cancelled')
    order by id
    for update
  loop
    if coalesce(line_record.ordered_quantity, 0) <= 0 then
      raise exception 'PO % contains a line with an invalid quantity.', clean_po_number;
    end if;

    select inventory.*
    into inventory_record
    from public.product_inventory inventory
    where inventory.id::text = coalesce(line_record.product_id, '')
       or (
         nullif(btrim(line_record.product_key), '') is not null
         and lower(inventory.product_key) = lower(btrim(line_record.product_key))
       )
    order by
      case when inventory.id::text = coalesce(line_record.product_id, '') then 0 else 1 end
    limit 1
    for update;

    if not found then
      raise exception 'PO % line % could not be matched to physical inventory.',
        clean_po_number,
        line_record.product_name;
    end if;

    previous_qty := coalesce(inventory_record.current_inventory, 0);
    new_qty := previous_qty + line_record.ordered_quantity;

    update public.product_inventory
    set
      current_inventory = new_qty,
      cost_per_unit = case
        when coalesce(line_record.cost_per_unit, 0) > 0
          then line_record.cost_per_unit
        else cost_per_unit
      end,
      updated_at = receipt_time
    where id = inventory_record.id;

    insert into public.inventory_movements (
      product_id,
      product_key,
      movement_type,
      quantity_change,
      previous_quantity,
      new_quantity,
      admin_note,
      created_by,
      created_by_email,
      created_at
    ) values (
      inventory_record.id,
      inventory_record.product_key,
      'incoming_received',
      line_record.ordered_quantity,
      previous_qty,
      new_qty,
      'Received selected line from ' || clean_po_number || ': ' ||
        coalesce(line_record.product_name, inventory_record.display_name, inventory_record.product_key) ||
        ' · ' || line_record.ordered_quantity || ' vial(s). Incoming ID: ' || line_record.id,
      auth.uid(),
      nullif(actor_email, ''),
      receipt_time
    );

    update public.incoming_inventory
    set
      status = 'received',
      received_at = receipt_time,
      received_quantity = line_record.ordered_quantity,
      updated_at = receipt_time,
      audit_note = concat_ws(
        E'\n',
        nullif(audit_note, ''),
        'Received selected line from ' || clean_po_number || ' on ' ||
          to_char(receipt_time, 'YYYY-MM-DD HH24:MI:SS TZ') ||
          ' by ' || coalesce(nullif(actor_email, ''), 'Admin') ||
          '. Previous stock ' || previous_qty || '; new stock ' || new_qty || '.'
      )
    where id = line_record.id;

    received_lines := received_lines + 1;
    received_vials := received_vials + line_record.ordered_quantity;
  end loop;

  return jsonb_build_object(
    'po_number', clean_po_number,
    'received_lines', received_lines,
    'received_vials', received_vials,
    'received_at', receipt_time
  );
end;
$$;

revoke execute on function public.receive_incoming_purchase_order_lines(text, text[]) from public;
revoke execute on function public.receive_incoming_purchase_order_lines(text, text[]) from anon;
grant execute on function public.receive_incoming_purchase_order_lines(text, text[]) to authenticated;
