import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

const root = process.cwd();
const productRoot = path.join(root, "src", "app", "(product)");
const productComponents = [
  path.join(root, "src", "components", "product-shell.tsx"),
  path.join(root, "src", "components", "product-ui.tsx"),
  path.join(root, "src", "components", "energy-usage-chart.tsx")
];

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const item = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(item));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(item);
    }
  }
  return files;
}

async function productSource() {
  const files = [...await collectFiles(productRoot), ...productComponents];
  const contents = await Promise.all(files.map(async (file) => ({
    file,
    content: await readFile(file, "utf8")
  })));
  return contents;
}

test("customer pages do not contain internal pipeline terminology", async () => {
  const forbidden = [
    /\bKafka\b/i,
    /\bOllama\b/i,
    /\bPhi-3\b/i,
    /\bSLM\b/i,
    /\bTimescaleDB\b/i,
    /\bDocker\b/i,
    /consumer lag/i,
    /batch[_ -]?id/i,
    /raw JSON/i,
    /raw audit/i,
    /internal port/i
  ];
  for (const { file, content } of await productSource()) {
    for (const pattern of forbidden) {
      assert.equal(
        pattern.test(content),
        false,
        `${path.relative(root, file)} contains ${pattern}`
      );
    }
  }
});

test("customer browser calls use the Next.js API boundary only", async () => {
  const directService = /https?:\/\/[^"'`\s]+|localhost:(?:3001|3002|3003|3004|3005|3006|3009|3010)/i;
  for (const { file, content } of await productSource()) {
    assert.equal(
      directService.test(content),
      false,
      `${path.relative(root, file)} contains a direct backend address`
    );
    for (const match of content.matchAll(/fetch\(\s*["'`]([^"'`]+)["'`]/g)) {
      assert.equal(
        match[1].startsWith("/api/"),
        true,
        `${path.relative(root, file)} calls outside the BFF: ${match[1]}`
      );
    }
  }
});

test("customer pages preserve the explicit simulation safety boundary", async () => {
  const source = (await productSource()).map((item) => item.content).join("\n");
  assert.match(
    source,
    /Controlled demonstration using simulated energy devices\. No real household device control is enabled\./
  );
  assert.match(source, /No physical device control is enabled/);
});

test("product routing includes all required customer areas and operations separation", async () => {
  const expected = [
    "dashboard/page.tsx",
    "dashboard/analytics/page.tsx",
    "dashboard/devices/page.tsx",
    "dashboard/flexibility/page.tsx",
    "dashboard/community/page.tsx",
    "dashboard/reports/page.tsx",
    "dashboard/settings/page.tsx"
  ];
  const files = (await collectFiles(productRoot)).map((file) => (
    path.relative(productRoot, file).replaceAll("\\", "/")
  ));
  for (const route of expected) {
    assert.equal(files.includes(route), true, `Missing ${route}`);
  }

  const operations = path.join(
    root,
    "src",
    "app",
    "(console)",
    "admin",
    "operations",
    "page.tsx"
  );
  assert.match(await readFile(operations, "utf8"), /DashboardView/);
});

