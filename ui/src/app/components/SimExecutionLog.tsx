import React from "react";
import { decodeEncodedPayload } from "@/lib/reportParsing";

export default function SimExecutionLog({
  executionLog,
}: {
  executionLog: any;
}) {
  if (!executionLog) {
    return <p style={{ opacity: 0.6 }}>No execution log available.</p>;
  }

  const decodedLog = decodeEncodedPayload(executionLog);

  return (
    <div>
      <pre
        style={{
          background: "#1e1e1e",
          color: "#d4d4d4",
          padding: 16,
          borderRadius: 8,
          fontSize: 13,
          lineHeight: 1.5,
          maxHeight: "60vh",
          overflow: "auto",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {decodedLog}
      </pre>
    </div>
  );
}
