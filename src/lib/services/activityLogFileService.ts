import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

// Logs are written as newline-delimited JSON (JSONL), one file per UTC day,
// under <project root>/logs/activity/YYYY-MM-DD.jsonl
const LOG_DIR = path.join(process.cwd(), "logs", "activity");

export interface ActivityLogEntry {
  id: string;
  category: string;
  action: string;
  actorId: string | null;
  actorName: string | null;
  targetId: string | null;
  targetName: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string; // ISO timestamp
}

async function ensureLogDir(): Promise<void> {
  await fs.mkdir(LOG_DIR, { recursive: true });
}

function getFilePathForDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
 return path.join(LOG_DIR, `activity-${y}-${m}-${d}.log`);
}

/**
 * Appends one activity log entry to today's log file.
 * A single JSON-line append is safe under concurrent writers on POSIX
 * filesystems (Node opens the file with the O_APPEND flag), which is
 * sufficient for this app's write volume.
 */
export async function appendActivityLogEntry(
  entry: Omit<ActivityLogEntry, "id" | "createdAt">,
  occurredAt: Date = new Date(),
): Promise<void> {
  await ensureLogDir();
  const record: ActivityLogEntry = {
    id: crypto.randomUUID(),
    createdAt: occurredAt.toISOString(),
    ...entry,
  };
  const line = JSON.stringify(record) + "\n";
  const filePath = getFilePathForDate(occurredAt);
  await fs.appendFile(filePath, line, "utf8");
}

/**
 * Reads and parses every activity log entry across all daily files.
 * Malformed lines are skipped (and logged) rather than failing the
 * whole read, since these files could in principle be hand-edited or
 * partially written during a crash.
 */
export async function readActivityLogEntries(): Promise<ActivityLogEntry[]> {
  await ensureLogDir();

  let files: string[] = [];
  try {
    files = (await fs.readdir(LOG_DIR)).filter((f) => f.endsWith(".log"));
  } catch {
    return [];
  }

  const allEntries: ActivityLogEntry[] = [];

  for (const file of files) {
    const filePath = path.join(LOG_DIR, file);
    let content: string;
    try {
      content = await fs.readFile(filePath, "utf8");
    } catch {
      continue;
    }

    const lines = content.split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        allEntries.push(JSON.parse(line) as ActivityLogEntry);
      } catch (err) {
        console.error(`Skipping malformed activity log line in ${file}:`, err);
      }
    }
  }

  allEntries.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return allEntries;
}