import { ArrowRight } from "lucide-react";
import { Chatbot } from "@/components/chatbot";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ButtonLink } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Section } from "@/components/ui/section";

const FEATURES = [
  {
    title: "Dual-model verification",
    body: "An NLI cross-encoder and a contrastive bi-encoder each score the goal/subtask pair. If either model rejects, the subtask is blocked.",
  },
  {
    title: "One call to gate a subtask",
    body: "POST a goal and subtask and get accept/reject in a single round trip, with per-model scores and the thresholds that produced them.",
  },
  {
    title: "Evidence for every decision",
    body: "Each evaluation is logged with scores, thresholds, model version and latency — filterable, and exportable as CSV.",
  },
  {
    title: "Thresholds from training",
    body: "Operating points come from cross-validated training runs, not guesses at runtime. Models are read-only; nothing to tune by hand.",
  },
] as const;

const STEPS = [
  {
    title: "Issue a key",
    body: "Create an API key in the console and give it a per-minute rate limit.",
  },
  {
    title: "Send the subtask",
    body: "Your agent posts the authorized goal and the subtask it is about to perform.",
  },
  {
    title: "Read the verdict",
    body: "Sentinel returns a decision — accepted or rejected — with the scores behind it.",
  },
] as const;



export default function Home() {
  return (
    <>
      <SiteHeader />

      <main className="bg-hatch flex-1">
        {/* Each section is its own panel on the hatched base, separated by a gap. */}
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10 md:gap-8 md:py-14">
          {/* ── Hero ─────────────────────────────────────────────── */}
          <Section className="px-6 py-14 md:px-10 md:py-20">
            <Eyebrow>NLI Security Gateway</Eyebrow>

            <h1 className="mt-8 max-w-4xl font-serif text-5xl leading-[1.03] tracking-[-0.02em] md:text-6xl lg:text-7xl">
              Verify what your agents do,{" "}
              <em className="italic">before</em> they do it.
            </h1>

            <p className="mt-7 max-w-xl text-lg leading-relaxed text-muted">
              Sentinel checks every subtask an agent proposes against its
              authorized goal. Two independent models each cast a vote, and a
              single reject is enough to stop the task.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <ButtonLink href="#playground" size="lg">
                Try it out
                <ArrowRight className="h-4 w-4" />
              </ButtonLink>
              <ButtonLink href="/login?tab=create" variant="outline" size="lg">
                Get started
              </ButtonLink>
            </div>
          </Section>



          {/* ── Capabilities ─────────────────────────────────────── */}
          <Section id="product">
            <div className="px-6 pb-10 pt-12 md:px-10 md:pt-16">
              <Eyebrow>Capabilities</Eyebrow>
              <h2 className="mt-6 max-w-2xl font-serif text-4xl leading-tight tracking-[-0.01em] md:text-5xl">
                Two models, one decision.
              </h2>
            </div>

            <div className="border-t border-line">
              {FEATURES.map((feature, index) => (
                <article
                  key={feature.title}
                  className="grid gap-4 border-b border-line px-6 py-8 last:border-b-0 md:grid-cols-[3rem_1fr_1.15fr] md:items-baseline md:gap-10 md:px-10"
                >
                  <span className="font-mono text-[11px] tracking-widest text-muted">
                    0{index + 1}
                  </span>
                  <h3 className="font-serif text-2xl tracking-tight">
                    {feature.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-muted">
                    {feature.body}
                  </p>
                </article>
              ))}
            </div>
          </Section>

          {/* ── How it works (daisyUI timeline) ──────────────────── */}
          <Section id="how">
            <div className="px-6 pb-10 pt-12 md:px-10 md:pt-16">
              <Eyebrow>How it works</Eyebrow>
              <h2 className="mt-6 max-w-2xl font-serif text-4xl leading-tight tracking-[-0.01em] md:text-5xl">
                Three steps to a safer agent.
              </h2>
            </div>

            <div className="border-t border-line px-6 py-12 md:px-10 md:py-14">
              {/* Horizontal only once the three items genuinely fit — at `md`
                  the row overflowed the page by ~280px (verified). */}
              <ul className="timeline timeline-vertical xl:timeline-horizontal">
                {STEPS.map((step, index) => (
                  <li key={step.title}>
                    {index > 0 && <hr className="bg-line" />}

                    <div className="timeline-middle">
                      <span className="flex h-9 w-9 items-center justify-center border border-ink bg-paper font-mono text-[11px] tracking-widest">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                    </div>

                    <div className="timeline-end px-0 pb-8 pt-3 md:pb-0 md:pt-6">
                      <h3 className="font-serif text-2xl tracking-tight">
                        {step.title}
                      </h3>
                      <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted">
                        {step.body}
                      </p>
                    </div>

                    {index < STEPS.length - 1 && <hr className="bg-line" />}
                  </li>
                ))}
              </ul>
            </div>
          </Section>

          {/* ── Chatbot ──────────────────────────────────────────── */}
          <Chatbot />

          {/* ── API / docs ───────────────────────────────────────── */}
          <Section id="docs" className="grid md:grid-cols-[1fr_1.2fr]">
            <div className="min-w-0 border-b border-line p-6 md:border-b-0 md:border-r md:p-8">
              <Eyebrow>API</Eyebrow>
              <h2 className="mt-6 font-serif text-3xl leading-tight tracking-[-0.01em] md:text-4xl">
                One endpoint, plain JSON.
              </h2>
              <p className="mt-5 max-w-sm text-sm leading-relaxed text-muted">
                Authenticate with an API key, send a goal and a subtask, and get
                back a decision with the scores behind it. No SDK required.
              </p>
              <div className="mt-7">
                <ButtonLink href="/docs" variant="outline" size="sm">
                  API reference
                  <ArrowRight className="h-3.5 w-3.5" />
                </ButtonLink>
              </div>
            </div>

            <div className="min-w-0 p-6 md:p-8">
              <div className="border border-line">
                <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
                  <span aria-hidden className="block h-2 w-2 border border-line-strong" />
                  <span className="label-mono">evaluate.sh</span>
                </div>
                <pre className="overflow-x-auto p-4 font-mono text-[12.5px] leading-relaxed text-ink-soft">
                  {`curl -X POST /api/evaluate \\
  -H "Authorization: Bearer sk_live_…" \\
  -H "Content-Type: application/json" \\
  -d '{ "goal": "...", "subtask": "...", "mode": "detailed" }'`}
                </pre>
              </div>
              <p className="mt-4 font-mono text-[11px] tracking-wider text-muted">
                REJECT IF EITHER MODEL REJECTS
              </p>
            </div>
          </Section>

          {/* ── CTA ──────────────────────────────────────────────── */}
          <Section className="px-6 py-16 text-center md:px-10 md:py-20">
            <h2 className="mx-auto max-w-3xl font-serif text-4xl leading-tight tracking-[-0.01em] md:text-5xl">
              Gate your agents in an afternoon.
            </h2>
            <p className="mx-auto mt-5 max-w-md text-sm leading-relaxed text-muted">
              Issue a key, point your agent at one endpoint, and every subtask is
              verified before it runs.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <ButtonLink href="/login?tab=create" size="lg">
                Get started
                <ArrowRight className="h-4 w-4" />
              </ButtonLink>
              <ButtonLink href="#docs" variant="outline" size="lg">
                Read the API
              </ButtonLink>
            </div>
          </Section>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
