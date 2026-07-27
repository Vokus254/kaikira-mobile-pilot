const DONE = new Set(["completed", "approved"]);

export function prioritizeWorkerTasks(tasks = [], today = new Date().toISOString().slice(0, 10)) {
  const rank = (task) => {
    const overdue = Boolean(task.due_date && task.due_date < today);
    if (overdue && task.status === "blocked") return 1;
    if (overdue && ["declined", "question"].includes(task.status)) return 2;
    if (task.due_date === today) return 3;
    if (["declined", "question"].includes(task.status)) return 4;
    return 5;
  };
  return [...tasks].sort((a, b) => rank(a) - rank(b) || String(a.due_date ?? "9999").localeCompare(String(b.due_date ?? "9999")));
}

export function buildCockpitModel({ tasks = [], project = null, member = null, substitutions = [], today = new Date().toISOString().slice(0, 10) }) {
  const done = tasks.filter((task) => DONE.has(task.status));
  const open = tasks.filter((task) => !DONE.has(task.status));
  const overdue = open.filter((task) => task.due_date && task.due_date < today);
  const critical = open.filter((task) => overdue.includes(task) || ["blocked", "declined"].includes(task.status));
  const reviews = tasks.filter((task) => ["submitted", "in_review"].includes(task.status));
  const decisions = tasks.filter((task) => ["submitted", "in_review", "question"].includes(task.status));
  const unassigned = open.filter((task) => !task.responsible_member_id && !task.responsible_email);
  const own = tasks.filter((task) => task.responsible_member_id === member?.id);
  const principalIds = new Set(substitutions.map((row) => row.principal_member_id));
  const substitute = tasks.filter((task) => principalIds.has(task.responsible_member_id));
  const dated = tasks.filter((task) => task.due_date);
  const planned = dated.length ? dated.filter((task) => task.due_date <= today).length : null;
  const planProgress = planned == null ? null : Math.round(planned / dated.length * 100);
  const actualProgress = tasks.length ? Math.round(done.length / tasks.length * 100) : 0;
  const closingDate = project?.closing_date ?? null;
  const daysToClose = closingDate ? Math.ceil((new Date(`${closingDate}T12:00:00`) - new Date(`${today}T12:00:00`)) / 86400000) : null;
  return {
    total: tasks.length, done, open, overdue, critical, reviews, decisions, unassigned, own, substitute,
    actualProgress, planProgress, planDeviation: planProgress == null ? null : actualProgress - planProgress,
    daysToClose, budget: null
  };
}
