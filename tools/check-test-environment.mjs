import { requireTestEnvironment } from "../tests/security/test-env.mjs";

try {
  requireTestEnvironment({ requireWriteGuard: true });
  if (!process.env.SUPABASE_TEST_DB_URL) {
    throw Object.assign(new Error("A separate test database URL is required"), {
      details: {
        status: "BLOCKED",
        reason: "TEST_DATABASE_URL_MISSING",
        missingVariables: ["SUPABASE_TEST_DB_URL"],
        productionRefDenied: false,
        writeGuardValid: true,
      },
    });
  }
  console.log(JSON.stringify({
    status: "READY",
    environment: "separate-test-project",
    productionRefDenied: false,
    writeGuardValid: true,
    secretValuesPrinted: false,
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify(error.details || {
    status: "BLOCKED",
    reason: error.message,
  }, null, 2));
  process.exitCode = 2;
}
