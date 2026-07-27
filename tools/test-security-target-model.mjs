import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { requireTestEnvironment } from "../tests/security/test-env.mjs";

const env = requireTestEnvironment({ requireWriteGuard: true });
const state = JSON.parse(await fs.readFile(path.join(env.root, ".test-state", "fixtures.json"), "utf8"));
if (state.projectRef !== env.projectRef) throw new Error("Fixture project mismatch");

const observers = {};
function clientFor(name, key) {
  const observer = { status: null };
  observers[name] = observer;
  return createClient(env.url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (...args) => {
      const response = await fetch(...args);
      observer.status = response.status;
      return response;
    } },
  });
}

const service = clientFor("service", env.serviceRoleKey);
const clients = { anonymous: clientFor("anonymous", env.anonKey) };
for (const role of ["user_a", "editor", "admin"]) {
  const client = clientFor(role, env.anonKey);
  const login = await client.auth.signInWithPassword({ email: state.users[role].email, password: env.password });
  if (login.error) throw new Error(`Login failed for ${role}: ${login.error.message}`);
  clients[role] = client;
}

const results = [];
const temporaryStorage = new Set();
const temporaryMembers = new Set();
const add = result => results.push({ ...result, passed: result.actual === result.expected });
const statusOf = (name, result) => observers[name].status ?? result?.status ?? result?.error?.statusCode ?? null;
const readMember = async id => {
  const result = await service.from("project_members").select("*").eq("id", id).maybeSingle();
  if (result.error) throw result.error;
  return result.data;
};
const storageFolder = state.storagePaths.A.slice(0, state.storagePaths.A.lastIndexOf("/"));
const storagePath = label => `${storageFolder}/proof-${label}-${crypto.randomUUID()}.txt`;
const storageExists = async objectPath => {
  const file = objectPath.slice(objectPath.lastIndexOf("/") + 1);
  const folder = objectPath.slice(0, objectPath.lastIndexOf("/"));
  const listed = await service.storage.from("lumina-datarooms").list(folder, { limit: 100, search: file });
  if (listed.error) throw listed.error;
  return listed.data.some(item => item.name === file);
};
const storageContent = async objectPath => {
  const downloaded = await service.storage.from("lumina-datarooms").download(objectPath);
  if (downloaded.error) throw downloaded.error;
  return downloaded.data.text();
};
const seedStorage = async objectPath => {
  temporaryStorage.add(objectPath);
  const seeded = await service.storage.from("lumina-datarooms").upload(
    objectPath,
    new Blob(["proof seed\n"], { type: "text/plain" }),
    { upsert: true, contentType: "text/plain" },
  );
  if (seeded.error) throw seeded.error;
};
const memberPayload = (id, projectId, label) => ({
  id,
  project_id: projectId,
  name: `Target model ${label}`,
  email: `target-${id}@example.invalid`,
  project_role: "Viewer",
  access_level: "viewer",
  can_read: true,
  can_upload: false,
  can_edit: false,
  can_approve: false,
  can_manage_members: false,
  invitation_status: "accepted",
});
const seedMember = async (projectId, label) => {
  const id = crypto.randomUUID();
  temporaryMembers.add(id);
  const inserted = await service.from("project_members").insert(memberPayload(id, projectId, label));
  if (inserted.error) throw inserted.error;
  return id;
};

