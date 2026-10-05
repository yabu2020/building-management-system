"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { PageHeader } from "@/components/custom/PageHeader";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ClipboardList,
  Banknote,
  CalendarDays,
  CheckCircle,
  AlertTriangle,
  Info,
  User,
  HomeIcon,
  Landmark,
  Download,
  Building as BuildingIconLucide,
  UploadCloud,
  Loader2,
  EyeOff,
  Paperclip,
  Clock,
} from "lucide-react";
import type {
  PenaltyTier as PenaltyTierPrisma,
  Space as SpacePrismaOriginal,
  Bill as BillPrismaOriginal,
  Agreement as AgreementPrismaOriginal,
  Tenant as TenantPrismaOriginal,
  Building as BuildingPrismaTypeOriginal,
  UtilityBreakdownItem as UtilityBreakdownItemPrismaOriginal,
} from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import {
  addMonths,
  endOfMonth,
  format,
  parseISO,
  isBefore,
  startOfMonth,
  startOfDay,
  differenceInDays,
} from "date-fns";
import {
  formatDateOnlyUTC,
  toUtcStartOfDay,
  isAfterUtcDay,
  differenceInUtcDays,
} from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import XLSX from "xlsx-js-style";
import { usePermissions } from "@/contexts/PermissionContext";
import { PaginationControls } from "@/components/custom/PaginationControls";

// Client-side representation types, ensuring dates are strings (ISO format)
export interface ClientPenaltyTier extends Omit<
  PenaltyTierPrisma,
  "id" | "feeValue"
> {
  id?: string;
  feeValue: number;
}

export interface ClientBuilding extends Omit<
  BuildingPrismaTypeOriginal,
  "createdAt" | "updatedAt" | "penaltyPolicyTiers"
> {
  createdAt: string;
  updatedAt: string;
  penaltyPolicyTiers: ClientPenaltyTier[];
}

export interface ClientSpaceForAgreement extends Omit<
  SpacePrismaOriginal,
  | "createdAt"
  | "updatedAt"
  | "building"
  | "tenantId"
  | "buildingId"
  | "agreements"
  | "tenant"
  | "area"
  | "utilityProrationShare"
  | "monthlyRentalPrice"
> {
  createdAt: string;
  updatedAt: string;
  building: ClientBuilding;
  tenantId?: string | null;
  buildingId: string;
  area: number;
  utilityProrationShare: number;
  monthlyRentalPrice: number;
}
export interface ClientSpaceForPotentialRevenue extends Omit<
  SpacePrismaOriginal,
  | "createdAt"
  | "updatedAt"
  | "buildingId"
  | "tenantId"
  | "agreements"
  | "tenant"
  | "building"
  | "area"
  | "utilityProrationShare"
  | "monthlyRentalPrice"
> {
  createdAt: string;
  updatedAt: string;
  buildingId: string;
  tenantId?: string | null;
  area: number;
  utilityProrationShare: number;
  monthlyRentalPrice: number;
}

export interface ClientTenant extends Omit<
  TenantPrismaOriginal,
  "createdAt" | "updatedAt" | "rentedSpaceId" | "agreements" | "bills"
> {
  createdAt: string;
  updatedAt: string;
  rentedSpaceId?: string | null;
}

export interface ClientAgreementForBill extends Omit<
  AgreementPrismaOriginal,
  | "createdAt"
  | "updatedAt"
  | "startDate"
  | "nextPaymentDueDate"
  | "initialPaymentDate"
  | "endDate"
  | "tenant"
  | "space"
  | "bills"
  | "tenantId"
  | "spaceId"
  | "monthlyRentalPrice"
  | "initialPaymentAmount"
> {
  createdAt: string;
  updatedAt: string;
  startDate: string;
  nextPaymentDueDate: string;
  initialPaymentDate?: string | null;
  endDate?: string | null;
  tenant: ClientTenant;
  space: ClientSpaceForAgreement;
  tenantId: string;
  spaceId: string;
  monthlyRentalPrice: number;
  initialPaymentAmount: number | null;
}

