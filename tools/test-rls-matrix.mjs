import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { expectedAllowed, planSummary, resources, roles, operations } from "../tests/security/rls-model.mjs";
import { requireTestEnvironment } from "../tests/security/test-env.mjs";

const plan = planSummary();
const planOnly = process.argv.includes("--plan");
if (planOnly) {
  console.log(JSON.stringify({
    status: "PLAN_ONLY",
    ...Object.fromEntries(Object.entries(plan).filter(([key]) => key !== "cases")),
    executedCases: 0,
    passedCases: 0,
    failedCases: 0,
    actualVisibleRows: 0,
    actualDeniedMutations: 0,
    remoteApplied: false,
  }, null, 2));
  process.exit(0);
}

let env;
try {
  env = requireTestEnvironment({ requireWriteGuard: true });
} catch (error) {
  console.error(JSON.stringify({
    ...(error.details || { status: "BLOCKED", reason: error.message }),
    ...Object.fromEntries(Object.entries(plan).filter(([key]) => key !== "cases")),
    executedCases: 0,
    passedCases: 0,
    failedCases: 0,
    actualVisibleRows: 0,
    actualDeniedMutations: 0,
    remoteApplied: false,
  }, null, 2));
  process.exit(2);
}

const statePath = path.join(env.root, ".test-state", "fixtures.json");
let state;
try {
  state = JSON.parse(await fs.readFile(statePath, "utf8"));
} catch {
  console.error(JSON.stringify({ status: "BLOCKED", reason: "FIXTURES_NOT_PREPARED", statePath: ".test-state/fixtures.json" }, null, 2));
  process.exit(2);
}
if (state.projectRef !== env.projectRef) {
  console.error(JSON.stringify({ status: "BLOCKED", reason: "FIXTURE_PROJECT_MISMATCH" }, null, 2));
  process.exit(2);
}

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const service = createClient(env.url, env.serviceRoleKey, clientOptions);
const clients = { anonymous: createClient(env.url, env.anonKey, clientOptions) };
for (const role of roles.filter(item => item !== "anonymous")) {
  const client = createClient(env.url, env.anonKey, clientOptions);
  const login = await client.auth.signInWithPassword({ email: state.users[role].email, password: env.password });
  if (login.error) throw new Error(`Login failed for ${role}: ${login.error.message}`);
  clients[role] = client;
}

const tableFor = resource => resource.startsWith("storage:") ? null : resource;
const base = scope => ({
  companyId: state.ids.companies[scope],
  projectId: state.ids.projects[scope],
  taskId: state.ids.tasks[scope],
  roomId: state.ids.rooms[scope],
  folderId: state.ids.folders[scope],
  owner: scope === "A" ? state.users.user_a : state.users.user_b,
});
const actorFor = role => role === "anonymous" ? null : state.users[role];

function selectId(resource, scope, role) {
  if (resource === "companies") return state.ids.companies[scope];
  if (resource === "projects") return state.ids.projects[scope];
  if (resource === "project_members") {
    if (scope === "B") return state.ids.members.user_b;
    return state.ids.members[role] || state.ids.members.editor;
  }
  if (resource === "tasks") return state.ids.tasks[scope];
  if (resource === "task_rooms") return state.ids.rooms[scope];
  if (resource === "task_room_folders") return state.ids.folders[scope];
  if (resource === "documents") return state.ids.documents[scope];
  if (resource === "task_comments") return state.ids.comments[scope];
  if (resource === "task_activity_events") return state.ids.activities[scope];
  if (resource === "task_approvals") return state.ids.approvals[scope];
  if (resource === "task_review_notes") return state.ids.reviews[scope];
  if (resource === "task_notifications") return state.ids.notifications[scope];
  if (resource === "task_responses") return state.ids.responses[scope];
  return state.storagePaths[scope];
}

async function serviceInsert(table, payload) {
  const result = await service.from(table).insert(payload);
  if (result.error) throw new Error(`Fixture seed ${table}: ${result.error.message}`);
}

