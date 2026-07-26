import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { requireTestEnvironment } from "../tests/security/test-env.mjs";

let env;
try {
  env = requireTestEnvironment({ requireWriteGuard: true });
} catch (error) {
  console.error(JSON.stringify(error.details || { status: "BLOCKED", reason: error.message }, null, 2));
  process.exit(2);
}

const admin = createClient(env.url, env.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const identityKeys = ["user_a", "user_b", "editor", "approver", "auditor", "admin"];
const users = {};
const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listed.error) throw listed.error;

for (const key of identityKeys) {
  const email = `lumina-security-${key}@${env.emailDomain}`.toLowerCase();
  let user = listed.data.users.find(item => item.email?.toLowerCase() === email);
  if (!user) {
    const created = await admin.auth.admin.createUser({
      email,
      password: env.password,
      email_confirm: true,
      user_metadata: { fixture: "lumina-security-baseline", role: key },
    });
    if (created.error) throw created.error;
    user = created.data.user;
  }
  users[key] = { id: user.id, email };
}

const ids = {
  companies: { A: "10000000-0000-4000-8000-000000000001", B: "10000000-0000-4000-8000-000000000002" },
  projects: { A: "20000000-0000-4000-8000-000000000001", B: "20000000-0000-4000-8000-000000000002" },
  tasks: { A: "30000000-0000-4000-8000-000000000001", B: "30000000-0000-4000-8000-000000000002" },
  rooms: { A: "40000000-0000-4000-8000-000000000001", B: "40000000-0000-4000-8000-000000000002" },
  folders: { A: "50000000-0000-4000-8000-000000000001", B: "50000000-0000-4000-8000-000000000002" },
  members: {
    editor: "60000000-0000-4000-8000-000000000001",
    approver: "60000000-0000-4000-8000-000000000002",
    auditor: "60000000-0000-4000-8000-000000000003",
    admin: "60000000-0000-4000-8000-000000000004",
    user_b: "60000000-0000-4000-8000-000000000005"
  },
  documents: { A: "70000000-0000-4000-8000-000000000001", B: "70000000-0000-4000-8000-000000000002" },
  comments: { A: "71000000-0000-4000-8000-000000000001", B: "71000000-0000-4000-8000-000000000002" },
  activities: { A: "72000000-0000-4000-8000-000000000001", B: "72000000-0000-4000-8000-000000000002" },
  approvals: { A: "73000000-0000-4000-8000-000000000001", B: "73000000-0000-4000-8000-000000000002" },
  reviews: { A: "74000000-0000-4000-8000-000000000001", B: "74000000-0000-4000-8000-000000000002" },
  notifications: { A: "75000000-0000-4000-8000-000000000001", B: "75000000-0000-4000-8000-000000000002" },
  responses: { A: "76000000-0000-4000-8000-000000000001", B: "76000000-0000-4000-8000-000000000002" }
};

async function upsert(table, rows) {
  const result = await admin.from(table).upsert(rows, { onConflict: "id" });
  if (result.error) throw new Error(`${table}: ${result.error.message}`);
}