async function storageMutationProof({ id, role, operation, expected }) {
  const objectPath = storagePath(`${role}-${operation}`);
  temporaryStorage.add(objectPath);
  if (operation === "update") await seedStorage(objectPath);
  const beforeExists = await storageExists(objectPath);
  const beforeContent = beforeExists ? await storageContent(objectPath) : null;
  observers[role].status = null;
  const result = operation === "insert"
    ? await clients[role].storage.from("lumina-datarooms").upload(
      objectPath,
      new Blob(["proof inserted\n"], { type: "text/plain" }),
      { upsert: false, contentType: "text/plain" },
    )
    : await clients[role].storage.from("lumina-datarooms").update(
      objectPath,
      new Blob(["proof updated\n"], { type: "text/plain" }),
      { upsert: true, contentType: "text/plain" },
    );
  const httpStatus = statusOf(role, result);
  const afterExists = await storageExists(objectPath);
  const afterContent = afterExists ? await storageContent(objectPath) : null;
  const changed = operation === "insert"
    ? !beforeExists && afterExists
    : beforeExists && afterExists && beforeContent !== afterContent;
  add({
    id,
    area: "storage",
    actor: role,
    operation,
    expected,
    actual: changed,
    httpStatus,
    errorCode: result.error?.statusCode || result.error?.name || null,
    beforeExists,
    afterExists,
    contentChanged: beforeContent !== afterContent,
    actualDataState: changed ? (operation === "insert" ? "OBJECT_INSERTED" : "OBJECT_UPDATED") : "OBJECT_UNCHANGED",
  });
}

async function flagProof({ id, actor, targetId, targetKind, field, value, expected }) {
  const before = await readMember(targetId);
  observers[actor].status = null;
  const mutation = await clients[actor].from("project_members").update({ [field]: value }).eq("id", targetId);
  const after = await readMember(targetId);
  const changed = before[field] !== after[field] && after[field] === value;
  await service.from("project_members").update({ [field]: before[field] }).eq("id", targetId);
  add({
    id,
    area: "project_members",
    actor,
    targetKind,
    operation: "update",
    field,
    expected,
    actual: changed,
    httpStatus: statusOf(actor, mutation),
    errorCode: mutation.error?.code || null,
    beforeValue: before[field],
    afterValue: after[field],
    actualDataState: changed ? "ROW_UPDATED" : "ROW_UNCHANGED",
  });
}

async function memberInsertProof({ id, project, expected }) {
  const memberId = crypto.randomUUID();
  temporaryMembers.add(memberId);
  const payload = {
    ...memberPayload(memberId, state.ids.projects[project], `admin-${project}`),
    cockpit_profile: null,
    can_view_all_tasks: false,
    invitation_status: "pending",
  };
  observers.admin.status = null;
  const mutation = await clients.admin.from("project_members").insert(payload);
  const after = await readMember(memberId);
  add({
    id,
    area: "project_members",
    actor: "admin",
    targetKind: `PROJECT_${project}`,
    operation: "insert",
    expected,
    actual: Boolean(after),
    httpStatus: statusOf("admin", mutation),
    errorCode: mutation.error?.code || null,
    actualDataState: after ? "ROW_INSERTED" : "ROW_NOT_INSERTED",
  });
}

async function memberDeleteProof({ id, project, expected }) {
  const memberId = await seedMember(state.ids.projects[project], `delete-${project}`);
  observers.admin.status = null;
  const mutation = await clients.admin.from("project_members").delete().eq("id", memberId);
  const after = await readMember(memberId);
  add({
    id,
    area: "project_members",
    actor: "admin",
    targetKind: `PROJECT_${project}`,
    operation: "delete",
    expected,
    actual: !after,
    httpStatus: statusOf("admin", mutation),
    errorCode: mutation.error?.code || null,
    actualDataState: after ? "ROW_RETAINED" : "ROW_DELETED",
  });
}

