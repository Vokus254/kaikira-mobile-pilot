import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, match => match.slice(1))), "..");
const roots = [path.join(root, "assets"), path.join(root, "tools"), path.join(root, "tests")];
const files = [];

function collect(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(full);
    else if (entry.isFile() && entry.name.endsWith(".mjs")) files.push(full);
  }
}

roots.forEach(collect);
files.sort();
const results = files.map(file => {
  const result = spawnSync(process.execPath, ["--check", file], { cwd: root, encoding: "utf8" });
  return {
    file: path.relative(root, file).replaceAll("\\", "/"),
    exitCode: result.status ?? 1,
    error: (result.stderr || "").trim() || null,
  };
});

const summary = {
  command: "node --check <all tools/tests .mjs files>",
  checked: results.length,
  passed: results.filter(item => item.exitCode === 0).length,
  failed: results.filter(item => item.exitCode !== 0).length,
  results,
};
console.log(JSON.stringify(summary, null, 2));
process.exitCode = summary.failed === 0 ? 0 : 1;
