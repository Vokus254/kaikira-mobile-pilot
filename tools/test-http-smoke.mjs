import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, match => match.slice(1))), "..");
const routes = new Map([
  ["/", "index.html"],
  ["/cockpit", "cockpit.html"],
  ["/aufgaben", "cockpit.html"],
  ["/datenraeume", "cockpit.html"],
  ["/kommunikation", "cockpit.html"],
  ["/admin", "admin.html"],
  ["/abschlussplaner", "abschlussplaner.html"],
  ["/task", "task.html"],
  ["/datenschutz", "datenschutz.html"],
  ["/impressum", "impressum.html"],
  ["/lumina-cockpit-demo", "lumina-cockpit-demo.html"],
  ["/reporting/index39-template", "reporting/index39-template.html"],
]);

const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
const server = http.createServer((request, response) => {
  const file = routes.get(new URL(request.url, "http://127.0.0.1").pathname);
  if (!file) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  const body = fs.readFileSync(path.join(root, file));
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(body);
});

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});

const { port } = server.address();
const results = [];
try {
  for (const [route, file] of routes) {
    const response = await fetch(`http://127.0.0.1:${port}${route}`);
    const body = await response.text();
    results.push({
      route,
      file,
      expectedStatus: 200,
      actualStatus: response.status,
      bytes: Buffer.byteLength(body),
      passed: response.status === 200 && body.length > 0,
    });
  }
} finally {
  await new Promise(resolve => server.close(resolve));
}

const summary = {
  vercelConfiguration: {
    cleanUrls: vercel.cleanUrls,
    trailingSlash: vercel.trailingSlash,
    protectedRewrites: vercel.rewrites,
  },
  expectedRoutes: results.length,
  actualSuccessfulRoutes: results.filter(item => item.passed).length,
  failedRoutes: results.filter(item => !item.passed).length,
  results,
};
console.log(JSON.stringify(summary, null, 2));
process.exitCode = summary.failedRoutes === 0 ? 0 : 1;
