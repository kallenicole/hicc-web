import type React from "react";
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
  rat_index?: number | null;
  rat311_cnt_180d_k1?: number | null;
  ratinsp_fail_365d_k1?: number | null;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "";

// ---------- helpers ----------
function softNormalize(s: string) {
  return s.replace(/[^a-z0-9\s]/gi, "").replace(/(.)\1{2,}/gi, "$1$1").trim();
}
function ratPressureLabel(x?: number | null): string {
  if (x == null) return "Unknown";
  if (x < 0.2) return "Low";
  if (x < 0.4) return "Moderate";
  if (x < 0.6) return "Elevated";
  if (x < 0.8) return "High";
  return "Very High";
}
function fmt(x?: number | null, digits = 2) {
  return x == null ? "—" : x.toFixed(digits);
}
function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  try { return JSON.stringify(err); } catch { return String(err); }
}
function isAbortError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "name" in err && (err as { name?: string }).name === "AbortError";
}
function dedent(s: string) {
  return s.replace(/^[ \t]+/gm, "").trim();
}

// ---------- small UI bits ----------
function Spinner({ label }: { label?: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span
        role="progressbar"
        aria-label={label || "Loading"}
        style={{
          width: 16, height: 16, border: "2px solid #ddd", borderTopColor: "#555",
          borderRadius: "50%", display: "inline-block", animation: "spin 0.8s linear infinite",
        }}
      />
      {label ? <span>{label}</span> : null}
      <style jsx>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </span>
  );
}

function InfoIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden {...props}>
      <circle cx="12" cy="12" r="10" fill="none" stroke="#64748b" strokeWidth="2" />
      <line x1="12" y1="10" x2="12" y2="17" stroke="#64748b" strokeWidth="2" />
      <circle cx="12" cy="7" r="1" fill="#64748b" />
    </svg>
  );
}

