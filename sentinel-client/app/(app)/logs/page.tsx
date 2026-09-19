import type { Metadata } from "next";

import { ConsolePlaceholder } from "@/components/console/console-placeholder";

export const metadata: Metadata = {
  title: "Logs — Sentinel",
};

export default function LogsPage() {
  return (
    <ConsolePlaceholder
      title="Logs"
      description="Every evaluation Sentinel has made, with scores, thresholds and latency."
      note="The log viewer is under construction. GET /api/requests and GET /api/requests/export.csv are already live."
    />
  );
}
