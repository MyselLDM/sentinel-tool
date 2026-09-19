"use client";

import { useCallback, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu } from "lucide-react";

import { signOut } from "@/lib/auth/actions";
import { cn } from "@/lib/cn";
import { CONSOLE_ROUTES, activeRoute } from "./nav-items";

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
        <header className="sticky top-0 z-40 border-b border-line bg-paper/85 backdrop-blur-md">
          <div className="flex h-16 items-center gap-3 px-4 md:px-6">
            <label
              htmlFor={DRAWER_ID}
              className="btn btn-ghost btn-sm drawer-button -ml-2 lg:hidden"
              aria-label="Open navigation"
            >
              <Menu className="h-4 w-4" />
            </label>

            <nav aria-label="Breadcrumb" className="min-w-0">
              <ol className="flex items-center gap-2 text-sm">
                <li className="hidden sm:block">
                  <Link href="/dashboard" className="text-muted transition-colors hover:text-ink">
                    Console
                  </Link>
                </li>
                <li aria-hidden className="hidden text-muted sm:block">
                  /
                </li>
                <li aria-current="page" className="truncate text-ink">
                  {active?.label ?? "Console"}
                </li>
              </ol>
            </nav>
          </div>
        </header>

        <main className="bg-hatch flex-1">
          <div className="mx-auto w-full max-w-6xl px-6 py-10 md:py-12">{children}</div>
        </main>
      </div>

      {/* ── Sidebar ────────────────────────────────────────────────── */}
      <div className="drawer-side z-50">
        <label htmlFor={DRAWER_ID} aria-label="Close navigation" className="drawer-overlay" />
        <aside className="flex min-h-full w-72 flex-col border-r border-line bg-paper">
          <div className="flex h-16 items-center gap-2.5 border-b border-line px-5">
            <span aria-hidden className="block h-3 w-3 border border-ink" />
            <span className="font-serif text-[22px] leading-none tracking-tight">Sentinel</span>
          </div>

          <nav aria-label="Console" className="flex-1 overflow-y-auto p-3">
            <ul className="menu w-full">
              {CONSOLE_ROUTES.map((route) => {
                const isActive = route.href === active?.href;
                return (
                  <li key={route.href}>
                    <Link
                      href={route.href}
                      aria-current={isActive ? "page" : undefined}
                      onClick={closeDrawer}
                      className={cn("gap-2.5", !isActive && "text-muted")}
                    >
                      <route.icon className="h-4 w-4" />
                      {route.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="border-t border-line p-3">
            <div className="flex items-center gap-2.5 px-2 py-1.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center bg-ink font-mono text-[11px] text-paper">
                {initials(user.name) || "S"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm leading-tight">{user.name}</span>
                <span className="block truncate font-mono text-[11px] text-muted">
                  {user.email}
                </span>
              </span>
            </div>
            <form action={signOut} className="mt-1">
              <button
                type="submit"
                className="btn btn-ghost btn-sm w-full justify-start gap-2 text-muted hover:text-ink"
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
