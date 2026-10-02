"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Download, History, EyeOff, Activity } from "lucide-react";
import { format } from "date-fns";
import { PaginationControls } from "@/components/custom/PaginationControls";
import type { SerializedAuditLog } from "./actions";
import { usePermissions } from "@/contexts/PermissionContext";
import XLSX from "xlsx-js-style";

interface AuditLogClientPageProps {
  initialData: SerializedAuditLog[];
}

const CATEGORY_LABELS: Record<string, string> = {
  PAYMENT: "Payment",
  AUTH: "Authentication",
  USER: "User",
  ROLE: "Role",
  BUILDING: "Building",
  SPACE: "Space",
  TENANT: "Tenant",
  AGREEMENT: "Agreement",
  BILLING: "Billing",
  BUILDING_UTILITY: "Building Utility",
  AGREEMENT_TEMPLATE: "Agreement Template",
  SETTINGS: "Settings",
};

const ACTION_LABELS: Record<string, string> = {
  CREATED: "Created",
  UPDATED: "Updated",
  DELETED: "Deleted",
  STATUS_CHANGED: "Status Changed",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  ASSIGNED: "Assigned",
  PASSWORD_RESET: "Password Reset",
  LOGIN: "Logged In",
  LOGIN_FAILED: "Login Failed",
  LOGOUT: "Logged Out",
  RECORDED: "Recorded",
};

const ACTION_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  CREATED: "default",
  UPDATED: "default",
  DELETED: "destructive",
  STATUS_CHANGED: "default",
  APPROVED: "default",
  REJECTED: "destructive",
  ASSIGNED: "default",
  PASSWORD_RESET: "destructive",
  LOGIN: "default",
  LOGIN_FAILED: "destructive",
  LOGOUT: "secondary",
  RECORDED: "secondary",
};

function isPaymentLog(log: SerializedAuditLog) {
  return log.category === "PAYMENT" || !log.category;
}

function formatMetadataValue(value: unknown): string {
  if (typeof value === "number") return value.toLocaleString();
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "None";
  return String(value);
}

