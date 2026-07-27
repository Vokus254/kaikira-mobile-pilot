-- LUMINA Phase 2: additive role-profile and project substitution schema.

alter table public.project_members
  add column if not exists cockpit_profile text,
  add column if not exists can_view_all_tasks boolean not null default false;

create or replace function private.cockpit_profile_for_project_role(input_role text)
returns text
language sql
immutable
set search_path to ''
as $function$
  select case
    when lower(btrim(input_role)) in ('cfo', 'geschäftsführung', 'geschaeftsfuehrung', 'cfo / geschäftsführung', 'cfo / geschaeftsfuehrung') then 'cfo'
    when lower(btrim(input_role)) in ('projektleitung abschluss', 'projektleitung jahresabschluss') then 'project'
    when lower(btrim(input_role)) in ('leiter rechnungswesen', 'leitung rechnungswesen') then 'accounting_lead'
    when lower(btrim(input_role)) in (
      'bilanzbuchhaltung', 'controlling', 'externe beratung', 'it',
      'investor relations', 'konsolidierung', 'nachhaltigkeit',
      'personal / hr', 'personal/hr', 'recht', 'steuern', 'treasury',
      'wirtschaftsprüfung', 'wirtschaftspruefung'
    ) then 'worker'
    else null
  end;
$function$;

revoke all on function private.cockpit_profile_for_project_role(text) from public, anon, authenticated, service_role;

do $constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.project_members'::regclass
      and conname = 'project_members_cockpit_profile_check'
  ) then
    alter table public.project_members
      add constraint project_members_cockpit_profile_check
      check (cockpit_profile is null or cockpit_profile in ('cfo', 'project', 'accounting_lead', 'worker'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.project_members'::regclass
      and conname = 'project_members_project_id_id_key'
  ) then
    alter table public.project_members
      add constraint project_members_project_id_id_key unique (project_id, id);
  end if;
end;
$constraints$;

update public.project_members
set cockpit_profile = private.cockpit_profile_for_project_role(project_role)
where cockpit_profile is null;

update public.project_members
set can_view_all_tasks = true
where cockpit_profile in ('cfo', 'project', 'accounting_lead')
  and can_view_all_tasks = false;

create index if not exists idx_project_members_active_user_project
  on public.project_members (user_id, project_id)
  where invitation_status = 'accepted' and user_id is not null;

create index if not exists idx_project_members_cockpit_profile
  on public.project_members (project_id, cockpit_profile)
  where cockpit_profile is not null;

create table if not exists public.project_member_substitutions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  principal_member_id uuid not null,
  substitute_member_id uuid not null,
  status text not null default 'pending',
  valid_from timestamptz,
  valid_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_member_substitutions_status_check
    check (status in ('pending', 'active', 'inactive', 'declined', 'expired')),
  constraint project_member_substitutions_distinct_members_check
    check (principal_member_id <> substitute_member_id),
  constraint project_member_substitutions_valid_range_check
    check (valid_from is null or valid_until is null or valid_until > valid_from),
  constraint project_member_substitutions_principal_project_fkey
    foreign key (project_id, principal_member_id)
    references public.project_members(project_id, id) on delete cascade,
  constraint project_member_substitutions_substitute_project_fkey
    foreign key (project_id, substitute_member_id)
    references public.project_members(project_id, id) on delete cascade
);

create unique index if not exists project_member_substitutions_active_relation_key
  on public.project_member_substitutions (project_id, principal_member_id, substitute_member_id)
  where status = 'active';
create index if not exists idx_project_member_substitutions_project_status
  on public.project_member_substitutions (project_id, status);
create index if not exists idx_project_member_substitutions_principal
  on public.project_member_substitutions (principal_member_id, status);
create index if not exists idx_project_member_substitutions_substitute
  on public.project_member_substitutions (substitute_member_id, status);

drop trigger if exists project_member_substitutions_set_updated_at on public.project_member_substitutions;
create trigger project_member_substitutions_set_updated_at
before update on public.project_member_substitutions
for each row execute function public.set_updated_at();

alter table public.project_member_substitutions enable row level security;

revoke all on table public.project_member_substitutions from public, anon, authenticated;
grant select on table public.project_member_substitutions to authenticated;
grant all on table public.project_member_substitutions to service_role;
