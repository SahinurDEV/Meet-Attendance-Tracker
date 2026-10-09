// Cross-version test runner: `node scripts/run-tests.mjs <dir> [node --test flags...]`.
// Node 20 accepts a directory after `--test`, but Node 21+ treats every positional argument as a file
// path or glob, so `node --test test/unit/` fails with MODULE_NOT_FOUND there. Listing the test files
// explicitly works on every supported Node version and every OS (no shell globbing needed).
import { readdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const [dir, ...flags] = process.argv.slice(2);
if (!dir) {
  console.error("usage: node scripts/run-tests.mjs <dir> [--test-* flags]");
  process.exit(2);
}
const files = readdirSync(dir, { recursive: true })
  .map(String)
  .filter((f) => /\.test\.(c|m)?js$/.test(f))
  .sort()
  .map((f) => path.join(dir, f));
if (!files.length) {
  console.error(`No *.test.{js,mjs,cjs} files found in ${dir}`);
  process.exit(1);
}
const r = spawnSync(process.execPath, ["--test", ...flags, ...files], { stdio: "inherit" });
process.exit(r.status ?? 1);
