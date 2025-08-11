import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";

type Hit = { camis: string; name: string; address: string; boro: string };
type ViolationProb = { code: string; probability: number; label: string };
type ScoreResp = {
  camis: string;
  prob_bc: number;
  predicted_points?: number | null;
  top_reasons?: string[];
  top_violation_probs?: ViolationProb[];
  model_version?: string;
  data_version?: string;
  last_inspection_date?: string | null;
  last_points?: number | null;
  last_grade?: string | null;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "";

// collapse 3+ repeats to 2 (cooofffeee -> cooffee) and strip punctuation
function softNormalize(s: string) {
  return s
    .replace(/[^a-z0-9\s]/gi, "")
    .replace(/(.)\1{2,}/gi, "$1$1")
    .trim();
}
function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  try { return JSON.stringify(err); } catch { return String(err); }
}
function isAbortError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "name" in err && (err as { name?: string }).name === "AbortError";
}

function Spinner({ label }: { label?: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span
        role="progressbar"
        aria-label={label || "Loading"}
        style={{
          width: 16,
          height: 16,
          border: "2px solid #ddd",
          borderTopColor: "#555",
          borderRadius: "50%",
          display: "inline-block",
          animation: "spin 0.8s linear infinite",
        }}
      />
      {label ? <span>{label}</span> : null}
      <style jsx>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </span>
  );
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

export default function Home() {
  const router = useRouter();

  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [highlighted, setHighlighted] = useState<number>(-1); // keyboard focus index

  const [searchLoading, setSearchLoading] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);

  const [selected, setSelected] = useState<Hit | null>(null);
  const [score, setScore] = useState<ScoreResp | null>(null);
  const [scoreLoading, setScoreLoading] = useState(false);
  const [scoreErr, setScoreErr] = useState<string | null>(null);

  // Toast notifications
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  };

  // Refs for UX
  const inputRef = useRef<HTMLInputElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const resultsListRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const deepLink = useMemo(() => {
    if (!selected) return "";
    const base = typeof window !== "undefined" ? window.location.origin : "";
    return `${base}${router.pathname}?camis=${encodeURIComponent(selected.camis)}`;
  }, [selected ? selected.camis : "", router.pathname]);

  async function handleShare() {
    if (!deepLink) return;
    const ok = await copyText(deepLink);
    showToast(ok ? "Link copied!" : "Copy failed");
  }
  async function handleCopyCamis() {
    if (!selected) return;
    const ok = await copyText(selected.camis);
    showToast(ok ? "CAMIS copied!" : "Copy failed");
  }
  async function handleCopyJson() {
    if (!score) { showToast("No score yet"); return; }
    const ok = await copyText(JSON.stringify(score, null, 2));
    showToast(ok ? "JSON copied!" : "Copy failed");
  }

  function scrollSelectedIntoView(camis: string) {
    const el = itemRefs.current[camis];
    if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function handleBackToResults() {
    if (selected) {
      // Highlight the selected item (if still in the list) and scroll to it
      const idx = hits.findIndex(h => h.camis === selected.camis);
      if (idx >= 0) setHighlighted(idx);
      scrollSelectedIntoView(selected.camis);
    }
    inputRef.current?.focus();
  }

  function handleStartOver() {
    setQ("");
    setHits([]);
    setSelected(null);
    setScore(null);
    setScoreErr(null);
    setHighlighted(-1);
    // Remove ?camis= from URL (shallow)
    const { camis, ...rest } = router.query;
    router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true });
    inputRef.current?.focus();
    showToast("Cleared");
  }

  async function runSearch(term: string, { allowFallback }: { allowFallback: boolean }) {
    setSearchLoading(true);
    setSearchErr(null);
    setSuggestion(null);

    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    try {
      const r = await fetch(`${API_BASE}/search?name=${encodeURIComponent(term)}`, { signal: abortRef.current.signal });
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      const data = (await r.json()) as Hit[];

      if (data.length === 0 && allowFallback) {
        const soft = softNormalize(term);
        if (soft && soft !== term) {
          const r2 = await fetch(`${API_BASE}/search?name=${encodeURIComponent(soft)}`, { signal: abortRef.current.signal });
          if (r2.ok) {
            const data2 = (await r2.json()) as Hit[];
            if (data2.length > 0) {
              setSuggestion(soft);
              setHits(data2);
              setHighlighted(data2.length ? 0 : -1);
              return;
            }
          }
        }
      }

      setHits(data);
      setHighlighted(data.length ? 0 : -1);
    } catch (err: unknown) {
      if (!isAbortError(err)) setSearchErr(getErrorMessage(err));
    } finally {
      setSearchLoading(false);
    }
  }

  // Debounced search
  useEffect(() => {
    if (!API_BASE) return;
    if (q.trim().length < 2) {
      setHits([]); setSearchErr(null); setSuggestion(null); setHighlighted(-1);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => runSearch(q, { allowFallback: true }), 350);
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // Deep-link: ?camis=12345
  useEffect(() => {
    if (!router.isReady) return;
    const camis = router.query.camis;
    if (typeof camis === "string" && camis.trim()) {
      setSelected({ camis, name: `Restaurant ${camis}`, address: "", boro: "" });
      runScore(camis);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  const runScore = async (camis: string) => {
    setScoreLoading(true); setScoreErr(null); setScore(null);
    try {
      const r = await fetch(`${API_BASE}/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ camis }),
      });
      if (!r.ok) { const t = await r.text(); throw new Error(`${r.status}: ${t}`); }
      const data = (await r.json()) as ScoreResp;
      setScore(data);

      // Keep the selected item highlighted (if present) and in view
      const idx = hits.findIndex(h => h.camis === camis);
      if (idx >= 0) {
        setHighlighted(idx);
        scrollSelectedIntoView(camis);
      }
    } catch (err: unknown) {
      setScoreErr(getErrorMessage(err));
    } finally { setScoreLoading(false); }
  };

  const selectHit = (h: Hit) => {
    setSelected(h); setScore(null); setScoreErr(null);
    runScore(h.camis);
    // Update URL with ?camis=... (shallow)
    const q = { ...router.query, camis: h.camis };
    router.replace({ pathname: router.pathname, query: q }, undefined, { shallow: true });

    // Highlight and scroll into view immediately
    const idx = hits.findIndex(x => x.camis === h.camis);
    if (idx >= 0) setHighlighted(idx);
    scrollSelectedIntoView(h.camis);
  };

  // Keyboard navigation on input
  const onInputKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === "Escape") {
      // Quick reset
      handleStartOver();
      return;
    }
    if (!hits.length) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((i) => (i + 1) % hits.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((i) => (i - 1 + hits.length) % hits.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const index = highlighted >= 0 ? highlighted : 0;
      const h = hits[index];
      if (h) selectHit(h);
    }
  };

  const noResults = !searchLoading && !searchErr && q.trim().length >= 2 && hits.length === 0;

  return (
    <main style={{ maxWidth: 820, margin: "2rem auto", padding: "0 1rem", fontFamily: "ui-sans-serif, system-ui" }}>
      <h1 style={{ fontSize: "1.8rem", marginBottom: 8 }}>DineSafe NYC — Compliance Coach</h1>
      <p style={{ color: "#555", marginTop: 0 }}>
        Type a NYC restaurant name to search, use ↑/↓ then Enter to score, or share a deep link with <code>?camis=</code>.
      </p>

      {!API_BASE && (
        <p style={{ background: "#fff3cd", padding: 12, borderRadius: 8, border: "1px solid #ffe58f" }}>
          <b>Heads up:</b> Set <code>NEXT_PUBLIC_API_BASE</code> to your Cloud Run URL to use the API.
        </p>
      )}

      <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            ref={inputRef}
            placeholder="e.g. pizza, sushi, coffee"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onInputKeyDown}
            style={{ flex: 1, padding: "0.65rem 0.8rem", border: "1px solid #ccc", borderRadius: 10 }}
            aria-label="Search restaurants"
          />
          <button
            onClick={handleStartOver}
            title="Clear selection and search"
            style={{ padding: "8px 12px", border: "1px solid #ddd", borderRadius: 8, background: "#fff", cursor: "pointer" }}
          >
            Start over
          </button>
        </div>

        {searchLoading && <Spinner label="Searching…" />}
        {searchErr && <div style={{ color: "crimson" }}>Error: {searchErr}</div>}

        {suggestion && (
          <div style={{ marginTop: -6 }}>
            <button
              onClick={() => setQ(suggestion)}
              style={{ background: "#f5f5f5", border: "1px solid #e6e6e6", borderRadius: 999, padding: "4px 10px", cursor: "pointer" }}
              aria-label={`Use suggestion ${suggestion}`}
            >
              Did you mean “{suggestion}”?
            </button>
          </div>
        )}

        {noResults && (
          <div style={{ color: "#666" }}>
            No results for “{q}”. Try fewer words, remove extra letters, or search part of the name.
          </div>
        )}

        {hits.length > 0 && (
          <div>
            <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>Showing {hits.length} restaurant(s)</div>
            <div ref={resultsListRef} style={{ border: "1px solid #eee", borderRadius: 12, padding: 8, maxHeight: 360, overflowY: "auto" }}>
              {hits.map((h, i) => {
                const active = i === highlighted;
                return (
                  <button
                    key={h.camis}
                    ref={(el) => { itemRefs.current[h.camis] = el; }}
                    onClick={() => selectHit(h)}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "10px 12px",
                      border: "1px solid #eee",
                      borderRadius: 10,
                      margin: "6px 0",
                      background: active ? "#f5f5f5" : "#fff",
                      cursor: "pointer",
                      outline: active ? "2px solid #a3a3a3" : "none",
                    }}
                    aria-selected={active}
                  >
                    <div style={{ fontWeight: 600, color: "#000" }}>{h.name}</div>
                    <div style={{ fontSize: 13, color: "#555" }}>
                      {h.boro} • {h.address}
                    </div>
                    <div style={{ fontSize: 12, color: "#888" }}>CAMIS: {h.camis}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {selected && (
        <div style={{ marginTop: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between", flexWrap: "wrap" }}>
            <h2 style={{ margin: 0 }}>{selected.name} Risk Summary</h2>
            <div style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button
                onClick={handleBackToResults}
                title="Scroll back to the selected item in results"
                style={{ padding: "6px 10px", border: "1px solid #ddd", borderRadius: 8, background: "#fff", cursor: "pointer" }}
              >
                Back to results
              </button>
              <button
                onClick={handleShare}
                title="Copy a shareable link to this restaurant"
                style={{ padding: "6px 10px", border: "1px solid #ddd", borderRadius: 8, background: "#fff", cursor: "pointer" }}
                aria-label="Copy shareable link"
              >
                Share
              </button>
              <a
                href={deepLink || "#"}
                target="_blank"
                rel="noopener noreferrer"
                style={{ padding: "6px 10px", border: "1px solid #ddd", borderRadius: 8, background: "#fff", textDecoration: "none" }}
                aria-label="Open deep link in new tab"
              >
                Open in new tab
              </a>
              <button
                onClick={handleCopyCamis}
                title="Copy CAMIS"
                style={{ padding: "6px 10px", border: "1px solid #ddd", borderRadius: 8, background: "#fff", cursor: "pointer" }}
                aria-label="Copy CAMIS"
              >
                Copy CAMIS
              </button>
              <button
                onClick={handleCopyJson}
                title="Copy the raw /score JSON"
                style={{ padding: "6px 10px", border: "1px solid #ddd", borderRadius: 8, background: "#fff", cursor: "pointer" }}
                aria-label="Copy /score JSON"
              >
                Copy JSON
              </button>
            </div>
          </div>

          <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 16, marginTop: 8 }}>
            {scoreLoading && <Spinner label="Scoring…" />}
            {scoreErr && <div style={{ color: "crimson" }}>Error: {scoreErr}</div>}
            {score && (
              <div>
                <h3 style={{ marginTop: 0 }}>Latest Results</h3>
                <div>Last Inspection Date: {score.last_inspection_date ?? "—"}</div>
                <div>Last Points: {score.last_points ?? "—"}</div>
                <div>Last Grade: {score.last_grade ?? "—"}</div>

                <p style={{ marginTop: 16, fontWeight: 600 }}>
                  Probability of B or C: {(score.prob_bc * 100).toFixed(1)}% &nbsp;|&nbsp;
                  {(() => {
                    const sameAsLast =
                      score.predicted_points != null &&
                      score.last_points != null &&
                      Math.round(score.predicted_points) === Math.round(score.last_points);
                    return (
                      <>
                        Next Inspection Predicted Points:{" "}
                        {sameAsLast ? "≈ last (baseline)" : score.predicted_points ?? "—"}
                      </>
                    );
                  })()}
                </p>

                {score.top_violation_probs && score.top_violation_probs.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <h3>Likely Next Violation Categories</h3>
                    <ul style={{ marginTop: 6 }}>
                      {score.top_violation_probs.slice(0, 2).map((v, i) => (
                        <li key={i}>
                          {v.label} — {(v.probability * 100).toFixed(0)}% <span style={{ color: "#888" }}>(code {v.code})</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          role="status"
          style={{
            position: "fixed",
            left: "50%",
            bottom: 24,
            transform: "translateX(-50%)",
            background: "#111",
            color: "#fff",
            padding: "8px 12px",
            borderRadius: 8,
            boxShadow: "0 6px 20px rgba(0,0,0,0.25)",
            fontSize: 14,
            zIndex: 50,
          }}
        >
          {toast}
        </div>
      )}
    </main>
  );
}


