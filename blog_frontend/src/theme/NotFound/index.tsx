import React, {type ReactNode} from "react";
import Layout from "@theme/Layout";

/** Swizzled 404: provides the missing meta description for the not-found page. */
export default function NotFound(): ReactNode {
  return (
    <Layout title="Page Not Found" description="The requested Kalidass Journal page could not be found.">
      <main
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "60vh",
          padding: "3rem 1.5rem",
          textAlign: "center",
        }}
      >
        <h1 style={{fontSize: "2.5rem", marginBottom: "0.5rem"}}>Page Not Found</h1>
        <p style={{color: "var(--ink-secondary, #94a3b8)", maxWidth: "480px"}}>
          This dispatch never reached the press. The page you are looking for does not exist or has moved.
        </p>
      </main>
    </Layout>
  );
}
