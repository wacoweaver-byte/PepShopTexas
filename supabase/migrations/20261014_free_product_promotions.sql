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
-- Per-customer restrictions are enforced under a promotion advisory lock, allowing once_per_order campaigns.
alter table public.promotion_redemptions enable row level security;

