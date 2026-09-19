import type { Metadata } from "next";

import { ConsolePlaceholder } from "@/components/console/console-placeholder";

export const metadata: Metadata = {
  title: "API keys — Sentinel",
};

export default function ApiKeysPage() {
  return (
    <ConsolePlaceholder
      title="API keys"
      description="Issue, rate-limit and revoke the credentials your agents authenticate with."
      note="Key management is under construction. The gateway endpoints behind it (GET / POST / PATCH / DELETE /api/keys) are already live."
    />
  );
}
