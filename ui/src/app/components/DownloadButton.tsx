"use client";

import { useCallback, type RefObject } from "react";
import { toPng } from "html-to-image";

export function DownloadButton({
  targetRef,
  fileName,
}: {
  targetRef: RefObject<HTMLElement | null>;
  fileName: string;
}) {
  const handleDownload = useCallback(async () => {
    if (!targetRef.current) return;
    try {
      const dataUrl = await toPng(targetRef.current, {
        backgroundColor: "#ffffff",
        pixelRatio: 2,
      });
      const link = document.createElement("a");
      link.download = `${fileName.replace(/[^a-zA-Z0-9_-]/g, "_")}.png`;
      link.href = dataUrl;
      link.click();
    } catch {
      /* ignore capture errors */
    }
  }, [targetRef, fileName]);

  return (
    <button
      onClick={handleDownload}
      title="Download chart as PNG"
      className="ml-2 mt-0.5 p-1.5 rounded-md text-gray-400 hover:text-gray-700
                 hover:bg-gray-100 transition-colors cursor-pointer"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
    </button>
  );
}
