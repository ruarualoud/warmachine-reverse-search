import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requestedMapRoot = process.argv.find((argument) =>
  argument.startsWith("--map="))?.slice("--map=".length) ||
  ".scratch/warmachine-reverse-search-wayfinder-v2";
const mapRoot = path.resolve(root, requestedMapRoot);
const issuesRoot = path.join(mapRoot, "issues");
const files = (await readdir(issuesRoot)).filter((name) => name.endsWith(".md")).sort();
const rows = await Promise.all(files.map(async (name) => {
  const text = await readFile(path.join(issuesRoot, name), "utf8");
  const status = text.match(/^Status:\s*(.+)$/m)?.[1]?.trim() || "open";
  const type = text.match(/^Type:\s*(.+)$/m)?.[1]?.trim() || "unknown";
  const blockedBy = (text.match(/^Blocked by:[ \t]*([^\r\n]*)$/m)?.[1] || "")
    .split(",").map((value) => value.trim()).filter(Boolean);
  const title = text.match(/^#\s+(.+)$/m)?.[1]?.trim() || name;
  return { id: name.slice(0, 2), name, title, type, status, blockedBy };
}));
const resolved = new Set(rows.filter((row) => row.status === "resolved").map((row) => row.id));
const frontier = rows.filter((row) => row.status === "open" &&
  row.blockedBy.every((id) => resolved.has(id)));

console.log(JSON.stringify({
  schemaVersion: "warmachine_reverse_search_wayfinder_frontier_v1",
  mapPath: path.relative(root, path.join(mapRoot, "map.md")),
  issueCount: rows.length,
  resolvedCount: resolved.size,
  openCount: rows.filter((row) => row.status === "open").length,
  frontier,
  blocked: rows.filter((row) => row.status === "open" && !frontier.includes(row)),
}, null, 2));
