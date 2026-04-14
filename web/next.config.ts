// SPDX-License-Identifier: AGPL-3.0-or-later
import type { NextConfig } from "next";

// In production Docker containers the FastAPI backend is reachable as
// http://docugardener:8000 (service name). In local dev it's 127.0.0.1:8000.
const backendUrl = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  // HYB-02: Expose deployment mode to client components.
  // Valid values: "saas" (default) | "client-installed" | "air-gap"
  env: {
    NEXT_PUBLIC_DEPLOYMENT_MODE: process.env.DEPLOYMENT_MODE ?? "saas",
    NEXT_PUBLIC_LICENSE_PORTAL_URL: process.env.LICENSE_PORTAL_URL ?? "",
  },

  // Required for the multi-stage Docker build (docker/Dockerfile.web).
  // Has no effect on `next dev` or `next start` outside Docker.
  output: "standalone",

  // nodemailer is a Node.js-only module required by NextAuth EmailProvider.
  // Prevent Next.js from attempting to bundle it for the browser.
  // nodemailer is Node.js-only; @octokit/auth-app is ESM-only (no CJS build) — skip bundling
  serverExternalPackages: ["nodemailer", "@octokit/auth-app"],

  async rewrites() {
    return [
      {
        // Strictly proxy Live Blocks content fetching to the Python PyGithub backend
        // to prevent hijacking native Next.js /api/* endpoints like /api/simulation
        source: "/api/repos/:owner/:repo/contents/:path*",
        destination: `${backendUrl}/repos/:owner/:repo/contents/:path*`,
      },
    ];
  },
};

export default nextConfig;

