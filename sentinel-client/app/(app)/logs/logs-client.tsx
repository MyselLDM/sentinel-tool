"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  RefreshCw,
  Search,
  X,
} from "lucide-react";

import { cn } from "@/lib/cn";
import { exportCsvAction, fetchLogsAction } from "./actions";
import type { FetchLogsResult, PageMeta, RequestFilters, RequestListItem } from "./actions";

// ── Utilities ─────────────────────────────────────────────────────────────────

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function fmtMs(ms: number): string {
  return `${ms.toLocaleString()} ms`;
}

// ── Status badge ──────────────────────────────────────────────────────────────

function VerdictBadge({ rejected }: { rejected: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-mono text-[11px] tracking-wider",
        rejected ? "text-ink" : "text-muted",
      )}
      aria-label={rejected ? "Rejected" : "Accepted"}
    >
      <span
        aria-hidden
        className={cn(
          "block h-1.5 w-1.5 border",
          rejected ? "border-ink bg-ink" : "border-muted bg-transparent",
        )}
      />
      {rejected ? "REJECTED" : "ACCEPTED"}
    </span>
  );
}

// ── Skeleton row ──────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="border-b border-line">
      {[...Array<number>(5)].map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 w-full animate-pulse bg-line" />
        </td>
      ))}
    </tr>
  );
}

// ── Pagination controls ───────────────────────────────────────────────────────

