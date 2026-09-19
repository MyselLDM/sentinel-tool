import type { Metadata } from "next";
import type { ReactNode } from "react";

import { CodeBlock } from "@/components/docs/code-block";
import { DocsToc } from "@/components/docs/docs-toc";
import type { TocItem } from "@/components/docs/docs-toc";
import { Inline } from "@/components/docs/inline";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Eyebrow } from "@/components/ui/eyebrow";
import {
  API_BASE_URL,
  API_GROUPS,
  API_SHAPES,
  ENDPOINT_COUNT,
  ERROR_CODES,
} from "@/lib/docs/api-reference";
import type { ApiEndpoint } from "@/lib/docs/api-reference";

export const metadata: Metadata = {
  title: "API reference — Sentinel",
  description:
    "Reference and tutorials for the Sentinel gateway: authenticate, issue API keys, evaluate subtasks, and read the logs.",
};

const TOC: TocItem[] = [
  { id: "getting-started", label: "Getting started" },
  { id: "tutorials", label: "Basic tutorials" },
  { id: "objects", label: "Data objects" },
  ...API_GROUPS.map((group) => ({
    id: group.id,
    label: group.title,
    children: group.endpoints.map((entry) => ({
      id: entry.id,
      label: `${entry.method} ${entry.path}`,
    })),
  })),
];

const AUTH_PLANES = [
  {
    plane: "Console",
    who: "the operator console (on behalf of a signed-in user)",
    header: "Authorization: Bearer <access JWT>",
  },
  {
    plane: "Data plane",
    who: "agents / SDKs",
    header: "Authorization: Bearer <api key>  ·  x-api-key: <api key>",
  },
] as const;

function Th({ children }: { children: ReactNode }) {
  return (
    <th className="font-mono text-[10px] font-normal uppercase tracking-widest text-muted">
      {children}
    </th>
  );
}

function SectionHeading({
  id,
  eyebrow,
  title,
  intro,
}: {
  id: string;
  eyebrow: string;
  title: string;
  intro?: ReactNode;
}) {
  return (
    <header id={id} className="scroll-mt-24">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-5 font-serif text-3xl leading-tight tracking-[-0.01em] md:text-4xl">
        {title}
      </h2>
      {intro && <div className="mt-4 max-w-2xl text-sm leading-relaxed text-muted">{intro}</div>}
    </header>
  );
}

function SubHeading({ children }: { children: ReactNode }) {
  return <h3 className="mt-10 font-serif text-xl tracking-tight">{children}</h3>;
}

