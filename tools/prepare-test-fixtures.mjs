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
const identityKeys = env.plan.identities.filter(item => item.key !== "anonymous").map(item => item.key);
const identityByKey = Object.fromEntries(env.plan.identities.map(item => [item.key, item]));
const permissionFields = ["can_read", "can_upload", "can_edit", "can_approve", "can_manage_members", "can_view_all_tasks"];
for (const identity of env.plan.identities) {
  for (const field of permissionFields) {
    if (typeof identity.permissions?.[field] !== "boolean") {
      throw new Error(`fixture plan ${identity.key}: ${field} must be an explicit boolean`);
    }
  }
}
const users = {};
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
    user_b: "60000000-0000-4000-8000-000000000005",
    user_a: "60000000-0000-4000-8000-000000000006",
  },
  documents: { A: "70000000-0000-4000-8000-000000000001", B: "70000000-0000-4000-8000-000000000002" },
  comments: { A: "71000000-0000-4000-8000-000000000001", B: "71000000-0000-4000-8000-000000000002" },
  activities: { A: "72000000-0000-4000-8000-000000000001", B: "72000000-0000-4000-8000-000000000002" },
  approvals: { A: "73000000-0000-4000-8000-000000000001", B: "73000000-0000-4000-8000-000000000002" },
  reviews: { A: "74000000-0000-4000-8000-000000000001", B: "74000000-0000-4000-8000-000000000002" },
  notifications: { A: "75000000-0000-4000-8000-000000000001", B: "75000000-0000-4000-8000-000000000002" },
  responses: { A: "76000000-0000-4000-8000-000000000001", B: "76000000-0000-4000-8000-000000000002" },
};
const storagePaths = {
  A: `${ids.projects.A}/${ids.tasks.A}/${ids.folders.A}/fixture-a.txt`,
  B: `${ids.projects.B}/${ids.tasks.B}/${ids.folders.B}/fixture-b.txt`,
};
const stateDir = path.join(env.root, ".test-state");
const statePath = path.join(stateDir, "fixtures.json");
const cleanupOnly = process.argv.includes("--cleanup");

async function deleteRows(table, rowIds) {
  const result = await admin.from(table).delete().in("id", rowIds);
  if (result.error) throw new Error(`cleanup ${table}: ${result.error.message}`);
}

async function cleanupFixtureData() {
  const storage = await admin.storage.from("lumina-datarooms").remove(Object.values(storagePaths));
  if (storage.error && !String(storage.error.message).toLowerCase().includes("not found")) {
    throw new Error(`cleanup storage: ${storage.error.message}`);
  }
  const targets = [
    ["task_responses", Object.values(ids.responses)],
    ["task_notifications", Object.values(ids.notifications)],
    ["task_review_notes", Object.values(ids.reviews)],
    ["task_approvals", Object.values(ids.approvals)],
    ["task_activity_events", Object.values(ids.activities)],
    ["task_comments", Object.values(ids.comments)],
    ["documents", Object.values(ids.documents)],
    ["task_room_folders", Object.values(ids.folders)],
    ["task_rooms", Object.values(ids.rooms)],
    ["tasks", Object.values(ids.tasks)],
    ["project_members", Object.values(ids.members)],
    ["projects", Object.values(ids.projects)],
    ["companies", Object.values(ids.companies)],
  ];
  for (const [table, rowIds] of targets) await deleteRows(table, rowIds);
  await fs.rm(statePath, { force: true });
}

async function deleteFixtureUsers() {
  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listed.error) throw listed.error;
  const fixtureEmails = new Set(identityKeys.map(key => `lumina-security-${key}@${env.emailDomain}`.toLowerCase()));
  for (const user of listed.data.users.filter(item => fixtureEmails.has(item.email?.toLowerCase()))) {
    const removed = await admin.auth.admin.deleteUser(user.id);
    if (removed.error) throw removed.error;
  }
}

