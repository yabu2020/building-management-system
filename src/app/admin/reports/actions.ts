"use server";

import { getUserAndManagedIds } from "@/lib/actions/server-helpers";
import { prisma } from "@/lib/prisma";
import { parseBranchDistrict } from "@/lib/branch-district";

export interface MonthlyBreakdownData {
  digitalVal: number;
  digitalVol: number;
  manualVal: number;
  manualVol: number;
}

// One row per BUILDING (not per district/branch group). District and
// Branch are still attached to every row — parsed from that building's
// own branchName — so the report can still be grouped/filtered by them.
export interface BuildingReportRow {
  buildingId: string;
  buildingName: string;
  district: string;
  branch: string;
  /** Real Building.createdAt, ISO string. */
  onboardingDate: string;
  /** Raw BuildingStatus value: "Pending" | "Active" | "Rejected" | "Inactive". */
  status: string;
  isActive: boolean;
  tenantsOnboarded: number;
  collectionAmount: number;
  transactionCount: number;
  digitalCollectionAmount: number;
  digitalTransactionCount: number;
  manualCollectionAmount: number;
  manualTransactionCount: number;
  monthlyBreakdown?: Record<string, MonthlyBreakdownData>;
}

export interface DistrictReportResult {
  rows: BuildingReportRow[];
  districts: string[];
  branches: string[];
  error: string | null;
}

export interface DistrictReportFilters {
  startDate?: string | null;
  endDate?: string | null;
  district?: string | null;
  branch?: string | null;
}

function isManualPayment(paymentMethod: string | null | undefined): boolean {
  return (paymentMethod ?? "").trim().toLowerCase() === "manual";
}

function buildPrismaDateFilter(startDateStr?: string | null, endDateStr?: string | null) {
  let gte: Date | undefined;
  let lte: Date | undefined;

  if (startDateStr && startDateStr.trim() !== "") {
    const [y, m, d] = startDateStr.split("-").map(Number);
    if (y && m && d) {
      gte = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
    }
  }

  if (endDateStr && endDateStr.trim() !== "") {
    const [y, m, d] = endDateStr.split("-").map(Number);
    if (y && m && d) {
      lte = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
    }
  }

  if (!gte && !lte) return undefined;

  return {
    ...(gte ? { gte } : {}),
    ...(lte ? { lte } : {}),
  };
}

