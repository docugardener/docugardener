// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const POLL_INTERVAL_MS = 5_000;

/**
 * Invisible client component that polls for job status updates.
 *
 * Mounts alongside the server-rendered Jobs table. While any job on the
 * current page is in an active state (queued / analyzing / fix PR open),
 * it calls router.refresh() every 5 s so the server component re-fetches
 * data and patches only the changed rows — no full-page reload, no scroll
 * reset. Once the server component re-renders with hasActiveJobs=false the
 * interval is cleared automatically.
 */
export function JobsAutoRefresh({ hasActiveJobs }: { hasActiveJobs: boolean }) {
    const router = useRouter();

    useEffect(() => {
        if (!hasActiveJobs) return;
        const id = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
        return () => clearInterval(id);
    }, [hasActiveJobs, router]);

    return null;
}
