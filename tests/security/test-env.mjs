import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, match => match.slice(1))), "..", "..");
const plan = JSON.parse(fs.readFileSync(path.join(root, "tests", "security", "fixture-plan.json"), "utf8"));

export function requireTestEnvironment({ requireWriteGuard = false } = {}) {
  const names = [
    "SUPABASE_TEST_URL",
    "SUPABASE_TEST_PROJECT_REF",
    "SUPABASE_TEST_ANON_KEY",
    "SUPABASE_TEST_SERVICE_ROLE_KEY",
    "SUPABASE_TEST_USER_PASSWORD",
  ];
  const missing = names.filter(name => !process.env[name]);
  const ref = process.env.SUPABASE_TEST_PROJECT_REF || "";
  const url = process.env.SUPABASE_TEST_URL || "";
  const denied = plan.productionProjectRefDenylist.find(item => item === ref || url.includes(item));
  const writeGuardValid = !requireWriteGuard || process.env[plan.writeGuard.variable] === plan.writeGuard.requiredValue;
  if (missing.length || denied || !writeGuardValid) {
    const error = new Error("A separate, explicitly authorized Supabase test environment is required");
    error.details = {
      status: "BLOCKED",
      reason: denied ? "PRODUCTION_PROJECT_DENIED" : missing.length ? "TEST_ENVIRONMENT_MISSING" : "WRITE_GUARD_MISSING",
      missingVariables: missing,
      productionRefDenied: Boolean(denied),
      writeGuardValid,
    };
    throw error;
  }
  return {
    root,
    plan,
    url,
    projectRef: ref,
    anonKey: process.env.SUPABASE_TEST_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_TEST_SERVICE_ROLE_KEY,
    password: process.env.SUPABASE_TEST_USER_PASSWORD,
    emailDomain: process.env.SUPABASE_TEST_EMAIL_DOMAIN || "example.invalid",
  };
}