export interface ClientUtilityBreakdownItem extends Omit<
  UtilityBreakdownItemPrismaOriginal,
  "id" | "billId"
> {
  id?: string;
  billId?: string;
}

export interface ClientBill extends Omit<
  BillPrismaOriginal,
  | "createdAt"
  | "updatedAt"
  | "billDate"
  | "dueDate"
  | "paymentDate"
  | "agreement"
  | "utilityBreakdown"
  | "tenantId"
  | "agreementId"
  | "rentAmount"
  | "penaltyAmount"
  | "totalAmount"
  | "paymentProofUrl"
> {
  createdAt: string;
  updatedAt: string;
  billDate: string;
  dueDate: string;
  paymentDate?: string | null;
  agreement: ClientAgreementForBill;
  utilityBreakdown: ClientUtilityBreakdownItem[];
  tenantId: string;
  agreementId: string;
  status: BillPrismaOriginal["status"];
  rentAmount: number;
  penaltyAmount: number | null;
  totalAmount: number;
  paymentProofDataUri?: string | null;
}

interface PaymentsOverviewClientPageProps {
  initialBills: ClientBill[];
  initialSpaces: ClientSpaceForPotentialRevenue[];
  initialAgreements: ClientAgreementForBill[];
}

export function PaymentsOverviewClientPage({
  initialBills,
  initialSpaces,
  initialAgreements,
}: PaymentsOverviewClientPageProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [today, setToday] = useState(new Date());
  const [summaryPeriodMode, setSummaryPeriodMode] = useState<
    "monthly" | "all-time"
  >("monthly");
  // Custom day-level date range for the top "Summary Period" cards (and the
  // "All Transactions" table, which now shares this same range) — replaces
  // the old whole-month-only Month/Year pickers so a specific date range
  // (not just a full calendar month) can be reported on.
  const [summaryStartDate, setSummaryStartDate] = useState<string>(
    format(startOfMonth(today), "yyyy-MM-dd"),
  );
  const [summaryEndDate, setSummaryEndDate] = useState<string>(
    format(endOfMonth(today), "yyyy-MM-dd"),
  );

  // Custom day-level date range for the "Payment History (Paid & Verified)"
  // table at the bottom.
  const [paymentStartDate, setPaymentStartDate] = useState<string>(
    format(startOfMonth(today), "yyyy-MM-dd"),
  );
  const [paymentEndDate, setPaymentEndDate] = useState<string>(
    format(endOfMonth(today), "yyyy-MM-dd"),
  );

  const [bills, setBills] = useState<ClientBill[]>(initialBills);

  const { hasPermission, isSuperAdmin } = usePermissions();
  const canViewPage = isSuperAdmin || hasPermission("payment_overview:view");

  const [upcomingCurrentPage, setUpcomingCurrentPage] = useState(1);
  const [paidCurrentPage, setPaidCurrentPage] = useState(1);
  const [upcomingItemsPerPage, setUpcomingItemsPerPage] = useState(5);
  const [paidItemsPerPage, setPaidItemsPerPage] = useState(5);

  const handleUpcomingItemsPerPageChange = (newSize: number) => {
    setUpcomingItemsPerPage(newSize);
    setUpcomingCurrentPage(1);
  };

  const handlePaidItemsPerPageChange = (newSize: number) => {
    setPaidItemsPerPage(newSize);
    setPaidCurrentPage(1);
  };

  useEffect(() => {
    setIsMounted(true);
    setToday(new Date());
    setBills(initialBills);
  }, [initialBills]);

  useEffect(() => {
    setPaidCurrentPage(1);
  }, [paymentStartDate, paymentEndDate]);

  useEffect(() => {
    setUpcomingCurrentPage(1);
  }, [summaryStartDate, summaryEndDate, summaryPeriodMode]);

  const calculatePenalty = useCallback(
    (bill: ClientBill, currentStatus: ClientBill["status"]): number => {
      const building = bill.agreement?.space?.building;
      if (
        !building ||
        !building.penaltyPolicyTiers ||
        building.penaltyPolicyTiers.length === 0
      ) {
        return 0;
      }

      const space = bill.agreement.space;
      const dueDate = parseISO(bill.dueDate);

      if (currentStatus !== "Overdue") return 0;

      const daysOverdue = differenceInUtcDays(today, dueDate);
      if (daysOverdue <= 0) return 0;

      let applicableTiersForScope: ClientPenaltyTier[] = [];
      const spaceSpecificTiers = building.penaltyPolicyTiers.filter(
        (t) =>
          t.scope === "SpecificSpaces" &&
          t.applicableSpaceIdNames?.includes(space.spaceIdName),
      );

      if (spaceSpecificTiers.length > 0) {
        applicableTiersForScope = spaceSpecificTiers;
      } else {
        const floorSpecificTiers = building.penaltyPolicyTiers.filter(
          (t) => t.scope === "Floor" && t.applicableFloor === space.floor,
        );
        if (floorSpecificTiers.length > 0) {
          applicableTiersForScope = floorSpecificTiers;
        } else {
          applicableTiersForScope = building.penaltyPolicyTiers.filter(
            (t) => t.scope === "Building",
          );
        }
      }

      if (applicableTiersForScope.length === 0) return 0;

      // Mirror server logic: iterate each overdue day and apply the tier
      // that is active for that day. This handles tier transitions over
      // time as well as multiple one-time fees that may apply on different
      // days.
      const sortedTiers = [...applicableTiersForScope].sort(
        (a, b) => a.fromDay - b.fromDay,
      );

      let totalPenalty = 0;
      const oneTimeApplied = new Set<string>();

      for (let day = 1; day <= daysOverdue; day++) {
        const tierForDay = sortedTiers.find(
          (tier) =>
            day >= tier.fromDay &&
            (tier.toDay === null ||
              tier.toDay === undefined ||
              day <= tier.toDay),
        );
        if (!tierForDay) continue;

        const feeValue = tierForDay.feeValue;
        let feeAmount = 0;
        if (tierForDay.penaltyType === "Fixed") {
          feeAmount = feeValue;
        } else if (tierForDay.penaltyType === "Percentage") {
          feeAmount = bill.rentAmount * (feeValue / 100);
        }

        if (tierForDay.frequency === "Daily") {
          totalPenalty += feeAmount;
        } else if (tierForDay.frequency === "OneTime") {
          if (!oneTimeApplied.has(tierForDay.id || "")) {
            totalPenalty += feeAmount;
            if (tierForDay.id) oneTimeApplied.add(tierForDay.id);
          }
        }
      }

      return parseFloat(totalPenalty.toFixed(2));
    },
    [today],
  );

  const processedBills = useMemo(() => {
    return bills
      .map((bill) => {
        let currentStatus = bill.status;
        if (
          bill.status === "Pending" &&
          isAfterUtcDay(today, parseISO(bill.dueDate))
        ) {
          currentStatus = "Overdue";
        }

        const penalty =
          currentStatus === "Overdue" && bill.status !== "Paid"
            ? calculatePenalty(bill, currentStatus)
            : bill.penaltyAmount || 0;

        const baseAmount =
          bill.rentAmount +
          (bill.utilityBreakdown || []).reduce(
            (sum, util) => sum + util.amount,
            0,
          );
        const newTotalAmount = baseAmount + penalty;

        return {
          ...bill,
          status: currentStatus,
          penaltyAmount: penalty > 0 ? penalty : null,
          totalAmount: parseFloat(newTotalAmount.toFixed(2)),
          tenantName: bill.agreement?.tenant?.name || "N/A",
          spaceDescription: bill.agreement?.space
            ? `${bill.agreement.space.spaceIdName}, ${
                bill.agreement.space.building?.name || "N/A"
              }`
            : "N/A",
        };
      })
      .sort(
        (a, b) =>
          parseISO(b.createdAt).getTime() - parseISO(a.createdAt).getTime(),
      );
  }, [bills, today, calculatePenalty]);

  const upcomingAndPendingBills = useMemo(
    () =>
      processedBills.filter(
        (b) => b.status === "Pending" || b.status === "Overdue",
      ),
    [processedBills],
  );

  // Custom day-level range filter helper (inclusive on both ends).
  const parseRangeBound = (dateStr: string | null | undefined) =>
    dateStr ? startOfDay(parseISO(dateStr)) : null;

  const paidBillsInSelectedPeriod = useMemo(() => {
    const rangeStart = parseRangeBound(paymentStartDate);
    const rangeEnd = parseRangeBound(paymentEndDate);

    return processedBills.filter((bill) => {
      if (bill.status !== "Paid" || !bill.paymentDate) return false;
      const paymentDateObj = startOfDay(parseISO(bill.paymentDate));
      if (rangeStart && paymentDateObj < rangeStart) return false;
      if (rangeEnd && paymentDateObj > rangeEnd) return false;
      return true;
    });
  }, [processedBills, paymentStartDate, paymentEndDate]);

  // The top "Summary Period" range now also drives the "All Transactions"
  // table below, instead of that table always showing every bill
  // regardless of the selected period.
  const summaryBillsForSelectedPeriod = useMemo(() => {
    if (summaryPeriodMode === "all-time") {
      return processedBills;
    }

    const rangeStart = parseRangeBound(summaryStartDate);
    const rangeEnd = parseRangeBound(summaryEndDate);

    return processedBills.filter((bill) => {
      const billDate = startOfDay(parseISO(bill.billDate));
      if (rangeStart && billDate < rangeStart) return false;
      if (rangeEnd && billDate > rangeEnd) return false;
      return true;
    });
  }, [processedBills, summaryStartDate, summaryEndDate, summaryPeriodMode]);

  // Pagination for all transactions — now respects the Summary Period range.
  const allTransactionsTotalPages = Math.ceil(
    summaryBillsForSelectedPeriod.length / upcomingItemsPerPage,
  );
  const paginatedAllTransactions = summaryBillsForSelectedPeriod.slice(
    (upcomingCurrentPage - 1) * upcomingItemsPerPage,
    upcomingCurrentPage * upcomingItemsPerPage,
  );

  // Pagination for paid bills
  const paidTotalPages = Math.ceil(
    paidBillsInSelectedPeriod.length / paidItemsPerPage,
  );
  const paginatedPaidBills = paidBillsInSelectedPeriod.slice(
    (paidCurrentPage - 1) * paidItemsPerPage,
    paidCurrentPage * paidItemsPerPage,
  );

  const unpaidBillsInSummaryPeriod = useMemo(
    () =>
      summaryPeriodMode === "all-time"
        ? upcomingAndPendingBills
        : summaryBillsForSelectedPeriod.filter(
            (bill) => bill.status === "Pending" || bill.status === "Overdue",
          ),
    [summaryPeriodMode, summaryBillsForSelectedPeriod, upcomingAndPendingBills],
  );
  const paidBillsInSummaryPeriod = useMemo(
    () =>
      summaryPeriodMode === "all-time"
        ? processedBills.filter((bill) => bill.status === "Paid")
        : summaryBillsForSelectedPeriod.filter(
            (bill) => bill.status === "Paid",
          ),
    [processedBills, summaryBillsForSelectedPeriod, summaryPeriodMode],
  );
  const summaryPeriodLabel = useMemo(() => {
    if (summaryPeriodMode === "all-time") return "All Time";
    if (!summaryStartDate && !summaryEndDate) return "Selected Period";
    if (summaryStartDate && summaryEndDate) {
      if (summaryStartDate === summaryEndDate) {
        return format(parseISO(summaryStartDate), "MMM d, yyyy");
      }
      return `${format(parseISO(summaryStartDate), "MMM d, yyyy")} – ${format(
        parseISO(summaryEndDate),
        "MMM d, yyyy",
      )}`;
    }
    return summaryStartDate
      ? `From ${format(parseISO(summaryStartDate), "MMM d, yyyy")}`
      : `Through ${format(parseISO(summaryEndDate as string), "MMM d, yyyy")}`;
  }, [summaryStartDate, summaryEndDate, summaryPeriodMode]);
  const summaryPotentialRevenueAgreements = useMemo(() => {
    if (summaryPeriodMode === "all-time") {
      return [];
    }

    const rangeStart = parseRangeBound(summaryStartDate);
    const rangeEnd = parseRangeBound(summaryEndDate);
    if (!rangeStart || !rangeEnd) return [];

    return initialAgreements.filter((agreement) => {
      if (
        agreement.status === "Pending" ||
        agreement.status === "Rejected" ||
        agreement.status === "Canceled"
      ) {
        return false;
      }

      const agreementStart = startOfDay(parseISO(agreement.startDate));
      const agreementEnd = startOfDay(
        agreement.endDate
          ? parseISO(agreement.endDate)
          : addMonths(
              parseISO(agreement.startDate),
              agreement.paymentTermMonths,
            ),
      );

      return agreementStart <= rangeEnd && agreementEnd >= rangeStart;
    });
  }, [initialAgreements, summaryStartDate, summaryEndDate, summaryPeriodMode]);
  const totalUnpaidForSummaryPeriod = useMemo(
    () =>
      unpaidBillsInSummaryPeriod.reduce(
        (sum, bill) => sum + bill.totalAmount,
        0,
      ),
    [unpaidBillsInSummaryPeriod],
  );
  const totalPaidForSummaryPeriod = useMemo(
    () =>
      paidBillsInSummaryPeriod.reduce((sum, bill) => sum + bill.totalAmount, 0),
    [paidBillsInSummaryPeriod],
  );
  const totalPaidSelectedPeriod = useMemo(
    () =>
      paidBillsInSelectedPeriod.reduce(
        (sum, bill) => sum + bill.totalAmount,
        0,
      ),
    [paidBillsInSelectedPeriod],
  );
  const totalPotentialRevenue = useMemo(() => {
    if (summaryPeriodMode === "all-time") {
      return initialSpaces.reduce(
        (sum, space) => sum + (space.monthlyRentalPrice || 0),
        0,
      );
    }

    return summaryPotentialRevenueAgreements.reduce(
      (sum, agreement) => sum + (agreement.monthlyRentalPrice || 0),
      0,
    );
  }, [initialSpaces, summaryPotentialRevenueAgreements, summaryPeriodMode]);

  // Printable label for the Payment History date range.
  const rangeLabel = useMemo(() => {
    if (!paymentStartDate && !paymentEndDate) return "all time";
    if (paymentStartDate && paymentEndDate) {
      if (paymentStartDate === paymentEndDate) {
        return format(parseISO(paymentStartDate), "MMM d, yyyy");
      }
      return `${format(parseISO(paymentStartDate), "MMM d, yyyy")} — ${format(
        parseISO(paymentEndDate),
        "MMM d, yyyy",
      )}`;
    }
    return paymentStartDate
      ? `from ${format(parseISO(paymentStartDate), "MMM d, yyyy")}`
      : `through ${format(parseISO(paymentEndDate as string), "MMM d, yyyy")}`;
  }, [paymentStartDate, paymentEndDate]);

  const getStatusBadgeVariant = (
    status: ClientBill["status"],
  ): "default" | "destructive" | "secondary" | "outline" => {
    switch (status) {
      case "Paid":
        return "secondary";
      case "Pending":
        return "default";
      case "Overdue":
        return "destructive";
      case "PendingVerification":
        return "outline";
      default:
        return "default";
    }
  };

  const getStatusIcon = (status: ClientBill["status"]) => {
    switch (status) {
      case "Paid":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "Pending":
        return <Info className="h-4 w-4 text-yellow-600" />;
      case "Overdue":
        return <AlertTriangle className="h-4 w-4 text-red-600" />;
      case "PendingVerification":
        return <Clock className="h-4 w-4 text-blue-600" />;
      default:
        return <Info className="h-4 w-4 text-gray-500" />;
    }
  };

  const exportToExcel = (
    data: typeof processedBills,
    fileNamePrefix: string,
  ) => {
    if (!canViewPage) {
      // Double check permission before export
      // toast({ title: "Permission Denied", description: "Access Denied", variant: "destructive" });
      return;
    }
    const worksheetData = data.map((bill) => ({
      "Tenant Name": bill.tenantName,
      "Space Description": bill.spaceDescription,
      "Bill Date": formatDateOnlyUTC(bill.billDate),
      "Due Date": formatDateOnlyUTC(bill.dueDate),
      "Rent Amount": bill.rentAmount,
      "Utilities Amount": (bill.utilityBreakdown || []).reduce(
        (sum, util) => sum + util.amount,
        0,
      ),
      "Penalty Amount": bill.penaltyAmount || 0,
      "Total Amount": bill.totalAmount,
      Status: bill.status,
      "Payment Date": bill.paymentDate
        ? formatDateOnlyUTC(bill.paymentDate)
        : "N/A",
      "Payment Method": bill.paymentMethod || "N/A",
      Reference: bill.paymentReference || "N/A",
      Proof: bill.paymentProofDataUri ? "Yes" : "No",
      "Tenant Notes": bill.tenantPaymentNotes || "N/A",
      "Admin Notes": bill.adminVerificationNotes || "N/A",
    }));

    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Payments");
    XLSX.writeFile(
      workbook,
      `${fileNamePrefix}_${format(new Date(), "yyyy-MM-dd")}.xlsx`,
    );
  };

  if (!isMounted) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  if (!canViewPage && isMounted) {
    return (
      <Card className="shadow-lg text-center py-12">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center justify-center">
            <EyeOff className="mr-2" />
            Access Denied
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p>Access Denied</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="animate-fadeIn">
      <PageHeader
        title="Payments Overview"
        icon={ClipboardList}
        description="View all transactions. Analyze potential and collected revenue. Penalties are applied based on building policies."
      />

      <Card className="mb-6 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-headline">
            Summary Period
          </CardTitle>
          <CardDescription>
            Switch between a custom date range and all-time totals. This
            range also controls the "All Transactions" table below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3 lg:max-w-2xl">
            <div>
              <Label htmlFor="summary-period-mode">View</Label>
              <Select
                value={summaryPeriodMode}
                onValueChange={(value) =>
                  setSummaryPeriodMode(value as "monthly" | "all-time")
                }
              >
                <SelectTrigger id="summary-period-mode" className="mt-1 h-9">
                  <SelectValue placeholder="Select Summary View" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Custom Date Range</SelectItem>
                  <SelectItem value="all-time">All Time</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {summaryPeriodMode === "monthly" ? (
              <>
                <div>
                  <Label htmlFor="summary-start-date">From Date</Label>
                  <Input
                    id="summary-start-date"
                    type="date"
                    className="mt-1 h-9"
                    value={summaryStartDate}
                    onChange={(e) => setSummaryStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="summary-end-date">To Date</Label>
                  <Input
                    id="summary-end-date"
                    type="date"
                    className="mt-1 h-9"
                    value={summaryEndDate}
                    onChange={(e) => setSummaryEndDate(e.target.value)}
                  />
                </div>
              </>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 mb-8">
        <Card className="shadow-sm bg-secondary/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Unpaid ({summaryPeriodLabel})
            </CardTitle>
            <Banknote className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {totalUnpaidForSummaryPeriod.toFixed(2)} Birr
            </div>
            <p className="text-xs text-muted-foreground">
              {unpaidBillsInSummaryPeriod.length} transactions (incl. Overdue)
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-sm bg-secondary/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Paid ({summaryPeriodLabel})
            </CardTitle>
            <Banknote className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {totalPaidForSummaryPeriod.toFixed(2)} Birr
            </div>
            <p className="text-xs text-muted-foreground">
              {paidBillsInSummaryPeriod.length} transactions
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-sm bg-secondary/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Potential Monthly Revenue ({summaryPeriodLabel})
            </CardTitle>
            <Landmark className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {totalPotentialRevenue.toFixed(2)} Birr
            </div>
            <p className="text-xs text-muted-foreground">
              {summaryPeriodMode === "all-time"
                ? `Based on ${initialSpaces.length} total spaces`
                : `Based on ${summaryPotentialRevenueAgreements.length} active agreements`}
            </p>
          </CardContent>
        </Card>
      </div>

      <section className="mb-10">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2">
          <h2 className="text-2xl font-headline font-semibold text-foreground">
            All Transactions ({summaryPeriodLabel})
          </h2>
          {summaryBillsForSelectedPeriod.length > 0 && canViewPage && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                exportToExcel(summaryBillsForSelectedPeriod, "All_Transactions")
              }
            >
              <Download className="mr-2 h-4 w-4" /> Export All
            </Button>
          )}
        </div>
        {summaryBillsForSelectedPeriod.length === 0 ? (
          <Card className="text-center py-10 shadow-sm">
            <CardContent>
              <CheckCircle className="mx-auto h-12 w-12 text-green-500 mb-3" />
              <h3 className="text-lg font-semibold font-headline">
                All Clear!
              </h3>
              <p className="text-muted-foreground">
                No transactions found for {summaryPeriodLabel}.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="shadow-md">
              <CardContent className="p-0">
                <div className="w-full overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tenant</TableHead>
                        <TableHead>Space</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead className="text-right">Utility</TableHead>
                        <TableHead className="text-right">Penalty</TableHead>
                        <TableHead className="text-right">Amount Due</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedAllTransactions.map((bill) => {
                        const utilityTotal = (
                          bill.utilityBreakdown || []
                        ).reduce((sum, util) => sum + util.amount, 0);
                        return (
                          <TableRow
                            key={bill.id}
                            className={
                              bill.status === "Paid"
                                ? "bg-green-500/5 hover:bg-green-500/10"
                                : ""
                            }
                          >
                            <TableCell className="font-medium">
                              {bill.tenantName || "N/A"}
                            </TableCell>
                            <TableCell className="text-xs">
                              {bill.spaceDescription}
                            </TableCell>
                            <TableCell
                              className={
                                bill.status === "Overdue"
                                  ? "text-destructive font-semibold"
                                  : ""
                              }
                            >
                              {format(parseISO(bill.dueDate), "PP")}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground text-right whitespace-nowrap">
                              {utilityTotal > 0
                                ? `${utilityTotal.toFixed(2)} Birr`
                                : "-"}
                            </TableCell>
                            <TableCell className="text-xs text-destructive text-right whitespace-nowrap">
                              {bill.penaltyAmount
                                ? `${bill.penaltyAmount.toFixed(2)} Birr`
                                : "-"}
                            </TableCell>
                            <TableCell className="text-right font-semibold text-primary whitespace-nowrap">
                              {bill.totalAmount.toFixed(2)} Birr
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge
                                variant={getStatusBadgeVariant(bill.status)}
                                className="capitalize"
                              >
                                {getStatusIcon(bill.status)}
                                <span className="ml-1">
                                  {bill.status.replace(
                                    "PendingVerification",
                                    "Verifying",
                                  )}
                                </span>
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
            <PaginationControls
              currentPage={upcomingCurrentPage}
              totalPages={allTransactionsTotalPages}
              onPageChange={setUpcomingCurrentPage}
              itemsPerPage={upcomingItemsPerPage}
              onItemsPerPageChange={handleUpcomingItemsPerPageChange}
              className="mt-4"
            />
          </>
        )}
      </section>

      <section>
        <div className="flex flex-col md:flex-row justify-between md:items-center mb-4 gap-4">
          <h2 className="text-2xl font-headline font-semibold text-foreground">
            Payment History (Paid & Verified)
          </h2>
          <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end w-full sm:w-auto">
            <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end">
              <div className="flex-grow sm:flex-grow-0">
                <Label
                  htmlFor="payment-start-date"
                  className="text-xs text-muted-foreground"
                >
                  From Date
                </Label>
                <Input
                  id="payment-start-date"
                  type="date"
                  className="w-full sm:w-[160px] h-9 mt-1"
                  value={paymentStartDate}
                  onChange={(e) => setPaymentStartDate(e.target.value)}
                />
              </div>
              <div className="flex-grow sm:flex-grow-0">
                <Label
                  htmlFor="payment-end-date"
                  className="text-xs text-muted-foreground"
                >
                  To Date
                </Label>
                <Input
                  id="payment-end-date"
                  type="date"
                  className="w-full sm:w-[160px] h-9 mt-1"
                  value={paymentEndDate}
                  onChange={(e) => setPaymentEndDate(e.target.value)}
                />
              </div>
            </div>
            {paidBillsInSelectedPeriod.length > 0 && canViewPage && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  exportToExcel(
                    paidBillsInSelectedPeriod,
                    `Payment_History_${rangeLabel.replace(/[\s,]+/g, "_")}`,
                  )
                }
                className="self-stretch sm:self-end h-9 w-full sm:w-auto"
              >
                <Download className="mr-2 h-4 w-4" /> Export
              </Button>
            )}
          </div>
        </div>

        {paidBillsInSelectedPeriod.length === 0 ? (
          <Card className="text-center py-10 shadow-sm">
            <CardContent>
              <Banknote className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
              <h3 className="text-lg font-semibold font-headline">
                No Payments Found
              </h3>
              <p className="text-muted-foreground">
                No payments recorded for {rangeLabel}.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="shadow-md">
              <CardContent className="p-0">
                <div className="w-full overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tenant</TableHead>
                        <TableHead className="hidden md:table-cell">
                          Space
                        </TableHead>
                        <TableHead>Payment Date</TableHead>
                        <TableHead className="hidden lg:table-cell">
                          Method
                        </TableHead>
                        <TableHead className="hidden xl:table-cell">
                          Proof
                        </TableHead>
                        <TableHead className="text-right">
                          Amount Paid
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedPaidBills.map((bill) => (
                        <TableRow key={bill.id}>
                          <TableCell className="font-medium">
                            {bill.tenantName || "N/A"}
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-xs">
                            {bill.spaceDescription}
                          </TableCell>
                          <TableCell>
                            {bill.paymentDate
                              ? format(parseISO(bill.paymentDate), "PP")
                              : "N/A"}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-xs">
                            {bill.paymentMethod || "N/A"}
                          </TableCell>
                          <TableCell className="hidden xl:table-cell text-xs">
                            {bill.paymentProofDataUri ? (
                              <Button
                                asChild
                                variant="link"
                                size="sm"
                                className="p-0 h-auto"
                              >
                                <a
                                  href={bill.paymentProofDataUri}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <Paperclip className="mr-1 h-3 w-3" />
                                  View
                                </a>
                              </Button>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-green-600 whitespace-nowrap">
                            {bill.totalAmount.toFixed(2)} Birr
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
            <PaginationControls
              currentPage={paidCurrentPage}
              totalPages={paidTotalPages}
              onPageChange={setPaidCurrentPage}
              itemsPerPage={paidItemsPerPage}
              onItemsPerPageChange={handlePaidItemsPerPageChange}
              className="mt-4"
            />
          </>
        )}
      </section>
    </div>
  );
}