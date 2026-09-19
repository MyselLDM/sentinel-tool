import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Public auth surface: no app shell — just the brand mark over a centered card
 * on the hatched base.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="bg-hatch flex flex-1 items-center justify-center px-6 py-14">
      <div className="w-full max-w-sm">
        <Link href="/" className="mx-auto mb-8 flex w-fit items-center gap-2.5">
          <span aria-hidden className="block h-3 w-3 border border-ink" />
          <span className="font-serif text-[22px] leading-none tracking-tight">Sentinel</span>
        </Link>

        {children}

      </div>
    </main>
  );
}
