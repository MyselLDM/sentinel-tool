"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";

const NAV = [
  { href: "/#product", label: "Product" },
  { href: "/#how", label: "How it works" },
  { href: "/#playground", label: "Try it" },
  { href: "/#docs", label: "API" },
] as const;

/**
 * Marketing-site header for the public pages. The authenticated console has its
 * own chrome (sidebar + topbar) — see `components/console/console-shell.tsx`.
 */
export function SiteHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);

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
          <Link
            href="/docs"
            className="hidden text-sm text-muted transition-colors hover:text-ink sm:inline"
          >
            Docs
          </Link>
          <Link
            href="/login"
            className="hidden text-sm text-muted transition-colors hover:text-ink sm:inline"
          >
            Sign in
          </Link>
          <ButtonLink href="/login?tab=create" size="sm">
            Get started
          </ButtonLink>

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
            <Link
              href="/docs"
              onClick={() => setMobileOpen(false)}
              className="border-b border-line py-3 text-sm text-ink-soft"
            >
              Docs
            </Link>
            <Link
              href="/login"
              onClick={() => setMobileOpen(false)}
              className="py-3 text-sm text-muted"
            >
              Sign in
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