async function verifyFixtureCleanup() {
  const fixtureIds = {
    companies: Object.values(ids.companies), projects: Object.values(ids.projects),
    project_members: Object.values(ids.members), tasks: Object.values(ids.tasks),
    task_rooms: Object.values(ids.rooms), task_room_folders: Object.values(ids.folders),
    documents: Object.values(ids.documents), task_comments: Object.values(ids.comments),
    task_activity_events: Object.values(ids.activities), task_approvals: Object.values(ids.approvals),
    task_review_notes: Object.values(ids.reviews), task_notifications: Object.values(ids.notifications),
    task_responses: Object.values(ids.responses),
  };
  let retainedRows = 0;
  for (const [table, rowIds] of Object.entries(fixtureIds)) {
    const result = await admin.from(table).select("id", { count: "exact", head: true }).in("id", rowIds);
    if (result.error) throw result.error;
    retainedRows += result.count ?? 0;
  }
  let retainedStorageObjects = 0;
  for (const objectPath of Object.values(storagePaths)) {
    const folder = objectPath.slice(0, objectPath.lastIndexOf("/"));
    const file = objectPath.slice(objectPath.lastIndexOf("/") + 1);
    const listed = await admin.storage.from("lumina-datarooms").list(folder, { limit: 100, search: file });
    if (listed.error) throw listed.error;
    retainedStorageObjects += listed.data.filter(item => item.name === file).length;
  }
  const listedUsers = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listedUsers.error) throw listedUsers.error;
  const fixtureEmails = new Set(identityKeys.map(key => `lumina-security-${key}@${env.emailDomain}`.toLowerCase()));
  const retainedUsers = listedUsers.data.users.filter(user => fixtureEmails.has(user.email?.toLowerCase())).length;
  return { retainedRows, retainedStorageObjects, retainedUsers };
}

async function upsert(table, rows) {
  const requiredFixtureFields = {
    companies: ["id", "name", "created_by"],
    projects: ["id", "company_id", "name", "number_of_entities", "special_scope", "report_components", "systems", "risks", "status", "created_by"],
    project_members: ["id", "project_id", "user_id", "name", "email", "project_role", "cockpit_profile", "access_level", ...permissionFields, "invitation_status"],
    tasks: ["id", "project_id", "technical_id", "title", "status", "is_custom"],
    task_rooms: ["id", "task_id", "room_name", "room_status"],
    task_room_folders: ["id", "task_room_id", "folder_number", "folder_name", "can_member_upload", "can_auditor_read"],
    documents: ["id", "project_id", "task_id", "storage_bucket", "storage_path", "file_name", "version_number", "document_status", "version_no"],
    task_comments: ["id", "task_id", "author_type", "comment_type", "message"],
    task_activity_events: ["id", "task_id", "project_id", "event_type", "message", "metadata"],
    task_approvals: ["id", "task_id", "project_id", "step_name", "status", "sort_order", "created_by"],
    task_review_notes: ["id", "task_id", "project_id", "title", "description", "source_type", "priority", "status", "created_by"],
    task_notifications: ["id", "project_id", "recipient_email", "notification_type", "delivery_status"],
    task_responses: ["id", "task_id", "response_type"],
  };
  for (const [index, row] of rows.entries()) {
    const missing = requiredFixtureFields[table].filter(field => row[field] === null || row[field] === undefined);
    if (missing.length) throw new Error(`${table}[${index}] missing required fixture fields: ${missing.join(", ")}`);
  }
  const result = await admin.from(table).upsert(rows, { onConflict: "id", defaultToNull: false });
  if (result.error) throw new Error(`${table}: ${result.error.message}`);
}

function membership(key) {
  const identity = identityByKey[key];
  return {
    id: ids.members[key],
    project_id: ids.projects[identity.project],
    user_id: users[key].id,
    name: `Fixture ${identity.label}`,
    email: users[key].email,
    project_role: identity.projectRole,
    cockpit_profile: identity.cockpitProfile,
    access_level: identity.accessLevel,
    can_read: identity.permissions.can_read,
    can_upload: identity.permissions.can_upload,
    can_edit: identity.permissions.can_edit,
    can_approve: identity.permissions.can_approve,
    can_manage_members: identity.permissions.can_manage_members,
    can_view_all_tasks: identity.permissions.can_view_all_tasks,
    invitation_status: "accepted",
  };
}

