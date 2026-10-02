"use client";

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import { PageHeader } from "@/components/custom/PageHeader";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  Map,
  Building as BuildingIcon,
  Users,
  Banknote,
  Download,
  Loader2,
  RotateCcw,
} from "lucide-react";
import {
  format,
  eachMonthOfInterval,
  parseISO,
  startOfMonth,
  endOfMonth,
} from "date-fns";
import { usePermissions } from "@/contexts/PermissionContext";
import XLSX from "xlsx-js-style";
import {
  getDistrictReportAction,
  type BuildingReportRow,
} from "./actions";

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "ETB",
    maximumFractionDigits: 2,
  }).format(n || 0);
}

function formatDate(iso: string | undefined | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, "yyyy-MM-dd");
}

export function DistrictReportsClientPage() {
  const {
    hasPermission,
    isSuperAdmin,
    isLoading: permissionsLoading,
  } = usePermissions();

  const canViewPage =
    isSuperAdmin || hasPermission("district_report:view");

  const [isMounted, setIsMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [rows, setRows] = useState<BuildingReportRow[]>([]);
  const [districts, setDistricts] = useState<string[]>([]);
  const [branches, setBranches] = useState<string[]>([]);

  const [selectedDistrict, setSelectedDistrict] = useState("all");
  const [selectedBranch, setSelectedBranch] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const result = await getDistrictReportAction({
      district: selectedDistrict,
      branch: selectedBranch,
      startDate: startDate || null,
      endDate: endDate || null,
    });

    if (result.error) {
      setError(result.error);
      setRows([]);
    } else {
      setRows(result.rows);

      if (result.districts) {
        setDistricts(result.districts);
      }

      if (result.branches) {
        setBranches(result.branches);
      }
    }

    setIsLoading(false);
  }, [
    selectedDistrict,
    selectedBranch,
    startDate,
    endDate,
  ]);

  useEffect(() => {
    if (isMounted && canViewPage) {
      fetchData();
    } else if (isMounted) {
      setIsLoading(false);
    }
  }, [isMounted, canViewPage, fetchData]);

  const handleResetFilters = () => {
    setSelectedDistrict("all");
    setSelectedBranch("all");
    setStartDate("");
    setEndDate("");
  };

  // Rows are now one-per-building. "Buildings Onboarded" / "Active
  // Buildings" are derived by counting rows, not by summing a per-row field.
  const totals = useMemo(() => {
    const base = rows.reduce(
      (acc, r) => {
        acc.tenantsOnboarded += r.tenantsOnboarded;
        acc.collectionAmount += r.collectionAmount;
        acc.transactionCount += r.transactionCount;
        acc.digitalCollectionAmount += r.digitalCollectionAmount;
        acc.manualCollectionAmount += r.manualCollectionAmount;
        return acc;
      },
      {
        tenantsOnboarded: 0,
        collectionAmount: 0,
        transactionCount: 0,
        digitalCollectionAmount: 0,
        manualCollectionAmount: 0,
      },
    );

    return {
      ...base,
      buildingsOnboarded: rows.length,
      activeBuildings: rows.filter((r) => r.isActive).length,
    };
  }, [rows]);

  const exportToExcel = () => {
  if (!canViewPage || rows.length === 0) {
    return;
  }

  // --- Styles ---
  const navyStyle = {
    fill: { fgColor: { rgb: "1F4E78" } },
    font: { name: "Arial", bold: true, color: { rgb: "FFFFFF" }, sz: 10 },
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
  };

  const blueStyle = {
    fill: { fgColor: { rgb: "2E75B6" } },
    font: { name: "Arial", bold: true, color: { rgb: "FFFFFF" }, sz: 10 },
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
  };

  const redStyle = {
    fill: { fgColor: { rgb: "C00000" } },
    font: { name: "Arial", bold: true, color: { rgb: "FFFFFF" }, sz: 10 },
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
  };

  const totalStyle = {
    fill: { fgColor: { rgb: "D9D9D9" } },
    font: { name: "Arial", bold: true, sz: 10 },
    alignment: { horizontal: "center", vertical: "center" },
  };

  const summaryHeaderStyle = {
    fill: { fgColor: { rgb: "1F4E78" } },
    font: { name: "Arial", bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
    alignment: { horizontal: "left", vertical: "center" },
  };

  const summaryLabelStyle = {
    font: { name: "Arial", bold: true, sz: 10 },
    alignment: { horizontal: "left", vertical: "center" },
  };

  const summaryValueStyle = {
    font: { name: "Arial", sz: 10 },
    alignment: { horizontal: "right", vertical: "center" },
  };

  // --- DYNAMIC MONTH DEFINITIONS ---

const defaultMonths = [
  { label: "Jul", key: "2025-07" },
  { label: "Aug", key: "2025-08" },
  { label: "Sep", key: "2025-09" },
  { label: "Oct", key: "2025-10" },
  { label: "Nov", key: "2025-11" },
  { label: "Dec", key: "2025-12" },
  { label: "Jan", key: "2026-01" },
  { label: "Feb", key: "2026-02" },
  { label: "Mar", key: "2026-03" },
  { label: "Apr", key: "2026-04" },
  { label: "May", key: "2026-05" },
  { label: "Jun", key: "2026-06" },
];

let monthDefs = defaultMonths;

if (startDate && endDate) {
  try {
    const start = startOfMonth(parseISO(startDate));
    const end = endOfMonth(parseISO(endDate));

    if (start <= end) {
      const intervalMonths = eachMonthOfInterval({ start, end });
      monthDefs = intervalMonths.map((d) => ({
        label: format(d, "MMM"), // Output: Jul, Aug, Sep
        key: format(d, "yyyy-MM"),
      }));
    }
  } catch {
    monthDefs = defaultMonths;
  }
}

  // --- 1. MAIN REPORT HEADERS ---
  const row1: any[] = [
    { v: "No.", s: navyStyle },
    { v: "District", s: navyStyle },
    { v: "Branch", s: navyStyle },
    { v: "Building Name", s: navyStyle },
    { v: "Onboarding Date", s: navyStyle },
    { v: "Tenants Onboarded", s: navyStyle },
    { v: "Status (Active/Inactive)", s: navyStyle },
  ];

  monthDefs.forEach((month) => {
    row1.push(
      { v: month.label, s: blueStyle },
      { v: "", s: blueStyle },
      { v: "", s: blueStyle },
      { v: "", s: blueStyle },
    );
  });

  row1.push({ v: "YTD SUMMARY", s: redStyle });
  for (let i = 0; i < 6; i++) {
    row1.push({ v: "", s: redStyle });
  }

  const row2: any[] = [
    { v: "", s: navyStyle },
    { v: "", s: navyStyle },
    { v: "", s: navyStyle },
    { v: "", s: navyStyle },
    { v: "", s: navyStyle },
    { v: "", s: navyStyle },
    { v: "", s: navyStyle },
  ];

  monthDefs.forEach(() => {
    row2.push(
      { v: "Digital Value", s: blueStyle },
      { v: "Digital Volume", s: blueStyle },
      { v: "Branch Value", s: blueStyle },
      { v: "Branch Volume", s: blueStyle },
    );
  });

  row2.push(
    { v: "Digital Value", s: redStyle },
    { v: "Digital Volume", s: redStyle },
    { v: "Branch Value", s: redStyle },
    { v: "Branch Volume", s: redStyle },
    { v: "Total Value", s: redStyle },
    { v: "Total Volume", s: redStyle },
    { v: "Digital Share %", s: redStyle },
  );

  // --- 2. DATA ROWS — one row per BUILDING, with its real name/date/status ---
  const dataRows: any[][] = [];

  rows.forEach((r, idx) => {
    const digVal = r.digitalCollectionAmount || 0;
    const digVol = r.digitalTransactionCount || 0;
    const manVal = r.manualCollectionAmount || 0;
    const manVol = r.manualTransactionCount || 0;
    const totalVal = r.collectionAmount || 0;
    const totalVol = r.transactionCount || 0;

    const digShare = totalVal > 0 ? digVal / totalVal : 0;

    const row: any[] = [
      idx + 1,
      r.district,
      r.branch,
      r.buildingName,
      formatDate(r.onboardingDate),
      r.tenantsOnboarded,
      r.status || (r.isActive ? "Active" : "Inactive"),
    ];

    monthDefs.forEach((month) => {
      const monthly = r.monthlyBreakdown?.[month.key] || {
        digitalVal: 0,
        digitalVol: 0,
        manualVal: 0,
        manualVol: 0,
      };

      row.push(
        monthly.digitalVal,
        monthly.digitalVol,
        monthly.manualVal,
        monthly.manualVol,
      );
    });

    row.push(digVal, digVol, manVal, manVol, totalVal, totalVol, {
      v: digShare,
      t: "n",
      z: "0.0%",
    });

    dataRows.push(row);
  });

  // --- 3. TOTAL ROW ---
  const totalRow: any[] = [
    { v: "TOTAL", s: totalStyle },
    { v: "", s: totalStyle },
    { v: "", s: totalStyle },
    { v: "", s: totalStyle },
    { v: "", s: totalStyle },
    { v: totals.tenantsOnboarded, s: totalStyle },
    { v: "", s: totalStyle },
  ];

  // Dynamic filling for monthly summary sub-columns in the total row
  for (let i = 0; i < monthDefs.length * 4; i++) {
    totalRow.push({ v: 0, s: totalStyle });
  }

  const totDigVal = totals.digitalCollectionAmount;
  const totManVal = totals.manualCollectionAmount;
  const totVal = totals.collectionAmount;
  const totVol = totals.transactionCount;
  const totShare = totVal > 0 ? totDigVal / totVal : 0;

  totalRow.push(
    { v: totDigVal, s: totalStyle },
    { v: 0, s: totalStyle },
    { v: totManVal, s: totalStyle },
    { v: 0, s: totalStyle },
    { v: totVal, s: totalStyle },
    { v: totVol, s: totalStyle },
    { v: totShare, z: "0.0%", s: totalStyle },
  );

  // --- 4. BOTTOM KPI SUMMARY BLOCK ---
  const kpiSummaryRows: any[][] = [
    [],
    [],
    [{ v: "EXECUTIVE KPI SUMMARY", s: summaryHeaderStyle }, "", "", ""],
    [{ v: "Total Buildings:", s: summaryLabelStyle }, { v: totals.buildingsOnboarded, s: summaryValueStyle }, "", ""],
    [{ v: "Total Active Buildings:", s: summaryLabelStyle }, { v: totals.activeBuildings, s: summaryValueStyle }, "", ""],
    [{ v: "Total Tenants Onboarded:", s: summaryLabelStyle }, { v: totals.tenantsOnboarded, s: summaryValueStyle }, "", ""],
    [{ v: "Total Collection Amount (ETB):", s: summaryLabelStyle }, { v: totals.collectionAmount, s: summaryValueStyle, z: "#,##0.00" }, "", ""],
    [{ v: "Digital Collection Amount (ETB):", s: summaryLabelStyle }, { v: totals.digitalCollectionAmount, s: summaryValueStyle, z: "#,##0.00" }, "", ""],
    [{ v: "Manual Collection Amount (ETB):", s: summaryLabelStyle }, { v: totals.manualCollectionAmount, s: summaryValueStyle, z: "#,##0.00" }, "", ""],
    [{ v: "Total Transactions:", s: summaryLabelStyle }, { v: totals.transactionCount, s: summaryValueStyle }, "", ""],
  ];

  // --- 5. COMBINE ALL ROWS & APPLY DYNAMIC MERGES ---
  const sheetData = [
    row1,
    row2,
    ...dataRows,
    totalRow,
    ...kpiSummaryRows,
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(sheetData);

  worksheet["!merges"] = [
    // Header Column Merges
    { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } },
    { s: { r: 0, c: 1 }, e: { r: 1, c: 1 } },
    { s: { r: 0, c: 2 }, e: { r: 1, c: 2 } },
    { s: { r: 0, c: 3 }, e: { r: 1, c: 3 } },
    { s: { r: 0, c: 4 }, e: { r: 1, c: 4 } },
    { s: { r: 0, c: 5 }, e: { r: 1, c: 5 } },
    { s: { r: 0, c: 6 }, e: { r: 1, c: 6 } },
  ];

  // Monthly Group Merges (Dynamic based on monthDefs length)
  for (let m = 0; m < monthDefs.length; m++) {
    const startCol = 7 + m * 4;
    worksheet["!merges"].push({
      s: { r: 0, c: startCol },
      e: { r: 0, c: startCol + 3 },
    });
  }

  // Dynamic YTD Summary Column Start Index
  const ytdStartCol = 7 + monthDefs.length * 4;
  worksheet["!merges"].push({
    s: { r: 0, c: ytdStartCol },
    e: { r: 0, c: ytdStartCol + 6 },
  });

  // Total Row Merges
  const totalRIndex = dataRows.length + 2;
  worksheet["!merges"].push({
    s: { r: totalRIndex, c: 0 },
    e: { r: totalRIndex, c: 3 },
  });

  // KPI Header Banner Merge
  const kpiHeaderRIndex = totalRIndex + 3;
  worksheet["!merges"].push({
    s: { r: kpiHeaderRIndex, c: 0 },
    e: { r: kpiHeaderRIndex, c: 3 },
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "BMS");

  XLSX.writeFile(
    workbook,
    `Building_Report_${format(new Date(), "yyyy-MM-dd")}.xlsx`,
  );
};

  if (!isMounted || permissionsLoading) {
    return null;
  }

  if (!canViewPage) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold">
            Access Denied
          </h2>

          <p className="mt-2 text-muted-foreground">
            You do not have permission to view district reports.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="District & Branch Reports"
        description="Building-level performance, with District and Branch shown on every row, for management reporting."
        icon={Map}
        actions={
          <Button
            onClick={exportToExcel}
            disabled={rows.length === 0}
          >
            <Download className="mr-2 h-4 w-4" />
            Export Excel Report
          </Button>
        }
      />

      {/* Filter Controls */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <Label>District</Label>

              <Select
                value={selectedDistrict}
                onValueChange={setSelectedDistrict}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="All Districts" />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="all">
                    All Districts
                  </SelectItem>

                  {districts.map((district) => (
                    <SelectItem
                      key={district}
                      value={district}
                    >
                      {district}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Branch</Label>

              <Select
                value={selectedBranch}
                onValueChange={setSelectedBranch}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="All Branches" />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="all">
                    All Branches
                  </SelectItem>

                  {branches.map((branch) => (
                    <SelectItem
                      key={branch}
                      value={branch}
                    >
                      {branch}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>From Date</Label>

              <Input
                type="date"
                value={startDate}
                onChange={(e) =>
                  setStartDate(e.target.value)
                }
                className="mt-1"
              />
            </div>

            <div>
              <Label>To Date</Label>

              <Input
                type="date"
                value={endDate}
                onChange={(e) =>
                  setEndDate(e.target.value)
                }
                className="mt-1"
              />
            </div>

            <div>
              <Button
                variant="outline"
                className="w-full"
                onClick={handleResetFilters}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Reset Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card>
          <CardContent className="pt-6 text-destructive">
            {error}
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Buildings
            </CardTitle>

            <BuildingIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>

          <CardContent>
            <div className="text-xl font-bold sm:text-2xl">
              {totals.buildingsOnboarded}
            </div>

            <p className="text-xs text-muted-foreground">
              {totals.activeBuildings} active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Tenants Onboarded
            </CardTitle>

            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>

          <CardContent>
            <div className="text-xl font-bold sm:text-2xl">
              {totals.tenantsOnboarded}
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Collection Amount
            </CardTitle>

            <Banknote className="h-4 w-4 text-muted-foreground" />
          </CardHeader>

          <CardContent className="min-w-0">
            <div className="break-words text-xl font-bold leading-tight sm:text-2xl">
              {formatCurrency(
                totals.collectionAmount,
              )}
            </div>

            <p className="mt-1 text-xs leading-snug text-muted-foreground">
              Digital{" "}
              {formatCurrency(
                totals.digitalCollectionAmount,
              )}{" "}
              &middot; Manual{" "}
              {formatCurrency(
                totals.manualCollectionAmount,
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Report Table — one row per building */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            By Building
          </CardTitle>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No data found for the selected filters.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>District</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Building Name</TableHead>
                    <TableHead>Onboarding Date</TableHead>
                    <TableHead>Status</TableHead>

                    <TableHead className="text-right">
                      Tenants Onboarded
                    </TableHead>

                    <TableHead className="text-right">
                      Collection Amount
                    </TableHead>

                    <TableHead className="text-right">
                      Transactions
                    </TableHead>

                    <TableHead className="text-right">
                      Digital Collections
                    </TableHead>

                    <TableHead className="text-right">
                      Branch/Manual Collections
                    </TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.buildingId}>
                      <TableCell className="font-medium">
                        {r.district}
                      </TableCell>

                      <TableCell className="font-medium">
                        {r.branch}
                      </TableCell>

                      <TableCell className="font-medium">
                        {r.buildingName}
                      </TableCell>

                      <TableCell>
                        {formatDate(r.onboardingDate)}
                      </TableCell>

                      <TableCell>
                        {r.status || (r.isActive ? "Active" : "Inactive")}
                      </TableCell>

                      <TableCell className="text-right">
                        {r.tenantsOnboarded}
                      </TableCell>

                      <TableCell className="text-right">
                        {formatCurrency(
                          r.collectionAmount,
                        )}
                      </TableCell>

                      <TableCell className="text-right">
                        {r.transactionCount}
                      </TableCell>

                      <TableCell className="text-right">
                        {formatCurrency(
                          r.digitalCollectionAmount,
                        )}{" "}
                        ({r.digitalTransactionCount})
                      </TableCell>

                      <TableCell className="text-right">
                        {formatCurrency(
                          r.manualCollectionAmount,
                        )}{" "}
                        ({r.manualTransactionCount})
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}