export async function getDistrictReportAction(
  filters: DistrictReportFilters = {},
): Promise<DistrictReportResult> {
  try {
    const { isSuperAdmin, managedBuildingIds, currentUser } =
      await getUserAndManagedIds();
    const canSeeAllBuildings =
      isSuperAdmin || !Array.isArray(managedBuildingIds);
    const hasAssignedBuildingScope =
      Array.isArray(managedBuildingIds) && managedBuildingIds.length > 0;

    const baseBuildingWhere: any = canSeeAllBuildings
      ? {}
      : hasAssignedBuildingScope
        ? { id: { in: managedBuildingIds } }
        : { createdById: currentUser.id };

    // The date range filter is applied ONLY to the financial data (Bills)
    // below. Buildings and Tenants are always reported as their full,
    // current totals regardless of the selected date range.
    const dateRangeFilter = buildPrismaDateFilter(filters.startDate, filters.endDate);

    // 1. Fetch All Buildings (never date-filtered — always the current, full set)
    const allBuildings = await (prisma as any).building.findMany({
      where: baseBuildingWhere,
      select: {
        id: true,
        name: true,
        branchName: true,
        status: true,
        createdAt: true,
      },
    });

    const buildingMetaById = new Map<
      string,
      { district: string; branch: string; name: string }
    >();
    const allDistrictsSet = new Set<string>();
    const allBranchesSet = new Set<string>();

    for (const b of allBuildings) {
      const parsed = parseBranchDistrict(b.branchName);
      buildingMetaById.set(b.id, {
        district: parsed.district,
        branch: parsed.branch,
        name: b.name,
      });
      allDistrictsSet.add(parsed.district);
      allBranchesSet.add(parsed.branch);
    }

    const selectedDistrict =
      filters.district && filters.district !== "all" ? filters.district : null;
    const selectedBranch =
      filters.branch && filters.branch !== "all" ? filters.branch : null;

    // 2. Fetch Tenants (never date-filtered — always the current, full roster)
    const tenantWhere: any = canSeeAllBuildings
      ? {}
      : hasAssignedBuildingScope
        ? {
            OR: [
              { buildingId: { in: managedBuildingIds } },
              { agreements: { some: { space: { buildingId: { in: managedBuildingIds } } } } },
            ],
          }
        : { createdById: currentUser.id };

    const tenants = await (prisma as any).tenant.findMany({
      where: tenantWhere,
      select: {
        id: true,
        buildingId: true,
        createdAt: true,
        agreements: {
          select: {
            space: {
              select: { buildingId: true },
            },
          },
        },
      },
    });

    // 3. Fetch Bills — this is the ONLY dataset the date range filters.
    const billWhere: any = { status: "Paid" };
    if (dateRangeFilter) {
      billWhere.paymentDate = dateRangeFilter;
    }

    if (!canSeeAllBuildings) {
      billWhere.OR = hasAssignedBuildingScope
        ? [
            { agreement: { space: { buildingId: { in: managedBuildingIds } } } },
            { tenant: { buildingId: { in: managedBuildingIds } } },
          ]
        : undefined;
      if (!hasAssignedBuildingScope) {
        billWhere.agreement = { createdById: currentUser.id };
      }
    }

    const bills = await (prisma as any).bill.findMany({
      where: billWhere,
      select: {
        totalAmount: true,
        paymentMethod: true,
        paymentDate: true,
        tenant: { select: { buildingId: true } },
        agreement: {
          select: { space: { select: { buildingId: true } } },
        },
      },
    });

    // 4. Aggregation — ONE ROW PER BUILDING
    const rowByBuildingId = new Map<string, BuildingReportRow>();

    const ensureRow = (buildingId: string): BuildingReportRow | null => {
      let row = rowByBuildingId.get(buildingId);
      if (row) return row;

      const meta = buildingMetaById.get(buildingId);
      if (!meta) return null; 

      row = {
        buildingId,
        buildingName: meta.name,
        district: meta.district,
        branch: meta.branch,
        onboardingDate: "",
        status: "",
        isActive: false,
        tenantsOnboarded: 0,
        collectionAmount: 0,
        transactionCount: 0,
        digitalCollectionAmount: 0,
        manualCollectionAmount: 0,
        digitalTransactionCount: 0,
        manualTransactionCount: 0,
        monthlyBreakdown: {},
      };
      rowByBuildingId.set(buildingId, row);
      return row;
    };

    
    for (const b of allBuildings) {
      const meta = buildingMetaById.get(b.id)!;
      if (selectedDistrict && meta.district !== selectedDistrict) continue;
      if (selectedBranch && meta.branch !== selectedBranch) continue;

      const row = ensureRow(b.id);
      if (!row) continue;
      row.onboardingDate = new Date(b.createdAt).toISOString();
      row.status = b.status;
      row.isActive = b.status === "Active";
    }

    
    for (const t of tenants) {
      const buildingIds = new Set<string>();
      if (t.buildingId) buildingIds.add(t.buildingId);

      t.agreements?.forEach((a: any) => {
        if (a.space?.buildingId) buildingIds.add(a.space.buildingId);
      });

      buildingIds.forEach((bId) => {
        const row = rowByBuildingId.get(bId);
        if (!row) return; 
        row.tenantsOnboarded += 1;
      });
    }

  
    for (const bill of bills) {
      const buildingId =
        bill.agreement?.space?.buildingId ?? bill.tenant?.buildingId ?? null;
      if (!buildingId) continue;

      const row = rowByBuildingId.get(buildingId);
      if (!row) continue; // building filtered out by district/branch above

      const amount = Number(bill.totalAmount) || 0;
      const isManual = isManualPayment(bill.paymentMethod);

      row.collectionAmount += amount;
      row.transactionCount += 1;

      if (isManual) {
        row.manualCollectionAmount += amount;
        row.manualTransactionCount += 1;
      } else {
        row.digitalCollectionAmount += amount;
        row.digitalTransactionCount += 1;
      }

      if (bill.paymentDate) {
        const dateObj = new Date(bill.paymentDate);
        const monthKey = dateObj.toISOString().slice(0, 7); // e.g. "2025-07"

        if (!row.monthlyBreakdown) {
          row.monthlyBreakdown = {};
        }
        if (!row.monthlyBreakdown[monthKey]) {
          row.monthlyBreakdown[monthKey] = {
            digitalVal: 0,
            digitalVol: 0,
            manualVal: 0,
            manualVol: 0,
          };
        }

        const mData = row.monthlyBreakdown[monthKey];
        if (isManual) {
          mData.manualVal += amount;
          mData.manualVol += 1;
        } else {
          mData.digitalVal += amount;
          mData.digitalVol += 1;
        }
      }
    }

    const rows = Array.from(rowByBuildingId.values()).sort((a, b) => {
      const distComp = a.district.localeCompare(b.district);
      if (distComp !== 0) return distComp;
      const branchComp = a.branch.localeCompare(b.branch);
      if (branchComp !== 0) return branchComp;
      return a.buildingName.localeCompare(b.buildingName);
    });

    return {
      rows,
      districts: Array.from(allDistrictsSet).sort((a, b) => a.localeCompare(b)),
      branches: Array.from(allBranchesSet).sort((a, b) => a.localeCompare(b)),
      error: null,
    };
  } catch (e: any) {
    return {
      rows: [],
      districts: [],
      branches: [],
      error: e?.message || "Failed to load report.",
    };
  }
}