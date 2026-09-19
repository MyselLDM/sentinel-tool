import type { Metadata } from "next";

import { ConsolePlaceholder } from "@/components/console/console-placeholder";

export const metadata: Metadata = {
  title: "Model info — Sentinel",
};

export default function SettingsPage() {
  return (
    <ConsolePlaceholder
      title="Model info"
      description="Which models are live and how they decide — versions, decision rules and trained thresholds."
      note="The model page is under construction. GET /api/models and GET /api/metrics are already live. Thresholds come from training and are read-only."
    />
  );
}
