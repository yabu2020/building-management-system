"use server";

import { databaseService } from "@/lib/services/databaseService";
import { getUserAndManagedIds } from "@/lib/actions/server-helpers";
import { readActivityLogEntries } from "@/lib/services/activityLogFileService";
import type { AuditLog } from "@prisma/client";

export type SerializedAuditLog = Omit<
  AuditLog,
  | "createdAt"
  | "paymentDate"
  | "rentAmount"
  | "utilityAmount"
  | "penaltyAmount"
  | "totalAmount"
  | "metadata"
> & {
  createdAt: string;
  paymentDate: string | null;
  rentAmount: number | null;
  utilityAmount: number | null;
  penaltyAmount: number | null;
  totalAmount: number | null;
  metadata: Record<string, unknown> | null;
};

export async function getAuditLogDataAction(): Promise<SerializedAuditLog[]> {
  try {
    // Calling this both authenticates the request AND sets the
    // AsyncLocalStorage data-access scope that the global Prisma
    // middleware (src/lib/prisma.ts) reads for the DB-backed (payment)
    // query below. File-based activity entries are scoped manually
    // further down, since the Prisma middleware only intercepts Prisma
    // calls.
    const { isSuperAdmin, currentUser } = await getUserAndManagedIds();

    // --- Financial transactions: still stored in the database ---
    const paymentLogs = await databaseService.getAllAuditLogs({
      where: { category: "PAYMENT" },
      orderBy: { createdAt: "desc" },
    });

    const serializedPaymentLogs: SerializedAuditLog[] = paymentLogs.map(
      (log) => {
        const rentAmount =
          log.rentAmount !== null && log.rentAmount !== undefined
            ? Number(log.rentAmount)
            : null;
        const utilityAmount =
          log.utilityAmount !== null && log.utilityAmount !== undefined
            ? Number(log.utilityAmount)
            : null;
        const totalAmount =
          log.totalAmount !== null && log.totalAmount !== undefined
            ? Number(log.totalAmount)
            : null;
        const explicitPenalty =
          log.penaltyAmount !== null && log.penaltyAmount !== undefined
            ? Number(log.penaltyAmount)
            : null;
        const derivedPenalty =
          rentAmount !== null && utilityAmount !== null && totalAmount !== null
            ? Math.max(0, totalAmount - rentAmount - utilityAmount)
            : null;

        return {
          ...log,
          createdAt: log.createdAt.toISOString(),
          paymentDate: log.paymentDate ? log.paymentDate.toISOString() : null,
          rentAmount,
          utilityAmount,
          penaltyAmount:
            explicitPenalty !== null && explicitPenalty > 0
              ? explicitPenalty
              : derivedPenalty,
          totalAmount,
          metadata: (log.metadata as Record<string, unknown>) ?? null,
        };
      },
    );

    // --- Activity log: now stored in local JSONL files ---
    let activityEntries = await readActivityLogEntries();

    // Replicate the same ownership scoping the Prisma middleware used to
    // apply automatically: non-super-admins only see entries where they
    // were the actor (activity entries don't carry a buildingId).
    if (!isSuperAdmin) {
      activityEntries = activityEntries.filter(
        (entry) => entry.actorId === currentUser.id,
      );
    }

    const serializedActivityLogs: SerializedAuditLog[] = activityEntries.map(
      (entry) => ({
        id: entry.id,
        category: entry.category,
        action: entry.action,
        actorId: entry.actorId,
        actorName: entry.actorName,
        targetId: entry.targetId,
        targetName: entry.targetName,
        metadata: entry.metadata,
        createdAt: entry.createdAt,
        // Financial-only fields don't apply to activity entries.
        tenantId: null,
        tenantName: null,
        buildingId: null,
        buildingName: null,
        spaceName: null,
        paymentDate: null,
        rentAmount: null,
        utilityAmount: null,
        penaltyAmount: null,
        totalAmount: null,
        transactionId: null,
        toAccountNumber: null,
      }),
    );

    // Combine and sort newest-first across both sources.
    return [...serializedPaymentLogs, ...serializedActivityLogs].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  } catch (error) {
    console.error("Error fetching audit log data:", error);
    return [];
  }
}