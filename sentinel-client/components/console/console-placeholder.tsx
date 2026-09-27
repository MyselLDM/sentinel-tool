import { Info } from "lucide-react";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Section } from "@/components/ui/section";

/**
 * A console page that is routed but not yet built — a page header plus an
 * "under construction" note, so every sidebar destination resolves.
 */
export function ConsolePlaceholder({
  eyebrow = "Console",
  title,
  description,
  note,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  note: string;
}) {
  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <div>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-heading md:text-3xl">
          {title}
        </h1>
        {description && (
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">{description}</p>
        )}
      </div>

      <Section className="p-6 md:p-8">
        <div className="flex items-center gap-3 rounded-lg border border-primary-blue/20 bg-primary-light p-4 text-sm text-body">
          <Info className="h-4 w-4 shrink-0 text-primary-blue" />
          <span>{note}</span>
        </div>
      </Section>
    </div>
  );
}
