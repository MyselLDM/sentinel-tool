import Link from "next/link";
import { Shield } from "lucide-react";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/#product", label: "Overview" },
      { href: "/#how", label: "How it works" },
      { href: "/#playground", label: "Playground" },
    ],
  },
  {
    title: "Account",
    links: [
      { href: "/login", label: "Sign in" },
      { href: "/dashboard", label: "Dashboard" },
      { href: "/api-keys", label: "API keys" },
    ],
  },
  {
    title: "Resources",
    links: [
      { href: "/docs", label: "Documentation" },
      { href: "/logs", label: "Logs" },
      { href: "/settings", label: "Model info" },
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border bg-surface">
      <div className="mx-auto w-full max-w-6xl px-6 py-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="max-w-xs">
            <div className="flex items-center gap-2.5">
              <Shield className="h-5 w-5 text-primary-blue" />
              <span className="text-lg font-semibold tracking-tight text-heading">
                Sentinel
              </span>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-muted">
              Alignment verification for agent subtasks. Two independent models,
              one auditable decision.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.title}>
              <p className="text-xs font-medium uppercase tracking-wide text-muted">{column.title}</p>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-body transition-colors hover:text-primary-blue"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted">
            © {new Date().getFullYear()} Sentinel · NLI Security Gateway
          </p>
          <p className="text-xs text-muted">
            NLI + Contrastive · MiniLM
          </p>
        </div>
      </div>
    </footer>
  );
}
