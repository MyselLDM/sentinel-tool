"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export type DocSection = {
  id: string;
  label: string;
  children?: { id: string; label: string }[];
};

/**
 * The docs view: a sidebar that swaps the content pane (no routing, no scroll
 * trail). The pages themselves are server-rendered and handed in as `content`,
 * so only this switcher ships to the client.
 */
export function DocsExplorer({
  sections,
  content,
}: {
  sections: DocSection[];
  content: Record<string, ReactNode>;
}) {
  const [active, setActive] = useState<string>(sections[0]?.id ?? "");
  const articleRef = useRef<HTMLElement>(null);

  // If we're scrolled past the pane when switching, bring its top back into view.
  useEffect(() => {
    const el = articleRef.current;
    if (el && el.getBoundingClientRect().top < 0) {
      el.scrollIntoView({ block: "start", behavior: "instant" as ScrollBehavior });
    }
  }, [active]);

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_17rem]">
      <article ref={articleRef} id="docs-panel" className="min-w-0 scroll-mt-20 p-6 md:p-10">
        {content[active]}
      </article>

      <aside className="border-t border-line lg:border-t-0 lg:border-l">
        <div className="p-6 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto">
          <nav aria-label="Documentation sections">
            <p className="label-mono">Sections</p>

            <ul className="mt-4 flex flex-col gap-1 text-sm">
              {sections.map((section) => {
                const isActive = active === section.id;
                const holdsActive = section.children?.some((child) => child.id === active) ?? false;

                return (
                  <li key={section.id}>
                    <button
                      type="button"
                      onClick={() => setActive(section.id)}
                      aria-current={isActive ? "page" : undefined}
                      aria-controls="docs-panel"
                      className={cn(
                        "block w-full text-left transition-colors hover:text-ink",
                        isActive || holdsActive ? "text-ink" : "text-muted",
                      )}
                    >
                      {section.label}
                    </button>

                    {section.children && section.children.length > 0 && (
                      <ul className="mt-1 flex flex-col gap-0.5 border-l border-line pl-3">
                        {section.children.map((child) => {
                          const childActive = active === child.id;
                          return (
                            <li key={child.id}>
                              <button
                                type="button"
                                onClick={() => setActive(child.id)}
                                aria-current={childActive ? "page" : undefined}
                                aria-controls="docs-panel"
                                className={cn(
                                  "block w-full text-left font-mono text-[11px] transition-colors hover:text-ink",
                                  childActive ? "text-ink" : "text-muted",
                                )}
                              >
                                {child.label}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </aside>
    </div>
  );
}