try {
  if (cleanupOnly) {
    await cleanupFixtureData();
    await deleteFixtureUsers();
    const verification = await verifyFixtureCleanup();
    if (Object.values(verification).some(count => count !== 0)) {
      throw new Error(`fixture cleanup verification failed: ${JSON.stringify(verification)}`);
    }
    console.log(JSON.stringify({
      status: "CLEANED",
      environment: "separate-test-project",
      fixtureRowsRetained: false,
      fixtureUsersRetained: false,
      fixtureStorageObjectsRetained: false,
      verification,
      productionApplied: false,
    }, null, 2));
    process.exit(0);
  }

  await cleanupFixtureData();

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

  await upsert("companies", [
    { id: ids.companies.A, name: "LUMINA Security Fixture Company A", created_by: users.user_a.id },
    { id: ids.companies.B, name: "LUMINA Security Fixture Company B", created_by: users.user_b.id },
  ]);
  await upsert("projects", [
    { id: ids.projects.A, company_id: ids.companies.A, name: "LUMINA Security Fixture Project A", number_of_entities: 1, special_scope: [], report_components: [], systems: {}, risks: [], created_by: users.user_a.id, status: "active" },
    { id: ids.projects.B, company_id: ids.companies.B, name: "LUMINA Security Fixture Project B", number_of_entities: 1, special_scope: [], report_components: [], systems: {}, risks: [], created_by: users.user_b.id, status: "active" },
  ]);
  await upsert("project_members", identityKeys.map(membership));
  await upsert("tasks", [
    { id: ids.tasks.A, project_id: ids.projects.A, technical_id: "SEC-A-001", title: "Security Fixture Task A", responsible_member_id: ids.members.editor, responsible_name: "Fixture Bearbeiter", responsible_email: users.editor.email, status: "in_progress", is_custom: false },
    { id: ids.tasks.B, project_id: ids.projects.B, technical_id: "SEC-B-001", title: "Security Fixture Task B", responsible_member_id: ids.members.user_b, responsible_name: "Fixture Nutzer B", responsible_email: users.user_b.email, status: "in_progress", is_custom: false },
  ]);
  await upsert("task_rooms", [
    { id: ids.rooms.A, task_id: ids.tasks.A, room_name: "Security Fixture Room A", room_status: "active" },
    { id: ids.rooms.B, task_id: ids.tasks.B, room_name: "Security Fixture Room B", room_status: "active" },
  ]);
  await upsert("task_room_folders", [
    { id: ids.folders.A, task_room_id: ids.rooms.A, folder_number: 1, folder_name: "Security Fixture Folder A", can_member_upload: true, can_auditor_read: true },
    { id: ids.folders.B, task_room_id: ids.rooms.B, folder_number: 1, folder_name: "Security Fixture Folder B", can_member_upload: true, can_auditor_read: false },
  ]);
  await upsert("documents", [
    { id: ids.documents.A, project_id: ids.projects.A, task_id: ids.tasks.A, folder_id: ids.folders.A, storage_bucket: "lumina-datarooms", storage_path: storagePaths.A, file_name: "fixture-a.txt", version_number: 1, version_no: 1, document_status: "uploaded", uploaded_by: users.editor.id },
    { id: ids.documents.B, project_id: ids.projects.B, task_id: ids.tasks.B, folder_id: ids.folders.B, storage_bucket: "lumina-datarooms", storage_path: storagePaths.B, file_name: "fixture-b.txt", version_number: 1, version_no: 1, document_status: "uploaded", uploaded_by: users.user_b.id },
  ]);
  await upsert("task_comments", [
    { id: ids.comments.A, task_id: ids.tasks.A, user_id: users.user_a.id, author_name: users.user_a.email, author_type: "human", comment_type: "comment", message: "Security fixture comment A" },
    { id: ids.comments.B, task_id: ids.tasks.B, user_id: users.user_b.id, author_name: users.user_b.email, author_type: "human", comment_type: "comment", message: "Security fixture comment B" },
  ]);
  await upsert("task_activity_events", [
    { id: ids.activities.A, task_id: ids.tasks.A, project_id: ids.projects.A, event_type: "fixture", message: "Security fixture activity A", metadata: {}, created_by: users.user_a.id },
    { id: ids.activities.B, task_id: ids.tasks.B, project_id: ids.projects.B, event_type: "fixture", message: "Security fixture activity B", metadata: {}, created_by: users.user_b.id },
  ]);
  await upsert("task_approvals", [
    { id: ids.approvals.A, task_id: ids.tasks.A, project_id: ids.projects.A, step_name: "Security fixture approval A", responsible_user_id: users.approver.id, status: "pending", sort_order: 1, created_by: users.user_a.id },
    { id: ids.approvals.B, task_id: ids.tasks.B, project_id: ids.projects.B, step_name: "Security fixture approval B", responsible_user_id: users.user_b.id, status: "pending", sort_order: 1, created_by: users.user_b.id },
  ]);
  await upsert("task_review_notes", [
    { id: ids.reviews.A, task_id: ids.tasks.A, project_id: ids.projects.A, title: "Security fixture review A", description: "Fixture", source_type: "human", priority: "medium", status: "open", assigned_to: users.approver.id, created_by: users.user_a.id },
    { id: ids.reviews.B, task_id: ids.tasks.B, project_id: ids.projects.B, title: "Security fixture review B", description: "Fixture", source_type: "human", priority: "medium", status: "open", assigned_to: users.user_b.id, created_by: users.user_b.id },
  ]);
  await upsert("task_notifications", [
    { id: ids.notifications.A, project_id: ids.projects.A, task_id: ids.tasks.A, recipient_email: users.approver.email, notification_type: "task_assignment", subject: "Security fixture notification A", delivery_status: "prepared" },
    { id: ids.notifications.B, project_id: ids.projects.B, task_id: ids.tasks.B, recipient_email: users.user_b.email, notification_type: "task_assignment", subject: "Security fixture notification B", delivery_status: "prepared" },
  ]);
  await upsert("task_responses", [
    { id: ids.responses.A, task_id: ids.tasks.A, user_id: users.editor.id, response_type: "submitted", message: "Security fixture response A" },
    { id: ids.responses.B, task_id: ids.tasks.B, user_id: users.user_b.id, response_type: "submitted", message: "Security fixture response B" },
  ]);

  for (const storagePath of Object.values(storagePaths)) {
    const upload = await admin.storage.from("lumina-datarooms").upload(
      storagePath,
      new Blob(["LUMINA synthetic security fixture\n"], { type: "text/plain" }),
      { upsert: true, contentType: "text/plain" },
    );
    if (upload.error) throw new Error(`storage fixture: ${upload.error.message}`);
  }

  await fs.mkdir(stateDir, { recursive: true });
  await fs.writeFile(statePath, JSON.stringify({
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
    projectMembersPrepared: identityKeys.length,
    projectsPrepared: 2,
    businessDataUsed: false,
    idempotentCleanupBeforeSeed: true,
    stateFile: ".test-state/fixtures.json",
  }, null, 2));
} catch (error) {
  let cleanup = "PASS";
  let cleanupError = null;
  try {
    await cleanupFixtureData();
    await deleteFixtureUsers();
  } catch (failure) {
    cleanup = "FAIL";
    cleanupError = failure.message;
  }
  console.error(JSON.stringify({
    status: "FAIL",
    error: error.message,
    cleanup,
    cleanupError,
    retainedFixtureState: cleanup !== "PASS",
  }, null, 2));
  process.exitCode = 1;
}
