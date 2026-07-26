export const roles = ["user_a", "user_b", "editor", "approver", "auditor", "admin", "anonymous"];
export const operations = ["select", "insert", "update", "delete"];
export const resources = [
  "companies", "projects", "project_members", "tasks", "task_rooms",
  "task_room_folders", "documents", "task_comments", "task_activity_events",
  "task_approvals", "task_review_notes", "task_notifications",
  "task_responses", "storage:lumina-datarooms",
];

const projectAAccess = new Set(["user_a", "editor", "approver", "auditor", "admin"]);
const projectAManagers = new Set(["user_a", "admin"]);
const projectAEditors = new Set(["user_a", "editor", "admin"]);
const authenticated = role => role !== "anonymous";
const canUpload = (role, scope) => scope === "A"
  ? new Set(["editor", "admin"]).has(role)
  : false;

export function expectedAllowed({ resource, operation, role, scope = "A" }) {
  const foreign = scope === "A" ? role === "user_b" : role !== "user_b";
  const access = scope === "A" ? projectAAccess.has(role) : role === "user_b";
  const manager = scope === "A" ? projectAManagers.has(role) : role === "user_b";
  const editor = scope === "A" ? projectAEditors.has(role) : role === "user_b";

  if (resource === "companies") {
    if (operation === "insert") return authenticated(role);
    if (operation === "delete") return false;
    return scope === "A" ? role === "user_a" : role === "user_b";
  }
  if (resource === "projects") {
    if (operation === "select") return access;
    if (operation === "insert") return scope === "A" ? role === "user_a" : role === "user_b";
    if (operation === "update") return manager;
    if (operation === "delete") return scope === "A" ? role === "user_a" : role === "user_b";
  }
  if (resource === "project_members") {
    if (operation === "select") return access && !foreign;
    if (["update", "delete"].includes(operation) && role === "admin") return false;
    return manager;
  }
  if (resource === "tasks") {
    if (operation === "select") return access;
    if (operation === "update") return editor;
    return manager;
  }
  if (["task_rooms", "task_room_folders"].includes(resource)) {
    if (operation === "select") return access;
    return editor;
  }
  if (resource === "documents") {
    if (operation === "select") return access;
    if (operation === "insert") return editor && authenticated(role);
    return editor && authenticated(role);
  }
  if (resource === "task_comments") {
    if (operation === "select") return access;
    if (operation === "insert") return access && authenticated(role);
    return false;
  }
  if (resource === "task_activity_events") {
    if (["select", "insert"].includes(operation)) return access;
    return false;
  }
  if (resource === "task_approvals") {
    if (operation === "select") return access;
    if (operation === "update") return manager || (scope === "A" && role === "approver");
    if (["insert", "delete"].includes(operation)) return manager;
  }
  if (resource === "task_review_notes") {
    if (["select", "insert"].includes(operation)) return access;
    if (operation === "update") return manager || (scope === "A" && role === "approver");
    if (operation === "delete") return manager;
  }
  if (resource === "task_notifications") {
    if (operation === "select") return manager || (scope === "A" && role === "approver");
    if (["insert", "update"].includes(operation)) return manager;
    return false;
  }
  if (resource === "task_responses") {
    if (operation === "select") return access;
    if (operation === "insert") return access && authenticated(role);
    return false;
  }
  if (resource === "storage:lumina-datarooms") {
    if (operation === "select") return access && authenticated(role);
    if (["insert", "update"].includes(operation)) return canUpload(role, scope);
    if (operation === "delete") return manager;
  }
  return false;
}

export function planSummary() {
  const base = [];
  for (const resource of resources) for (const role of roles) for (const operation of operations) {
    base.push({ resource, role, operation, scope: "A", expected: expectedAllowed({ resource, role, operation, scope: "A" }) });
  }
  const cross = [];
  for (const resource of resources) {
    cross.push({ resource, role: "user_a", operation: "select", scope: "B", expected: expectedAllowed({ resource, role: "user_a", operation: "select", scope: "B" }) });
    cross.push({ resource, role: "user_b", operation: "select", scope: "A", expected: expectedAllowed({ resource, role: "user_b", operation: "select", scope: "A" }) });
  }
  const all = [...base, ...cross];
  const identified = all.map((item, index) => ({
    ...item,
    caseId: `RLS-${String(index + 1).padStart(3, "0")}`,
    project: item.scope,
    directUuid: item.operation !== "insert",
    foreignProject: item.scope === "A" ? item.role === "user_b" : item.role !== "user_b",
  }));
  return {
    resources: resources.length,
    roles: roles.length,
    operations: operations.length,
    baseCases: base.length,
    directKnownUuidCases: base.filter(item => item.operation === "select").length,
    crossProjectCases: cross.length,
    plannedCases: all.length,
    expectedAllowed: identified.filter(item => item.expected).length,
    expectedDenied: identified.filter(item => !item.expected).length,
    cases: identified,
  };
}
