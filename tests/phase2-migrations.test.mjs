import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (match) => match.slice(1))), "..");
const migration = (name) => fs.readFileSync(path.join(root, "supabase", "migrations", name), "utf8");
const schema = migration("202607270003_add_cockpit_profiles_and_substitutions.sql");
const security = migration("202607270004_enforce_accepted_membership_identity.sql");
const projectDeletion = migration("202607270005_restrict_project_deletion_to_active_creator.sql");

test("profile schema is additive and supports only the four approved values", () => {
  assert.match(schema, /add column if not exists cockpit_profile text/i);
  assert.match(schema, /add column if not exists can_view_all_tasks boolean not null default false/i);
  for (const profile of ["cfo", "project", "accounting_lead", "worker"]) assert.match(schema, new RegExp(`'${profile}'`));
  assert.match(schema, /else null\s+end/i);
  assert.doesNotMatch(schema, /alter\s+column\s+cockpit_profile\s+set\s+not\s+null/i);
});

test("all approved legacy roles are present in the deterministic database mapper", () => {
  for (const role of [
    "cfo", "geschäftsführung", "projektleitung abschluss", "leiter rechnungswesen",
    "bilanzbuchhaltung", "controlling", "externe beratung", "it", "investor relations",
    "konsolidierung", "nachhaltigkeit", "personal / hr", "recht", "steuern", "treasury",
    "wirtschaftsprüfung",
  ]) assert.match(schema.toLowerCase(), new RegExp(role.replace("/", "\\/")));
});

test("substitutions are project-bound, temporal, non-self and service-managed", () => {
  assert.match(schema, /create table if not exists public\.project_member_substitutions/i);
  assert.match(schema, /foreign key \(project_id, principal_member_id\)/i);
  assert.match(schema, /foreign key \(project_id, substitute_member_id\)/i);
  assert.match(schema, /principal_member_id <> substitute_member_id/i);
  assert.match(schema, /valid_until > valid_from/i);
  assert.match(schema, /where status = 'active'/i);
  assert.match(schema, /revoke all on table public\.project_member_substitutions from public, anon, authenticated/i);
  assert.doesNotMatch(schema, /tasks\.deputy_member_id/i);
});

test("active authorization is accepted and UUID-bound without email fallback", () => {
  const memberHelper = security.match(/create or replace function private\.is_project_member[\s\S]*?\$function\$;/i)?.[0] ?? "";
  assert.match(memberHelper, /pm\.user_id = \(select auth\.uid\(\)\)/i);
  assert.match(memberHelper, /pm\.invitation_status = 'accepted'/i);
  assert.doesNotMatch(memberHelper, /email/i);
  const manageHelper = security.match(/create or replace function private\.can_manage_project[\s\S]*?\$function\$;/i)?.[0] ?? "";
  assert.match(manageHelper, /can_manage_members = true/i);
  assert.doesNotMatch(manageHelper, /access_level|cockpit_profile|email/i);
});

test("task access distinguishes own, active substitution and explicit project-wide view", () => {
  assert.match(security, /actor\.can_view_all_tasks = true/i);
  assert.match(security, /t\.responsible_member_id = actor\.id/i);
  assert.match(security, /private\.has_active_task_substitution\(t\.id\)/i);
  assert.match(security, /substitution\.status = 'active'/i);
  assert.match(security, /valid_from is null or substitution\.valid_from <= now\(\)/i);
  assert.match(security, /valid_until is null or substitution\.valid_until > now\(\)/i);
});

test("browser membership mutations, system-author spoofing and cross-project task ids are constrained", () => {
  assert.doesNotMatch(security, /create policy[^\n]*project_members[^\n]*for update/i);
  assert.doesNotMatch(security, /create policy[^\n]*project_members[^\n]*for delete/i);
  assert.match(security, /author_type = 'human'/i);
  assert.match(security, /user_id = auth\.uid\(\)/i);
  for (const constraint of [
    "documents_project_task_fkey", "task_activity_events_project_task_fkey",
    "task_approvals_project_task_fkey", "task_notifications_project_task_fkey",
    "task_review_notes_project_task_fkey",
  ]) assert.match(security, new RegExp(constraint));
});

test("storage mutation requires accepted UUID membership, upload permission and task access", () => {
  const uploadHelper = security.match(/create or replace function private\.can_upload_to_project[\s\S]*?\$function\$;/i)?.[0] ?? "";
  assert.match(uploadHelper, /invitation_status = 'accepted'/i);
  assert.match(uploadHelper, /user_id = \(select auth\.uid\(\)\)/i);
  assert.match(uploadHelper, /can_upload = true/i);
  assert.doesNotMatch(uploadHelper, /email/i);
  assert.match(security, /private\.can_access_task\(\(\(storage\.foldername\(name\)\)\[2\]\)::uuid\)/i);
});

test("member management permission never implies project deletion", () => {
  assert.match(projectDeletion, /drop policy if exists "Explizite Projektverwalter löschen Projekte"/i);
  assert.match(projectDeletion, /created_by = \(select auth\.uid\(\)\)/i);
  assert.match(projectDeletion, /private\.is_project_member\(id\)/i);
  assert.doesNotMatch(projectDeletion, /can_manage_project|can_manage_members/i);
});
