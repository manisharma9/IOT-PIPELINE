import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

const root = process.cwd();

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await collect(fullPath));
    else if (/\.(ts|tsx)$/.test(entry.name)) result.push(fullPath);
  }
  return result;
}

test("product browser routes use only the public dashboard BFF namespace", async () => {
  const productFiles = [
    ...await collect(path.join(root, "src", "app", "(product)")),
    path.join(root, "src", "components", "product-shell.tsx")
  ];
  for (const file of productFiles) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /\/api\/customer\//);
    assert.doesNotMatch(source, /\/api\/approvals\//);
    assert.doesNotMatch(source, /https?:\/\/(?:localhost|127\.0\.0\.1|[a-z-]+):\d+/);
  }
});

test("public demo proxy allows only product and dashboard API routes", async () => {
  const source = await readFile(path.join(root, "src", "proxy.ts"), "utf8");
  assert.match(source, /PUBLIC_DEMO_MODE/);
  assert.match(source, /pathname\.startsWith\("\/api\/dashboard"\)/);
  assert.match(source, /public_demo_route_not_available/);
});

test("demo authentication source contains no built-in credentials", async () => {
  const source = await readFile(path.join(root, "src", "lib", "auth.ts"), "utf8");
  const loginSource = await readFile(path.join(root, "src", "app", "login", "page.tsx"), "utf8");
  const scriptSources = await Promise.all(
    (await readdir(path.join(root, "scripts")))
      .filter((file) => file.endsWith(".js"))
      .map((file) => readFile(path.join(root, "scripts", file), "utf8"))
  );
  for (const credential of ["operator123", "household123", "admin123", "local-demo-session-secret", "local-dev-edge-key"]) {
    assert.equal(source.includes(credential), false);
    assert.equal(loginSource.includes(credential), false);
    assert.equal(scriptSources.some((scriptSource) => scriptSource.includes(credential)), false);
  }
  assert.match(source, /DEMO_SESSION_SECRET/);
  assert.match(source, /DEMO_USERNAME/);
  assert.match(source, /DEMO_PASSWORD/);
  assert.match(loginSource, /configured server-side/i);
});

test("public demo environment example contains placeholders rather than credentials", async () => {
  const source = await readFile(path.join(root, ".env.public-demo.example"), "utf8");
  assert.match(source, /DEMO_USERNAME=replace-with-/);
  assert.match(source, /DEMO_PASSWORD=replace-with-/);
  assert.match(source, /DEMO_SESSION_SECRET=replace-with-/);
  assert.doesNotMatch(source, /operator123|local-dev-edge-key/);
});
