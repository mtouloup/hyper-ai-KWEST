"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * Wraps the app content and checks if Couchbase is configured + reachable.
 * If not, redirects the user to /settings so they can provide credentials.
 *
 * Checks only:
 *  1. Once on initial mount
 *  2. When navigating AWAY from /settings (user may have just saved creds)
 *
 * Once confirmed "ok", it stays ok for the rest of the session — no more
 * re-checking on every page navigation.
 */
export default function ConfigGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "ok" | "needs-setup">(
    "loading",
  );
  const prevPathRef = useRef(pathname);

  useEffect(() => {
    const prevPath = prevPathRef.current;
    prevPathRef.current = pathname;

    // Always let the settings page render without checking
    if (pathname === "/settings") return;

    // If already confirmed ok, only re-check when leaving /settings
    // (the user might have just entered new credentials there)
    if (status === "ok" && prevPath !== "/settings") return;

    let cancelled = false;

    async function fetchStatus(): Promise<{
      configured: boolean;
      reachable: boolean;
      bucketOk?: boolean;
    }> {
      const res = await fetch("/api/couchbase/status");
      return res.json();
    }

    async function check() {
      // Try up to 3 times with a short delay between attempts.
      // Handles Couchbase cold-start / SDK warm-up after server restart.
      const MAX_ATTEMPTS = 3;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          const data = await fetchStatus();
          if (cancelled) return;

          if (data.configured && data.reachable && data.bucketOk !== false) {
            setStatus("ok");
            return;
          }

          // No credentials at all — don't retry, go straight to settings
          if (!data.configured) {
            setStatus("needs-setup");
            return;
          }

          // Cluster reachable but bucket missing — go to settings
          if (data.reachable && data.bucketOk === false) {
            setStatus("needs-setup");
            return;
          }

          // Has credentials but not reachable — wait and retry
          if (attempt < MAX_ATTEMPTS) {
            await new Promise((r) => setTimeout(r, 2000));
            if (cancelled) return;
          }
        } catch {
          if (cancelled) return;
          if (attempt < MAX_ATTEMPTS) {
            await new Promise((r) => setTimeout(r, 2000));
            if (cancelled) return;
          }
        }
      }

      // All attempts exhausted
      if (!cancelled) setStatus("needs-setup");
    }

    setStatus("loading");
    check();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Redirect to settings when setup is needed (in an effect, not during render)
  useEffect(() => {
    if (status === "needs-setup" && pathname !== "/settings") {
      router.replace("/settings");
    }
  }, [status, pathname, router]);

  // Always allow the settings page itself
  if (pathname === "/settings") {
    return <>{children}</>;
  }

  if (status === "loading" || status === "needs-setup") {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          gap: 12,
          opacity: 0.6,
        }}
      >
        <i className="pi pi-spin pi-spinner" style={{ fontSize: "2rem" }} />
        {status === "loading"
          ? "Checking database connection..."
          : "Redirecting to Settings..."}
      </div>
    );
  }

  return <>{children}</>;
}