async function prepareTableCase(resource, scope, role) {
  const id = crypto.randomUUID();
  const refs = base(scope);
  const actor = actorFor(role) || refs.owner;
  const dependencies = [];
  let payload;
  if (resource === "companies") payload = { id, name: `Matrix company ${id}`, created_by: refs.owner.id };
  if (resource === "projects") {
    const companyId = crypto.randomUUID();
    await serviceInsert("companies", { id: companyId, name: `Matrix dependency ${id}`, created_by: refs.owner.id });
    dependencies.push(["companies", companyId]);
    payload = { id, company_id: companyId, name: `Matrix project ${id}`, created_by: actor.id };
  }
  if (resource === "project_members") payload = { id, project_id: refs.projectId, name: "Matrix member", email: `matrix-${id}@example.invalid`, project_role: "Viewer", access_level: "viewer", invitation_status: "accepted" };
  if (resource === "tasks") payload = { id, project_id: refs.projectId, technical_id: `MATRIX-${id}`, title: "Matrix task", responsible_email: scope === "A" ? state.users.editor.email : state.users.user_b.email };
  if (resource === "task_rooms") {
    const taskId = crypto.randomUUID();
    await serviceInsert("tasks", { id: taskId, project_id: refs.projectId, technical_id: `MATRIX-ROOM-${id}`, title: "Matrix room dependency", responsible_email: scope === "A" ? state.users.editor.email : state.users.user_b.email });
    dependencies.push(["tasks", taskId]);
    payload = { id, task_id: taskId, room_name: "Matrix room" };
  }
  if (resource === "task_room_folders") {
    const taskId = crypto.randomUUID();
    const roomId = crypto.randomUUID();
    await serviceInsert("tasks", { id: taskId, project_id: refs.projectId, technical_id: `MATRIX-FOLDER-${id}`, title: "Matrix folder dependency", responsible_email: scope === "A" ? state.users.editor.email : state.users.user_b.email });
    await serviceInsert("task_rooms", { id: roomId, task_id: taskId, room_name: "Matrix folder room" });
    dependencies.push(["tasks", taskId]);
    payload = { id, task_room_id: roomId, folder_number: 1, folder_name: "Matrix folder" };
  }
  if (resource === "documents") payload = { id, project_id: refs.projectId, task_id: refs.taskId, folder_id: refs.folderId, storage_bucket: "lumina-datarooms", storage_path: `${refs.projectId}/${refs.taskId}/${refs.folderId}/${id}.txt`, file_name: `${id}.txt`, uploaded_by: role === "anonymous" ? null : actor.id };
  if (resource === "task_comments") payload = { id, task_id: refs.taskId, user_id: role === "anonymous" ? null : actor.id, author_name: role, message: "Matrix comment" };
  if (resource === "task_activity_events") payload = { id, task_id: refs.taskId, project_id: refs.projectId, event_type: "matrix", message: "Matrix activity", created_by: actor.id };
  if (resource === "task_approvals") payload = { id, task_id: refs.taskId, project_id: refs.projectId, step_name: "Matrix approval", responsible_user_id: scope === "A" ? state.users.approver.id : state.users.user_b.id, created_by: actor.id };
  if (resource === "task_review_notes") payload = { id, task_id: refs.taskId, project_id: refs.projectId, title: "Matrix review", description: "Matrix", assigned_to: scope === "A" ? state.users.approver.id : state.users.user_b.id, created_by: actor.id };
  if (resource === "task_notifications") payload = { id, project_id: refs.projectId, task_id: refs.taskId, recipient_email: scope === "A" ? state.users.approver.email : state.users.user_b.email, subject: "Matrix notification" };
  if (resource === "task_responses") payload = { id, task_id: refs.taskId, user_id: role === "anonymous" ? null : actor.id, response_type: "submitted", message: "Matrix response" };
  if (!payload) throw new Error(`No payload adapter for ${resource}`);
  return { id, payload, dependencies };
}

const updatePatch = resource => ({
  companies: { name: "Matrix updated" },
  projects: { status: "review" },
  project_members: { deputy_name: "Matrix updated" },
  tasks: { description: "Matrix updated" },
  task_rooms: { room_status: "ready" },
  task_room_folders: { folder_name: "Matrix updated" },
  documents: { description: "Matrix updated" },
  task_comments: { message: "Matrix updated" },
  task_activity_events: { message: "Matrix updated" },
  task_approvals: { comment: "Matrix updated" },
  task_review_notes: { description: "Matrix updated" },
  task_notifications: { subject: "Matrix updated" },
  task_responses: { message: "Matrix updated" },
}[resource]);

async function cleanupTable(table, id, dependencies) {
  await service.from(table).delete().eq("id", id);
  for (const [dependencyTable, dependencyId] of [...dependencies].reverse()) {
    await service.from(dependencyTable).delete().eq("id", dependencyId);
  }
}

