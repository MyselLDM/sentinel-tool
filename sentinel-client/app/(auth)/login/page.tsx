import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { AuthPanel } from "@/app/(auth)/_components/auth-panel";
import { safeNextPath } from "@/lib/auth/config";
import { getCurrentUser } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "Sign in — Sentinel",
  description: "Sign in to the Sentinel operator console, or create an account.",
};

/** Development seed, matching `express-server/src/seed.js`. */
const DEMO_EMAIL = "demo@sentinel.local";
const DEMO_PASSWORD = "demo-password-123";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Single auth surface: **Sign in** | **Create account** (plan §4.1).
 * `?tab=create` opens on the create tab; `?next=` returns the operator to the
 * protected page they were bounced from.
 */
export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = safeNextPath(first(params.next));

  // Already signed in — don't show the form.
  const user = await getCurrentUser();
  if (user) redirect(next);

  const defaultTab = first(params.tab) === "create" ? "create" : "signin";
  // Resolved on the server so the literal never lands in the client bundle.
  const demoHint =
    process.env.NODE_ENV === "production"
      ? undefined
      : { email: DEMO_EMAIL, password: DEMO_PASSWORD };

  return <AuthPanel defaultTab={defaultTab} next={next} demoHint={demoHint} />;
}
