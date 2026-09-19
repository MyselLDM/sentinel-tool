import type { ReactNode } from "react";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { verifySession } from "@/lib/auth/dal";

/**
 * Protected group. The layout is the second line of defense after the Proxy:
 * it verifies the session and redirects unauthenticated visitors to `/login`.
 * Every route under `(app)` inherits auth + chrome.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await verifySession();

  return (
    <>
      <SiteHeader user={{ name: user.fullName ?? user.email, email: user.email }} />
      <main className="bg-hatch flex-1">
        <div className="mx-auto w-full max-w-6xl px-6 py-10 md:py-14">{children}</div>
      </main>
      <SiteFooter />
    </>
  );
}
