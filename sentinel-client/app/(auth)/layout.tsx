import Link from "next/link";
import type { ReactNode } from "react";
import { Shield } from "lucide-react";

/**
 * Public auth surface: no app shell — just the brand mark over a centered card
 * on the page background.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center bg-page px-6 py-14">
      <div className="w-full max-w-sm">
        <Link href="/" className="mx-auto mb-8 flex w-fit items-center gap-2.5">
          <Shield className="h-5 w-5 text-primary-blue" />
          <span className="text-lg font-semibold tracking-tight text-heading">Sentinel</span>
        </Link>

        {children}

      </div>
    </main>
  );
}
