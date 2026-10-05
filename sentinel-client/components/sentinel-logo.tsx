import Image from "next/image";

/**
 * Reusable Sentinel brand logo components.
 *
 * Both variants use the ORIGINAL uploaded logo assets with transparent
 * backgrounds — do NOT replace with recreations, SVGs, icon library symbols,
 * or generated alternatives.
 *
 *  - <SentinelLogoFull>        emblem + "Sentinel" wordmark  → navbar, footer, console sidebar
 *  - <SentinelLogoIcon>        emblem only (no wordmark)     → chatbot avatar, launcher, icon slots
 *  - <SentinelThinkingIcon>    animated emblem for chatbot thinking state
 */

interface LogoProps {
  /** Tailwind class(es) for sizing. For the full logo, controls height (width
   *  auto-scales via aspect ratio). For the icon, controls both dimensions. */
  className?: string;
}

/**
 * Full horizontal logo: S emblem + "Sentinel" wordmark.
 *
 * Target sizing:
 *  - Desktop header: ~150-180 px wide  →  use className="h-11" (44 px tall → ~157 px wide)
 *  - Mobile header:  ~120-145 px wide  →  use responsive variant
 *  - Console sidebar: use className="h-8" (compact)
 */
export function SentinelLogoFull({ className = "h-11" }: LogoProps) {
  return (
    <Image
      src="/sentinel-logo-full.png"
      alt="Sentinel"
      width={1024}
      height={574}
      className={`w-auto object-contain ${className}`}
      priority
      draggable={false}
      quality={100}
      unoptimized
    />
  );
}

/**
 * Icon-only: S emblem with no wordmark.
 * Transparent background — renders cleanly on any surface.
 */
export function SentinelLogoIcon({ className = "h-7 w-7" }: LogoProps) {
  return (
    <Image
      src="/sentinel-logo-icon.png"
      alt="Sentinel emblem"
      width={512}
      height={512}
      className={`object-contain ${className}`}
      priority
      draggable={false}
      quality={100}
      unoptimized
    />
  );
}

/**
 * Animated thinking icon: the Sentinel emblem with a premium, fluid animation
 * indicating the chatbot is processing a response.
 *
 * States:
 *  - thinking=false → static icon (same as SentinelLogoIcon)
 *  - thinking=true  → slow pulse + gradient shimmer animation
 *
 * Respects prefers-reduced-motion — shows only a subtle opacity pulse.
 */
export function SentinelThinkingIcon({
  thinking = false,
  className = "h-7 w-7",
}: {
  thinking?: boolean;
  className?: string;
}) {
  return (
    <>
      <style>{`
        @keyframes s-pulse {
          0%   { opacity: 1;    transform: scale(1); }
          40%  { opacity: 0.72; transform: scale(0.94); }
          60%  { opacity: 0.88; transform: scale(0.97); }
          100% { opacity: 1;    transform: scale(1); }
        }
        @keyframes s-shimmer {
          0%   { filter: brightness(1)    saturate(1)   hue-rotate(0deg); }
          30%  { filter: brightness(1.4)  saturate(1.5) hue-rotate(12deg); }
          65%  { filter: brightness(0.82) saturate(1.1) hue-rotate(-10deg); }
          100% { filter: brightness(1)    saturate(1)   hue-rotate(0deg); }
        }
        .s-thinking {
          animation:
            s-pulse   2s   ease-in-out infinite,
            s-shimmer 2.6s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .s-thinking {
            animation: s-pulse 2.5s ease-in-out infinite;
            filter: none !important;
          }
        }
      `}</style>

      <span className="relative inline-flex items-center justify-center">
        {/* Soft ambient halo while thinking */}
        {thinking && (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: "-6px",
              borderRadius: "50%",
              background:
                "radial-gradient(circle, rgba(93,155,248,0.22) 0%, rgba(61,108,232,0.06) 65%, transparent 100%)",
              animation: "s-pulse 2s ease-in-out infinite",
              animationDelay: "0.25s",
              pointerEvents: "none",
            }}
          />
        )}

        <span className={thinking ? "s-thinking" : ""} style={{ display: "inline-flex" }}>
          <Image
            src="/sentinel-logo-icon.png"
            alt={thinking ? "Sentinel is thinking" : "Sentinel emblem"}
            width={512}
            height={512}
            className={`object-contain ${className}`}
            priority
            draggable={false}
            quality={100}
            unoptimized
          />
        </span>
      </span>
    </>
  );
}
