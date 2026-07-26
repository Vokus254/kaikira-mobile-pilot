-- LUMINA Phase 1A: schema-only baseline captured from the linked remote project.
-- Source project ref: mslbzypjtvvznyewupco; captured 2026-07-26.
-- Contains schema metadata only. No business rows or secrets are included.
-- IMPORTANT: for migration-from-zero only. Do not push to the existing remote
-- until the separately documented migration-history plan has been approved.

set search_path = public, extensions;

do $baseline_guard$
begin
  if to_regclass('public.companies') is not null then
    raise exception 'Phase-1A baseline requires an empty application schema; existing remote is intentionally protected';
  end if;
end;
$baseline_guard$;

create schema if not exists public;

create table public."companies" (
  "id" uuid default gen_random_uuid() not null,
  "name" text not null,
  "created_by" uuid default auth.uid() not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."documents" (
  "id" uuid default gen_random_uuid() not null,
  "project_id" uuid not null,
  "task_id" uuid not null,
  "folder_id" uuid,
  "storage_bucket" text default 'lumina-datarooms'::text not null,
  "storage_path" text not null,
  "file_name" text not null,
  "mime_type" text,
  "file_size" bigint,
  "version_number" integer default 1 not null,
  "document_status" text default 'uploaded'::text not null,
  "uploaded_by" uuid,
  "uploaded_at" timestamp with time zone default now() not null,
  "version_no" integer default 1 not null,
  "document_type" text,
  "description" text,
  "archived_at" timestamp with time zone
);

create table public."project_members" (
  "id" uuid default gen_random_uuid() not null,
  "project_id" uuid not null,
  "user_id" uuid,
  "name" text not null,
  "email" text not null,
  "project_role" text not null,
  "deputy_name" text,
  "deputy_email" text,
  "access_level" text default 'member'::text not null,
  "can_read" boolean default true not null,
  "can_upload" boolean default true not null,
  "can_edit" boolean default false not null,
  "can_approve" boolean default false not null,
  "can_manage_members" boolean default false not null,
  "invitation_status" text default 'pending'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."projects" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "name" text not null,
  "accounting_standard" text,
  "closing_scope" text,
  "legal_form" text,
  "number_of_entities" integer default 1 not null,
  "closing_date" date,
  "book_close_date" date,
  "draft_date" date,
  "audit_start_date" date,
  "signing_date" date,
  "disclosure_date" date,
  "size_class_previous" text,
  "size_class_current" text,
  "effective_size_class" text,
  "special_scope" jsonb default '[]'::jsonb not null,
  "report_components" jsonb default '[]'::jsonb not null,
  "systems" jsonb default '{}'::jsonb not null,
  "risks" jsonb default '[]'::jsonb not null,
  "status" text default 'draft'::text not null,
  "approved_by_name" text,
  "approved_by_role" text,
  "approved_at" timestamp with time zone,
  "approval_comment" text,
  "rooms_confirmed_at" timestamp with time zone,
  "created_by" uuid default auth.uid() not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."task_activity_events" (
  "id" uuid default gen_random_uuid() not null,
  "task_id" uuid not null,
  "project_id" uuid not null,
  "event_type" text not null,
  "message" text not null,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_by" uuid,
  "actor_name" text,
  "created_at" timestamp with time zone default now() not null
);

create table public."task_approvals" (
  "id" uuid default gen_random_uuid() not null,
  "task_id" uuid not null,
  "project_id" uuid not null,
  "step_name" text not null,
  "responsible_role" text,
  "responsible_user_id" uuid,
  "status" text default 'pending'::text not null,
  "sort_order" integer default 1 not null,
  "comment" text,
  "created_by" uuid default auth.uid() not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "decided_by" uuid,
  "decided_at" timestamp with time zone
);

create table public."task_comments" (
  "id" uuid default gen_random_uuid() not null,
  "task_id" uuid not null,
  "document_id" uuid,
  "user_id" uuid,
  "author_name" text,
  "author_type" text default 'human'::text not null,
  "comment_type" text default 'comment'::text not null,
  "message" text not null,
  "created_at" timestamp with time zone default now() not null,
  "recipient" text
);

create table public."task_notifications" (
  "id" uuid default gen_random_uuid() not null,
  "project_id" uuid not null,
  "task_id" uuid,
  "recipient_name" text,
  "recipient_email" text not null,
  "notification_type" text default 'task_assignment'::text not null,
  "subject" text,
  "delivery_status" text default 'prepared'::text not null,
  "sent_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null
);

create table public."task_responses" (
  "id" uuid default gen_random_uuid() not null,
  "task_id" uuid not null,
  "user_id" uuid,
  "response_type" text not null,
  "message" text,
  "created_at" timestamp with time zone default now() not null
);

create table public."task_review_notes" (
  "id" uuid default gen_random_uuid() not null,
  "task_id" uuid not null,
  "project_id" uuid not null,
  "note_number" text,
  "title" text not null,
  "description" text not null,
  "source_type" text default 'human'::text not null,
  "priority" text default 'medium'::text not null,
  "status" text default 'open'::text not null,
  "assigned_to" uuid,
  "due_date" date,
  "created_by" uuid default auth.uid() not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "resolved_at" timestamp with time zone
);

create table public."task_room_folders" (
  "id" uuid default gen_random_uuid() not null,
  "task_room_id" uuid not null,
  "folder_number" integer not null,
  "folder_code" text,
  "folder_name" text not null,
  "can_member_upload" boolean default true not null,
  "can_auditor_read" boolean default false not null,
  "created_at" timestamp with time zone default now() not null
);

create table public."task_rooms" (
  "id" uuid default gen_random_uuid() not null,
  "task_id" uuid not null,
  "room_name" text not null,
  "room_status" text default 'draft'::text not null,
  "confirmed_by" uuid,
  "confirmed_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."tasks" (
  "id" uuid default gen_random_uuid() not null,
  "project_id" uuid not null,
  "technical_id" text not null,
  "task_number" integer,
  "phase" text,
  "title" text not null,
  "description" text,
  "standard_role" text,
  "responsible_member_id" uuid,
  "responsible_name" text,
  "responsible_email" text,
  "deputy_name" text,
  "deputy_email" text,
  "due_date" date,
  "status" text default 'planned'::text not null,
  "date_anchor" text,
  "date_offset_days" integer,
  "is_custom" boolean default false not null,
  "accepted_at" timestamp with time zone,
  "declined_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

alter table only public."companies" add constraint "companies_pkey" PRIMARY KEY (id);
alter table only public."documents" add constraint "documents_pkey" PRIMARY KEY (id);
alter table only public."documents" add constraint "documents_storage_bucket_storage_path_key" UNIQUE (storage_bucket, storage_path);
alter table only public."documents" add constraint "documents_document_status_check" CHECK (document_status = ANY (ARRAY['uploaded'::text, 'in_review'::text, 'approved'::text, 'rejected'::text, 'superseded'::text, 'final'::text]));
alter table only public."project_members" add constraint "project_members_pkey" PRIMARY KEY (id);
alter table only public."project_members" add constraint "project_members_access_level_check" CHECK (access_level = ANY (ARRAY['admin'::text, 'cfo'::text, 'manager'::text, 'member'::text, 'advisor'::text, 'auditor'::text, 'viewer'::text]));
alter table only public."project_members" add constraint "project_members_invitation_status_check" CHECK (invitation_status = ANY (ARRAY['pending'::text, 'invited'::text, 'accepted'::text, 'declined'::text, 'inactive'::text]));
alter table only public."projects" add constraint "projects_pkey" PRIMARY KEY (id);
alter table only public."projects" add constraint "projects_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'review'::text, 'approved'::text, 'rooms_ready'::text, 'active'::text, 'completed'::text, 'archived'::text]));
alter table only public."task_activity_events" add constraint "task_activity_events_pkey" PRIMARY KEY (id);
alter table only public."task_approvals" add constraint "task_approvals_pkey" PRIMARY KEY (id);
alter table only public."task_approvals" add constraint "task_approvals_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'in_review'::text, 'approved'::text, 'rejected'::text]));
alter table only public."task_comments" add constraint "task_comments_pkey" PRIMARY KEY (id);
alter table only public."task_comments" add constraint "task_comments_author_type_check" CHECK (author_type = ANY (ARRAY['human'::text, 'volker'::text, 'kai'::text, 'kira'::text, 'system'::text]));
alter table only public."task_comments" add constraint "task_comments_comment_type_check" CHECK (comment_type = ANY (ARRAY['comment'::text, 'question'::text, 'answer'::text, 'reminder'::text, 'review'::text, 'approval'::text, 'rejection'::text, 'system'::text]));
alter table only public."task_notifications" add constraint "task_notifications_pkey" PRIMARY KEY (id);
alter table only public."task_notifications" add constraint "task_notifications_delivery_status_check" CHECK (delivery_status = ANY (ARRAY['prepared'::text, 'sent'::text, 'delivered'::text, 'failed'::text, 'opened'::text]));
alter table only public."task_responses" add constraint "task_responses_pkey" PRIMARY KEY (id);
alter table only public."task_responses" add constraint "task_responses_response_type_check" CHECK (response_type = ANY (ARRAY['accepted'::text, 'declined'::text, 'question'::text, 'submitted'::text, 'approved'::text, 'rejected'::text]));
alter table only public."task_review_notes" add constraint "task_review_notes_pkey" PRIMARY KEY (id);
alter table only public."task_review_notes" add constraint "task_review_notes_priority_check" CHECK (priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text]));
alter table only public."task_review_notes" add constraint "task_review_notes_source_type_check" CHECK (source_type = ANY (ARRAY['human'::text, 'auditor'::text, 'kira'::text, 'admin'::text, 'kai'::text]));
alter table only public."task_review_notes" add constraint "task_review_notes_status_check" CHECK (status = ANY (ARRAY['open'::text, 'in_progress'::text, 'answered'::text, 'recheck'::text, 'resolved'::text, 'closed'::text]));
alter table only public."task_room_folders" add constraint "task_room_folders_pkey" PRIMARY KEY (id);
alter table only public."task_room_folders" add constraint "task_room_folders_task_room_id_folder_number_key" UNIQUE (task_room_id, folder_number);
alter table only public."task_rooms" add constraint "task_rooms_pkey" PRIMARY KEY (id);
alter table only public."task_rooms" add constraint "task_rooms_task_id_key" UNIQUE (task_id);
alter table only public."task_rooms" add constraint "task_rooms_room_status_check" CHECK (room_status = ANY (ARRAY['draft'::text, 'ready'::text, 'active'::text, 'locked'::text, 'archived'::text]));
alter table only public."tasks" add constraint "tasks_pkey" PRIMARY KEY (id);
alter table only public."tasks" add constraint "tasks_project_id_technical_id_key" UNIQUE (project_id, technical_id);
alter table only public."tasks" add constraint "tasks_status_check" CHECK (status = ANY (ARRAY['planned'::text, 'invited'::text, 'accepted'::text, 'declined'::text, 'in_progress'::text, 'question'::text, 'blocked'::text, 'submitted'::text, 'in_review'::text, 'approved'::text, 'completed'::text]));

alter table only public."companies" add constraint "companies_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table only public."documents" add constraint "documents_folder_id_fkey" FOREIGN KEY (folder_id) REFERENCES task_room_folders(id) ON DELETE SET NULL;
alter table only public."documents" add constraint "documents_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
alter table only public."documents" add constraint "documents_task_id_fkey" FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;
alter table only public."documents" add constraint "documents_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table only public."project_members" add constraint "project_members_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
alter table only public."project_members" add constraint "project_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table only public."projects" add constraint "projects_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."projects" add constraint "projects_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table only public."task_activity_events" add constraint "task_activity_events_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table only public."task_activity_events" add constraint "task_activity_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
alter table only public."task_activity_events" add constraint "task_activity_events_task_id_fkey" FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;
alter table only public."task_approvals" add constraint "task_approvals_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table only public."task_approvals" add constraint "task_approvals_decided_by_fkey" FOREIGN KEY (decided_by) REFERENCES auth.users(id);
alter table only public."task_approvals" add constraint "task_approvals_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
alter table only public."task_approvals" add constraint "task_approvals_responsible_user_id_fkey" FOREIGN KEY (responsible_user_id) REFERENCES auth.users(id);
alter table only public."task_approvals" add constraint "task_approvals_task_id_fkey" FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;
alter table only public."task_comments" add constraint "task_comments_document_id_fkey" FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL;
alter table only public."task_comments" add constraint "task_comments_task_id_fkey" FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;
alter table only public."task_comments" add constraint "task_comments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table only public."task_notifications" add constraint "task_notifications_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
alter table only public."task_notifications" add constraint "task_notifications_task_id_fkey" FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;
alter table only public."task_responses" add constraint "task_responses_task_id_fkey" FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;
alter table only public."task_responses" add constraint "task_responses_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table only public."task_review_notes" add constraint "task_review_notes_assigned_to_fkey" FOREIGN KEY (assigned_to) REFERENCES auth.users(id);
alter table only public."task_review_notes" add constraint "task_review_notes_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table only public."task_review_notes" add constraint "task_review_notes_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
alter table only public."task_review_notes" add constraint "task_review_notes_task_id_fkey" FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;
alter table only public."task_room_folders" add constraint "task_room_folders_task_room_id_fkey" FOREIGN KEY (task_room_id) REFERENCES task_rooms(id) ON DELETE CASCADE;
alter table only public."task_rooms" add constraint "task_rooms_confirmed_by_fkey" FOREIGN KEY (confirmed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table only public."task_rooms" add constraint "task_rooms_task_id_fkey" FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;
alter table only public."tasks" add constraint "tasks_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
alter table only public."tasks" add constraint "tasks_responsible_member_id_fkey" FOREIGN KEY (responsible_member_id) REFERENCES project_members(id) ON DELETE SET NULL;

CREATE INDEX idx_documents_folder ON public.documents USING btree (folder_id);
CREATE INDEX idx_documents_project ON public.documents USING btree (project_id);
CREATE INDEX idx_documents_task ON public.documents USING btree (task_id);
CREATE INDEX idx_project_members_email ON public.project_members USING btree (lower(email));
CREATE INDEX idx_project_members_project ON public.project_members USING btree (project_id);
CREATE INDEX idx_project_members_user ON public.project_members USING btree (user_id);
CREATE UNIQUE INDEX project_members_project_email_role_key ON public.project_members USING btree (project_id, lower(email), project_role);
CREATE INDEX idx_projects_company ON public.projects USING btree (company_id);
CREATE INDEX idx_projects_created_by ON public.projects USING btree (created_by);
CREATE UNIQUE INDEX projects_name_unique_ci ON public.projects USING btree (lower(btrim(name)));
CREATE INDEX task_activity_events_task_idx ON public.task_activity_events USING btree (task_id, created_at DESC);
CREATE INDEX task_approvals_task_idx ON public.task_approvals USING btree (task_id, sort_order);
CREATE INDEX idx_task_comments_task ON public.task_comments USING btree (task_id);
CREATE INDEX idx_task_notifications_project ON public.task_notifications USING btree (project_id);
CREATE INDEX idx_task_responses_task ON public.task_responses USING btree (task_id);
CREATE INDEX task_review_notes_task_idx ON public.task_review_notes USING btree (task_id, status, created_at DESC);
CREATE INDEX idx_task_room_folders_room ON public.task_room_folders USING btree (task_room_id);
CREATE INDEX idx_task_rooms_task ON public.task_rooms USING btree (task_id);
CREATE INDEX idx_tasks_due_date ON public.tasks USING btree (due_date);
CREATE INDEX idx_tasks_project ON public.tasks USING btree (project_id);
CREATE INDEX idx_tasks_responsible_email ON public.tasks USING btree (lower(responsible_email));
CREATE INDEX idx_tasks_responsible_member ON public.tasks USING btree (responsible_member_id);

create schema if not exists private;
revoke all on schema private from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.current_user_email()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select lower(
    coalesce(
      (select auth.jwt()) ->> 'email',
      ''
    )
  );
$function$;

CREATE OR REPLACE FUNCTION private.is_project_member(target_project_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.project_members pm
    where pm.project_id = target_project_id
      and pm.invitation_status <> 'inactive'
      and (
        pm.user_id = (select auth.uid())
        or lower(pm.email) = private.current_user_email()
        or lower(coalesce(pm.deputy_email, ''))
           = private.current_user_email()
      )
  );
$function$;

CREATE OR REPLACE FUNCTION private.is_project_owner(target_project_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.projects p
    where p.id = target_project_id
      and p.created_by = (select auth.uid())
  );
$function$;

CREATE OR REPLACE FUNCTION private.can_manage_project(target_project_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    private.is_project_owner(target_project_id)
    or exists (
      select 1
      from public.project_members pm
      where pm.project_id = target_project_id
        and (
          pm.user_id = (select auth.uid())
          or lower(pm.email) = private.current_user_email()
        )
        and (
          pm.access_level in ('admin', 'cfo', 'manager')
          or pm.can_manage_members = true
        )
    );
$function$;

CREATE OR REPLACE FUNCTION private.can_access_task(target_task_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.tasks t
    where t.id = target_task_id
      and (
        private.is_project_member(t.project_id)
        or private.is_project_owner(t.project_id)
        or lower(coalesce(t.responsible_email, ''))
           = private.current_user_email()
        or lower(coalesce(t.deputy_email, ''))
           = private.current_user_email()
      )
  );
$function$;

CREATE OR REPLACE FUNCTION private.can_edit_task(target_task_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.tasks t
    where t.id = target_task_id
      and (
        private.can_manage_project(t.project_id)
        or lower(coalesce(t.responsible_email, ''))
           = private.current_user_email()
        or lower(coalesce(t.deputy_email, ''))
           = private.current_user_email()
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.normalize_project_name()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.name := btrim(new.name);

  if new.name is null or new.name = '' then
    raise exception 'Ein Projektname ist erforderlich.'
      using errcode = '23514';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.project_name_available(p_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    p_name is not null
    and btrim(p_name) <> ''
    and not exists (
      select 1
      from public.projects
      where lower(btrim(name)) = lower(btrim(p_name))
    );
$function$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

CREATE TRIGGER companies_set_updated_at BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER project_members_set_updated_at BEFORE UPDATE ON project_members FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER projects_set_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_normalize_project_name BEFORE INSERT OR UPDATE OF name ON projects FOR EACH ROW EXECUTE FUNCTION normalize_project_name();
CREATE TRIGGER task_rooms_set_updated_at BEFORE UPDATE ON task_rooms FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER tasks_set_updated_at BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION set_updated_at();

alter table public."companies" enable row level security;
alter table public."documents" enable row level security;
alter table public."project_members" enable row level security;
alter table public."projects" enable row level security;
alter table public."task_activity_events" enable row level security;
alter table public."task_approvals" enable row level security;
alter table public."task_comments" enable row level security;
alter table public."task_notifications" enable row level security;
alter table public."task_responses" enable row level security;
alter table public."task_review_notes" enable row level security;
alter table public."task_room_folders" enable row level security;
alter table public."task_rooms" enable row level security;
alter table public."tasks" enable row level security;

create policy "Benutzer legen eigene Unternehmen an" on "public"."companies" as permissive for insert to "authenticated" with check (((( SELECT auth.uid() AS uid) IS NOT NULL) AND (created_by = ( SELECT auth.uid() AS uid))));
create policy "Eigentümer sehen Unternehmen" on "public"."companies" as permissive for select to "authenticated" using ((created_by = ( SELECT auth.uid() AS uid)));
create policy "Ersteller ändern Unternehmen" on "public"."companies" as permissive for update to "authenticated" using ((created_by = ( SELECT auth.uid() AS uid))) with check ((created_by = ( SELECT auth.uid() AS uid)));
create policy "Berechtigte legen Dokumentmetadaten an" on "public"."documents" as permissive for insert to "authenticated" with check ((private.can_edit_task(task_id) AND (uploaded_by = ( SELECT auth.uid() AS uid))));
create policy "Berechtigte löschen Dokumentmetadaten" on "public"."documents" as permissive for delete to "authenticated" using (private.can_edit_task(task_id));
create policy "Berechtigte sehen Dokumentmetadaten" on "public"."documents" as permissive for select to "authenticated" using (private.can_access_task(task_id));
create policy "Berechtigte ändern Dokumentmetadaten" on "public"."documents" as permissive for update to "authenticated" using (private.can_edit_task(task_id)) with check (private.can_edit_task(task_id));
create policy "Testzugriff Dokumente anlegen" on "public"."documents" as permissive for insert to "anon", "authenticated" with check (true);
create policy "Testzugriff Dokumente lesen" on "public"."documents" as permissive for select to "anon", "authenticated" using (true);
create policy "Eigentümer und Mitglieder sehen Projektteam" on "public"."project_members" as permissive for select to "authenticated" using ((( SELECT private.is_project_owner(project_members.project_id) AS is_project_owner) OR (user_id = ( SELECT auth.uid() AS uid)) OR (lower(email) = private.current_user_email()) OR (lower(COALESCE(deputy_email, ''::text)) = private.current_user_email())));
create policy "Projektverwalter entfernen Mitglieder" on "public"."project_members" as permissive for delete to "authenticated" using (( SELECT private.can_manage_project(project_members.project_id) AS can_manage_project));
create policy "Projektverwalter legen Mitglieder an" on "public"."project_members" as permissive for insert to "authenticated" with check (( SELECT private.can_manage_project(project_members.project_id) AS can_manage_project));
create policy "Projektverwalter ändern Mitglieder" on "public"."project_members" as permissive for update to "authenticated" using (( SELECT private.can_manage_project(project_members.project_id) AS can_manage_project)) with check (( SELECT private.can_manage_project(project_members.project_id) AS can_manage_project));
create policy "Benutzer legen Projekte für eigene Unternehmen an" on "public"."projects" as permissive for insert to "authenticated" with check (((created_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM companies c
  WHERE ((c.id = projects.company_id) AND (c.created_by = ( SELECT auth.uid() AS uid)))))));
create policy "Eigentümer und Mitglieder sehen Projekte" on "public"."projects" as permissive for select to "authenticated" using (((created_by = ( SELECT auth.uid() AS uid)) OR ( SELECT private.is_project_member(projects.id) AS is_project_member)));
create policy "Projektersteller löschen Projekte" on "public"."projects" as permissive for delete to "authenticated" using ((created_by = ( SELECT auth.uid() AS uid)));
create policy "Projektverwalter ändern Projekte" on "public"."projects" as permissive for update to "authenticated" using (((created_by = ( SELECT auth.uid() AS uid)) OR ( SELECT private.can_manage_project(projects.id) AS can_manage_project))) with check (((created_by = ( SELECT auth.uid() AS uid)) OR ( SELECT private.can_manage_project(projects.id) AS can_manage_project)));
create policy "Projektmitglieder protokollieren Aktivitäten" on "public"."task_activity_events" as permissive for insert to "authenticated" with check (((created_by = auth.uid()) AND (private.is_project_member(project_id) OR private.is_project_owner(project_id))));
create policy "Projektmitglieder sehen Aktivitäten" on "public"."task_activity_events" as permissive for select to "authenticated" using ((private.is_project_member(project_id) OR private.is_project_owner(project_id)));
create policy "Berechtigte entscheiden Freigaben" on "public"."task_approvals" as permissive for update to "authenticated" using (((responsible_user_id = auth.uid()) OR private.can_manage_project(project_id) OR private.is_project_owner(project_id))) with check (((responsible_user_id = auth.uid()) OR private.can_manage_project(project_id) OR private.is_project_owner(project_id)));
create policy "Projektmitglieder sehen Freigaben" on "public"."task_approvals" as permissive for select to "authenticated" using ((private.is_project_member(project_id) OR private.is_project_owner(project_id)));
create policy "Projektverwalter legen Freigaben an" on "public"."task_approvals" as permissive for insert to "authenticated" with check (((created_by = auth.uid()) AND (private.can_manage_project(project_id) OR private.is_project_owner(project_id))));
create policy "Projektverwalter löschen Freigaben" on "public"."task_approvals" as permissive for delete to "authenticated" using ((private.can_manage_project(project_id) OR private.is_project_owner(project_id)));
create policy "Berechtigte erfassen Kommentare" on "public"."task_comments" as permissive for insert to "authenticated" with check ((private.can_access_task(task_id) AND ((user_id = ( SELECT auth.uid() AS uid)) OR (author_type = ANY (ARRAY['kai'::text, 'kira'::text, 'system'::text])))));
create policy "Berechtigte sehen Kommentare" on "public"."task_comments" as permissive for select to "authenticated" using (private.can_access_task(task_id));
create policy "Testzugriff Kommentare anlegen" on "public"."task_comments" as permissive for insert to "anon", "authenticated" with check (true);
create policy "Projektverwalter legen Versandprotokoll an" on "public"."task_notifications" as permissive for insert to "authenticated" with check (private.can_manage_project(project_id));
create policy "Projektverwalter sehen Versandprotokoll" on "public"."task_notifications" as permissive for select to "authenticated" using ((private.can_manage_project(project_id) OR (lower(recipient_email) = private.current_user_email())));
create policy "Projektverwalter ändern Versandprotokoll" on "public"."task_notifications" as permissive for update to "authenticated" using (private.can_manage_project(project_id)) with check (private.can_manage_project(project_id));
create policy "Berechtigte erfassen Aufgabenreaktionen" on "public"."task_responses" as permissive for insert to "authenticated" with check (((user_id = ( SELECT auth.uid() AS uid)) AND private.can_access_task(task_id)));
create policy "Berechtigte sehen Aufgabenreaktionen" on "public"."task_responses" as permissive for select to "authenticated" using (private.can_access_task(task_id));
create policy "Testzugriff Antworten anlegen" on "public"."task_responses" as permissive for insert to "anon", "authenticated" with check (true);
create policy "Projektmitglieder bearbeiten Review Notes" on "public"."task_review_notes" as permissive for update to "authenticated" using (((created_by = auth.uid()) OR (assigned_to = auth.uid()) OR private.can_manage_project(project_id))) with check (((created_by = auth.uid()) OR (assigned_to = auth.uid()) OR private.can_manage_project(project_id)));
create policy "Projektmitglieder legen Review Notes an" on "public"."task_review_notes" as permissive for insert to "authenticated" with check (((created_by = auth.uid()) AND (private.is_project_member(project_id) OR private.is_project_owner(project_id))));
create policy "Projektmitglieder sehen Review Notes" on "public"."task_review_notes" as permissive for select to "authenticated" using ((private.is_project_member(project_id) OR private.is_project_owner(project_id)));
create policy "Projektverwalter löschen Review Notes" on "public"."task_review_notes" as permissive for delete to "authenticated" using (private.can_manage_project(project_id));
create policy "Berechtigte legen Datenraumordner an" on "public"."task_room_folders" as permissive for insert to "authenticated" with check ((EXISTS ( SELECT 1
   FROM task_rooms tr
  WHERE ((tr.id = task_room_folders.task_room_id) AND private.can_edit_task(tr.task_id)))));
create policy "Berechtigte löschen Datenraumordner" on "public"."task_room_folders" as permissive for delete to "authenticated" using ((EXISTS ( SELECT 1
   FROM task_rooms tr
  WHERE ((tr.id = task_room_folders.task_room_id) AND private.can_edit_task(tr.task_id)))));
create policy "Berechtigte sehen Datenraumordner" on "public"."task_room_folders" as permissive for select to "authenticated" using ((EXISTS ( SELECT 1
   FROM task_rooms tr
  WHERE ((tr.id = task_room_folders.task_room_id) AND private.can_access_task(tr.task_id)))));
create policy "Berechtigte ändern Datenraumordner" on "public"."task_room_folders" as permissive for update to "authenticated" using ((EXISTS ( SELECT 1
   FROM task_rooms tr
  WHERE ((tr.id = task_room_folders.task_room_id) AND private.can_edit_task(tr.task_id))))) with check ((EXISTS ( SELECT 1
   FROM task_rooms tr
  WHERE ((tr.id = task_room_folders.task_room_id) AND private.can_edit_task(tr.task_id)))));
create policy "Berechtigte sehen Datenräume" on "public"."task_rooms" as permissive for select to "authenticated" using (private.can_access_task(task_id));
create policy "Berechtigte ändern Datenräume" on "public"."task_rooms" as permissive for update to "authenticated" using (private.can_edit_task(task_id)) with check (private.can_edit_task(task_id));
create policy "Projektverwalter legen Datenräume an" on "public"."task_rooms" as permissive for insert to "authenticated" with check (private.can_edit_task(task_id));
create policy "Projektverwalter löschen Datenräume" on "public"."task_rooms" as permissive for delete to "authenticated" using (private.can_edit_task(task_id));
create policy "Projektmitglieder sehen Maßnahmen" on "public"."tasks" as permissive for select to "authenticated" using ((private.is_project_member(project_id) OR private.is_project_owner(project_id) OR private.can_access_task(id)));
create policy "Projektverwalter legen Maßnahmen an" on "public"."tasks" as permissive for insert to "authenticated" with check (private.can_manage_project(project_id));
create policy "Projektverwalter löschen Maßnahmen" on "public"."tasks" as permissive for delete to "authenticated" using (private.can_manage_project(project_id));
create policy "Zuständige und Projektverwalter ändern Maßnahmen" on "public"."tasks" as permissive for update to "authenticated" using (private.can_edit_task(id)) with check (private.can_edit_task(id));

revoke all on table public."companies" from anon, authenticated, service_role;
revoke all on table public."documents" from anon, authenticated, service_role;
revoke all on table public."project_members" from anon, authenticated, service_role;
revoke all on table public."projects" from anon, authenticated, service_role;
revoke all on table public."task_activity_events" from anon, authenticated, service_role;
revoke all on table public."task_approvals" from anon, authenticated, service_role;
revoke all on table public."task_comments" from anon, authenticated, service_role;
revoke all on table public."task_notifications" from anon, authenticated, service_role;
revoke all on table public."task_responses" from anon, authenticated, service_role;
revoke all on table public."task_review_notes" from anon, authenticated, service_role;
revoke all on table public."task_room_folders" from anon, authenticated, service_role;
revoke all on table public."task_rooms" from anon, authenticated, service_role;
revoke all on table public."tasks" from anon, authenticated, service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."companies" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."companies" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."companies" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."documents" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."documents" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."documents" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."project_members" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."project_members" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."project_members" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."projects" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."projects" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."projects" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."task_activity_events" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."task_activity_events" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."task_activity_events" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."task_approvals" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."task_approvals" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."task_approvals" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."task_comments" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."task_comments" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."task_comments" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."task_notifications" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."task_notifications" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."task_notifications" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."task_responses" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."task_responses" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."task_responses" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."task_review_notes" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."task_review_notes" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."task_review_notes" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."task_room_folders" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."task_room_folders" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."task_room_folders" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."task_rooms" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."task_rooms" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."task_rooms" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."tasks" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."tasks" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."tasks" to "service_role";

revoke all on function public."normalize_project_name"() from public, anon, authenticated, service_role;
grant EXECUTE on function public."normalize_project_name"() to "anon";
grant EXECUTE on function public."normalize_project_name"() to "authenticated";
grant EXECUTE on function public."normalize_project_name"() to "public";
grant EXECUTE on function public."normalize_project_name"() to "service_role";
revoke all on function public."project_name_available"(p_name text) from public, anon, authenticated, service_role;
grant EXECUTE on function public."project_name_available"(p_name text) to "anon";
grant EXECUTE on function public."project_name_available"(p_name text) to "authenticated";
grant EXECUTE on function public."project_name_available"(p_name text) to "public";
grant EXECUTE on function public."project_name_available"(p_name text) to "service_role";
revoke all on function public."set_updated_at"() from public, anon, authenticated, service_role;
grant EXECUTE on function public."set_updated_at"() to "anon";
grant EXECUTE on function public."set_updated_at"() to "authenticated";
grant EXECUTE on function public."set_updated_at"() to "public";
grant EXECUTE on function public."set_updated_at"() to "service_role";

revoke all on function private."can_access_task"(target_task_id uuid) from public, anon, authenticated, service_role;
grant EXECUTE on function private."can_access_task"(target_task_id uuid) to "authenticated";
revoke all on function private."can_edit_task"(target_task_id uuid) from public, anon, authenticated, service_role;
grant EXECUTE on function private."can_edit_task"(target_task_id uuid) to "authenticated";
revoke all on function private."can_manage_project"(target_project_id uuid) from public, anon, authenticated, service_role;
grant EXECUTE on function private."can_manage_project"(target_project_id uuid) to "authenticated";
revoke all on function private."current_user_email"() from public, anon, authenticated, service_role;
grant EXECUTE on function private."current_user_email"() to "authenticated";
revoke all on function private."is_project_member"(target_project_id uuid) from public, anon, authenticated, service_role;
grant EXECUTE on function private."is_project_member"(target_project_id uuid) to "authenticated";
revoke all on function private."is_project_owner"(target_project_id uuid) from public, anon, authenticated, service_role;
grant EXECUTE on function private."is_project_owner"(target_project_id uuid) to "authenticated";

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lumina-datarooms', 'lumina-datarooms', false, null, null)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Projektmitglieder aktualisieren LUMINA-Dateien" on "storage"."objects" as permissive for update to "authenticated" using (((bucket_id = 'lumina-datarooms'::text) AND (array_length(storage.foldername(name), 1) >= 3) AND private.is_project_member(((storage.foldername(name))[1])::uuid))) with check (((bucket_id = 'lumina-datarooms'::text) AND (array_length(storage.foldername(name), 1) >= 3) AND private.is_project_member(((storage.foldername(name))[1])::uuid)));
create policy "Projektmitglieder laden LUMINA-Dateien hoch" on "storage"."objects" as permissive for insert to "authenticated" with check (((bucket_id = 'lumina-datarooms'::text) AND (array_length(storage.foldername(name), 1) >= 3) AND private.is_project_member(((storage.foldername(name))[1])::uuid)));
create policy "Projektmitglieder lesen LUMINA-Dateien" on "storage"."objects" as permissive for select to "authenticated" using (((bucket_id = 'lumina-datarooms'::text) AND (array_length(storage.foldername(name), 1) >= 3) AND private.is_project_member(((storage.foldername(name))[1])::uuid)));
create policy "Projektverwalter löschen LUMINA-Dateien" on "storage"."objects" as permissive for delete to "authenticated" using (((bucket_id = 'lumina-datarooms'::text) AND (array_length(storage.foldername(name), 1) >= 3) AND private.can_manage_project(((storage.foldername(name))[1])::uuid)));
create policy "Testzugriff Dateien hochladen" on "storage"."objects" as permissive for insert to "anon", "authenticated" with check ((bucket_id = 'lumina-datarooms'::text));
create policy "Testzugriff Dateien lesen" on "storage"."objects" as permissive for select to "anon", "authenticated" using ((bucket_id = 'lumina-datarooms'::text));
