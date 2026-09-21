import type { Metadata } from "next";
import Link from "next/link";
import { Download, Search } from "lucide-react";

import { Eyebrow } from "@/components/ui/eyebrow";
import { Section } from "@/components/ui/section";
import { getCurrentUser } from "@/lib/auth/dal";
import { readSession } from "@/lib/auth/session";
import { listRequests } from "@/lib/api/requests";

export const metadata: Metadata = {
  title: "Logs — Sentinel",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function badgeClass(rejected: boolean) {
  return rejected ? "badge badge-error" : "badge badge-success";
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function buildExportHref(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  if (params.from) search.set("from", params.from);
  if (params.to) search.set("to", params.to);
  if (params.status) search.set("status", params.status);
  if (params.q) search.set("q", params.q);
  if (params.mode) search.set("mode", params.mode);
  if (params.sort) search.set("sort", params.sort);
  return `/logs/export${search.size ? `?${search.toString()}` : ""}`;
}

export default async function LogsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthenticated user");

  const session = await readSession();
  if (!session) throw new Error("Missing session");

  const params = await searchParams;
  const page = Number(first(params.page) ?? "1") || 1;
  const pageSize = Number(first(params.pageSize) ?? "25") || 25;
  const filters = {
    from: first(params.from),
    to: first(params.to),
    status: first(params.status) as "accepted" | "rejected" | undefined,
    q: first(params.q),
    mode: first(params.mode) as "standard" | "detailed" | undefined,
    page,
    pageSize,
    sort: (first(params.sort) as "created_at" | "response_time_ms") ?? "created_at",
  };

  const { data, meta } = await listRequests(session.accessToken, filters);
  const rows = data.requests;
  const hasFilters = Boolean(filters.from || filters.to || filters.status || filters.q || filters.mode);

  const pagingQuery = new URLSearchParams();
  if (filters.from) pagingQuery.set("from", filters.from);
  if (filters.to) pagingQuery.set("to", filters.to);
  if (filters.status) pagingQuery.set("status", filters.status);
  if (filters.q) pagingQuery.set("q", filters.q);
  if (filters.mode) pagingQuery.set("mode", filters.mode);
  if (filters.sort) pagingQuery.set("sort", filters.sort);
  pagingQuery.set("pageSize", String(pageSize));

  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <Eyebrow>Console</Eyebrow>
          <h1 className="mt-5 font-serif text-4xl leading-tight tracking-[-0.01em] md:text-5xl">
            Logs
          </h1>
        </div>

        <a href={buildExportHref({
          from: filters.from,
          to: filters.to,
          status: filters.status,
          q: filters.q,
          mode: filters.mode,
          sort: filters.sort,
        })} className="btn btn-outline gap-2" target="_blank" rel="noreferrer">
          <Download className="h-4 w-4" />
          Export CSV
        </a>
      </div>

      <Section className="p-4 md:p-5">
        <form className="grid gap-3 md:grid-cols-6" action="/logs">
          <label className="form-control w-full md:col-span-2">
            <span className="label-mono mb-2 text-[10px] uppercase tracking-[0.18em] text-muted">From</span>
            <input type="date" name="from" defaultValue={filters.from} className="input input-bordered input-sm w-full" />
          </label>

          <label className="form-control w-full md:col-span-2">
            <span className="label-mono mb-2 text-[10px] uppercase tracking-[0.18em] text-muted">To</span>
            <input type="date" name="to" defaultValue={filters.to} className="input input-bordered input-sm w-full" />
          </label>

          <label className="form-control w-full md:col-span-1">
            <span className="label-mono mb-2 text-[10px] uppercase tracking-[0.18em] text-muted">Status</span>
            <select name="status" defaultValue={filters.status ?? ""} className="select select-bordered select-sm w-full">
              <option value="">All</option>
              <option value="accepted">Accepted</option>
              <option value="rejected">Rejected</option>
            </select>
          </label>

          <label className="form-control w-full md:col-span-1">
            <span className="label-mono mb-2 text-[10px] uppercase tracking-[0.18em] text-muted">Mode</span>
            <select name="mode" defaultValue={filters.mode ?? ""} className="select select-bordered select-sm w-full">
              <option value="">All</option>
              <option value="standard">Standard</option>
              <option value="detailed">Detailed</option>
            </select>
          </label>

          <label className="form-control w-full md:col-span-4">
            <span className="label-mono mb-2 text-[10px] uppercase tracking-[0.18em] text-muted">Request ID</span>
            <input
              type="search"
              name="q"
              defaultValue={filters.q}
              placeholder="Search by request ID"
              className="input input-bordered input-sm w-full"
            />
          </label>

          <div className="flex items-end gap-2 md:col-span-2">
            <button type="submit" className="btn btn-primary btn-sm gap-2 flex-1">
              <Search className="h-4 w-4" />
              Apply
            </button>
            <Link href="/logs" className="btn btn-ghost btn-sm flex-1">
              Reset
            </Link>
          </div>
        </form>
      </Section>

      <Section className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table table-zebra table-pin-rows w-full">
            <thead>
              <tr>
                <th>Time</th>
                <th>Request ID</th>
                <th>Status</th>
                <th>NLI</th>
                <th>Contrastive</th>
                <th>Latency</th>
                <th>Mode</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted">
                    {hasFilters
                      ? "No logs matched those filters. Try widening the search."
                      : "No evaluations have been recorded yet."}
                  </td>
                </tr>
              ) : (
                rows.map((request) => (
                  <tr key={request.id} className="hover:bg-paper-soft">
                    <td className="font-mono text-xs">{formatDate(request.createdAt)}</td>
                    <td>
                      <Link href={`/logs/${request.requestId}`} className="link link-hover font-mono text-sm">
                        {request.requestId}
                      </Link>
                    </td>
                    <td>
                      <span className={badgeClass(request.isRejected)}>
                        {request.isRejected ? "Rejected" : "Accepted"}
                      </span>
                    </td>
                    <td className="font-mono text-sm">{request.nliScore ?? "—"}</td>
                    <td className="font-mono text-sm">{request.contrastiveScore ?? "—"}</td>
                    <td className="font-mono text-sm">{request.responseTimeMs ?? 0} ms</td>
                    <td className="font-mono text-xs">{request.evaluationMode ?? "standard"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm text-muted">
          <span>{meta.total} total</span>
        </div>
        <div className="join">
          {(() => {
            const prevQuery = new URLSearchParams(pagingQuery.toString());
            prevQuery.set("page", String(Math.max(1, page - 1)));
            const nextQuery = new URLSearchParams(pagingQuery.toString());
            nextQuery.set("page", String(page + 1));
            return (
              <>
                <Link href={`/logs?${prevQuery.toString()}`} className={`btn btn-sm join-item ${page <= 1 ? "btn-disabled" : ""}`}>
                  Prev
                </Link>
                <button type="button" className="btn btn-sm join-item btn-ghost no-animation">
                  Page {page} / {meta.totalPages}
                </button>
                <Link href={`/logs?${nextQuery.toString()}`} className={`btn btn-sm join-item ${page >= meta.totalPages ? "btn-disabled" : ""}`}>
                  Next
                </Link>
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
