import { appendActivityLogEntry } from "./activityLogFileService";

export type AuditCategory =
  | "PAYMENT"
  | "AUTH"
  | "USER"
  | "ROLE"
  | "BUILDING"
  | "SPACE"
  | "TENANT"
  | "AGREEMENT"
  | "BILLING"
  | "BUILDING_UTILITY"
  | "AGREEMENT_TEMPLATE"
  | "SETTINGS";

export type AuditAction =
  | "CREATED"
  | "UPDATED"
  | "DELETED"
  | "STATUS_CHANGED"
  | "APPROVED"
  | "REJECTED"
  | "ASSIGNED"
  | "PASSWORD_RESET"
  | "LOGIN"
  | "LOGIN_FAILED"
  | "LOGOUT"
  | "RECORDED";

interface LogAuditEventParams {
  category: AuditCategory;
  action: AuditAction;
  actorId?: string | null;
  actorName?: string | null;
  targetId?: string | null;
  targetName?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Generic audit logger for any action in the system.
 * Writes to a local JSONL file (see activityLogFileService.ts) instead of
 * the database, to keep this high-volume, low-value-per-row data off the
 * Neon database and its storage/compute quota.
 *
 * Fire-and-forget: a logging failure is caught and logged to the console,
 * but it never throws, so it can never break the caller's primary action
 * (creating a building, resetting a password, etc.).
 */
export async function logAuditEvent({
  category,
  action,
  actorId,
  actorName,
  targetId,
  targetName,
  metadata,
}: LogAuditEventParams): Promise<void> {
  try {
    await appendActivityLogEntry({
      category,
      action,
      actorId: actorId ?? null,
      actorName: actorName ?? null,
      targetId: targetId ?? null,
      targetName: targetName ?? null,
      metadata: metadata ?? {},
    });
  } catch (error) {
    console.error("Failed to write activity log:", error);
  }
}