function Pagination({
  meta,
  onPage,
}: {
  meta: PageMeta;
  onPage: (page: number) => void;
}) {
  const { page, totalPages, total, pageSize } = meta;
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm">
      <span className="font-mono text-xs text-muted">
        {total === 0 ? "0 results" : `${start}–${end} of ${total.toLocaleString()}`}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
          className="flex h-8 w-8 items-center justify-center border border-line text-muted transition-colors hover:border-ink hover:text-ink disabled:pointer-events-none disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="flex h-8 min-w-[4rem] items-center justify-center border border-line font-mono text-xs">
          {page} / {totalPages || 1}
        </span>
        <button
          type="button"
          onClick={() => onPage(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
          className="flex h-8 w-8 items-center justify-center border border-line text-muted transition-colors hover:border-ink hover:text-ink disabled:pointer-events-none disabled:opacity-40"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ── Filter bar ────────────────────────────────────────────────────────────────

type ActiveFilters = {
  status: "" | "accepted" | "rejected";
  from: string;
  to: string;
  q: string;
};

const EMPTY_FILTERS: ActiveFilters = { status: "", from: "", to: "", q: "" };

function FilterBar({
  filters,
  localQ,
  onChange,
  onQChange,
}: {
  filters: ActiveFilters;
  localQ: string;
  onChange: (f: ActiveFilters) => void;
  onQChange: (q: string) => void;
}) {
  const hasActive =
    filters.status !== "" || filters.from !== "" || filters.to !== "" || filters.q !== "" || localQ !== "";

  return (
    <div className="flex flex-wrap items-end gap-3 border-b border-line bg-paper px-4 py-3">
      {/* Status */}
      <fieldset className="fieldset p-0">
        <legend className="fieldset-legend">Status</legend>
        <select
          id="status-filter"
          value={filters.status}
          onChange={(e) =>
            onChange({ ...filters, status: e.target.value as ActiveFilters["status"] })
          }
          className="select select-sm border-line font-mono text-xs"
        >
          <option value="">All</option>
          <option value="accepted">Accepted</option>
          <option value="rejected">Rejected</option>
        </select>
      </fieldset>

      {/* Date from */}
      <fieldset className="fieldset p-0">
        <legend className="fieldset-legend">From</legend>
        <input
          id="from-filter"
          type="date"
          value={filters.from}
          onChange={(e) => onChange({ ...filters, from: e.target.value })}
          className="input input-sm border-line font-mono text-xs"
        />
      </fieldset>

      {/* Date to */}
      <fieldset className="fieldset p-0">
        <legend className="fieldset-legend">To</legend>
        <input
          id="to-filter"
          type="date"
          value={filters.to}
          onChange={(e) => onChange({ ...filters, to: e.target.value })}
          className="input input-sm border-line font-mono text-xs"
        />
      </fieldset>

      {/* Request ID search */}
      <fieldset className="fieldset flex-1 p-0 sm:max-w-xs">
        <legend className="fieldset-legend">Request ID</legend>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            id="q-filter"
            type="search"
            value={localQ}
            onChange={(e) => onQChange(e.target.value)}
            placeholder="Search by request ID…"
            className="input input-sm w-full border-line pl-8 font-mono text-xs"
          />
        </div>
      </fieldset>

      {/* Clear */}
      {hasActive && (
        <button
          type="button"
          onClick={() => {
            onQChange("");
            onChange(EMPTY_FILTERS);
          }}
          className="flex h-8 items-center gap-1.5 border border-line px-2.5 font-mono text-[11px] tracking-wider text-muted transition-colors hover:border-ink hover:text-ink"
        >
          <X className="h-3 w-3" />
          CLEAR
        </button>
      )}
    </div>
  );
}

// ── Table ─────────────────────────────────────────────────────────────────────

function LogsTable({
  rows,
  loading,
}: {
  rows: RequestListItem[];
  loading: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[700px] table-auto text-sm">
        <thead>
          <tr className="border-b border-line">
            <th className="px-4 py-3 text-left">
              <span className="label-mono">Request ID</span>
            </th>
            <th className="px-4 py-3 text-left">
              <span className="label-mono">Decision</span>
            </th>
            <th className="px-4 py-3 text-left">
              <span className="label-mono">Latency</span>
            </th>
            <th className="px-4 py-3 text-left">
              <span className="label-mono">Mode</span>
            </th>
            <th className="px-4 py-3 text-left">
              <span className="label-mono">Timestamp</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {loading
            ? [...Array<number>(8)].map((_, i) => <SkeletonRow key={i} />)
            : rows.map((row) => (
                <tr key={row.id} className="transition-colors hover:bg-paper-soft">
                  <td className="px-4 py-3">
                    <Link
                      href={`/logs/${row.requestId}`}
                      className="font-mono text-xs text-muted underline-offset-2 hover:text-ink hover:underline"
                      title={row.requestId}
                    >
                      {row.requestId.slice(0, 8)}…
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <VerdictBadge rejected={row.isRejected} />
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-muted">{fmtMs(row.responseTimeMs)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-[11px] uppercase tracking-wider text-muted">
                      {row.evaluationMode}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-muted" title={row.createdAt}>
                      {fmtDateTime(row.createdAt)}
                    </span>
                  </td>
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function LogsClient({ initialResult }: { initialResult: FetchLogsResult }) {
  const [filters, setFilters] = useState<ActiveFilters>(EMPTY_FILTERS);
  const [localQ, setLocalQ] = useState("");
  const qTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<RequestListItem[]>(
    initialResult.ok ? initialResult.requests : [],
  );
  const [meta, setMeta] = useState<PageMeta>(
    initialResult.ok
      ? initialResult.meta
      : { page: 1, pageSize: 25, total: 0, totalPages: 0 },
  );
  const [error, setError] = useState<string | null>(initialResult.ok ? null : initialResult.message);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState(false);

  // Debounced handler for the search input — avoids a re-fetch on every keystroke.
  const handleQChange = useCallback((q: string) => {
    setLocalQ(q);
    if (qTimer.current) clearTimeout(qTimer.current);
    qTimer.current = setTimeout(() => {
      setFilters((prev) => ({ ...prev, q }));
      setPage(1);
    }, 400);
  }, []);

  // Fetch logs whenever filters or page change
  const fetchLogs = useCallback(
    async (activeFilters: ActiveFilters, activePage: number) => {
      setLoading(true);
      setError(null);

      const apiFilters: RequestFilters = {
        page: activePage,
        pageSize: 25,
      };
      if (activeFilters.status) apiFilters.status = activeFilters.status as "accepted" | "rejected";
      if (activeFilters.from) apiFilters.from = activeFilters.from;
      if (activeFilters.to) apiFilters.to = activeFilters.to;
      if (activeFilters.q) apiFilters.q = activeFilters.q;

      const result = await fetchLogsAction(apiFilters);
      setLoading(false);

      if (!result.ok) {
        setError(result.message);
        return;
      }
      setRows(result.requests);
      setMeta(result.meta);
    },
    [],
  );

  // Ref to track first mount (avoid double-fetch on mount)
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    void fetchLogs(filters, page);
  }, [filters, page, fetchLogs]);

  const handleFiltersChange = (newFilters: ActiveFilters) => {
    setLocalQ(newFilters.q); // keep localQ in sync when filters are cleared
    setFilters(newFilters);
    setPage(1); // reset to page 1 when filters change
  };

  const handleExport = async () => {
    setExportLoading(true);
    setExportError(null);
    setExportSuccess(false);

    const exportFilters: Omit<RequestFilters, "page" | "pageSize" | "sort"> = {};
    if (filters.status) exportFilters.status = filters.status as "accepted" | "rejected";
    if (filters.from) exportFilters.from = filters.from;
    if (filters.to) exportFilters.to = filters.to;
    if (filters.q) exportFilters.q = filters.q;

    const result = await exportCsvAction(exportFilters);
    setExportLoading(false);

    if (!result.ok) {
      setExportError(result.message);
      return;
    }

    // Trigger browser download from the returned CSV string
    const blob = new Blob([result.csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "evaluation_requests.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setExportSuccess(true);
    setTimeout(() => setExportSuccess(false), 3000);
  };

  const hasFilters =
    filters.status !== "" || filters.from !== "" || filters.to !== "" || filters.q !== "";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-mono">Console</p>
          <h1 className="mt-3 font-serif text-4xl leading-tight tracking-[-0.01em] md:text-5xl">
            Logs
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
            Every evaluation Sentinel has made, with scores, thresholds, and latency. Click a row
            to inspect the full evaluation detail.
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void fetchLogs(filters, page)}
            disabled={loading}
            aria-label="Refresh logs"
            className="flex h-9 w-9 items-center justify-center border border-line text-muted transition-colors hover:border-ink hover:text-ink disabled:pointer-events-none disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </button>

          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={exportLoading}
            aria-label="Export CSV"
            className="flex h-9 items-center gap-2 border border-line px-3 font-mono text-[11px] tracking-wider text-muted transition-colors hover:border-ink hover:text-ink disabled:pointer-events-none disabled:opacity-50"
          >
            {exportLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : exportSuccess ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            EXPORT CSV
          </button>
        </div>
      </div>

      {/* Export error */}
      {exportError && (
        <div
          role="alert"
          className="flex items-center gap-3 border border-line bg-paper-soft p-3 text-sm"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-muted" />
          <span className="flex-1">{exportError}</span>
          <button
            type="button"
            onClick={() => setExportError(null)}
            aria-label="Dismiss export error"
            className="text-muted hover:text-ink"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Table panel */}
      <div className="border border-line bg-paper">
        <FilterBar filters={filters} localQ={localQ} onChange={handleFiltersChange} onQChange={handleQChange} />

        {/* Error state */}
        {error && !loading && (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <AlertCircle className="h-8 w-8 text-muted" />
            <div>
              <p className="font-medium">Failed to load logs</p>
              <p className="mt-1 text-sm text-muted">{error}</p>
            </div>
            <button
              type="button"
              onClick={() => void fetchLogs(filters, page)}
              className="flex items-center gap-2 border border-ink px-4 py-2 text-sm transition-colors hover:bg-paper-soft"
            >
              <RefreshCw className="h-4 w-4" />
              Retry
            </button>
          </div>
        )}

        {/* Empty state */}
        {!error && !loading && rows.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="font-medium">
              {hasFilters ? "No logs match your filters" : "No evaluations yet"}
            </p>
            <p className="max-w-sm text-sm text-muted">
              {hasFilters
                ? "Try adjusting or clearing the filters above."
                : "Evaluations will appear here once agents start sending requests."}
            </p>
          </div>
        )}

        {/* Table */}
        {(loading || rows.length > 0) && !error && (
          <LogsTable rows={rows} loading={loading} />
        )}

        {/* Pagination */}
        {!error && meta.total > 0 && (
          <Pagination meta={meta} onPage={setPage} />
        )}
      </div>
    </div>
  );
}
