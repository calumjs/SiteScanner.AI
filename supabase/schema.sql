-- Enable pgcrypto extension
create extension if not exists "pgcrypto";

create table if not exists public.issues (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source_url text,
  title text not null,
  description text,
  manual_instructions text,
  status text not null default 'reported',
  pr_url text,
  error_message text,
  created_by uuid references auth.users(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  claimed_by text,
  claimed_at timestamptz
);

create index if not exists issues_status_created_at_idx
  on public.issues(status, created_at);

create or replace function public.moddatetime()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_issues_updated_at on public.issues;
create trigger set_issues_updated_at
before update on public.issues
for each row execute function public.moddatetime();

create or replace function public.set_issue_creator()
returns trigger as $$
begin
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_issue_creator_before_insert on public.issues;
create trigger set_issue_creator_before_insert
before insert on public.issues
for each row execute function public.set_issue_creator();

create or replace function public.claim_issue(worker_id text)
returns public.issues
language sql
as $$
  update public.issues
  set status = 'in_progress',
      claimed_by = worker_id,
      claimed_at = now()
  where id = (
    select id
    from public.issues
    where status = 'approved'
    order by created_at
    for update skip locked
    limit 1
  )
  returning *;
$$;

create or replace function public.approve_issue(issue_id uuid)
returns public.issues
language plpgsql
as $$
declare
  updated_issue public.issues;
begin
  update public.issues
  set status = 'approved',
      approved_by = auth.uid(),
      approved_at = now()
  where id = issue_id
  returning * into updated_issue;
  return updated_issue;
end;
$$;

create or replace function public.reject_issue(issue_id uuid)
returns public.issues
language plpgsql
as $$
declare
  updated_issue public.issues;
begin
  update public.issues
  set status = 'rejected'
  where id = issue_id
  returning * into updated_issue;
  return updated_issue;
end;
$$;

alter table public.issues enable row level security;

drop policy if exists "authenticated can select issues" on public.issues;
create policy "portal select issues"
on public.issues
for select
using (auth.role() = 'authenticated' or auth.role() = 'anon');

drop policy if exists "portal insert issues" on public.issues;
create policy "portal insert issues"
on public.issues
for insert
with check (auth.role() = 'authenticated' or auth.role() = 'anon');

drop policy if exists "portal update issues" on public.issues;
create policy "portal update issues"
on public.issues
for update
using (auth.role() = 'authenticated' or auth.role() = 'anon')
with check (auth.role() = 'authenticated' or auth.role() = 'anon');

