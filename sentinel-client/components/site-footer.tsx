import Link from "next/link";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "#product", label: "Overview" },
      { href: "#how", label: "How it works" },
      { href: "#docs", label: "API reference" },
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
      { href: "/logs", label: "Logs" },
      { href: "/settings", label: "Model info" },
      { href: "/docs", label: "Documentation" },
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line">
      <div className="mx-auto w-full max-w-6xl px-6 py-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="max-w-xs">
            <div className="flex items-center gap-2.5">
              <span aria-hidden className="block h-3 w-3 border border-ink" />
              <span className="font-serif text-[22px] leading-none tracking-tight">
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
              <p className="label-mono">{column.title}</p>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-ink-soft transition-colors hover:text-ink"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-[11px] tracking-wider text-muted">
            © {new Date().getFullYear()} SENTINEL · NLI SECURITY GATEWAY
          </p>
          <p className="font-mono text-[11px] tracking-wider text-muted">
            NLI + CONTRASTIVE · MINILM
          </p>
        </div>
      </div>
    </footer>
  );
}
