import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { expectedAllowed, planSummary, resources, roles, operations } from "../tests/security/rls-model.mjs";
import { requireTestEnvironment } from "../tests/security/test-env.mjs";

const plan = planSummary();
const planOnly = process.argv.includes("--plan");
const probesOnly = process.argv.includes("--probes-only");
const resourceOption = process.argv.find(item => item.startsWith("--resources="));
const requestedResources = resourceOption
  ? new Set(resourceOption.slice("--resources=".length).split(",").filter(Boolean))
  : null;
if (planOnly) {
  console.log(JSON.stringify({
    status: "PLAN_ONLY",
    ...Object.fromEntries(Object.entries(plan).filter(([key]) => key !== "cases")),
    executedCases: 0,
    passedCases: 0,
    failedCases: 0,
    expectedVisibleSelectCases: plan.cases.filter(item => item.operation === "select" && item.expected).length,
    actualVisibleSelectCases: 0,
    successfulMutations: 0,
    visibilityAfterMutations: 0,
    privilegeProbesPlanned: 37,
    privilegeProbesExecuted: 0,
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

const observers = {};
function observedClient(name, key) {
  const observer = { lastStatus: null };
  observers[name] = observer;
  return createClient(env.url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: async (...args) => {
        const response = await fetch(...args);
        observer.lastStatus = response.status;
        return response;
      },
    },
  });
}
const service = observedClient("service", env.serviceRoleKey);
const clients = { anonymous: observedClient("anonymous", env.anonKey) };
for (const role of roles.filter(item => item !== "anonymous")) {
  const client = observedClient(role, env.anonKey);
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
    if (role === "user_b") return state.ids.members.editor;
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

async function seedProjectMembership(projectId, role, dependencies) {
  if (!["user_a", "editor", "approver", "auditor", "admin"].includes(role)) return;
  const identity = env.plan.identities.find(item => item.key === role);
  const memberId = crypto.randomUUID();
  await serviceInsert("project_members", {
    id: memberId,
    project_id: projectId,
    user_id: state.users[role].id,
    name: `Matrix ${identity.label}`,
    email: state.users[role].email,
    project_role: identity.projectRole,
    cockpit_profile: identity.cockpitProfile,
    access_level: identity.accessLevel,
    ...identity.permissions,
    invitation_status: "accepted",
  });
  dependencies.push(["project_members", memberId]);
}

async function prepareTableCase(resource, scope, role, operation) {
  const id = crypto.randomUUID();
  const refs = base(scope);
  const actor = actorFor(role) || refs.owner;
  const dependencies = [];
  let payload;
  if (resource === "companies") payload = { id, name: `Matrix company ${id}`, created_by: operation === "insert" ? actor.id : refs.owner.id };
  if (resource === "projects") {
    const companyId = crypto.randomUUID();
    await serviceInsert("companies", { id: companyId, name: `Matrix dependency ${id}`, created_by: refs.owner.id });
    dependencies.push(["companies", companyId]);
    payload = { id, company_id: companyId, name: `Matrix project ${id}`, created_by: operation === "insert" ? actor.id : refs.owner.id };
  }
  if (resource === "project_members") payload = {
    id,
    project_id: refs.projectId,
    name: "Matrix member",
    email: `matrix-${id}@example.invalid`,
    project_role: "Viewer",
    access_level: "viewer",
    can_read: true,
    can_upload: false,
    can_edit: false,
    can_approve: false,
    can_manage_members: false,
    can_view_all_tasks: false,
    cockpit_profile: null,
    invitation_status: operation === "insert" ? "pending" : "accepted",
  };
  if (resource === "tasks") payload = { id, project_id: refs.projectId, technical_id: `MATRIX-${id}`, title: "Matrix task", responsible_member_id: scope === "A" ? state.ids.members.editor : state.ids.members.user_b, responsible_email: scope === "A" ? state.users.editor.email : state.users.user_b.email };
  if (resource === "task_rooms") {
    const taskId = crypto.randomUUID();
    await serviceInsert("tasks", { id: taskId, project_id: refs.projectId, technical_id: `MATRIX-ROOM-${id}`, title: "Matrix room dependency", responsible_member_id: scope === "A" ? state.ids.members.editor : state.ids.members.user_b, responsible_email: scope === "A" ? state.users.editor.email : state.users.user_b.email });
    dependencies.push(["tasks", taskId]);
    payload = { id, task_id: taskId, room_name: "Matrix room" };
  }
  if (resource === "task_room_folders") {
    const taskId = crypto.randomUUID();
    const roomId = crypto.randomUUID();
    await serviceInsert("tasks", { id: taskId, project_id: refs.projectId, technical_id: `MATRIX-FOLDER-${id}`, title: "Matrix folder dependency", responsible_member_id: scope === "A" ? state.ids.members.editor : state.ids.members.user_b, responsible_email: scope === "A" ? state.users.editor.email : state.users.user_b.email });
    await serviceInsert("task_rooms", { id: roomId, task_id: taskId, room_name: "Matrix folder room" });
    dependencies.push(["tasks", taskId]);
    payload = { id, task_room_id: roomId, folder_number: 1, folder_name: "Matrix folder" };
  }
  if (resource === "documents") payload = { id, project_id: refs.projectId, task_id: refs.taskId, folder_id: refs.folderId, storage_bucket: "lumina-datarooms", storage_path: `${refs.projectId}/${refs.taskId}/${refs.folderId}/${id}.txt`, file_name: `${id}.txt`, uploaded_by: role === "anonymous" ? null : actor.id };
  if (resource === "task_comments") payload = { id, task_id: refs.taskId, user_id: role === "anonymous" ? null : actor.id, author_name: role, message: "Matrix comment" };
  if (resource === "task_activity_events") payload = { id, task_id: refs.taskId, project_id: refs.projectId, event_type: "matrix", message: "Matrix activity", created_by: actor.id };
  if (resource === "task_approvals") payload = { id, task_id: refs.taskId, project_id: refs.projectId, step_name: "Matrix approval", responsible_user_id: scope === "A" ? state.users.approver.id : state.users.user_b.id, created_by: actor.id };
  if (resource === "task_review_notes") payload = { id, task_id: refs.taskId, project_id: refs.projectId, title: "Matrix review", description: "Matrix", assigned_to: scope === "A" ? state.users.approver.id : state.users.user_b.id, created_by: operation === "insert" ? actor.id : refs.owner.id };
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

async function readBack(table, id) {
  const result = await service.from(table).select("*").eq("id", id).maybeSingle();
  if (result.error) throw new Error(`Read-back ${table}: ${result.error.message}`);
  return result.data;
}

async function visibleCount(client, resource, id) {
  const result = await client.from(resource).select("id", { count: "exact" }).eq("id", id);
  return {
    count: result.count ?? result.data?.length ?? 0,
    httpStatus: result.status ?? null,
    errorCode: result.error?.code || null,
  };
}

async function runTableCase(testCase) {
  const { resource, operation, role, scope } = testCase;
  const client = clients[role];
  if (operation === "select") {
    const id = selectId(resource, scope, role);
    observers[role].lastStatus = null;
    const result = await client.from(resource).select("id", { count: "exact" }).eq("id", id);
    const visibleRows = result.count ?? result.data?.length ?? 0;
    return {
      allowed: !result.error && visibleRows === 1,
      httpStatus: observers[role].lastStatus ?? result.status ?? null,
      errorCode: result.error?.code || null,
      visibleRowsBefore: visibleRows,
      affectedRows: 0,
      returnedRows: result.data?.length ?? 0,
      visibleRowsAfter: visibleRows,
      beforeExists: true,
      afterExists: true,
      actualDataState: visibleRows === 1 ? "ROW_VISIBLE" : "ROW_HIDDEN",
    };
  }
  const prepared = await prepareTableCase(resource, scope, role, operation);
  try {
    if (["update", "delete"].includes(operation)) {
      await serviceInsert(resource, prepared.payload);
      if (resource === "projects") await seedProjectMembership(prepared.id, role, prepared.dependencies);
    }
    const before = await readBack(resource, prepared.id);
    const beforeVisibility = await visibleCount(client, resource, prepared.id);
    let result;
    observers[role].lastStatus = null;
    if (operation === "insert") result = await client.from(resource).insert(prepared.payload);
    if (operation === "update") result = await client.from(resource).update(updatePatch(resource)).eq("id", prepared.id);
    if (operation === "delete") result = await client.from(resource).delete().eq("id", prepared.id);
    const mutationHttpStatus = observers[role].lastStatus ?? result.status ?? null;
    const after = await readBack(resource, prepared.id);
    const afterVisibility = await visibleCount(client, resource, prepared.id);
    let allowed = false;
    let affectedRows = 0;
    let mutationField = null;
    let valueBefore = null;
    let valueAfter = null;
    if (operation === "insert") {
      affectedRows = !before && after ? 1 : 0;
      allowed = affectedRows === 1;
    }
    if (operation === "delete") {
      affectedRows = before && !after ? 1 : 0;
      allowed = affectedRows === 1;
    }
    if (operation === "update") {
      const [field, value] = Object.entries(updatePatch(resource))[0];
      mutationField = field;
      valueBefore = before?.[field] ?? null;
      valueAfter = after?.[field] ?? null;
      affectedRows = before && after && valueBefore !== valueAfter && valueAfter === value ? 1 : 0;
      allowed = affectedRows === 1;
    }
    return {
      allowed,
      httpStatus: mutationHttpStatus,
      errorCode: result.error?.code || null,
      visibleRowsBefore: beforeVisibility.count,
      affectedRows,
      returnedRows: result.data?.length ?? 0,
      visibleRowsAfter: afterVisibility.count,
      beforeExists: Boolean(before),
      afterExists: Boolean(after),
      mutationField,
      valueBefore,
      valueAfter,
      actualDataState: operation === "insert"
        ? (after ? "ROW_INSERTED" : "ROW_NOT_INSERTED")
        : operation === "delete"
          ? (after ? "ROW_RETAINED" : "ROW_DELETED")
          : affectedRows === 1 ? "ROW_UPDATED" : "ROW_UNCHANGED",
    };
  } finally {
    await cleanupTable(resource, prepared.id, prepared.dependencies);
  }
}

async function runStorageCase(testCase) {
  const { operation, role, scope } = testCase;
  const bucket = "lumina-datarooms";
  const client = clients[role].storage.from(bucket);
  if (operation === "select") {
    const folder = state.storagePaths[scope].slice(0, state.storagePaths[scope].lastIndexOf("/"));
    const objectPath = `${folder}/matrix-select-${crypto.randomUUID()}.txt`;
    try {
      const seeded = await service.storage.from(bucket).upload(
        objectPath,
        new Blob(["uncached matrix select fixture\n"], { type: "text/plain" }),
        { upsert: true, contentType: "text/plain" },
      );
      if (seeded.error) throw seeded.error;
      observers[role].lastStatus = null;
      const result = await client.download(objectPath);
      const downloadStatus = observers[role].lastStatus ?? result.error?.statusCode ?? (result.data ? 200 : null);
      observers[role].lastStatus = null;
      const signed = await client.createSignedUrl(objectPath, 60);
      return {
        allowed: !result.error && Boolean(result.data),
        httpStatus: downloadStatus,
        errorCode: result.error?.statusCode || result.error?.name || null,
        visibleRowsBefore: result.error ? 0 : 1,
        affectedRows: 0,
        returnedRows: result.error ? 0 : 1,
        visibleRowsAfter: result.error ? 0 : 1,
        beforeExists: true,
        afterExists: true,
        bucket,
        objectPath,
        signedUrlCreated: !signed.error && Boolean(signed.data?.signedUrl),
        signedUrlHttpStatus: observers[role].lastStatus ?? signed.error?.statusCode ?? (signed.data ? 200 : null),
        signedUrlErrorCode: signed.error?.statusCode || signed.error?.name || null,
        actualDataState: result.error ? "OBJECT_NOT_DOWNLOADABLE" : "OBJECT_DOWNLOADABLE",
      };
    } finally {
      await service.storage.from(bucket).remove([objectPath]);
    }
  }
  const refs = base(scope);
  const objectPath = `${refs.projectId}/${refs.taskId}/${refs.folderId}/matrix-${crypto.randomUUID()}.txt`;
  const content = new Blob(["synthetic matrix fixture\n"], { type: "text/plain" });
  const [fileName] = objectPath.split("/").slice(-1);
  const folderPath = objectPath.slice(0, -(fileName.length + 1));
  const objectExists = async () => {
    const listed = await service.storage.from(bucket).list(folderPath, { limit: 100, search: fileName });
    if (listed.error) throw listed.error;
    return listed.data.some(item => item.name === fileName);
  };
  const objectContent = async exists => {
    if (!exists) return null;
    const downloaded = await service.storage.from(bucket).download(objectPath);
    if (downloaded.error) throw downloaded.error;
    return downloaded.data.text();
  };
  const signedDownloadStatus = async signed => signed.error || !signed.data?.signedUrl
    ? null
    : (await fetch(signed.data.signedUrl)).status;
  try {
    if (["update", "delete"].includes(operation)) {
      const seeded = await service.storage.from(bucket).upload(objectPath, new Blob(["synthetic matrix seed\n"], { type: "text/plain" }), { upsert: true, contentType: "text/plain" });
      if (seeded.error) throw seeded.error;
    }
    const beforeExists = await objectExists();
    const contentBefore = await objectContent(beforeExists);
    const beforeVisible = await client.download(objectPath);
    observers[role].lastStatus = null;
    const signedBefore = await client.createSignedUrl(objectPath, 60);
    const signedBeforeStatus = observers[role].lastStatus ?? signedBefore.error?.statusCode ?? (signedBefore.data ? 200 : null);
    const signedBeforeDownloadStatus = await signedDownloadStatus(signedBefore);
    let result;
    observers[role].lastStatus = null;
    if (operation === "insert") result = await client.upload(objectPath, content, { upsert: false, contentType: "text/plain" });
    if (operation === "update") result = await client.update(objectPath, content, { upsert: true, contentType: "text/plain" });
    if (operation === "delete") result = await client.remove([objectPath]);
    const mutationHttpStatus = observers[role].lastStatus ?? result.error?.statusCode ?? (result.data ? 200 : null);
    const afterExists = await objectExists();
    const contentAfter = await objectContent(afterExists);
    const afterVisible = await client.download(objectPath);
    observers[role].lastStatus = null;
    const signedAfter = await client.createSignedUrl(objectPath, 60);
    const signedAfterDownloadStatus = await signedDownloadStatus(signedAfter);
    const affectedRows = operation === "insert"
      ? (!beforeExists && afterExists ? 1 : 0)
      : operation === "delete"
        ? (beforeExists && !afterExists ? 1 : 0)
        : beforeExists && afterExists && contentBefore !== contentAfter ? 1 : 0;
    const allowed = affectedRows === 1;
    return {
      allowed,
      httpStatus: mutationHttpStatus,
      errorCode: result.error?.statusCode || result.error?.name || null,
      visibleRowsBefore: beforeVisible.error ? 0 : 1,
      affectedRows,
      returnedRows: result.data ? 1 : 0,
      visibleRowsAfter: afterVisible.error ? 0 : 1,
      beforeExists,
      afterExists,
      bucket,
      objectPath,
      signedUrlCreated: !signedAfter.error && Boolean(signedAfter.data?.signedUrl),
      signedUrlHttpStatus: observers[role].lastStatus ?? signedAfter.error?.statusCode ?? (signedAfter.data ? 200 : null),
      signedUrlDownloadHttpStatus: signedAfterDownloadStatus,
      signedUrlErrorCode: signedAfter.error?.statusCode || signedAfter.error?.name || null,
      signedUrlBeforeCreated: !signedBefore.error && Boolean(signedBefore.data?.signedUrl),
      signedUrlBeforeHttpStatus: signedBeforeStatus,
      signedUrlBeforeDownloadHttpStatus: signedBeforeDownloadStatus,
      contentChanged: contentBefore !== contentAfter,
      actualDataState: operation === "insert"
        ? (afterExists ? "OBJECT_INSERTED" : "OBJECT_NOT_INSERTED")
        : operation === "delete"
          ? (afterExists ? "OBJECT_RETAINED" : "OBJECT_DELETED")
          : affectedRows === 1 ? "OBJECT_UPDATED" : "OBJECT_UNCHANGED",
    };
  } finally {
    await service.storage.from(bucket).remove([objectPath]);
  }
}

async function runPrivilegeProbes() {
  const probes = [];
  const updateProbe = async ({ probeId, actor, targetRole, field, value, expected, targetKind }) => {
    const targetId = state.ids.members[targetRole];
    const before = await readBack("project_members", targetId);
    const visibleBefore = await visibleCount(clients[actor], "project_members", targetId);
    observers[actor].lastStatus = null;
    const mutation = await clients[actor].from("project_members").update({ [field]: value }).eq("id", targetId);
    const httpStatus = observers[actor].lastStatus ?? mutation.status ?? null;
    const after = await readBack("project_members", targetId);
    const visibleAfter = await visibleCount(clients[actor], "project_members", targetId);
    const changed = before?.[field] !== after?.[field] && after?.[field] === value;
    await service.from("project_members").update({ [field]: before?.[field] }).eq("id", targetId);
    probes.push({
      probeId,
      actor,
      targetRole,
      targetKind,
      operation: "update",
      field,
      expected,
      httpStatus,
      errorCode: mutation.error?.code || null,
      visibleRowsBefore: visibleBefore.count,
      affectedRows: changed ? 1 : 0,
      visibleRowsAfter: visibleAfter.count,
      valueBefore: before?.[field] ?? null,
      valueAfter: after?.[field] ?? null,
      actualDataState: changed ? "ROW_UPDATED" : "ROW_UNCHANGED",
      passed: changed === expected,
    });
  };
  await updateProbe({ probeId: "PM-ESC-001", actor: "editor", targetRole: "editor", targetKind: "OWN_MEMBERSHIP", field: "project_role", value: "Admin", expected: false });
  await updateProbe({ probeId: "PM-ESC-002", actor: "editor", targetRole: "editor", targetKind: "OWN_MEMBERSHIP", field: "can_read", value: false, expected: false });
  await updateProbe({ probeId: "PM-ESC-003", actor: "editor", targetRole: "editor", targetKind: "OWN_MEMBERSHIP", field: "can_upload", value: false, expected: false });
  await updateProbe({ probeId: "PM-ESC-004", actor: "editor", targetRole: "editor", targetKind: "OWN_MEMBERSHIP", field: "can_edit", value: false, expected: false });
  await updateProbe({ probeId: "PM-ESC-005", actor: "editor", targetRole: "editor", targetKind: "OWN_MEMBERSHIP", field: "can_approve", value: true, expected: false });
  await updateProbe({ probeId: "PM-ESC-006", actor: "editor", targetRole: "editor", targetKind: "OWN_MEMBERSHIP", field: "can_manage_members", value: true, expected: false });
  await updateProbe({ probeId: "PM-ESC-007", actor: "editor", targetRole: "approver", targetKind: "FOREIGN_MEMBERSHIP", field: "can_approve", value: false, expected: false });
  await updateProbe({ probeId: "PM-ESC-008", actor: "admin", targetRole: "approver", targetKind: "FOREIGN_MEMBERSHIP", field: "can_approve", value: false, expected: false });

  const insertProbe = async ({ probeId, actor, expected }) => {
    const id = crypto.randomUUID();
    const payload = {
      id,
      project_id: state.ids.projects.A,
      name: `Privilege probe ${actor}`,
      email: `privilege-${id}@example.invalid`,
      project_role: "Viewer",
      access_level: "viewer",
      can_read: true,
      can_upload: false,
      can_edit: false,
    can_approve: false,
    can_manage_members: false,
      can_view_all_tasks: false,
      cockpit_profile: null,
      invitation_status: "pending",
    };
    observers[actor].lastStatus = null;
    const mutation = await clients[actor].from("project_members").insert(payload);
    const httpStatus = observers[actor].lastStatus ?? mutation.status ?? null;
    const after = await readBack("project_members", id);
    const visibleAfter = await visibleCount(clients[actor], "project_members", id);
    const inserted = Boolean(after);
    await service.from("project_members").delete().eq("id", id);
    probes.push({
      probeId,
      actor,
      targetRole: "new_member",
      targetKind: "NEW_MEMBERSHIP",
      operation: "insert",
      field: null,
      expected,
      httpStatus,
      errorCode: mutation.error?.code || null,
      visibleRowsBefore: 0,
      affectedRows: inserted ? 1 : 0,
      visibleRowsAfter: visibleAfter.count,
      valueBefore: null,
      valueAfter: inserted ? "ROW_PRESENT" : null,
      actualDataState: inserted ? "ROW_INSERTED" : "ROW_NOT_INSERTED",
      passed: inserted === expected,
    });
  };
  await insertProbe({ probeId: "PM-ESC-009", actor: "editor", expected: false });
  await insertProbe({ probeId: "PM-ESC-010", actor: "admin", expected: true });

  const visibilityProbe = async ({ probeId, actor, table, id, expected, setup, cleanup, detail }) => {
    try {
      if (setup) await setup();
      observers[actor].lastStatus = null;
      const visible = await visibleCount(clients[actor], table, id);
      probes.push({
        probeId, actor, targetKind: detail, operation: "select", expected,
        httpStatus: observers[actor].lastStatus ?? visible.httpStatus,
        errorCode: visible.errorCode,
        visibleRowsBefore: visible.count, affectedRows: 0, visibleRowsAfter: visible.count,
        actualDataState: visible.count === 1 ? "ROW_VISIBLE" : "ROW_HIDDEN",
        passed: (visible.count === 1) === expected,
      });
    } finally {
      if (cleanup) await cleanup();
    }
  };

  const auditorId = state.ids.members.auditor;
  const auditorBefore = await readBack("project_members", auditorId);
  const restoreAuditor = async () => {
    await service.from("project_members").update({
      user_id: auditorBefore.user_id,
      invitation_status: auditorBefore.invitation_status,
      project_role: auditorBefore.project_role,
      cockpit_profile: auditorBefore.cockpit_profile,
      can_view_all_tasks: auditorBefore.can_view_all_tasks,
    }).eq("id", auditorId);
  };

  await visibilityProbe({ probeId: "P2-RLS-001", actor: "editor", table: "projects", id: state.ids.projects.A, expected: true, detail: "ACCEPTED_MEMBERSHIP" });
  for (const [index, status] of ["pending", "invited", "declined", "inactive"].entries()) {
    await visibilityProbe({
      probeId: `P2-RLS-00${index + 2}`, actor: "auditor", table: "projects", id: state.ids.projects.A,
      expected: false, detail: `${status.toUpperCase()}_MEMBERSHIP`,
      setup: async () => { await service.from("project_members").update({ invitation_status: status }).eq("id", auditorId); },
      cleanup: restoreAuditor,
    });
  }
  await visibilityProbe({
    probeId: "P2-RLS-006", actor: "auditor", table: "projects", id: state.ids.projects.A,
    expected: false, detail: "UNLINKED_MEMBERSHIP",
    setup: async () => { await service.from("project_members").update({ user_id: null }).eq("id", auditorId); },
    cleanup: restoreAuditor,
  });
  await visibilityProbe({ probeId: "P2-RLS-007", actor: "editor", table: "tasks", id: state.ids.tasks.A, expected: true, detail: "OWN_TASK" });

  const substitutionId = () => crypto.randomUUID();
  const substitutionProbe = async ({ probeId, status, validFrom = null, validUntil = null, expected }) => {
    const id = substitutionId();
    await visibilityProbe({
      probeId, actor: "auditor", table: "tasks", id: state.ids.tasks.A, expected, detail: `${status.toUpperCase()}_SUBSTITUTION`,
      setup: async () => {
        const inserted = await service.from("project_member_substitutions").insert({
          id, project_id: state.ids.projects.A, principal_member_id: state.ids.members.editor,
          substitute_member_id: auditorId, status, valid_from: validFrom, valid_until: validUntil,
        });
        if (inserted.error) throw inserted.error;
      },
      cleanup: async () => { await service.from("project_member_substitutions").delete().eq("id", id); },
    });
  };
  await substitutionProbe({ probeId: "P2-RLS-008", status: "active", expected: true });
  await substitutionProbe({ probeId: "P2-RLS-009", status: "inactive", expected: false });
  await substitutionProbe({
    probeId: "P2-RLS-010", status: "active", expected: false,
    validFrom: "2020-01-01T00:00:00Z", validUntil: "2020-01-02T00:00:00Z",
  });

  const crossSubstitutionId = substitutionId();
  const crossSubstitution = await service.from("project_member_substitutions").insert({
    id: crossSubstitutionId, project_id: state.ids.projects.A,
    principal_member_id: state.ids.members.editor, substitute_member_id: state.ids.members.user_b,
    status: "active",
  });
  const crossSubstitutionAfter = await readBack("project_member_substitutions", crossSubstitutionId);
  probes.push({
    probeId: "P2-RLS-011", actor: "service_constraint_probe", targetKind: "CROSS_PROJECT_SUBSTITUTION",
    operation: "insert", expected: false, httpStatus: crossSubstitution.status ?? null,
    errorCode: crossSubstitution.error?.code || null, visibleRowsBefore: 0,
    affectedRows: crossSubstitutionAfter ? 1 : 0, visibleRowsAfter: crossSubstitutionAfter ? 1 : 0,
    actualDataState: crossSubstitutionAfter ? "ROW_INSERTED" : "ROW_NOT_INSERTED",
    passed: !crossSubstitutionAfter && crossSubstitution.error?.code === "23503",
  });
  if (crossSubstitutionAfter) await service.from("project_member_substitutions").delete().eq("id", crossSubstitutionId);

  await visibilityProbe({ probeId: "P2-RLS-012", actor: "auditor", table: "tasks", id: state.ids.tasks.A, expected: false, detail: "WORKER_FOREIGN_TASK" });
  await visibilityProbe({
    probeId: "P2-RLS-013", actor: "auditor", table: "tasks", id: state.ids.tasks.A, expected: true, detail: "EXPLICIT_VIEW_ALL",
    setup: async () => { await service.from("project_members").update({ can_view_all_tasks: true }).eq("id", auditorId); },
    cleanup: restoreAuditor,
  });
  await visibilityProbe({ probeId: "P2-RLS-014", actor: "auditor", table: "tasks", id: state.ids.tasks.A, expected: false, detail: "NO_VIEW_ALL" });

  const safeInvitationAttempt = async ({ probeId, actor, profile, role }) => {
    const actorId = state.ids.members[actor];
    const before = await readBack("project_members", actorId);
    const id = crypto.randomUUID();
    await service.from("project_members").update({ project_role: role, cockpit_profile: profile, can_manage_members: false }).eq("id", actorId);
    observers[actor].lastStatus = null;
    const mutation = await clients[actor].from("project_members").insert({
      id, project_id: state.ids.projects.A, user_id: null, name: `Phase 2 ${role}`,
      email: `phase2-${id}@example.invalid`, project_role: "Bilanzbuchhaltung", cockpit_profile: null,
      access_level: "viewer", can_read: true, can_upload: false, can_edit: false,
      can_approve: false, can_manage_members: false, can_view_all_tasks: false, invitation_status: "pending",
    });
    const after = await readBack("project_members", id);
    await service.from("project_members").delete().eq("id", id);
    await service.from("project_members").update({
      project_role: before.project_role, cockpit_profile: before.cockpit_profile,
      can_manage_members: before.can_manage_members,
    }).eq("id", actorId);
    probes.push({
      probeId, actor, targetKind: `${profile.toUpperCase()}_WITHOUT_MANAGE`, operation: "insert", expected: false,
      httpStatus: observers[actor].lastStatus ?? mutation.status ?? null, errorCode: mutation.error?.code || null,
      visibleRowsBefore: 0, affectedRows: after ? 1 : 0, visibleRowsAfter: after ? 1 : 0,
      actualDataState: after ? "ROW_INSERTED" : "ROW_NOT_INSERTED", passed: !after,
    });
  };
  await safeInvitationAttempt({ probeId: "P2-RLS-015", actor: "approver", profile: "cfo", role: "CFO / Geschäftsführung" });
  await safeInvitationAttempt({ probeId: "P2-RLS-016", actor: "approver", profile: "project", role: "Projektleitung Abschluss" });

  const adminInviteId = crypto.randomUUID();
  const adminInvite = await clients.admin.from("project_members").insert({
    id: adminInviteId, project_id: state.ids.projects.A, user_id: null, name: "Phase 2 safe invitation",
    email: `phase2-${adminInviteId}@example.invalid`, project_role: "Bilanzbuchhaltung", cockpit_profile: null,
    access_level: "viewer", can_read: true, can_upload: false, can_edit: false,
    can_approve: false, can_manage_members: false, can_view_all_tasks: false, invitation_status: "pending",
  });
  const adminInviteAfter = await readBack("project_members", adminInviteId);
  probes.push({
    probeId: "P2-RLS-017", actor: "admin", targetKind: "EXPLICIT_MANAGER_SAFE_INVITATION",
    operation: "insert", expected: true, httpStatus: adminInvite.status ?? null, errorCode: adminInvite.error?.code || null,
    visibleRowsBefore: 0, affectedRows: adminInviteAfter ? 1 : 0, visibleRowsAfter: adminInviteAfter ? 1 : 0,
    actualDataState: adminInviteAfter ? "ROW_INSERTED" : "ROW_NOT_INSERTED", passed: Boolean(adminInviteAfter),
  });
  await service.from("project_members").delete().eq("id", adminInviteId);

  await visibilityProbe({
    probeId: "P2-RLS-018", actor: "auditor", table: "tasks", id: state.ids.tasks.A, expected: false, detail: "UNKNOWN_PROFILE",
    setup: async () => { await service.from("project_members").update({ project_role: "Unbekannte Altrolle", cockpit_profile: null }).eq("id", auditorId); },
    cleanup: restoreAuditor,
  });
  await updateProbe({ probeId: "P2-RLS-019", actor: "editor", targetRole: "editor", targetKind: "OWN_PROFILE", field: "cockpit_profile", value: "cfo", expected: false });
  await updateProbe({ probeId: "P2-RLS-020", actor: "editor", targetRole: "editor", targetKind: "OWN_TASK_SCOPE", field: "can_view_all_tasks", value: true, expected: false });
  await updateProbe({ probeId: "P2-RLS-021", actor: "editor", targetRole: "approver", targetKind: "FOREIGN_USER_ID", field: "user_id", value: state.users.editor.id, expected: false });
  await updateProbe({ probeId: "P2-RLS-022", actor: "admin", targetRole: "approver", targetKind: "FOREIGN_PROJECT_ID", field: "project_id", value: state.ids.projects.B, expected: false });

  const constraintProbe = async ({ probeId, table, payload, targetKind }) => {
    observers.admin.lastStatus = null;
    const mutation = await clients.admin.from(table).insert(payload);
    const after = await readBack(table, payload.id);
    probes.push({
      probeId, actor: "admin", targetKind, operation: "insert", expected: false,
      httpStatus: observers.admin.lastStatus ?? mutation.status ?? null, errorCode: mutation.error?.code || null,
      visibleRowsBefore: 0, affectedRows: after ? 1 : 0, visibleRowsAfter: after ? 1 : 0,
      actualDataState: after ? "ROW_INSERTED" : "ROW_NOT_INSERTED",
      passed: !after && mutation.error?.code === "23503",
    });
    if (after) await service.from(table).delete().eq("id", payload.id);
  };
  await constraintProbe({
    probeId: "P2-RLS-023", table: "documents", targetKind: "PROJECT_TASK_MISMATCH_DOCUMENT",
    payload: {
      id: crypto.randomUUID(), project_id: state.ids.projects.B, task_id: state.ids.tasks.A,
      folder_id: null, storage_bucket: "lumina-datarooms", storage_path: `mismatch/${crypto.randomUUID()}`,
      file_name: "mismatch.txt", uploaded_by: state.users.admin.id,
    },
  });

  const actingSubstitutionId = substitutionId();
  await service.from("project_member_substitutions").insert({
    id: actingSubstitutionId, project_id: state.ids.projects.A,
    principal_member_id: state.ids.members.editor, substitute_member_id: auditorId, status: "active",
  });
  const actorEventId = crypto.randomUUID();
  const validActorEvent = await clients.auditor.from("task_activity_events").insert({
    id: actorEventId, project_id: state.ids.projects.A, task_id: state.ids.tasks.A,
    event_type: "substitution_probe", message: "Acting substitute", created_by: state.users.auditor.id,
  });
  const actorEvent = await readBack("task_activity_events", actorEventId);
  const spoofEventId = crypto.randomUUID();
  const spoofActor = await clients.auditor.from("task_activity_events").insert({
    id: spoofEventId, project_id: state.ids.projects.A, task_id: state.ids.tasks.A,
    event_type: "substitution_probe", message: "Spoofed principal", created_by: state.users.editor.id,
  });
  const spoofEvent = await readBack("task_activity_events", spoofEventId);
  probes.push({
    probeId: "P2-RLS-024", actor: "auditor", targetKind: "SUBSTITUTE_ACTOR_IDENTITY", operation: "insert",
    expected: true, httpStatus: validActorEvent.status ?? null,
    errorCode: validActorEvent.error?.code || spoofActor.error?.code || null,
    visibleRowsBefore: 0, affectedRows: actorEvent && !spoofEvent ? 1 : 0, visibleRowsAfter: actorEvent ? 1 : 0,
    actualDataState: actorEvent?.created_by === state.users.auditor.id && !spoofEvent ? "ACTOR_PRESERVED_SPOOF_REJECTED" : "ACTOR_INTEGRITY_FAILED",
    passed: actorEvent?.created_by === state.users.auditor.id && !spoofEvent,
  });
  await service.from("task_activity_events").delete().in("id", [actorEventId, spoofEventId]);
  await service.from("project_member_substitutions").delete().eq("id", actingSubstitutionId);

  const spoofCommentId = crypto.randomUUID();
  const spoofComment = await clients.editor.from("task_comments").insert({
    id: spoofCommentId, task_id: state.ids.tasks.A, user_id: state.users.editor.id,
    author_name: "KIRA", author_type: "system", comment_type: "system", message: "spoof",
  });
  const spoofCommentAfter = await readBack("task_comments", spoofCommentId);
  probes.push({
    probeId: "P2-RLS-025", actor: "editor", targetKind: "SYSTEM_AUTHOR_IMPERSONATION", operation: "insert",
    expected: false, httpStatus: spoofComment.status ?? null, errorCode: spoofComment.error?.code || null,
    visibleRowsBefore: 0, affectedRows: spoofCommentAfter ? 1 : 0, visibleRowsAfter: spoofCommentAfter ? 1 : 0,
    actualDataState: spoofCommentAfter ? "ROW_INSERTED" : "ROW_NOT_INSERTED", passed: !spoofCommentAfter,
  });
  if (spoofCommentAfter) await service.from("task_comments").delete().eq("id", spoofCommentId);

  await constraintProbe({
    probeId: "P2-RLS-026", table: "task_activity_events", targetKind: "PROJECT_TASK_MISMATCH_ACTIVITY",
    payload: {
      id: crypto.randomUUID(), project_id: state.ids.projects.B, task_id: state.ids.tasks.A,
      event_type: "mismatch", message: "mismatch", created_by: state.users.admin.id,
    },
  });
  await updateProbe({ probeId: "P2-RLS-027", actor: "editor", targetRole: "editor", targetKind: "ACCESS_LEVEL_NO_ESCALATION", field: "access_level", value: "admin", expected: false });
  return probes;
}

const startedAt = new Date().toISOString();
const results = [];
const selectedCases = probesOnly
  ? []
  : requestedResources
  ? plan.cases.filter(item => requestedResources.has(item.resource))
  : plan.cases;
for (const testCase of selectedCases) {
  const actual = testCase.resource.startsWith("storage:")
    ? await runStorageCase(testCase)
    : await runTableCase(testCase);
  results.push({ ...testCase, ...actual, passed: actual.allowed === testCase.expected });
}

const mutationResults = results.filter(item => item.operation !== "select");
const privilegeProbes = requestedResources && !probesOnly ? [] : await runPrivilegeProbes();
const selectResults = results.filter(item => item.operation === "select");
const summary = {
  status: results.every(item => item.passed) && privilegeProbes.every(item => item.passed) ? "PASS" : "FAIL",
  startedAt,
  finishedAt: new Date().toISOString(),
  resources: resources.length,
  roles: roles.length,
  operations: operations.length,
  plannedCases: selectedCases.length,
  executedCases: results.length,
  passedCases: results.filter(item => item.passed).length,
  failedCases: results.filter(item => !item.passed).length,
  expectedVisibleSelectCases: selectResults.filter(item => item.expected).length,
  actualVisibleSelectCases: selectResults.filter(item => item.visibleRowsAfter === 1).length,
  expectedVisibleSelectRows: selectResults.filter(item => item.expected).length,
  actualVisibleSelectRows: selectResults.reduce((sum, item) => sum + (item.visibleRowsAfter || 0), 0),
  successfulMutations: mutationResults.filter(item => item.allowed).length,
  visibilityAfterMutations: mutationResults.reduce((sum, item) => sum + (item.visibleRowsAfter || 0), 0),
  expectedDeniedMutations: mutationResults.filter(item => !item.expected).length,
  actualDeniedMutations: mutationResults.filter(item => !item.allowed).length,
  productionApplied: false,
  testEnvironmentMutations: true,
  targetedResources: requestedResources ? [...requestedResources] : null,
  failures: results.filter(item => !item.passed),
  privilegeProbes: {
    executed: privilegeProbes.length,
    passed: privilegeProbes.filter(item => item.passed).length,
    failed: privilegeProbes.filter(item => !item.passed).length,
  },
};
const resultFile = probesOnly
  ? ".test-state/rls-privilege-probes.json"
  : requestedResources
    ? ".test-state/rls-results-targeted.json"
    : ".test-state/rls-results.json";
const resultPath = path.join(env.root, resultFile);
await fs.writeFile(resultPath, JSON.stringify({ summary, results, privilegeProbes }, null, 2), "utf8");
summary.resultFile = resultFile;
console.log(JSON.stringify(summary, null, 2));
process.exitCode = summary.status === "PASS" ? 0 : 1;
