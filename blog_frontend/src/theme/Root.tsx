import React, {type ReactNode} from "react";
import FaroAwareErrorBoundary from "../components/ErrorBoundary";
import {AuthProvider} from "../lib/auth";

export default function Root({children}: {children: ReactNode}) {
  return (
    <FaroAwareErrorBoundary
      fallback={
        <div style={{padding: "3rem 1.5rem", textAlign: "center", fontFamily: "var(--font-sans, sans-serif)"}}>
          <h2 style={{fontSize: "1.5rem", marginBottom: "0.5rem"}}>Something went wrong</h2>
          <p style={{color: "var(--ink-secondary, #94a3b8)", maxWidth: "480px", margin: "0 auto 1.5rem"}}>
            An unexpected error occurred in Kalidass Journal. Telemetry details have been reported automatically.
          </p>
          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined") {
                window.location.reload();
              }
            }}
            style={{
              padding: "0.5rem 1.2rem",
              borderRadius: "6px",
              background: "#6366f1",
              color: "#fff",
              border: "none",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Reload Page
          </button>
        </div>
      }
    >
      <AuthProvider>{children}</AuthProvider>
    </FaroAwareErrorBoundary>
  );
}
