import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (match) => match.slice(1))), "..");
const listed = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" });
const files = listed.split(/\r?\n/).filter(Boolean).filter((file) => !file.startsWith(".test-state/"));
const findings = [];

function record(file, kind) {
  findings.push({ file: file.replaceAll("\\", "/"), kind });
}

for (const file of files) {
  const full = path.join(root, file);
  let content;
  try {
    const buffer = fs.readFileSync(full);
    if (buffer.includes(0)) continue;
    content = buffer.toString("utf8");
  } catch {
    continue;
  }

  if (/postgres(?:ql)?:\/\/[^:\s/]+:[^@\s/]+@/i.test(content)) record(file, "DATABASE_URL_WITH_PASSWORD");
  if (/(?:SUPABASE_(?:TEST_)?SERVICE_ROLE_KEY|serviceRoleKey)\s*[:=]\s*["'][^"'\n]{20,}["']/i.test(content)) {
    record(file, "HARDCODED_SERVICE_ROLE_VALUE");
  }

  for (const match of content.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g)) {
    try {
      const payload = JSON.parse(Buffer.from(match[0].split(".")[1], "base64url").toString("utf8"));
      if (payload.role === "service_role") record(file, "SERVICE_ROLE_JWT");
    } catch {
      // An undecodable token-like string is not treated as a confirmed secret.
    }
  }
}

console.log(JSON.stringify({
  status: findings.length ? "FAIL" : "PASS",
  scannedFiles: files.length,
  findings,
  secretValuesPrinted: false,
}, null, 2));
process.exitCode = findings.length ? 1 : 0;