function Tooltip({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      style={{ position: "relative", display: "inline-flex", alignItems: "center" }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      <span
        role="tooltip"
        style={{
          position: "absolute", bottom: "125%", left: 0, transform: "translateY(-4px)",
          background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8,
          boxShadow: "0 10px 25px rgba(0,0,0,0.12)", padding: "8px 10px",
          fontSize: 12, color: "#111", whiteSpace: "pre-wrap", maxWidth: 320,
          lineHeight: 1.35, zIndex: 60, opacity: open ? 1 : 0, pointerEvents: "none",
          transition: "opacity 120ms ease",
        }}
      >
        {label}
      </span>
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

// Visual helpers
function riskColor(p: number): string {
  if (p < 0.2) return "#16a34a";
  if (p < 0.4) return "#84cc16";
  if (p < 0.6) return "#f59e0b";
  if (p < 0.8) return "#f97316";
  return "#ef4444";
}
function riskLabel(p: number): string {
  if (p < 0.2) return "Low";
  if (p < 0.4) return "Moderate";
  if (p < 0.6) return "Elevated";
  if (p < 0.8) return "High";
  return "Very High";
}

// ---------- page ----------
export default function Home() {
  const router = useRouter();

  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [highlighted, setHighlighted] = useState<number>(-1);

  const [searchLoading, setSearchLoading] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);

  const [selected, setSelected] = useState<Hit | null>(null);
  const [score, setScore] = useState<ScoreResp | null>(null);
  const [scoreLoading, setScoreLoading] = useState(false);
  const [scoreErr, setScoreErr] = useState<string | null>(null);

  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 1800); };

  // Refs
  const inputRef = useRef<HTMLInputElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const deepLink = useMemo(() => {
    if (!selected) return "";
    const base = typeof window !== "undefined" ? window.location.origin : "";
    return `${base}${router.pathname}?camis=${encodeURIComponent(selected.camis)}`;
  }, [selected ? selected.camis : "", router.pathname]);

  const actionsDisabled = !score || scoreLoading;

  const btnStyle: React.CSSProperties = {
    padding: "6px 10px",
    border: "1px solid #ddd",
    borderRadius: 8,
    background: "#fff",
    fontSize: 14,
    lineHeight: 1.2,
    display: "inline-block",
  };

  async function handleShare() {
    if (actionsDisabled || !deepLink) { showToast("No score yet"); return; }
    const ok = await copyText(deepLink);
    showToast(ok ? "Link copied!" : "Copy failed");
  }
  async function handleCopyCamis() {
    if (actionsDisabled || !selected) { showToast("No score yet"); return; }
    const ok = await copyText(selected.camis);
    showToast(ok ? "CAMIS copied!" : "Copy failed");
  }
  async function handleCopyJson() {
    if (actionsDisabled || !score) { showToast("No score yet"); return; }
    const ok = await copyText(JSON.stringify(score, null, 2));
    showToast(ok ? "JSON copied!" : "Copy failed");
  }

  function scrollSelectedIntoView(camis: string) {
    const el = itemRefs.current[camis];
    if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function handleBackToResults() {
    if (selected) {
      const idx = hits.findIndex(h => h.camis === selected.camis);
      if (idx >= 0) setHighlighted(idx);
      scrollSelectedIntoView(selected.camis);
    }
    inputRef.current?.focus();
  }

  function handleStartOver() {
    setQ(""); setHits([]); setSelected(null);
    setScore(null); setScoreErr(null); setHighlighted(-1);
    const { camis, ...rest } = router.query;
    router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true });
    inputRef.current?.focus();
    showToast("Cleared");
  }

  async function runSearch(term: string, { allowFallback }: { allowFallback: boolean }) {
    setSearchLoading(true); setSearchErr(null); setSuggestion(null);
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
              setSuggestion(soft); setHits(data2); setHighlighted(data2.length ? 0 : -1);
              return;
            }
          }
        }
      }

      setHits(data); setHighlighted(data.length ? 0 : -1);
    } catch (err: unknown) {
      if (!isAbortError(err)) setSearchErr(getErrorMessage(err));
    } finally { setSearchLoading(false); }
  }

  // Debounced search
  useEffect(() => {
    if (!API_BASE) return;
    if (q.trim().length < 2) { setHits([]); setSearchErr(null); setSuggestion(null); setHighlighted(-1); return; }
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
      const idx = hits.findIndex(h => h.camis === camis);
      if (idx >= 0) { setHighlighted(idx); scrollSelectedIntoView(camis); }
    } catch (err: unknown) {
      setScoreErr(getErrorMessage(err));
    } finally { setScoreLoading(false); }
  };

  const selectHit = (h: Hit) => {
    setSelected(h); setScore(null); setScoreErr(null);
    runScore(h.camis);
    const q = { ...router.query, camis: h.camis };
    router.replace({ pathname: router.pathname, query: q }, undefined, { shallow: true });
    const idx = hits.findIndex(x => x.camis === h.camis);
    if (idx >= 0) setHighlighted(idx);
    scrollSelectedIntoView(h.camis);
  };

  // Keyboard on input
  const onInputKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === "Escape") { handleStartOver(); return; }
    if (!hits.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlighted(i => (i + 1) % hits.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlighted(i => (i - 1 + hits.length) % hits.length); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const index = highlighted >= 0 ? highlighted : 0;
      const h = hits[index]; if (h) selectHit(h);
    }
  };

  const noResults = !searchLoading && !searchErr && q.trim().length >= 2 && hits.length === 0;

  // ---------- layout ----------
  return (
    <main style={{ maxWidth: 1180, margin: "2rem auto", padding: "0 1rem", fontFamily: "ui-sans-serif, system-ui" }}>
      {/* Header (spans both columns) */}
      <div style={{ marginBottom: 12 }}>
        <h1 style={{ fontSize: "1.9rem", marginBottom: 8 }}>DineSafe NYC — Compliance Coach</h1>
        <p style={{ color: "#555", marginTop: 0 }}>
          Type a NYC restaurant name to search, use ↑/↓ then Enter to score, or share a deep link with <code>?camis=</code>.
        </p>
        {!API_BASE && (
          <p style={{ background: "#fff3cd", padding: 12, borderRadius: 8, border: "1px solid #ffe58f" }}>
            <b>Heads up:</b> Set <code>NEXT_PUBLIC_API_BASE</code> to your Cloud Run URL to use the API.
          </p>
        )}
      </div>

      {/* Two-column grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(320px, 420px) 1fr",
          gap: 20,
          alignItems: "start",
        }}
      >
        {/* LEFT: search + results (sticky) */}
        <aside
          style={{
            position: "sticky",
            top: 16,
            alignSelf: "start",
          }}
        >
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
            <button onClick={handleStartOver} title="Clear selection and search" style={{ padding: "8px 12px", border: "1px solid #ddd", borderRadius: 8, background: "#fff", cursor: "pointer" }}>
              Start over
            </button>
          </div>

          <div style={{ marginTop: 12 }}>
            {searchLoading && <Spinner label="Searching…" />}
            {searchErr && <div style={{ color: "crimson" }}>Error: {searchErr}</div>}
            {suggestion && (
              <div style={{ marginTop: -6 }}>
                <button
                  onClick={() => setQ(suggestion)}
                  style={{ background: "#f5f5f5", border: "1px solid #e6e6e6", borderRadius: 999, padding: "4px 10px", cursor: "pointer", fontSize: 13 }}
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
                <div
                  style={{
                    border: "1px solid #eee",
                    borderRadius: 12,
                    padding: 8,
                    maxHeight: "calc(100vh - 220px)",
                    overflowY: "auto",
                    background: "#fff",
                  }}
                >
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
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div style={{ fontWeight: 600, color: "#000", marginRight: 8 }}>{h.name}</div>
                          <span
                            style={{
                              fontSize: 11, padding: "2px 8px", borderRadius: 999,
                              background: "#f1f5f9", border: "1px solid #e5e7eb", color: "#334155",
                              textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap",
                            }}
                          >
                            {h.boro || "NYC"}
                          </span>
                        </div>
                        <div style={{ fontSize: 13, color: "#555", marginTop: 2 }}>{h.address}</div>
                        <div style={{ fontSize: 12, color: "#888" }}>CAMIS: {h.camis}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* RIGHT: score card */}
        <section>
          {selected && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between", flexWrap: "wrap" }}>
                <h2 style={{ margin: 0 }}>{selected.name} Risk Summary</h2>
                <div style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <button onClick={handleBackToResults} title="Scroll back to the selected item in results" style={{ ...btnStyle, cursor: "pointer" }}>
                    Back to results
                  </button>
                  <button
                    onClick={handleShare}
                    title="Copy a shareable link"
                    style={{ ...btnStyle, cursor: actionsDisabled ? "not-allowed" : "pointer", opacity: actionsDisabled ? 0.5 : 1 }}
                    aria-label="Copy shareable link"
                    disabled={actionsDisabled}
                  >
                    Share
                  </button>
                  <a
                    href={actionsDisabled ? undefined : (deepLink || "#")}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      ...btnStyle,
                      textDecoration: "none",
                      pointerEvents: actionsDisabled ? "none" : "auto",
                      opacity: actionsDisabled ? 0.5 : 1,
                      cursor: actionsDisabled ? "not-allowed" : "pointer",
                    }}
                    aria-disabled={actionsDisabled}
                  >
                    Open in new tab
                  </a>
                  <button
                    onClick={handleCopyCamis}
                    title="Copy CAMIS"
                    style={{ ...btnStyle, cursor: actionsDisabled ? "not-allowed" : "pointer", opacity: actionsDisabled ? 0.5 : 1 }}
                    aria-label="Copy CAMIS"
                    disabled={actionsDisabled}
                  >
                    Copy CAMIS
                  </button>
                  <button
                    onClick={handleCopyJson}
                    title="Copy the raw /score JSON"
                    style={{ ...btnStyle, cursor: actionsDisabled ? "not-allowed" : "pointer", opacity: actionsDisabled ? 0.5 : 1 }}
                    aria-label="Copy /score JSON"
                    disabled={actionsDisabled}
                  >
                    Copy JSON
                  </button>
                </div>
              </div>

              <div style={{ display: "grid", gap: 16, gridTemplateColumns: "1fr", marginTop: 12 }}>
                {/* Prediction card */}
                <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 16, background: "#f8fafc" }}>
                  {scoreLoading && <Spinner label="Scoring…" />}
                  {scoreErr && <div style={{ color: "crimson" }}>Error: {scoreErr}</div>}
                  {score && (
                    <div>
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                        <h3 style={{ margin: 0 }}>Prediction</h3>
                        <span
                          style={{
                            fontSize: 12, padding: "2px 8px", borderRadius: 999,
                            border: "1px solid #e5e7eb", background: "#fff", color: "#334155",
                          }}
                          title="Overall risk label"
                        >
                          {riskLabel(score.prob_bc)}
                        </span>
                      </div>

                      <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                        <div style={{ fontSize: 28, fontWeight: 700, color: riskColor(score.prob_bc) }}>
                          {(score.prob_bc * 100).toFixed(1)}%
                        </div>
                        <div style={{ color: "#555" }}>chance of <b>B or C</b> next inspection</div>
                      </div>

                      <div style={{ marginTop: 10 }}>
                        <div style={{ height: 10, background: "#e5e7eb", borderRadius: 999, overflow: "hidden" }}>
                          <div
                            style={{
                              width: `${Math.max(0, Math.min(100, score.prob_bc * 100))}%`,
                              height: "100%",
                              background: riskColor(score.prob_bc),
                            }}
                            aria-hidden
                          />
                        </div>
                      </div>

                      {/* Rat pressure with tooltip */}
                      <div style={{ marginTop: 10, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                        <Tooltip
                          label={dedent(`
                          Local Rat Pressure combines two signals near the restaurant (≈150–200m cell):
                          • 311 rodent complaints in the last 180 days
                          • DOHMH rat inspection failures in the last 365 days
                          We normalize these into an index from 0–1 using robust quantiles.
                          Scale: Low <0.2 · Moderate 0.2–0.4 · Elevated 0.4–0.6 · High 0.6–0.8 · Very High ≥0.8
                          `)}
                        >
                          <span
                            title="Recent 311 rodent complaints + DOHMH rat inspection fails near this location"
                            style={{ fontSize: 12, padding: "2px 8px", borderRadius: 999, border: "1px solid #e5e7eb", background: "#fff", color: "#334155", display: "inline-flex", alignItems: "center", gap: 6 }}
                          >
                            Local Rat Pressure: <b>{ratPressureLabel(score.rat_index)}</b>
                            <InfoIcon />
                          </span>
                        </Tooltip>

                        <span style={{ fontSize: 12, color: "#6b7280" }}>
                          idx {fmt(score.rat_index, 2)} · 311 last 180d: {score.rat311_cnt_180d_k1 ?? "—"} · fails last 365d: {score.ratinsp_fail_365d_k1 ?? "—"}
                        </span>
                      </div>

                      <p style={{ marginTop: 12, marginBottom: 0, fontWeight: 600 }}>
                        Next Inspection Predicted Points:&nbsp;
                        {(() => {
                          const sameAsLast =
                            score.predicted_points != null &&
                            score.last_points != null &&
                            Math.round(score.predicted_points) === Math.round(score.last_points);
                          return sameAsLast ? "≈ last (baseline)" : (score.predicted_points ?? "—");
                        })()}
                      </p>

                      {score.top_violation_probs && score.top_violation_probs.length > 0 && (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ fontWeight: 600, marginBottom: 6 }}>Likely Next Violation Categories</div>
                        <ul
                          style={{
                            margin: 0,
                            paddingLeft: 20,          // move bullets in from the card edge
                            listStyleType: "disc",
                            listStylePosition: "outside",
                          }}
                        >
                          {score.top_violation_probs.slice(0, 2).map((v, i) => (
                            <li key={i} style={{ lineHeight: 1.4 }}>
                              {v.label} — {(v.probability * 100).toFixed(0)}%{" "}
                              <span style={{ color: "#888" }}>(code {v.code})</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    </div>
                  )}
                </div>

                {/* Latest Results card */}
                {score && (
                  <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 16, background: "#fff" }}>
                    <h3 style={{ marginTop: 0 }}>Latest Results</h3>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 12 }}>
                      <div>
                        <div style={{ fontSize: 12, color: "#6b7280" }}>Last Inspection Date</div>
                        <div style={{ fontWeight: 600 }}>{score.last_inspection_date ?? "—"}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 12, color: "#6b7280" }}>Last Points</div>
                        <div style={{ fontWeight: 600 }}>{score.last_points ?? "—"}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 12, color: "#6b7280" }}>Last Grade</div>
                        <div style={{ fontWeight: 600 }}>{score.last_grade ?? "—"}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

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
