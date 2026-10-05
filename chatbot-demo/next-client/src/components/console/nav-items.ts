import { Cpu, KeyRound, LayoutDashboard, ScrollText } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * The console's primary navigation — one entry per route under `app/(app)/`.
 *
 * Keep this in sync with that group (and with `PROTECTED_PREFIXES` in
 * `proxy.ts`, which mirrors the same set).
 */
export type ConsoleRoute = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const CONSOLE_ROUTES: readonly ConsoleRoute[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/api-keys", label: "API keys", icon: KeyRound },
  { href: "/logs", label: "Logs", icon: ScrollText },
  { href: "/settings", label: "Model info", icon: Cpu },
];

/** The route matching the current pathname (exact, or a nested child of it). */
export function activeRoute(pathname: string): ConsoleRoute | null {
  return (
    CONSOLE_ROUTES.find(
      (route) => pathname === route.href || pathname.startsWith(`${route.href}/`),
    ) ?? null
  );
}
