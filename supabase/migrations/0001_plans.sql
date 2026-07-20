-- Cloud sync schema (D31): one row per user holding the whole validated export
-- envelope as jsonb. Row-level security is the entire authorization model — the
-- browser talks to Supabase directly with the public key; these policies are what
-- make each user's document private.

create table if not exists public.plans (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.plans enable row level security;

create policy "plans_select_own" on public.plans
  for select using (auth.uid() = user_id);

create policy "plans_insert_own" on public.plans
  for insert with check (auth.uid() = user_id);

create policy "plans_update_own" on public.plans
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "plans_delete_own" on public.plans
  for delete using (auth.uid() = user_id);
