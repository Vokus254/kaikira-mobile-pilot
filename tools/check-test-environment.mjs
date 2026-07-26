import { requireTestEnvironment } from "../tests/security/test-env.mjs";

try {
  requireTestEnvironment({ requireWriteGuard: true });
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
