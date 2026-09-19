import type { Metadata } from "next";
import type { ReactNode } from "react";

import { DocsExplorer } from "@/components/docs/docs-explorer";
import type { DocSection } from "@/components/docs/docs-explorer";
import {
  DataObjectsSection,
  EndpointSection,
  GettingStartedSection,
  GroupSection,
  TutorialsSection,
} from "@/components/docs/docs-sections";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Eyebrow } from "@/components/ui/eyebrow";
import { API_BASE_URL, API_GROUPS, ENDPOINT_COUNT } from "@/lib/docs/api-reference";

export const metadata: Metadata = {
  title: "API reference — Sentinel",
  description:
    "Reference and tutorials for the Sentinel gateway: authenticate, issue API keys, evaluate subtasks, and read the logs.",
};

/** The sidebar. Reference groups nest their endpoints one level deep. */
const SECTIONS: DocSection[] = [
  { id: "getting-started", label: "Getting started" },
  { id: "tutorials", label: "Basic tutorials" },
  { id: "objects", label: "Data objects" },
  ...API_GROUPS.map((group) => ({
    id: group.id,
    label: group.title,
    children: group.endpoints.map((endpoint) => ({
      id: endpoint.id,
      label: `${endpoint.method} ${endpoint.path}`,
    })),
  })),
];

/** Every sidebar target, pre-rendered on the server and swapped in the client. */
function buildContent(): Record<string, ReactNode> {
  const content: Record<string, ReactNode> = {
    "getting-started": <GettingStartedSection />,
    tutorials: <TutorialsSection />,
    objects: <DataObjectsSection />,
  };

  for (const group of API_GROUPS) {
    content[group.id] = <GroupSection group={group} />;
    for (const endpoint of group.endpoints) {
      content[endpoint.id] = (
        <EndpointSection endpoint={endpoint} groupTitle={group.title} />
      );
    }
  }

  return content;
}

export default function DocsPage() {
  return (
    <>
      <SiteHeader />

      <main className="bg-hatch flex-1">
        <div className="mx-auto w-full max-w-6xl px-6 py-10 md:py-14">
          {/* ── Intro ─────────────────────────────────────────────── */}
          <div className="mb-8 max-w-3xl">
            <Eyebrow>API reference</Eyebrow>
            <h1 className="mt-5 font-serif text-4xl leading-[1.05] tracking-[-0.02em] md:text-5xl">
              Sentinel HTTP API
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-muted">
              One endpoint gates a subtask; everything else issues keys and reads the record of
              what happened. JSON over HTTP, authenticated with a bearer token.
            </p>
            <p className="mt-5 font-mono text-[11px] tracking-wider text-muted">
              {ENDPOINT_COUNT} ENDPOINTS · BASE URL {API_BASE_URL}
            </p>
          </div>

          <div className="border border-line bg-paper">
            <DocsExplorer sections={SECTIONS} content={buildContent()} />
          </div>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
