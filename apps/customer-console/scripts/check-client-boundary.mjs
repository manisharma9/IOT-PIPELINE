import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const clientDirs = ["src/app", "src/components"];
const forbidden = [
  "localhost:3001",
  "localhost:3002",
  "localhost:3003",
  "localhost:3004",
  "localhost:3005",
  "localhost:3006",
  "localhost:3009",
  "EDGE_API_KEY"
];

async function collectFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(fullPath));
    } else if (/\.(tsx|ts|css)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

const files = [];
for (const dir of clientDirs) {
  files.push(...await collectFiles(path.join(root, dir)));
}

const violations = [];
for (const file of files) {
  const relative = path.relative(root, file).replaceAll("\\", "/");
  if (relative.includes("/api/")) {
    continue;
  }

  const content = await readFile(file, "utf8");
  for (const token of forbidden) {
    if (content.includes(token)) {
      violations.push(`${relative}: ${token}`);
    }
  }
}

if (violations.length) {
  console.error("Client boundary check failed:");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log("Client boundary check passed: no direct internal service URLs or EDGE_API_KEY references in client UI.");
