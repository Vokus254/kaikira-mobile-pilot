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

export function expectedAllowed({ resource, operation, role, scope = "A" }) {
  const foreign = scope === "A" ? role === "user_b" : role !== "user_b";
  const access = scope === "A" ? projectAAccess.has(role) : role === "user_b";
  const manager = scope === "A" ? projectAManagers.has(role) : role === "user_b";
  const editor = scope === "A" ? projectAEditors.has(role) : role === "user_b";

  if (resource === "companies") {
    if (operation === "insert") return authenticated(role);
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
    if (["select", "insert"].includes(operation)) return true;
    return editor && authenticated(role);
  }
  if (resource === "task_comments") {
    if (operation === "select") return access;
    if (operation === "insert") return true;
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
    if (operation === "insert") return true;
    return false;
  }
  if (resource === "storage:lumina-datarooms") {
    if (["select", "insert"].includes(operation)) return true;
    if (operation === "update") return scope === "A"
      ? new Set(["editor", "approver", "auditor", "admin"]).has(role)
      : role === "user_b";
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
  return {
    resources: resources.length,
    roles: roles.length,
    operations: operations.length,
    baseCases: base.length,
    directKnownUuidCases: base.filter(item => item.operation === "select").length,
    crossProjectCases: cross.length,
    plannedCases: all.length,
    expectedAllowed: all.filter(item => item.expected).length,
    expectedDenied: all.filter(item => !item.expected).length,
    cases: all,
  };
}