await upsert("companies", [
  { id: ids.companies.A, name: "LUMINA Security Fixture Company A", created_by: users.user_a.id },
  { id: ids.companies.B, name: "LUMINA Security Fixture Company B", created_by: users.user_b.id },
]);
await upsert("projects", [
  { id: ids.projects.A, company_id: ids.companies.A, name: "LUMINA Security Fixture Project A", created_by: users.user_a.id, status: "active" },
  { id: ids.projects.B, company_id: ids.companies.B, name: "LUMINA Security Fixture Project B", created_by: users.user_b.id, status: "active" },
]);
await upsert("project_members", [
  { id: ids.members.editor, project_id: ids.projects.A, user_id: users.editor.id, name: "Fixture Bearbeiter", email: users.editor.email, project_role: "Bearbeiter", access_level: "member", can_read: true, can_upload: true, can_edit: true, invitation_status: "accepted" },
  { id: ids.members.approver, project_id: ids.projects.A, user_id: users.approver.id, name: "Fixture Freigeber", email: users.approver.email, project_role: "Freigeber", access_level: "member", can_read: true, can_approve: true, invitation_status: "accepted" },
  { id: ids.members.auditor, project_id: ids.projects.A, user_id: users.auditor.id, name: "Fixture Prüfer", email: users.auditor.email, project_role: "Prüfer", access_level: "auditor", can_read: true, invitation_status: "accepted" },
  { id: ids.members.admin, project_id: ids.projects.A, user_id: users.admin.id, name: "Fixture Admin", email: users.admin.email, project_role: "Admin", access_level: "admin", can_read: true, can_upload: true, can_edit: true, can_approve: true, can_manage_members: true, invitation_status: "accepted" },
  { id: ids.members.user_b, project_id: ids.projects.B, user_id: users.user_b.id, name: "Fixture Nutzer B", email: users.user_b.email, project_role: "Owner", access_level: "admin", can_read: true, can_upload: true, can_edit: true, can_approve: true, can_manage_members: true, invitation_status: "accepted" },
]);
await upsert("tasks", [
  { id: ids.tasks.A, project_id: ids.projects.A, technical_id: "SEC-A-001", title: "Security Fixture Task A", responsible_member_id: ids.members.editor, responsible_name: "Fixture Bearbeiter", responsible_email: users.editor.email, status: "in_progress" },
  { id: ids.tasks.B, project_id: ids.projects.B, technical_id: "SEC-B-001", title: "Security Fixture Task B", responsible_member_id: ids.members.user_b, responsible_name: "Fixture Nutzer B", responsible_email: users.user_b.email, status: "in_progress" },
]);
await upsert("task_rooms", [
  { id: ids.rooms.A, task_id: ids.tasks.A, room_name: "Security Fixture Room A", room_status: "active" },
  { id: ids.rooms.B, task_id: ids.tasks.B, room_name: "Security Fixture Room B", room_status: "active" },
]);
await upsert("task_room_folders", [
  { id: ids.folders.A, task_room_id: ids.rooms.A, folder_number: 1, folder_name: "Security Fixture Folder A" },
  { id: ids.folders.B, task_room_id: ids.rooms.B, folder_number: 1, folder_name: "Security Fixture Folder B" },
]);
await upsert("documents", [
  { id: ids.documents.A, project_id: ids.projects.A, task_id: ids.tasks.A, folder_id: ids.folders.A, storage_bucket: "lumina-datarooms", storage_path: `${ids.projects.A}/${ids.tasks.A}/${ids.folders.A}/fixture-a.txt`, file_name: "fixture-a.txt", uploaded_by: users.editor.id },
  { id: ids.documents.B, project_id: ids.projects.B, task_id: ids.tasks.B, folder_id: ids.folders.B, storage_bucket: "lumina-datarooms", storage_path: `${ids.projects.B}/${ids.tasks.B}/${ids.folders.B}/fixture-b.txt`, file_name: "fixture-b.txt", uploaded_by: users.user_b.id },
]);
await upsert("task_comments", [
  { id: ids.comments.A, task_id: ids.tasks.A, user_id: users.user_a.id, author_name: users.user_a.email, message: "Security fixture comment A" },
  { id: ids.comments.B, task_id: ids.tasks.B, user_id: users.user_b.id, author_name: users.user_b.email, message: "Security fixture comment B" },
]);
await upsert("task_activity_events", [
  { id: ids.activities.A, task_id: ids.tasks.A, project_id: ids.projects.A, event_type: "fixture", message: "Security fixture activity A", created_by: users.user_a.id },
  { id: ids.activities.B, task_id: ids.tasks.B, project_id: ids.projects.B, event_type: "fixture", message: "Security fixture activity B", created_by: users.user_b.id },
]);
await upsert("task_approvals", [
  { id: ids.approvals.A, task_id: ids.tasks.A, project_id: ids.projects.A, step_name: "Security fixture approval A", responsible_user_id: users.approver.id, created_by: users.user_a.id },
  { id: ids.approvals.B, task_id: ids.tasks.B, project_id: ids.projects.B, step_name: "Security fixture approval B", responsible_user_id: users.user_b.id, created_by: users.user_b.id },
]);
await upsert("task_review_notes", [
  { id: ids.reviews.A, task_id: ids.tasks.A, project_id: ids.projects.A, title: "Security fixture review A", description: "Fixture", assigned_to: users.approver.id, created_by: users.user_a.id },
  { id: ids.reviews.B, task_id: ids.tasks.B, project_id: ids.projects.B, title: "Security fixture review B", description: "Fixture", assigned_to: users.user_b.id, created_by: users.user_b.id },
]);
await upsert("task_notifications", [
  { id: ids.notifications.A, project_id: ids.projects.A, task_id: ids.tasks.A, recipient_email: users.approver.email, subject: "Security fixture notification A" },
  { id: ids.notifications.B, project_id: ids.projects.B, task_id: ids.tasks.B, recipient_email: users.user_b.email, subject: "Security fixture notification B" },
]);
await upsert("task_responses", [
  { id: ids.responses.A, task_id: ids.tasks.A, user_id: users.editor.id, response_type: "submitted", message: "Security fixture response A" },
  { id: ids.responses.B, task_id: ids.tasks.B, user_id: users.user_b.id, response_type: "submitted", message: "Security fixture response B" },
]);

const storagePaths = {
  A: `${ids.projects.A}/${ids.tasks.A}/${ids.folders.A}/fixture-a.txt`,
  B: `${ids.projects.B}/${ids.tasks.B}/${ids.folders.B}/fixture-b.txt`,
};
for (const storagePath of Object.values(storagePaths)) {
  const upload = await admin.storage.from("lumina-datarooms").upload(
    storagePath,
    new Blob(["LUMINA synthetic security fixture\n"], { type: "text/plain" }),
    { upsert: true, contentType: "text/plain" },
  );
  if (upload.error) throw new Error(`storage fixture: ${upload.error.message}`);
}

const stateDir = path.join(env.root, ".test-state");
await fs.mkdir(stateDir, { recursive: true });
await fs.writeFile(path.join(stateDir, "fixtures.json"), JSON.stringify({
  projectRef: env.projectRef,
  generatedAt: new Date().toISOString(),
  users,
  ids,
  storagePaths,
}, null, 2), "utf8");

console.log(JSON.stringify({
  status: "PREPARED",
  environment: "separate-test-project",
  usersPrepared: Object.keys(users).length,
  projectsPrepared: 2,
  businessDataUsed: false,
  stateFile: ".test-state/fixtures.json",
}, null, 2));
