import { Eyebrow } from "@/components/ui/eyebrow";
import { Section } from "@/components/ui/section";

export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-6 md:gap-8">
      {/* Header skeleton */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <Eyebrow>Console</Eyebrow>
          <div className="mt-5 h-10 w-48 animate-pulse bg-line" />
          <div className="mt-3 h-4 w-72 animate-pulse bg-line" />
        </div>
        <div className="h-8 w-36 animate-pulse bg-line" />
      </div>

      {/* Stats row skeleton */}
      <div className="grid gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col justify-between bg-paper p-5 md:p-6">
            <div className="h-3 w-20 animate-pulse bg-line" />
            <div className="mt-4 space-y-2">
              <div className="h-9 w-28 animate-pulse bg-line" />
              <div className="h-3 w-36 animate-pulse bg-line" />
            </div>
          </div>
        ))}
      </div>

      {/* Activity table skeleton */}
      <Section className="p-6 md:p-8">
        <div className="flex items-center justify-between border-b border-line pb-5">
          <div className="h-7 w-40 animate-pulse bg-line" />
          <div className="h-4 w-24 animate-pulse bg-line" />
        </div>
        <div className="mt-6 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-4 border-b border-line/60 py-3">
              <div className="h-4 w-28 animate-pulse bg-line" />
              <div className="h-4 flex-1 max-w-md animate-pulse bg-line" />
              <div className="h-6 w-20 animate-pulse bg-line" />
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
