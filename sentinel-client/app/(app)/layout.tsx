import type { ReactNode } from "react";

import { ConsoleShell } from "@/components/console/console-shell";
import { verifySession } from "@/lib/auth/dal";

/**
 * Protected group. The layout is the second line of defense after the Proxy:
 * it verifies the session and redirects unauthenticated visitors to `/login`.
 * Every route under `(app)` inherits auth + the console chrome (sidebar +
 * topbar).
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await verifySession();

  return (
    <ConsoleShell user={{ name: user.fullName ?? user.email, email: user.email }}>
      {children}
    </ConsoleShell>
  );
}
