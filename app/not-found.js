import Link from "next/link";

export const metadata = { title: "Page not found · DeusADS" };

export default function NotFound() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "2rem", background: "var(--paper, #f6f1ea)", color: "var(--ink, #1c1b1a)" }}>
      <div style={{ textAlign: "center", maxWidth: 420 }}>
        <h1 style={{ margin: "0 0 0.5rem" }}>Page not found</h1>
        <p style={{ margin: "0 0 1.25rem", opacity: 0.7 }}>This address does not exist, or the page was moved.</p>
        <Link href="/dashboard" className="button">Back to the dashboard</Link>
      </div>
    </main>
  );
}
