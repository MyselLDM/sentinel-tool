import type { Metadata } from "next";

import type { ApiKey } from "@/lib/api/keys";
import { fetchKeys } from "./actions";
import { ApiKeysClient } from "./api-keys-client";

export const metadata: Metadata = {
  title: "API keys — Sentinel",
  description: "Issue, rate-limit and revoke the API keys your agents authenticate with.",
};

/**
 * API Key Management page.
 *
 * Server Component: fetches the initial key list (via a server action that reads
 * the session cookie). Passes the data to the interactive client component.
 *
 * The app layout has already verified the session via verifySession(), so any
 * fetch failure here is non-auth related.
 */
export default async function ApiKeysPage() {
  let initialKeys: ApiKey[];
  try {
    initialKeys = await fetchKeys();
  } catch {
    // Render the client component with an empty list; it will show an error state.
    initialKeys = [];
  }

  return <ApiKeysClient initialKeys={initialKeys} />;
}
