"use client";

import { useCallback, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, LogOut, Menu } from "lucide-react";

import { signOut } from "@/lib/auth/actions";
import { cn } from "@/lib/cn";
import { CONSOLE_ROUTES, activeRoute } from "./nav-items";
import { SentinelLogoFull } from "@/components/sentinel-logo";

/**
 * The authenticated console shell: a daisyUI `drawer` holding the navigation
 * sidebar and a topbar (breadcrumb).
 *
 * - Persistent sidebar on `lg+` (`drawer-open`); off-canvas with a hamburger
 *   below that.
 * - The account block + sign-out live in the sidebar footer, so they are
 *   server-rendered (they work without JS, unlike a dropdown).
 * - This shell is the only client boundary here; pages stay Server Components.
 */

const DRAWER_ID = "console-nav";

type ConsoleUser = { name: string; email: string };

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function ConsoleShell({ user, children }: { user: ConsoleUser; children: ReactNode }) {
  const pathname = usePathname();
  const drawerRef = useRef<HTMLInputElement>(null);
  const active = activeRoute(pathname);

  const closeDrawer = useCallback(() => {
    if (drawerRef.current) drawerRef.current.checked = false;
  }, []);

  // Collapse the off-canvas drawer after navigating (mobile) — both on a route
  // change and on tapping the item for the route we're already on.
  useEffect(() => {
    closeDrawer();
  }, [pathname, closeDrawer]);

  return (
    <div className="drawer min-h-dvh w-full lg:drawer-open">
      <input ref={drawerRef} id={DRAWER_ID} type="checkbox" className="drawer-toggle" />

      {/* ── Content column ─────────────────────────────────────────── */}
      <div className="drawer-content flex min-h-dvh flex-col">
        <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur-md">
          <div className="flex h-14 items-center gap-3 px-4 md:px-6">
            <label
              htmlFor={DRAWER_ID}
              className="btn btn-ghost btn-sm drawer-button -ml-2 rounded-lg lg:hidden"
              aria-label="Open navigation"
            >
              <Menu className="h-4 w-4" />
            </label>

            <nav aria-label="Breadcrumb" className="min-w-0">
              <ol className="flex items-center gap-2 text-sm">
                <li className="hidden sm:block">
                  <Link href="/dashboard" className="text-muted transition-colors hover:text-heading">
                    Console
                  </Link>
                </li>
                <li aria-hidden className="hidden text-border-strong sm:block">
                  /
                </li>
                <li aria-current="page" className="truncate font-medium text-heading">
                  {active?.label ?? "Console"}
                </li>
              </ol>
            </nav>

            <Link
              href="/docs"
              className="ml-auto text-sm text-muted transition-colors hover:text-heading"
            >
              Docs
            </Link>
          </div>
        </header>

        <main className="flex-1 bg-page">
          <div className="mx-auto w-full max-w-6xl px-6 py-8 md:py-10">{children}</div>
        </main>
      </div>

      {/* ── Sidebar ────────────────────────────────────────────────── */}
      <div className="drawer-side z-50">
        <label htmlFor={DRAWER_ID} aria-label="Close navigation" className="drawer-overlay" />
        <aside className="flex min-h-full w-64 flex-col border-r border-border bg-surface">
          <div className="flex h-14 items-center border-b border-border px-5">
            <SentinelLogoFull className="h-8" />
          </div>

          <nav aria-label="Console" className="flex-1 overflow-y-auto px-3 py-4">
            <ul className="flex flex-col gap-1">
              {CONSOLE_ROUTES.map((route) => {
                const isActive = route.href === active?.href;
                return (
                  <li key={route.href}>
                    <Link
                      href={route.href}
                      aria-current={isActive ? "page" : undefined}
                      onClick={closeDrawer}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-primary-light text-primary-blue"
                          : "text-muted hover:bg-page hover:text-heading",
                      )}
                    >
                      <route.icon className="h-4.5 w-4.5" />
                      {route.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Bottom of the sidebar: docs, then the account block. */}
          <div className="border-t border-border px-3 py-3">
            <Link
              href="/docs"
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted transition-colors hover:bg-page hover:text-heading"
            >
              <BookOpen className="h-4 w-4" />
              Documentation
            </Link>
          </div>

          <div className="border-t border-border px-4 py-3">
            <div className="flex items-center gap-3 py-1.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-light text-xs font-semibold text-primary-blue">
                {initials(user.name) || "S"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-heading">{user.name}</span>
                <span className="block truncate text-xs text-muted">
                  {user.email}
                </span>
              </span>
            </div>
            <form action={signOut} className="mt-1">
              <button
                type="submit"
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-page hover:text-heading"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </form>
          </div>
        </aside>
      </div>
    </div>
  );
}
