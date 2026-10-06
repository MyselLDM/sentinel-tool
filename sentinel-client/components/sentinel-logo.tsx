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
 *
 * BOTH source PNGs are exported with a lot of transparent padding, so the artwork
 * occupies only part of its canvas — the wordmark fills 44% of its height and the
 * emblem only 49% of its width. Pointing a plain <img> at a box therefore draws a
 * mark much smaller than the box, and for the square-canvassed emblem a narrow
 * strip with dead space either side.
 *
 * `CroppedLogo` removes that padding WITHOUT touching the files: it wraps the
 * image in an `overflow-hidden` box sized to the *artwork's* aspect ratio, then
 * scales the image up by the inverse of its coverage and offsets it by the
 * padding, so only the artwork is visible. Because the canvas and the artwork
 * share an aspect ratio, `object-fit` cannot do this — the padding is inside the
 * canvas — so the upscale-and-clip is the only CSS route.
 *
 * `className` controls the HEIGHT; the width follows from the artwork's aspect
 * ratio. Passing a width class as well would override `aspect-ratio` and clip the
 * logo, so pass height only.
 */

/**
 * Transparent padding around the artwork in each source PNG, measured from the
 * alpha bounding box:
 *
 *   python -c "from PIL import Image; print(Image.open(p).convert('RGBA').split()[-1].getbbox())"
 *
 * → sentinel-logo-full.png (1024x574): bbox (126, 170, 903, 422)
 *   sentinel-logo-icon.png (512x512):  bbox (134, 33, 383, 482)
 *
 * (`x`/`y` = bbox top-left, `w`/`h` = bbox size. Re-measure if the PNGs change.)
 */
const CROP = {
  full: { canvasW: 1024, canvasH: 574, x: 126, y: 170, w: 778, h: 253 },
  icon: { canvasW: 512, canvasH: 512, x: 134, y: 33, w: 250, h: 450 },
} as const;

/**
 * Breathing room kept around the artwork. The bounding box is measured at alpha
 * > 8, so a soft antialiased edge can reach a pixel or two past it — cropping
 * flush would slice it off and leave a visible hard line.
 */
const PAD = 4;

type CropBox = (typeof CROP)[keyof typeof CROP];

interface LogoProps {
  /** Tailwind class(es) for sizing — controls HEIGHT; width follows the
   *  artwork's aspect ratio. Do not pass a width class. */
  className?: string;
}

function CroppedLogo({
  src,
  alt,
  crop,
  className,
  priority = true,
}: {
  src: string;
  alt: string;
  crop: CropBox;
  className: string;
  priority?: boolean;
}) {
  // Clamp the padded crop back inside the canvas.
  const x = Math.max(0, crop.x - PAD);
  const y = Math.max(0, crop.y - PAD);
  const w = Math.min(crop.canvasW - x, crop.w + PAD * 2);
  const h = Math.min(crop.canvasH - y, crop.h + PAD * 2);

  return (
    <span
      className={`block shrink-0 overflow-hidden ${className}`}
      style={{ aspectRatio: `${w} / ${h}` }}
    >
      <Image
        src={src}
        alt={alt}
        width={crop.canvasW}
        height={crop.canvasH}
        priority={priority}
        draggable={false}
        quality={100}
        unoptimized
        style={{
          // Scale the canvas so the artwork crop exactly fills the wrapper, then
          // shift it up/left by the padding. `maxWidth: none` is load-bearing:
          // Tailwind preflight sets `img { max-width: 100% }`, which would clamp
          // the upscale and leave the padding visible again.
          width: `${(crop.canvasW / w) * 100}%`,
          height: `${(crop.canvasH / h) * 100}%`,
          marginLeft: `${(-x / w) * 100}%`,
          marginTop: `${(-y / h) * 100}%`,
          maxWidth: "none",
        }}
      />
    </span>
  );
}

/**
 * Full horizontal logo: S emblem + "Sentinel" wordmark.
 *
 * Target sizing (heights, now that the artwork fills its box):
 *  - Desktop header: use className="h-12 md:h-14"  → ~147 / ~172 px wide
 *  - Mobile header:  use a smaller responsive variant
 *  - Console sidebar: use className="h-8" (compact → ~98 px wide)
 */
export function SentinelLogoFull({ className = "h-11" }: LogoProps) {
  return (
    <CroppedLogo
      src="/sentinel-logo-full.png"
      alt="Sentinel"
      crop={CROP.full}
      className={className}
    />
  );
}

/**
 * Icon-only: S emblem with no wordmark.
 * Transparent background — renders cleanly on any surface.
 */
export function SentinelLogoIcon({ className = "h-7" }: LogoProps) {
  return (
    <CroppedLogo
      src="/sentinel-logo-icon.png"
      alt="Sentinel emblem"
      crop={CROP.icon}
      className={className}
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
  className = "h-7",
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
          <CroppedLogo
            src="/sentinel-logo-icon.png"
            alt={thinking ? "Sentinel is thinking" : "Sentinel emblem"}
            crop={CROP.icon}
            className={className}
          />
        </span>
      </span>
    </>
  );
}
