-- ══════════════════════════════════════════════════════
-- FinanceTracker — Run this ONCE in Supabase SQL Editor
-- ══════════════════════════════════════════════════════

-- App config (hCaptcha sitekey etc.)
create table if not exists public.app_config (
  key text primary key,
  value text not null,
  updated_at timestamptz default now()
);
alter table public.app_config enable row level security;
drop policy if exists "app_config: public read"     on public.app_config;
drop policy if exists "app_config: no public write" on public.app_config;
create policy "app_config: public read"     on public.app_config for select using (true);
create policy "app_config: no public write" on public.app_config for all    using (false);
insert into public.app_config (key, value)
  values ('hcaptcha_sitekey', '10000000-ffff-ffff-ffff-000000000001')
  on conflict (key) do nothing;

-- Profiles
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text,
  role text default 'member',
  created_at timestamptz default now()
);

-- Transactions
create table if not exists public.transactions (
  id bigserial primary key,
  user_id uuid references auth.users on delete cascade not null,
  type text not null,
  date date not null,
  amount numeric(14,2) not null,
  category text,
  note text,
  created_at timestamptz default now()
);

-- Investments (with extra_data and maturity_date)
create table if not exists public.investments (
  id bigserial primary key,
  user_id uuid references auth.users on delete cascade not null,
  asset_type text not null,
  name text not null,
  amount_invested numeric(14,2) not null,
  current_value numeric(14,2) not null,
  units numeric(18,6) default 0,
  avg_price numeric(14,4) default 0,
  purchase_date date,
  maturity_date date,
  extra_data jsonb default '{}',
  created_at timestamptz default now()
);

-- Add maturity_date and extra_data to existing investments table if upgrading
alter table public.investments add column if not exists maturity_date date;
alter table public.investments add column if not exists extra_data jsonb default '{}';

-- Salary profiles
create table if not exists public.salary_profiles (
  id bigserial primary key,
  user_id uuid references auth.users on delete cascade not null unique,
  employer text,
  designation text,
  frequency text default 'monthly',
  financial_year text default '2025-26',
  created_at timestamptz default now()
);

-- Salary components (earnings + deductions)
create table if not exists public.salary_components (
  id bigserial primary key,
  user_id uuid references auth.users on delete cascade not null,
  kind text not null,         -- 'earning' or 'deduction'
  name text not null,
  amount_monthly numeric(14,2) not null,
  taxable text,               -- 'yes', 'partial', 'no' (for earnings)
  section text,               -- '80C', '80D', 'TDS', etc. (for deductions)
  note text,
  created_at timestamptz default now()
);

-- Enable RLS on all tables
alter table public.profiles          enable row level security;
alter table public.transactions      enable row level security;
alter table public.investments       enable row level security;
alter table public.salary_profiles   enable row level security;
alter table public.salary_components enable row level security;

-- Drop old policies first (safe to run even if they don't exist)
drop policy if exists "profiles: own row"          on public.profiles;
drop policy if exists "transactions: own rows"     on public.transactions;
drop policy if exists "investments: own rows"      on public.investments;
drop policy if exists "salary_profiles: own row"   on public.salary_profiles;
drop policy if exists "salary_components: own rows" on public.salary_components;

-- Create RLS policies
create policy "profiles: own row"           on public.profiles          for all using (auth.uid() = id);
create policy "transactions: own rows"      on public.transactions      for all using (auth.uid() = user_id);
create policy "investments: own rows"       on public.investments       for all using (auth.uid() = user_id);
create policy "salary_profiles: own row"    on public.salary_profiles   for all using (auth.uid() = user_id);
create policy "salary_components: own rows" on public.salary_components for all using (auth.uid() = user_id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    coalesce(new.raw_user_meta_data->>'role', 'member')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
