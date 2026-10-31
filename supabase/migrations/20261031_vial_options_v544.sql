-- v544 (Jimmie's report #15): pick the vial picture per product. All optional; empty = Auto (today's picture).
alter table public.product_catalog
  add column if not exists vial_type  text,
  add column if not exists vial_fill  text,
  add column if not exists vial_color text;
do $$ begin
  alter table public.product_catalog add constraint product_catalog_vial_type_chk  check (vial_type  is null or vial_type  in ('clear-3','clear-5','clear-10','amber-10'));
  alter table public.product_catalog add constraint product_catalog_vial_fill_chk  check (vial_fill  is null or vial_fill  in ('powder','liquid'));
  alter table public.product_catalog add constraint product_catalog_vial_color_chk check (vial_color is null or vial_color in ('white','blue','orange','red'));
exception when duplicate_object then null; end $$;
notify pgrst, 'reload schema';
