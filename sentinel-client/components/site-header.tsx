"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, Menu, X } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";

export type SessionUser = { name: string; email: string };

const NAV = [
  { href: "#product", label: "Product" },
  { href: "#how", label: "How it works" },
  { href: "#playground", label: "Playground" },
  { href: "#docs", label: "Docs" },
] as const;

const ACCOUNT_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/api-keys", label: "API keys" },
  { href: "/logs", label: "Logs" },
  { href: "/settings", label: "Model info" },
] as const;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function SiteHeader({ user = null }: { user?: SessionUser | null }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
        {/* Wordmark */}
        <Link href="/" className="flex items-center gap-2.5">
          <span aria-hidden className="block h-3 w-3 border border-ink" />
          <span className="font-serif text-[22px] leading-none tracking-tight">
            Sentinel
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-8 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm text-muted transition-colors hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {user ? (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="flex h-9 items-center gap-2 border border-line-strong pl-1 pr-2.5 text-sm transition-colors hover:border-ink"
              >
                <span className="flex h-7 w-7 items-center justify-center bg-ink font-mono text-[11px] text-paper">
                  {initials(user.name) || "S"}
                </span>
                <span className="hidden max-w-[10rem] truncate sm:inline">
                  {user.name}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-muted" />
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-56 border border-line bg-paper"
                >
                  <div className="border-b border-line px-3 py-2.5">
                    <p className="truncate text-sm font-medium">{user.name}</p>
                    <p className="truncate font-mono text-[11px] text-muted">
                      {user.email}
                    </p>
                  </div>
                  <div className="py-1">
                    {ACCOUNT_LINKS.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        role="menuitem"
                        className="block px-3 py-1.5 text-sm text-ink-soft transition-colors hover:bg-paper-soft hover:text-ink"
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                  <div className="border-t border-line py-1">
                    <button
                      type="button"
                      role="menuitem"
                      className="block w-full px-3 py-1.5 text-left text-sm text-muted transition-colors hover:bg-paper-soft hover:text-ink"
                    >
                      Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden text-sm text-muted transition-colors hover:text-ink sm:inline"
              >
                Sign in
              </Link>
              <ButtonLink href="/login" size="sm">
                Get started
              </ButtonLink>
            </>
          )}

          {/* Mobile toggle */}
          <button
            type="button"
            onClick={() => setMobileOpen((open) => !open)}
            aria-label="Toggle menu"
            aria-expanded={mobileOpen}
            className="ml-1 flex h-9 w-9 items-center justify-center border border-line-strong transition-colors hover:border-ink md:hidden"
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Mobile panel */}
      {mobileOpen && (
        <div className="border-t border-line md:hidden">
          <nav className="mx-auto flex w-full max-w-6xl flex-col px-6">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className="border-b border-line py-3 text-sm text-ink-soft"
              >
                {item.label}
              </Link>
            ))}
            {!user && (
              <Link
                href="/login"
                onClick={() => setMobileOpen(false)}
                className="py-3 text-sm text-muted"
              >
                Sign in
              </Link>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
