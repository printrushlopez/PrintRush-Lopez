-- ============================================================
-- PrintRUSH Lopez — Supabase PostgreSQL Schema
-- Multi-tenant SaaS | Run this in Supabase SQL Editor
-- ============================================================

-- Enable UUID generation and PostGIS for Geolocation
create extension if not exists "uuid-ossp";
create extension if not exists "postgis";

-- ============================================================
-- SHOPS (Tenant Root)
-- ============================================================
create table if not exists shops (
  id            uuid primary key default uuid_generate_v4(),
  name          text not null,
  slug          text not null unique,           -- URL-safe shop identifier
  address       text,
  owner_phone   text,
  owner_email   text,
  logo_url      text,
  plan          text not null default 'basic',  -- 'basic' | 'pro'
  approval_mode boolean not null default false, -- require owner approval for online jobs
  qr_code_url   text,
  delivery_fee_metro    numeric(10,2) default 80.00,
  delivery_fee_province numeric(10,2) default 150.00,
  is_active     boolean not null default true,
  -- Geolocation & Specialties
  lat           float8, -- Latitude
  lng           float8, -- Longitude
  specialties   text[] default '{}', -- ['clothing', 'documents', etc.]
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ============================================================
-- SHOP OWNERS (linked to Supabase Auth)
-- ============================================================
create table if not exists shop_owners (
  id         uuid primary key default uuid_generate_v4(),
  shop_id    uuid not null references shops(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'owner',    -- 'owner' | 'staff'
  created_at timestamptz not null default now(),
  unique(shop_id, user_id)
);

-- ============================================================
-- SERVICES (13 categories, customizable per shop)
-- ============================================================
create table if not exists services (
  id          uuid primary key default uuid_generate_v4(),
  shop_id     uuid not null references shops(id) on delete cascade,
  category    text not null,   -- 'document', 'business_print', 'marketing', etc.
  name        text not null,
  description text,
  unit        text not null default 'per page', -- 'per page', 'per piece', 'per sqm', etc.
  unit_price  numeric(10,2) not null default 0.00,
  min_order   integer default 1,
  is_active   boolean not null default true,
  sort_order  integer default 0,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- JOBS (Print Queue — core table)
-- ============================================================
create table if not exists jobs (
  id                   uuid primary key default uuid_generate_v4(),
  shop_id              uuid not null references shops(id) on delete cascade,
  job_number           integer not null,            -- sequential per shop
  job_token            uuid not null default uuid_generate_v4(), -- customer tracking token
  customer_name        text not null default 'Customer',
  device_fingerprint   text,                        -- FingerprintJS hash
  service_id           uuid references services(id),
  service_category     text not null,
  service_name         text not null,
  file_url             text,                        -- Supabase Storage URL
  file_name            text,
  file_size_bytes      bigint,
  pages                integer default 1,
  copies               integer default 1,
  color_mode           text default 'bw',           -- 'bw' | 'color'
  paper_size           text default 'A4',
  special_instructions text,
  unit_price           numeric(10,2) not null default 0.00,
  quantity             numeric(10,2) not null default 1,
  subtotal             numeric(10,2) not null default 0.00,
  delivery_fee         numeric(10,2) default 0.00,
  total_price          numeric(10,2) not null default 0.00,
  payment_method       text not null default 'cash_pickup', -- 'gcash' | 'maya' | 'cash_pickup' | 'cash_walkin' | 'cod'
  payment_status       text not null default 'pending',     -- 'pending' | 'paid' | 'failed' | 'refunded'
  job_status           text not null default 'pending',     -- 'pending' | 'approved' | 'processing' | 'ready' | 'done' | 'cancelled'
  pickup_type          text not null default 'pickup',      -- 'pickup' | 'delivery' | 'walkin'
  delivery_address     text,
  delivery_city        text,
  delivery_province    text,
  push_endpoint        text,                        -- customer push sub endpoint for notifications
  source               text not null default 'online',  -- 'online' | 'walkin' | 'bluetooth'
  is_approved          boolean not null default false,
  priority_score       integer default 0,           -- for drag-drop ordering
  estimated_minutes    integer,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique(shop_id, job_number)
);

-- ============================================================
-- PAYMENTS
-- ============================================================
create table if not exists payments (
  id              uuid primary key default uuid_generate_v4(),
  job_id          uuid not null references jobs(id) on delete cascade,
  shop_id         uuid not null references shops(id) on delete cascade,
  amount          numeric(10,2) not null,
  method          text not null,
  paymongo_id     text,          -- PayMongo payment intent ID
  paymongo_status text,
  paid_at         timestamptz,
  created_at      timestamptz not null default now()
);

-- ============================================================
-- INVENTORY
-- ============================================================
create table if not exists inventory (
  id            uuid primary key default uuid_generate_v4(),
  shop_id       uuid not null references shops(id) on delete cascade,
  item_name     text not null,
  category      text default 'consumable',  -- 'ink' | 'paper' | 'consumable'
  quantity      numeric(10,2) not null default 0,
  unit          text not null default 'pieces',
  low_threshold numeric(10,2) not null default 10,
  notes         text,
  updated_at    timestamptz not null default now(),
  unique(shop_id, item_name)
);

-- ============================================================
-- DELIVERIES (Shipmates integration)
-- ============================================================
create table if not exists deliveries (
  id                   uuid primary key default uuid_generate_v4(),
  job_id               uuid not null references jobs(id) on delete cascade,
  shop_id              uuid not null references shops(id) on delete cascade,
  shipmates_booking_id text,
  tracking_number      text,
  courier              text,           -- 'j&t' | 'lbc' | 'ninja_van'
  status               text default 'pending',
  estimated_delivery   date,
  pickup_address       text,
  delivery_address     text,
  delivery_city        text,
  cod_amount           numeric(10,2) default 0.00,
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ============================================================
-- SPAM CONTROL — Device Bans & Rate Limiting
-- ============================================================
create table if not exists device_bans (
  id          uuid primary key default uuid_generate_v4(),
  shop_id     uuid not null references shops(id) on delete cascade,
  fingerprint text not null,
  reason      text,
  banned_at   timestamptz not null default now(),
  unique(shop_id, fingerprint)
);

create table if not exists job_throttle (
  id           uuid primary key default uuid_generate_v4(),
  fingerprint  text not null,
  shop_id      uuid not null references shops(id) on delete cascade,
  job_count    integer not null default 1,
  window_start timestamptz not null default now(),
  unique(fingerprint, shop_id)
);

-- ============================================================
-- PUSH SUBSCRIPTIONS (Web Push VAPID)
-- ============================================================
create table if not exists push_subscriptions (
  id          uuid primary key default uuid_generate_v4(),
  shop_id     uuid not null references shops(id) on delete cascade,
  job_id      uuid references jobs(id) on delete cascade,
  sub_type    text not null,   -- 'owner' | 'customer'
  endpoint    text not null unique,
  p256dh      text not null,
  auth_key    text not null,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- LOYALTY TRACKING
-- ============================================================
create table if not exists loyalty (
  id              uuid primary key default uuid_generate_v4(),
  shop_id         uuid not null references shops(id) on delete cascade,
  device_fingerprint text not null,
  total_jobs      integer not null default 0,
  total_spent     numeric(10,2) not null default 0.00,
  discount_earned boolean not null default false,
  last_job_at     timestamptz,
  unique(shop_id, device_fingerprint)
);

-- ============================================================
-- INDEXES for performance
-- ============================================================
create index if not exists idx_jobs_shop_id        on jobs(shop_id);
create index if not exists idx_jobs_status         on jobs(job_status);
create index if not exists idx_jobs_token          on jobs(job_token);
create index if not exists idx_jobs_fingerprint    on jobs(device_fingerprint);
create index if not exists idx_jobs_created        on jobs(created_at desc);
create index if not exists idx_payments_job_id     on payments(job_id);
create index if not exists idx_deliveries_job_id   on deliveries(job_id);
create index if not exists idx_device_bans_fp      on device_bans(shop_id, fingerprint);
create index if not exists idx_push_subs_shop      on push_subscriptions(shop_id, sub_type);
create index if not exists idx_loyalty_fp          on loyalty(shop_id, device_fingerprint);

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Auto-increment job_number per shop
create or replace function next_job_number(p_shop_id uuid)
returns integer language plpgsql as $$
declare
  v_next integer;
begin
  select coalesce(max(job_number), 0) + 1
    into v_next
    from jobs
   where shop_id = p_shop_id;
  return v_next;
end;
$$;

-- Update updated_at on row change
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- TRIGGERS
-- ============================================================
create trigger trg_jobs_updated_at
  before update on jobs
  for each row execute function touch_updated_at();

create trigger trg_shops_updated_at
  before update on shops
  for each row execute function touch_updated_at();

create trigger trg_inventory_updated_at
  before update on inventory
  for each row execute function touch_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================
alter table shops             enable row level security;
alter table shop_owners       enable row level security;
alter table services          enable row level security;
alter table jobs              enable row level security;
alter table payments          enable row level security;
alter table inventory         enable row level security;
alter table deliveries        enable row level security;
alter table device_bans       enable row level security;
alter table job_throttle      enable row level security;
alter table push_subscriptions enable row level security;
alter table loyalty           enable row level security;

-- Helper: check if authenticated user owns a shop
create or replace function auth_owns_shop(p_shop_id uuid)
returns boolean language sql security definer as $$
  select exists (
    select 1 from shop_owners
    where shop_id = p_shop_id and user_id = auth.uid()
  );
$$;

-- SHOPS
create policy "Owners can view their shop"
  on shops for select using (auth_owns_shop(id));
create policy "Owners can update their shop"
  on shops for update using (auth_owns_shop(id));
create policy "Anyone can view active shop by slug"
  on shops for select using (is_active = true);

-- SHOP OWNERS
create policy "Owners can view their own record"
  on shop_owners for select using (user_id = auth.uid());

-- SERVICES — anyone can read active services (for order page)
create policy "Public can view active services"
  on services for select using (is_active = true);
create policy "Owners can manage services"
  on services for all using (auth_owns_shop(shop_id));

-- JOBS — students access via job_token; owners see all for their shop
create policy "Public can insert jobs"
  on jobs for insert with check (true);
create policy "Public can view own job by token"
  on jobs for select using (true);  -- filtered by job_token in app queries
create policy "Owners can view all shop jobs"
  on jobs for select using (auth_owns_shop(shop_id));
create policy "Owners can update jobs"
  on jobs for update using (auth_owns_shop(shop_id));

-- PAYMENTS
create policy "Public can insert payment record"
  on payments for insert with check (true);
create policy "Owners can view payments"
  on payments for select using (auth_owns_shop(shop_id));

-- INVENTORY
create policy "Owners can manage inventory"
  on inventory for all using (auth_owns_shop(shop_id));

-- DELIVERIES
create policy "Public can insert delivery"
  on deliveries for insert with check (true);
create policy "Owners can manage deliveries"
  on deliveries for all using (auth_owns_shop(shop_id));
create policy "Public can view delivery by job"
  on deliveries for select using (true); -- filtered by job_token in app

-- DEVICE BANS
create policy "Owners can manage bans"
  on device_bans for all using (auth_owns_shop(shop_id));
create policy "Public can read bans (to check own fingerprint)"
  on device_bans for select using (true);

-- JOB THROTTLE
create policy "Public can manage throttle"
  on job_throttle for all using (true);

-- PUSH SUBSCRIPTIONS
create policy "Anyone can subscribe"
  on push_subscriptions for insert with check (true);
create policy "Owners can view push subs"
  on push_subscriptions for select using (auth_owns_shop(shop_id));

-- LOYALTY
create policy "Anyone can read/upsert loyalty"
  on loyalty for all using (true);

-- ============================================================
-- SEED: Default services (13 categories)
-- These are templates; each shop gets their own copy on signup
-- ============================================================

-- NOTE: Run the seed per shop after creating a shop record.
-- Example seed function:
create or replace function seed_default_services(p_shop_id uuid)
returns void language plpgsql as $$
begin
  insert into services (shop_id, category, name, unit, unit_price, sort_order) values
    -- 1. Document & Copy
    (p_shop_id, 'document_copy', 'B&W Photocopy', 'per page', 2.00, 1),
    (p_shop_id, 'document_copy', 'Color Photocopy', 'per page', 10.00, 2),
    (p_shop_id, 'document_copy', 'Document Printing (B&W)', 'per page', 2.00, 3),
    (p_shop_id, 'document_copy', 'Document Printing (Color)', 'per page', 10.00, 4),
    (p_shop_id, 'document_copy', 'Resume / CV Printing', 'per page', 5.00, 5),
    (p_shop_id, 'document_copy', 'Thesis / Dissertation Printing', 'per page', 3.00, 6),
    (p_shop_id, 'document_copy', 'Scanning (to PDF/JPG)', 'per page', 5.00, 7),
    -- 2. Business Print
    (p_shop_id, 'business_print', 'Business Cards (Standard)', 'per 100 pcs', 250.00, 10),
    (p_shop_id, 'business_print', 'Letterheads', 'per page', 8.00, 11),
    (p_shop_id, 'business_print', 'Envelopes (Custom Printed)', 'per piece', 15.00, 12),
    -- 3. Marketing Materials
    (p_shop_id, 'marketing', 'Flyers (A4)', 'per piece', 15.00, 20),
    (p_shop_id, 'marketing', 'Brochures (Tri-fold)', 'per piece', 25.00, 21),
    (p_shop_id, 'marketing', 'Posters (A3)', 'per piece', 45.00, 22),
    (p_shop_id, 'marketing', 'Pull-up / Retractable Banner', 'per piece', 800.00, 23),
    -- 4. Large Format & Signage
    (p_shop_id, 'large_format', 'Tarpaulin Printing', 'per sqft', 35.00, 30),
    (p_shop_id, 'large_format', 'Vinyl Banner', 'per sqft', 45.00, 31),
    (p_shop_id, 'large_format', 'Sintra Board Sign', 'per sqft', 80.00, 32),
    (p_shop_id, 'large_format', 'Standee / Life-size Cutout', 'per piece', 1200.00, 33),
    -- 5. Book Binding
    (p_shop_id, 'binding', 'Spiral Binding', 'per book', 35.00, 40),
    (p_shop_id, 'binding', 'Comb Binding (GBC)', 'per book', 40.00, 41),
    (p_shop_id, 'binding', 'Perfect Binding', 'per book', 80.00, 42),
    (p_shop_id, 'binding', 'Hardbound Binding', 'per book', 350.00, 43),
    (p_shop_id, 'binding', 'Staple Binding', 'per book', 15.00, 44),
    -- 6. Lamination
    (p_shop_id, 'lamination', 'Lamination (Gloss, A4)', 'per page', 20.00, 50),
    (p_shop_id, 'lamination', 'Lamination (Matte, A4)', 'per page', 25.00, 51),
    (p_shop_id, 'lamination', 'Encapsulation (ID size)', 'per piece', 15.00, 52),
    -- 7. Finishing Services
    (p_shop_id, 'finishing', 'Die Cutting (Custom Shape)', 'per piece', 50.00, 60),
    (p_shop_id, 'finishing', 'Folding (Tri-fold)', 'per piece', 5.00, 61),
    (p_shop_id, 'finishing', 'Perforating (Tear-off)', 'per page', 5.00, 62),
    -- 8. Apparel & Textile
    (p_shop_id, 'apparel', 'Shirt Printing (Silkscreen)', 'per piece', 150.00, 70),
    (p_shop_id, 'apparel', 'Sublimation Printing (Shirt)', 'per piece', 200.00, 71),
    (p_shop_id, 'apparel', 'Heat Transfer Printing', 'per piece', 120.00, 72),
    (p_shop_id, 'apparel', 'Embroidery (Polo/Cap)', 'per piece', 250.00, 73),
    -- 9. Personalized / Novelty
    (p_shop_id, 'novelty', 'Mug / Tumbler Printing', 'per piece', 250.00, 80),
    (p_shop_id, 'novelty', 'Button Pins', 'per piece', 15.00, 81),
    (p_shop_id, 'novelty', 'Stickers / Decals', 'per piece', 10.00, 82),
    (p_shop_id, 'novelty', 'ID Cards (PVC)', 'per piece', 80.00, 83),
    (p_shop_id, 'novelty', 'Lanyards', 'per piece', 35.00, 84),
    -- 10. Photo Services
    (p_shop_id, 'photo', 'Photo Print (4R)', 'per piece', 20.00, 90),
    (p_shop_id, 'photo', 'Photo Print (8R)', 'per piece', 60.00, 91),
    (p_shop_id, 'photo', 'Passport / ID Photo (2x2)', 'per set', 40.00, 92),
    (p_shop_id, 'photo', 'Canvas Photo Printing', 'per piece', 350.00, 93),
    -- 11. Specialty / Advanced
    (p_shop_id, 'specialty', 'UV Flatbed Printing', 'per sqin', 25.00, 100),
    (p_shop_id, 'specialty', 'Laser Engraving', 'per piece', 200.00, 101),
    (p_shop_id, 'specialty', 'QR Code Printing', 'per piece', 10.00, 102),
    -- 12. Design Services
    (p_shop_id, 'design', 'Logo Design', 'per project', 500.00, 110),
    (p_shop_id, 'design', 'Layout & Typesetting', 'per page', 100.00, 111),
    (p_shop_id, 'design', 'Photo Editing & Retouching', 'per photo', 80.00, 112),
    -- 13. Value-Added Services
    (p_shop_id, 'value_added', 'Rush / Same-Day Printing', 'flat fee', 50.00, 120),
    (p_shop_id, 'value_added', 'Pickup & Delivery', 'flat fee', 80.00, 121),
    (p_shop_id, 'value_added', 'Print-on-Demand', 'per job', 30.00, 122)
  on conflict do nothing;
end;
$$;

-- ============================================================
-- GEOLOCATION: Find shops near coordinates
-- ============================================================
create or replace function get_shops_near(user_lat float8, user_lng float8, max_dist_meters float8 default 5000)
returns table (
  id uuid,
  name text,
  slug text,
  address text,
  lat float8,
  lng float8,
  specialties text[],
  distance_meters float8
) language sql stable as $$
  select 
    id, name, slug, address, lat, lng, specialties,
    st_distance(
      st_point(lng, lat)::geography, 
      st_point(user_lng, user_lat)::geography
    ) as distance_meters
  from shops
  where is_active = true
    and st_dwithin(
      st_point(lng, lat)::geography, 
      st_point(user_lng, user_lat)::geography,
      max_dist_meters
    )
  order by distance_meters asc;
$$;