function formatMetadataKey(key: string): string {
  // "totalAmount" -> "Total Amount"
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

function formatMetadata(metadata: Record<string, unknown> | null) {
  if (!metadata) return null;
  const entries = Object.entries(metadata).filter(([key, value]) => {
    if (value === null || value === undefined || value === "") return false;
    // Raw internal record ids aren't useful to a human reader — the
    // Target column already names the record by its readable name.
    if (/Id$/.test(key)) return false;
    return true;
  });
  if (entries.length === 0) return null;
  return entries
    .map(([key, value]) => `${formatMetadataKey(key)}: ${formatMetadataValue(value)}`)
    .join(" · ");
}

function eventLabel(log: SerializedAuditLog) {
  const category = log.category ? CATEGORY_LABELS[log.category] ?? log.category : "Payment";
  const action = log.action ? ACTION_LABELS[log.action] ?? log.action : "Recorded";
  return `${category} ${action}`;
}

export function AuditLogClientPage({ initialData }: AuditLogClientPageProps) {
  const { hasPermission } = usePermissions();
  const [logs] = useState<SerializedAuditLog[]>(initialData);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const canViewAudit = hasPermission("audit:view");

  const paymentLogs = useMemo(() => logs.filter(isPaymentLog), [logs]);
  const activityLogs = useMemo(
    () => logs.filter((log) => !isPaymentLog(log)),
    [logs],
  );

  const filterBySearch = (list: SerializedAuditLog[]) => {
    if (!searchTerm) return list;
    const q = searchTerm.toLowerCase();
    return list.filter((log) => {
      return (
        log.tenantName?.toLowerCase().includes(q) ||
        log.buildingName?.toLowerCase().includes(q) ||
        log.spaceName?.toLowerCase().includes(q) ||
        log.transactionId?.toLowerCase().includes(q) ||
        log.actorName?.toLowerCase().includes(q) ||
        log.targetName?.toLowerCase().includes(q) ||
        eventLabel(log).toLowerCase().includes(q)
      );
    });
  };

  const filteredPaymentLogs = useMemo(
    () => filterBySearch(paymentLogs),
    [paymentLogs, searchTerm],
  );
  const filteredActivityLogs = useMemo(
    () => filterBySearch(activityLogs),
    [activityLogs, searchTerm],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const handleItemsPerPageChange = (newSize: number) => {
    setItemsPerPage(newSize);
    setCurrentPage(1);
  };

  const exportToExcel = (list: SerializedAuditLog[], filename: string) => {
    const dataToExport = list.map((log) => ({
      Date: format(new Date(log.createdAt), "PPpp"),
      Event: eventLabel(log),
      Building: log.buildingName ?? "",
      Space: log.spaceName ?? "",
      Tenant: log.tenantName ?? "",
      Target: log.targetName ?? "",
      "Rent Amount": log.rentAmount ?? "",
      "Utility Amount": log.utilityAmount ?? "",
      "Penalty Amount": log.penaltyAmount ?? "",
      "Total Amount": log.totalAmount ?? "",
      "Transaction ID": log.transactionId ?? "",
      "To Account": log.toAccountNumber ?? "",
      Details: formatMetadata(log.metadata) ?? "",
      "Performed By": log.actorName ?? "",
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "AuditLog");
    XLSX.writeFile(workbook, filename);
  };

  if (!canViewAudit) {
    return (
      <Card className="shadow-lg text-center py-12">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center justify-center">
            <EyeOff className="mr-2" /> Access Denied
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p>Access Denied</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            placeholder="Search by name, building, event type..."
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="financial" className="w-full">
          <TabsList>
            <TabsTrigger value="financial">
              <History className="mr-2 h-4 w-4" />
              Financial Transactions
            </TabsTrigger>
            <TabsTrigger value="activity">
              <Activity className="mr-2 h-4 w-4" />
              Activity Log
            </TabsTrigger>
          </TabsList>

          <TabsContent value="financial" className="mt-4">
            <PaymentLogTable
              logs={filteredPaymentLogs}
              currentPage={currentPage}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={handleItemsPerPageChange}
              onExport={() =>
                exportToExcel(filteredPaymentLogs, "Financial_Transactions_Log.xlsx")
              }
            />
          </TabsContent>

          <TabsContent value="activity" className="mt-4">
            <ActivityLogTable
              logs={filteredActivityLogs}
              currentPage={currentPage}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={handleItemsPerPageChange}
              onExport={() =>
                exportToExcel(filteredActivityLogs, "Activity_Log.xlsx")
              }
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

interface TableProps {
  logs: SerializedAuditLog[];
  currentPage: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange: (size: number) => void;
  onExport: () => void;
}

function PaymentLogTable({
  logs,
  currentPage,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
  onExport,
}: TableProps) {
  const totalPages = Math.max(1, Math.ceil(logs.length / itemsPerPage));
  const visiblePage = Math.min(currentPage, totalPages);
  const paginated = logs.slice(
    (visiblePage - 1) * itemsPerPage,
    visiblePage * itemsPerPage,
  );

  return (
    <div>
      <div className="flex justify-end mb-3">
        <Button
          onClick={onExport}
          variant="outline"
          size="sm"
          disabled={logs.length === 0}
        >
          <Download className="mr-2 h-4 w-4" /> Export to Excel
        </Button>
      </div>
      {paginated.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <History className="mx-auto h-12 w-12 mb-4" />
          <p>No financial transaction records found.</p>
        </div>
      ) : (
        <>
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Building/Space</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead className="text-right">Total Amount</TableHead>
                  <TableHead className="hidden md:table-cell text-right">
                    Rent
                  </TableHead>
                  <TableHead className="hidden md:table-cell text-right">
                    Utilities
                  </TableHead>
                  <TableHead className="hidden lg:table-cell text-right">
                    Penalty
                  </TableHead>
                  <TableHead className="hidden lg:table-cell">
                    Transaction ID
                  </TableHead>
                  <TableHead className="hidden xl:table-cell">
                    Recorded By
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-medium whitespace-nowrap">
                      {format(new Date(log.createdAt), "PP")}
                    </TableCell>
                    <TableCell>
                      <div>{log.buildingName}</div>
                      <div className="text-xs text-muted-foreground">
                        {log.spaceName}
                      </div>
                    </TableCell>
                    <TableCell>{log.tenantName}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {log.totalAmount !== null
                        ? log.totalAmount.toFixed(2)
                        : "—"}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-right text-sm">
                      {log.rentAmount !== null ? log.rentAmount.toFixed(2) : "—"}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-right text-sm">
                      {log.utilityAmount !== null
                        ? log.utilityAmount.toFixed(2)
                        : "—"}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-right text-sm text-destructive">
                      {log.penaltyAmount !== null
                        ? log.penaltyAmount.toFixed(2)
                        : "—"}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-xs">
                      {log.transactionId || "N/A"}
                    </TableCell>
                    <TableCell className="hidden xl:table-cell text-xs">
                      {log.actorName}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <PaginationControls
            currentPage={visiblePage}
            totalPages={totalPages}
            onPageChange={onPageChange}
            itemsPerPage={itemsPerPage}
            onItemsPerPageChange={onItemsPerPageChange}
            className="mt-4"
          />
        </>
      )}
    </div>
  );
}

function ActivityLogTable({
  logs,
  currentPage,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
  onExport,
}: TableProps) {
  const totalPages = Math.max(1, Math.ceil(logs.length / itemsPerPage));
  const visiblePage = Math.min(currentPage, totalPages);
  const paginated = logs.slice(
    (visiblePage - 1) * itemsPerPage,
    visiblePage * itemsPerPage,
  );

  return (
    <div>
      <div className="flex justify-end mb-3">
        <Button
          onClick={onExport}
          variant="outline"
          size="sm"
          disabled={logs.length === 0}
        >
          <Download className="mr-2 h-4 w-4" /> Export to Excel
        </Button>
      </div>
      {paginated.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <Activity className="mx-auto h-12 w-12 mb-4" />
          <p>No activity records found.</p>
        </div>
      ) : (
        <>
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date &amp; Time</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead className="hidden xl:table-cell">
                    Performed By
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.map((log) => {
                  const label = eventLabel(log);
                  const variant = log.action
                    ? ACTION_VARIANT[log.action] ?? "default"
                    : "secondary";
                  const details = formatMetadata(log.metadata);

                  return (
                    <TableRow key={log.id}>
                      <TableCell className="font-medium whitespace-nowrap">
                        {format(new Date(log.createdAt), "PPp")}
                      </TableCell>
                      <TableCell>
                        <Badge variant={variant}>{label}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {log.targetName || "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-sm truncate">
                        {details || "—"}
                      </TableCell>
                      <TableCell className="hidden xl:table-cell text-xs">
                        {log.actorName || "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <PaginationControls
            currentPage={visiblePage}
            totalPages={totalPages}
            onPageChange={onPageChange}
            itemsPerPage={itemsPerPage}
            onItemsPerPageChange={onItemsPerPageChange}
            className="mt-4"
          />
        </>
      )}
    </div>
  );
}