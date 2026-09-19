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
        <h1 className="mt-5 font-serif text-4xl leading-tight tracking-[-0.01em] md:text-5xl">
          {title}
        </h1>
        {description && (
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">{description}</p>
        )}
      </div>

      <Section className="p-6 md:p-8">
        <div role="alert" className="alert alert-info alert-outline">
          <span>{note}</span>
        </div>
      </Section>
    </div>
  );
}