function Endpoint({ endpoint }: { endpoint: ApiEndpoint }) {
  return (
    <div id={endpoint.id} className="scroll-mt-24">
      {/* Method · path · auth */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="border border-line-strong px-2 py-0.5 font-mono text-[11px] tracking-widest text-ink-soft">
          {endpoint.method}
        </span>
        <code className="font-mono text-sm text-ink">{endpoint.path}</code>
        <span className="label-mono ml-auto">{endpoint.auth}</span>
      </div>

      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
        <Inline text={endpoint.summary} />
      </p>

      {endpoint.params && endpoint.params.length > 0 && (
        <div className="mt-5 overflow-x-auto border border-line">
          <table className="table table-sm">
            <thead>
              <tr>
                <Th>Param</Th>
                <Th>Type</Th>
                <Th>Notes</Th>
              </tr>
            </thead>
            <tbody>
              {endpoint.params.map((param) => (
                <tr key={param.name}>
                  <td className="whitespace-nowrap font-mono text-xs text-ink">{param.name}</td>
                  <td className="whitespace-nowrap font-mono text-xs text-muted">{param.type}</td>
                  <td className="text-xs">
                    <Inline text={param.notes} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(endpoint.request || endpoint.response) && (
        <div className="mt-5 flex flex-col gap-4">
          {endpoint.request && <CodeBlock label="request" code={endpoint.request} />}
          {endpoint.response && <CodeBlock label="response" code={endpoint.response} />}
        </div>
      )}

      {endpoint.errors && (
        <p className="mt-4 text-xs leading-relaxed text-muted">
          <span className="label-mono">Errors</span>{" "}
          <span className="ml-1">
            <Inline text={endpoint.errors} />
          </span>
        </p>
      )}

      {endpoint.note && (
        <p className="mt-4 border-l-2 border-line-strong pl-4 text-xs leading-relaxed text-muted">
          <Inline text={endpoint.note} />
        </p>
      )}
    </div>
  );
}

const TUTORIAL_EVALUATE = `BASE=http://localhost:4000

# 1) Sign in → access token (console plane)
TOKEN=$(curl -s -X POST $BASE/api/auth/login \\
  -H 'Content-Type: application/json' \\
  -d '{"email":"op@acme.io","password":"correct horse battery"}' \\
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.accessToken')

# 2) Mint an API key — the plaintext secret is shown exactly once
KEY=$(curl -s -X POST $BASE/api/keys \\
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \\
  -d '{"keyName":"first-agent"}' \\
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.key')

# 3) Gate a subtask (data plane)
curl -s -X POST $BASE/api/evaluate \\
  -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \\
  -d '{"goal":"Process disability benefits for veteran",
       "subtask":"Retrieve medical records",
       "mode":"detailed"}'`;

const TUTORIAL_KEYS = `# List your keys — always masked, never the secret
curl -s $BASE/api/keys -H "Authorization: Bearer $TOKEN"

# Deactivate a key (keeps it for the audit trail)
curl -s -X PATCH $BASE/api/keys/$KEY_ID \\
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \\
  -d '{"isActive":false}'

# Delete it for good (frees the hash so it can never authenticate again)
curl -s -X DELETE $BASE/api/keys/$KEY_ID -H "Authorization: Bearer $TOKEN"`;

const TUTORIAL_LOGS = `# Rejections in the last page, newest first
curl -s "$BASE/api/requests?status=rejected&pageSize=5" \\
  -H "Authorization: Bearer $TOKEN"

# One evaluation, with both models' scores and the thresholds used
curl -s "$BASE/api/requests/$REQUEST_ID" -H "Authorization: Bearer $TOKEN"

# Export everything that matched the filter to CSV
curl -s "$BASE/api/requests/export.csv?status=rejected" \\
  -H "Authorization: Bearer $TOKEN" -o rejected.csv`;

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
            <div className="grid lg:grid-cols-[minmax(0,1fr)_17rem]">
              {/* ── Content ─────────────────────────────────────────── */}
              <article className="min-w-0 p-6 md:p-10">
                {/* Getting started */}
                <SectionHeading
                  id="getting-started"
                  eyebrow="Getting started"
                  title="Authenticate, then gate a subtask"
                  intro={
                    <>
                      <p>
                        Send a goal and the subtask an agent is about to perform. Two independent
                        models each cast a vote, and{" "}
                        <Inline text="**a single reject blocks the subtask**." />
                      </p>
                    </>
                  }
                />

                <div className="mt-6 flex flex-wrap items-center gap-3 border border-line px-4 py-3">
                  <span className="label-mono">Base URL</span>
                  <code className="font-mono text-sm text-ink">{API_BASE_URL}</code>
                </div>

                <SubHeading>Two auth planes</SubHeading>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
                  An access JWT authenticates an <span className="text-ink">operator</span>; an API
                  key authenticates a <span className="text-ink">machine client</span>. They are
                  never interchangeable.
                </p>
                <div className="mt-4 overflow-x-auto border border-line">
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <Th>Plane</Th>
                        <Th>Who calls it</Th>
                        <Th>Header</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {AUTH_PLANES.map((row) => (
                        <tr key={row.plane}>
                          <td className="whitespace-nowrap text-sm text-ink">{row.plane}</td>
                          <td className="text-xs text-muted">{row.who}</td>
                          <td className="whitespace-nowrap font-mono text-xs text-ink-soft">
                            {row.header}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <SubHeading>Response envelopes</SubHeading>
                <div className="mt-4 flex flex-col gap-4">
                  <CodeBlock
                    label="console success"
                    code={`{ "data": { /* payload */ }, "meta": { /* pagination */ } }`}
                  />
                  <CodeBlock
                    label="error (all endpoints)"
                    code={`{ "error": { "code": "VALIDATION_ERROR",
             "message": "Request validation failed",
             "details": { "goal": "goal is required" } } }`}
                  />
                </div>
                <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted">
                  <Inline text="`POST /api/evaluate` is the exception" /> — it returns a flat shape
                  (no envelope) so external SDKs stay stable.
                </p>

                <SubHeading>Error codes</SubHeading>
                <div className="mt-4 overflow-x-auto border border-line">
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <Th>HTTP</Th>
                        <Th>Code</Th>
                        <Th>Meaning</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {ERROR_CODES.map((row) => (
                        <tr key={row.code}>
                          <td className="font-mono text-xs text-muted">{row.status}</td>
                          <td className="whitespace-nowrap font-mono text-xs text-ink">
                            {row.code}
                          </td>
                          <td className="text-xs text-muted">{row.meaning}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Tutorials */}
                <div className="mt-16 border-t border-line pt-12">
                  <SectionHeading
                    id="tutorials"
                    eyebrow="Basic tutorials"
                    title="Three walkthroughs"
                    intro={<p>Copy-paste these in order; each one builds on the last.</p>}
                  />
                </div>

                <SubHeading>1 · Gate a subtask, end to end</SubHeading>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
                  Sign in, mint a key, then post a goal and subtask. A rejection looks like this —
                  read <Inline text="`result`" /> as the overall verdict:
                </p>
                <div className="mt-4 flex flex-col gap-4">
                  <CodeBlock label="terminal" code={TUTORIAL_EVALUATE} />
                  <CodeBlock
                    label="response"
                    code={`{
  "result": false,                                            // blocked
  "date": "2026-01-01T12:00:00.000Z",
  "id": "6f1c…",
  "nli":         { "score": 0.71, "result": false, "threshold": 0.5 },
  "contrastive": { "score": 0.83, "result": true,  "threshold": 0.5 }
}`}
                  />
                </div>
                <p className="mt-4 max-w-2xl text-xs leading-relaxed text-muted">
                  <Inline text="`nli.result: false` means the NLI model rejected (its `p(contradiction)` of 0.71 sits above the 0.5 threshold). One reject is enough — the subtask is blocked even though the contrastive model accepted it." />
                </p>

                <SubHeading>2 · Manage API keys</SubHeading>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
                  Keys are always returned masked after creation. Deactivate one to keep its
                  history, or delete it to free the credential for good.
                </p>
                <div className="mt-4">
                  <CodeBlock label="terminal" code={TUTORIAL_KEYS} />
                </div>

                <SubHeading>3 · Read the record</SubHeading>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
                  Every evaluation is logged with scores, thresholds, model version and latency —
                  filterable, and exportable as CSV.
                </p>
                <div className="mt-4">
                  <CodeBlock label="terminal" code={TUTORIAL_LOGS} />
                </div>

                {/* Data objects */}
                <div className="mt-16 border-t border-line pt-12">
                  <SectionHeading
                    id="objects"
                    eyebrow="Data objects"
                    title="Shared shapes"
                    intro={<p>The objects referenced throughout the reference below.</p>}
                  />
                </div>
                <div className="mt-6 flex flex-col gap-6">
                  {API_SHAPES.map((shape) => (
                    <div key={shape.name}>
                      <p className="label-mono">{shape.name}</p>
                      <div className="mt-3">
                        <CodeBlock code={shape.body} />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Reference */}
                {API_GROUPS.map((group) => (
                  <div key={group.id} className="mt-16 border-t border-line pt-12">
                    <SectionHeading
                      id={group.id}
                      eyebrow="Reference"
                      title={group.title}
                      intro={<p><Inline text={group.blurb} /></p>}
                    />
                    <div className="mt-8 flex flex-col gap-12">
                      {group.endpoints.map((endpoint) => (
                        <Endpoint key={endpoint.id} endpoint={endpoint} />
                      ))}
                    </div>
                  </div>
                ))}
              </article>

              {/* ── Right sidebar: on this page ─────────────────────── */}
              <aside className="border-t border-line lg:border-l lg:border-t-0">
                <div className="p-6 lg:sticky lg:top-20">
                  <DocsToc items={TOC} />
                </div>
              </aside>
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
