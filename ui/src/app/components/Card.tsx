"use client";

import { useRef } from "react";
import { DownloadButton } from "./DownloadButton";

export function Card({
  title,
  subtitle,
  children,
  span2 = false,
  runId,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  span2?: boolean;
  runId?: string;
}) {
  const sectionRef = useRef<HTMLElement>(null);

  const fileName = runId
    ? `${title.replace(/[^a-zA-Z0-9_-]/g, "_")}_${runId}`
    : title.replace(/[^a-zA-Z0-9_-]/g, "_");

  return (
    <section
      ref={sectionRef}
      className={[
        "bg-white border border-gray-200 rounded-xl shadow-sm",
        "p-4 md:p-5",
        span2 ? "lg:col-span-2" : "",
      ].join(" ")}
    >
      <div className="mb-3 flex items-start justify-between">
        <div>
          <div className="text-base md:text-lg font-semibold text-gray-900">
            {title}
          </div>
          {subtitle ? (
            <div className="text-sm text-gray-500 mt-0.5">{subtitle}</div>
          ) : null}
        </div>
        <DownloadButton targetRef={sectionRef} fileName={fileName} />
      </div>

      <div className="w-full h-full">
        <div className="h-[320px] md:h-[380px] p-3 md:p-4">{children}</div>
      </div>
    </section>
  );
}
