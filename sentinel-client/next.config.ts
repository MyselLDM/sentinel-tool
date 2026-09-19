import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Next.js 16 blocks cross-origin requests to dev-only resources (`/_next/*`)
   * by default, replying 403 "Unauthorized" (see
   * `next/dist/server/lib/router-utils/block-cross-site-dev.js`).
   *
   * Only `localhost`, its subdomains, and the hostname the server started with
   * are allowed out of the box. So opening the dev server from a phone or
   * another device on the LAN silently breaks the client bundle — the HTML
   * renders but React never hydrates, which leaves `whileInView` sections stuck
   * at opacity 0.
   *
   * These entries cover the RFC 1918 private ranges (`*` matches exactly one
   * hostname label) plus mDNS `.local` names. Development only — this option is
   * ignored by `next build`.
   */
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*", "*.local"],
};

export default nextConfig;
