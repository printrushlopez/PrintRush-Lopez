-- ============================================================
-- Add Shop Applications Table & Storage
-- ============================================================

-- 1. Create the applications table
create table if not exists shop_applications (
  id uuid primary key default uuid_generate_v4(),
  shop_name text not null,
  slug text not null unique,
  owner_email text not null,
  owner_phone text,
  address text,
  lat float8,
  lng float8,
  plan text not null default 'basic',
  proof_of_payment_url text,
  payment_status text not null default 'pending', -- 'pending' | 'paid'
  status text not null default 'pending',         -- 'pending' | 'approved' | 'rejected'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Add trigger for updated_at
create trigger trg_shop_applications_updated_at
  before update on shop_applications
  for each row execute function touch_updated_at();

-- 3. RLS Policies
alter table shop_applications enable row level security;

-- Public can insert new applications (so anyone can apply)
create policy "Public can insert applications"
  on shop_applications for insert with check (true);

-- Admins can read all applications
create policy "Admins can view applications"
  on shop_applications for select using (
    exists (select 1 from platform_admins where user_id = auth.uid())
  );

-- Admins can update applications (to approve/reject)
create policy "Admins can update applications"
  on shop_applications for update using (
    exists (select 1 from platform_admins where user_id = auth.uid())
  );

-- 4. Storage Bucket for Proof of Payments
insert into storage.buckets (id, name, public) 
values ('applications', 'applications', true)
on conflict (id) do nothing;

create policy "Anyone can upload proof of payment"
  on storage.objects for insert with check ( bucket_id = 'applications' );

create policy "Admins can view proof of payments"
  on storage.objects for select using ( bucket_id = 'applications' );
