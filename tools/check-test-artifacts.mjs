import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { requireTestEnvironment } from "../tests/security/test-env.mjs";

const env = requireTestEnvironment({ requireWriteGuard: true });
const state = JSON.parse(await fs.readFile(path.join(env.root, ".test-state", "fixtures.json"), "utf8"));
if (state.projectRef !== env.projectRef) throw new Error("Fixture project mismatch");
const service = createClient(env.url, env.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const checks = [
  ["companies", "name", "Matrix%"],
  ["projects", "name", "Matrix%"],
  ["project_members", "email", "matrix-%"],
  ["project_members", "email", "privilege-%"],
  ["project_members", "email", "target-%"],
  ["tasks", "technical_id", "MATRIX-%"],
  ["task_rooms", "room_name", "Matrix%"],
  ["task_room_folders", "folder_name", "Matrix%"],
  ["task_comments", "message", "Matrix%"],
  ["task_activity_events", "event_type", "matrix"],
  ["task_approvals", "step_name", "Matrix%"],
  ["task_review_notes", "title", "Matrix%"],
  ["task_notifications", "subject", "Matrix%"],
  ["task_responses", "message", "Matrix%"],
];
const results = [];
for (const [table, column, pattern] of checks) {
  const query = service.from(table).select("id", { count: "exact", head: true });
  const response = pattern.includes("%") ? await query.ilike(column, pattern) : await query.eq(column, pattern);
  if (response.error) throw response.error;
  results.push({ resource: table, selector: `${column}:${pattern}`, count: response.count ?? 0 });
}

const fixtureIds = {
  companies: Object.values(state.ids.companies),
  projects: Object.values(state.ids.projects),
  project_members: Object.values(state.ids.members),
  tasks: Object.values(state.ids.tasks),
  task_rooms: Object.values(state.ids.rooms),
  task_room_folders: Object.values(state.ids.folders),
  documents: Object.values(state.ids.documents),
  task_comments: Object.values(state.ids.comments),
  task_activity_events: Object.values(state.ids.activities),
  task_approvals: Object.values(state.ids.approvals),
  task_review_notes: Object.values(state.ids.reviews),
  task_notifications: Object.values(state.ids.notifications),
  task_responses: Object.values(state.ids.responses),
};
for (const [table, ids] of Object.entries(fixtureIds)) {
  const response = await service
    .from(table)
    .select("id", { count: "exact", head: true })
    .not("id", "in", `(${ids.join(",")})`);
  if (response.error) throw response.error;
  results.push({ resource: table, selector: "outside_deterministic_fixture_ids", count: response.count ?? 0 });
}

for (const scope of ["A", "B"]) {
  const objectPath = state.storagePaths[scope];
  const folder = objectPath.slice(0, objectPath.lastIndexOf("/"));
  const fixtureName = objectPath.slice(objectPath.lastIndexOf("/") + 1);
  const allObjects = await service.storage.from("lumina-datarooms").list(folder, { limit: 1000 });
  if (allObjects.error) throw allObjects.error;
  results.push({ resource: `storage:${scope}`, selector: "outside_fixture_object", count: allObjects.data.filter(item => item.name !== fixtureName).length });
  for (const prefix of ["matrix-", "matrix-select-", "proof-"]) {
    const response = await service.storage.from("lumina-datarooms").list(folder, { limit: 1000, search: prefix });
    if (response.error) throw response.error;
    results.push({ resource: `storage:${scope}`, selector: prefix, count: response.data.filter(item => item.name.startsWith(prefix)).length });
  }
}

const temporaryArtifacts = results.reduce((sum, item) => sum + item.count, 0);
console.log(JSON.stringify({
  status: temporaryArtifacts === 0 ? "PASS" : "FAIL",
  environment: "separate-test-project",
  temporaryArtifacts,
  checks: results,
  productionApplied: false,
  linked: false,
}, null, 2));
process.exitCode = temporaryArtifacts === 0 ? 0 : 1;
