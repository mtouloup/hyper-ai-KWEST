"use client";

import React, { useState } from "react";
import { decodeEncodedPayload } from "@/lib/reportParsing";
import { Button } from "primereact/button";
import { EncodedFile } from "./SimFilesUsed";

export default function FileCard({
  label,
  icon,
  filename,
  encoded,
  rawContent,
}: {
  label: string;
  icon: string;
  filename: string;
  /** Base64+gzip encoded payload (for config/nodes) */
  encoded?: EncodedFile;
  /** Pre-decoded string content (for trace JSON) */
  rawContent?: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [content, setContent] = useState<string | null>(null);

  const handleToggle = () => {
    if (!expanded && content === null) {
      if (rawContent != null) {
        setContent(rawContent);
      } else if (encoded) {
        try {
          setContent(decodeEncodedPayload(encoded));
        } catch {
          setContent("(Failed to decode file content)");
        }
      }
    }
    setExpanded((prev) => !prev);
  };

  // Update content if rawContent arrives after initial render (async fetch)
  React.useEffect(() => {
    if (expanded && rawContent != null && content !== rawContent) {
      setContent(rawContent);
    }
  }, [rawContent, expanded, content]);

  const handleDownload = () => {
    let text: string;
    if (rawContent != null) {
      text = rawContent;
    } else if (encoded) {
      try {
        text = decodeEncodedPayload(encoded);
      } catch {
        return;
      }
    } else {
      return;
    }

    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const sizeLabel = encoded
    ? encoded.bytes >= 1024
      ? `${(encoded.bytes / 1024).toFixed(1)} KB`
      : `${encoded.bytes} B`
    : rawContent != null
      ? rawContent.length >= 1024
        ? `${(rawContent.length / 1024).toFixed(1)} KB`
        : `${rawContent.length} B`
      : null;

  return (
    <div
      style={{
        border: "1px solid var(--surface-border, #dee2e6)",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          background: "var(--surface-ground, #f8f9fa)",
          cursor: "pointer",
        }}
        onClick={handleToggle}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <i className={icon} style={{ fontSize: "1.1rem", opacity: 0.7 }} />
          <span style={{ fontWeight: 600 }}>{label}</span>
          {sizeLabel && (
            <span style={{ fontSize: 12, opacity: 0.5, marginLeft: 4 }}>
              ({sizeLabel})
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Button
            icon="pi pi-download"
            rounded
            text
            size="small"
            severity="secondary"
            tooltip={`Download ${filename}`}
            tooltipOptions={{ position: "top" }}
            onClick={(e) => {
              e.stopPropagation();
              handleDownload();
            }}
          />
          <i
            className={`pi ${expanded ? "pi-chevron-up" : "pi-chevron-down"}`}
            style={{ fontSize: "0.85rem", opacity: 0.5 }}
          />
        </div>
      </div>

      {/* Collapsible content */}
      {expanded && (
        <pre
          style={{
            background: "#1e1e1e",
            color: "#d4d4d4",
            padding: 16,
            margin: 0,
            fontSize: 13,
            lineHeight: 1.5,
            maxHeight: "40vh",
            overflow: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {content ?? "Loading..."}
        </pre>
      )}
    </div>
  );
}