async function runTableCase(testCase) {
  const { resource, operation, role, scope } = testCase;
  const client = clients[role];
  if (operation === "select") {
    const id = selectId(resource, scope, role);
    const result = await client.from(resource).select("id", { count: "exact" }).eq("id", id);
    return { allowed: !result.error && (result.count ?? result.data?.length ?? 0) === 1, visibleRows: result.count ?? result.data?.length ?? 0, errorCode: result.error?.code || null };
  }
  const prepared = await prepareTableCase(resource, scope, role);
  try {
    if (["update", "delete"].includes(operation)) await serviceInsert(resource, prepared.payload);
    let result;
    if (operation === "insert") result = await client.from(resource).insert(prepared.payload);
    if (operation === "update") result = await client.from(resource).update(updatePatch(resource)).eq("id", prepared.id);
    if (operation === "delete") result = await client.from(resource).delete().eq("id", prepared.id);
    const verification = await service.from(resource).select("*").eq("id", prepared.id).maybeSingle();
    let allowed = false;
    if (operation === "insert") allowed = !result.error && Boolean(verification.data);
    if (operation === "delete") allowed = !result.error && !verification.data;
    if (operation === "update") {
      const [field, value] = Object.entries(updatePatch(resource))[0];
      allowed = !result.error && verification.data?.[field] === value;
    }
    return { allowed, visibleRows: 0, errorCode: result.error?.code || null };
  } finally {
    await cleanupTable(resource, prepared.id, prepared.dependencies);
  }
}

async function runStorageCase(testCase) {
  const { operation, role, scope } = testCase;
  const bucket = "lumina-datarooms";
  const client = clients[role].storage.from(bucket);
  if (operation === "select") {
    const result = await client.download(state.storagePaths[scope]);
    return { allowed: !result.error && Boolean(result.data), visibleRows: result.error ? 0 : 1, errorCode: result.error?.statusCode || null };
  }
  const refs = base(scope);
  const objectPath = `${refs.projectId}/${refs.taskId}/${refs.folderId}/matrix-${crypto.randomUUID()}.txt`;
  const content = new Blob(["synthetic matrix fixture\n"], { type: "text/plain" });
  try {
    if (["update", "delete"].includes(operation)) {
      const seeded = await service.storage.from(bucket).upload(objectPath, content, { upsert: true, contentType: "text/plain" });
      if (seeded.error) throw seeded.error;
    }
    let result;
    if (operation === "insert") result = await client.upload(objectPath, content, { upsert: false, contentType: "text/plain" });
    if (operation === "update") result = await client.update(objectPath, content, { upsert: true, contentType: "text/plain" });
    if (operation === "delete") result = await client.remove([objectPath]);
    const verification = await service.storage.from(bucket).download(objectPath);
    const exists = !verification.error && Boolean(verification.data);
    const allowed = operation === "delete" ? !result.error && !exists : !result.error && exists;
    return { allowed, visibleRows: 0, errorCode: result.error?.statusCode || null };
  } finally {
    await service.storage.from(bucket).remove([objectPath]);
  }
}

const startedAt = new Date().toISOString();
const results = [];
for (const testCase of plan.cases) {
  const actual = testCase.resource.startsWith("storage:")
    ? await runStorageCase(testCase)
    : await runTableCase(testCase);
  results.push({ ...testCase, ...actual, passed: actual.allowed === testCase.expected });
}

const mutationResults = results.filter(item => item.operation !== "select");
const summary = {
  status: results.every(item => item.passed) ? "PASS" : "FAIL",
  startedAt,
  finishedAt: new Date().toISOString(),
  projectRef: env.projectRef,
  resources: resources.length,
  roles: roles.length,
  operations: operations.length,
  plannedCases: plan.plannedCases,
  executedCases: results.length,
  passedCases: results.filter(item => item.passed).length,
  failedCases: results.filter(item => !item.passed).length,
  expectedVisibleRows: results.filter(item => item.operation === "select" && item.expected).length,
  actualVisibleRows: results.reduce((sum, item) => sum + (item.visibleRows || 0), 0),
  expectedDeniedMutations: mutationResults.filter(item => !item.expected).length,
  actualDeniedMutations: mutationResults.filter(item => !item.allowed).length,
  remoteApplied: false,
  failures: results.filter(item => !item.passed),
};
console.log(JSON.stringify(summary, null, 2));
process.exitCode = summary.failedCases === 0 ? 0 : 1;