try {
  observers.anonymous.status = null;
  const anonDocuments = await clients.anonymous.from("documents").select("id", { count: "exact" });
  const anonDocumentCount = anonDocuments.count ?? anonDocuments.data?.length ?? 0;
  add({ id: "ANON-001", area: "documents", actor: "anonymous", operation: "select", expected: 0, actual: anonDocumentCount, httpStatus: statusOf("anonymous", anonDocuments), errorCode: anonDocuments.error?.code || null, actualDataState: `${anonDocumentCount}_ROWS_VISIBLE` });

  const anonymousReadPath = storagePath("anonymous-read");
  await seedStorage(anonymousReadPath);
  observers.anonymous.status = null;
  const anonDownload = await clients.anonymous.storage.from("lumina-datarooms").download(anonymousReadPath);
  add({ id: "ANON-002", area: "storage", actor: "anonymous", operation: "download", expected: false, actual: Boolean(anonDownload.data) && !anonDownload.error, httpStatus: statusOf("anonymous", anonDownload), errorCode: anonDownload.error?.statusCode || anonDownload.error?.name || null, actualDataState: anonDownload.error ? "OBJECT_NOT_DOWNLOADABLE" : "OBJECT_DOWNLOADABLE" });

  observers.anonymous.status = null;
  const anonSigned = await clients.anonymous.storage.from("lumina-datarooms").createSignedUrl(anonymousReadPath, 60);
  add({ id: "ANON-003", area: "storage", actor: "anonymous", operation: "create_signed_url", expected: false, actual: Boolean(anonSigned.data?.signedUrl) && !anonSigned.error, httpStatus: statusOf("anonymous", anonSigned), errorCode: anonSigned.error?.statusCode || anonSigned.error?.name || null, actualDataState: anonSigned.error ? "SIGNED_URL_NOT_CREATED" : "SIGNED_URL_CREATED" });

  await storageMutationProof({ id: "ANON-004", role: "anonymous", operation: "insert", expected: false });
  await storageMutationProof({ id: "UPLOAD-001", role: "user_a", operation: "insert", expected: false });
  await storageMutationProof({ id: "UPLOAD-002", role: "user_a", operation: "update", expected: false });
  await storageMutationProof({ id: "UPLOAD-003", role: "editor", operation: "insert", expected: true });
  await storageMutationProof({ id: "UPLOAD-004", role: "editor", operation: "update", expected: true });

  const own = await readMember(state.ids.members.editor);
  const foreign = await readMember(state.ids.members.approver);
  for (const field of ["can_read", "can_upload", "can_edit", "can_approve", "can_manage_members"]) {
    await flagProof({ id: `FLAGS-OWN-${field}`, actor: "editor", targetId: own.id, targetKind: "OWN_MEMBERSHIP", field, value: !own[field], expected: false });
    await flagProof({ id: `FLAGS-FOREIGN-${field}`, actor: "editor", targetId: foreign.id, targetKind: "FOREIGN_MEMBERSHIP_PROJECT_A", field, value: !foreign[field], expected: false });
  }

  await flagProof({ id: "ADMIN-A-UPDATE", actor: "admin", targetId: state.ids.members.approver, targetKind: "FOREIGN_MEMBERSHIP_PROJECT_A", field: "can_approve", value: false, expected: false });
  await memberInsertProof({ id: "ADMIN-A-INSERT", project: "A", expected: true });
  await memberDeleteProof({ id: "ADMIN-A-DELETE", project: "A", expected: false });
  await flagProof({ id: "ADMIN-B-UPDATE", actor: "admin", targetId: state.ids.members.user_b, targetKind: "FOREIGN_MEMBERSHIP_PROJECT_B", field: "can_upload", value: true, expected: false });
  await memberInsertProof({ id: "ADMIN-B-INSERT", project: "B", expected: false });
  await memberDeleteProof({ id: "ADMIN-B-DELETE", project: "B", expected: false });
} finally {
  for (const objectPath of temporaryStorage) await service.storage.from("lumina-datarooms").remove([objectPath]);
  if (temporaryMembers.size) await service.from("project_members").delete().in("id", [...temporaryMembers]);
}

const summary = {
  status: results.every(item => item.passed) ? "PASS" : "FAIL",
  executed: results.length,
  passed: results.filter(item => item.passed).length,
  failed: results.filter(item => !item.passed).length,
  failures: results.filter(item => !item.passed),
  productionApplied: false,
  linked: false,
};
await fs.writeFile(path.join(env.root, ".test-state", "target-model-proofs.json"), JSON.stringify({ summary, results }, null, 2), "utf8");
console.log(JSON.stringify(summary, null, 2));
process.exitCode = summary.status === "PASS" ? 0 : 1;
