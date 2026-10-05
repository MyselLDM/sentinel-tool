import Link from "next/link";
import type { ReactNode } from "react";
import { SentinelLogoFull } from "@/components/sentinel-logo";

/**
 * Public auth surface: no app shell — just the brand mark over a centered card
 * on the page background.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center bg-page px-6 py-14">
      <div className="w-full max-w-sm">
        <Link href="/" className="mx-auto mb-8 flex w-fit items-center justify-center">
          <SentinelLogoFull className="h-12" />
        </Link>

        {children}

      </div>
    </main>
  );
}
