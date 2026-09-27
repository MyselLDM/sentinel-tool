import { Eyebrow } from "@/components/ui/eyebrow";
import { Section } from "@/components/ui/section";

export default function SettingsLoading() {
  return (
    <div className="flex flex-col gap-6 md:gap-8">
      {/* Header skeleton */}
      <div>
        <Eyebrow>Configuration</Eyebrow>
        <div className="mt-3 h-8 w-48 animate-pulse rounded-lg bg-border" />
        <div className="mt-2 h-4 w-96 animate-pulse rounded bg-border" />
      </div>

      {/* Note skeleton */}
      <div className="h-16 w-full animate-pulse rounded-xl border border-border bg-page" />

      {/* Dual model cards skeleton */}
      <div className="grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Section key={i} className="p-6 md:p-8 space-y-6">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <div className="h-6 w-44 animate-pulse rounded-lg bg-border" />
                <div className="h-4 w-64 animate-pulse rounded bg-border" />
              </div>
              <div className="h-6 w-24 animate-pulse rounded-full bg-border" />
            </div>

            <div className="rounded-lg border border-border bg-page p-4 space-y-2">
              <div className="h-3 w-28 animate-pulse rounded bg-border" />
              <div className="h-8 w-20 animate-pulse rounded-lg bg-border" />
            </div>

            <div className="space-y-4 pt-4 border-t border-border">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="flex justify-between items-center py-1">
                  <div className="h-3.5 w-24 animate-pulse rounded bg-border" />
                  <div className="h-3.5 w-48 animate-pulse rounded bg-border" />
                </div>
              ))}
            </div>
          </Section>
        ))}
      </div>

      {/* Metrics skeleton */}
      <Section className="p-6 md:p-8">
        <div className="h-6 w-48 animate-pulse rounded-lg bg-border" />
        <div className="mt-6 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 w-full animate-pulse rounded bg-border" />
          ))}
        </div>
      </Section>
    </div>
  );
}
