import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import styles from "@/styles/Home.module.css";

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
  latitude?: number | null;
  longitude?: number | null;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "";

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
function ratPressureColor(x?: number | null): string {
  if (x == null) return "#6b7280";
  if (x < 0.2) return "#16a34a";
  if (x < 0.4) return "#84cc16";
  if (x < 0.6) return "#f59e0b";
  if (x < 0.8) return "#f97316";
  return "#ef4444";
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
function gradeColor(grade?: string | null): string {
  if (grade === "A") return "#16a34a";
  if (grade === "B") return "#f59e0b";
  if (grade === "C") return "#ef4444";
  return "#94a3b8";
}

function osmEmbedSrc(lat: number, lon: number, dx = 0.003, dy = 0.002): string {
  const left = (lon - dx).toFixed(6);
  const right = (lon + dx).toFixed(6);
  const top = (lat + dy).toFixed(6);
  const bottom = (lat - dy).toFixed(6);
  return `https://www.openstreetmap.org/export/embed.html?bbox=${left},${bottom},${right},${top}&layer=mapnik&marker=${lat},${lon}`;
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

function Spinner({ label }: { label?: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span
        role="progressbar"
        aria-label={label || "Loading"}
        style={{
          width: 18, height: 18,
          border: "2px solid #e2e8f0",
          borderTopColor: "#3b82f6",
          borderRadius: "50%",
          display: "inline-block",
          animation: "spin 0.8s linear infinite",
        }}
      />
      {label && <span style={{ color: "#64748b", fontSize: 14 }}>{label}</span>}
      <style jsx>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </span>
  );
}

function InfoIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden {...props}>
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
      <line x1="12" y1="10" x2="12" y2="17" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="7" r="1" fill="currentColor" />
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
          position: "absolute", bottom: "125%", left: 0,
          background: "#1e293b", border: "none", borderRadius: 8,
          boxShadow: "0 10px 25px rgba(0,0,0,0.2)", padding: "10px 12px",
          fontSize: 12, color: "#f1f5f9", whiteSpace: "pre-wrap", maxWidth: 300,
          lineHeight: 1.5, zIndex: 60,
          opacity: open ? 1 : 0, pointerEvents: "none",
          transition: "opacity 120ms ease",
        }}
      >
        {label}
      </span>
    </span>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function EmptyState() {
  return (
    <div style={{
      border: "1px solid #e2e8f0",
      borderRadius: 16,
      padding: 32,
      background: "#fff",
      textAlign: "center",
    }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🍽️</div>
      <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#0f172a", marginBottom: 8 }}>
        Check any NYC restaurant
      </h2>
      <p style={{ color: "#64748b", fontSize: 14, lineHeight: 1.6, maxWidth: 340, margin: "0 auto 24px" }}>
        Search by name on the left to see a restaurant&apos;s inspection risk score, predicted violations, and local rat pressure.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, textAlign: "left" }}>
        {[
          { icon: "📊", title: "Risk Score", desc: "Probability of a B or C grade next inspection" },
          { icon: "🐀", title: "Rat Pressure", desc: "Nearby 311 complaints & failed rat inspections" },
          { icon: "⚠️", title: "Top Violations", desc: "Most likely violation categories to watch for" },
          { icon: "📍", title: "Location Map", desc: "Street-level map of the restaurant" },
        ].map(f => (
          <div key={f.title} style={{
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: 10,
            padding: "12px 14px",
          }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>{f.icon}</div>
            <div style={{ fontWeight: 600, fontSize: 13, color: "#0f172a", marginBottom: 2 }}>{f.title}</div>
            <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.4 }}>{f.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

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

  async function handleShare() {
    if (actionsDisabled || !deepLink) { showToast("No score yet"); return; }
    const ok = await copyText(deepLink);
    showToast(ok ? "Link copied!" : "Copy failed");
  }
  async function handleCopyJson() {
    if (actionsDisabled || !score) { showToast("No score yet"); return; }
    const ok = await copyText(JSON.stringify(score, null, 2));
    showToast(ok ? "JSON copied!" : "Copy failed");
  }

  function scrollSelectedIntoView(camis: string) {
    itemRefs.current[camis]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
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
            if (data2.length > 0) { setSuggestion(soft); setHits(data2); setHighlighted(0); return; }
          }
        }
      }
      setHits(data); setHighlighted(data.length ? 0 : -1);
    } catch (err: unknown) {
      if (!isAbortError(err)) setSearchErr(getErrorMessage(err));
    } finally { setSearchLoading(false); }
  }

  useEffect(() => {
    if (!API_BASE) return;
    if (q.trim().length < 2) { setHits([]); setSearchErr(null); setSuggestion(null); setHighlighted(-1); return; }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => runSearch(q, { allowFallback: true }), 350);
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

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
    router.replace({ pathname: router.pathname, query: { ...router.query, camis: h.camis } }, undefined, { shallow: true });
    const idx = hits.findIndex(x => x.camis === h.camis);
    if (idx >= 0) setHighlighted(idx);
    scrollSelectedIntoView(h.camis);
  };

  const onInputKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === "Escape") { handleStartOver(); return; }
    if (!hits.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlighted(i => (i + 1) % hits.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlighted(i => (i - 1 + hits.length) % hits.length); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const h = hits[highlighted >= 0 ? highlighted : 0];
      if (h) selectHit(h);
    }
  };

  const noResults = !searchLoading && !searchErr && q.trim().length >= 2 && hits.length === 0;

  return (
    <>
      {/* Header */}
      <header style={{
        background: "#0f172a",
        color: "#fff",
        padding: "0 1.5rem",
      }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "1rem 0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: "1.15rem", letterSpacing: "-0.01em" }}>
              🍽️ DineSafe NYC
            </div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 1 }}>
              Health Inspection Compliance Coach
            </div>
          </div>
          <a
            href="https://health-inspection-compliance-coach-production.up.railway.app/docs"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 12, color: "#94a3b8", border: "1px solid #334155",
              borderRadius: 6, padding: "4px 10px",
              transition: "color 0.15s",
            }}
          >
            API Docs
          </a>
        </div>
      </header>

      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "1.75rem 1.5rem 4rem" }}>
        {!API_BASE && (
          <div style={{ background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 14 }}>
            <b>Setup needed:</b> Set <code>NEXT_PUBLIC_API_BASE</code> to your API URL.
          </div>
        )}

        <div className={styles.layout}>
          {/* LEFT: search */}
          <aside className={styles.sidebar}>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
                <SearchIcon />
              </span>
              <input
                ref={inputRef}
                placeholder="Search restaurant name…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onInputKeyDown}
                aria-label="Search restaurants"
                style={{
                  width: "100%",
                  padding: "0.7rem 0.9rem 0.7rem 2.25rem",
                  border: "1px solid #e2e8f0",
                  borderRadius: 12,
                  fontSize: 15,
                  background: "#fff",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                  outline: "none",
                  transition: "border-color 0.15s, box-shadow 0.15s",
                }}
                onFocus={e => { e.target.style.borderColor = "#3b82f6"; e.target.style.boxShadow = "0 0 0 3px rgba(59,130,246,0.12)"; }}
                onBlur={e => { e.target.style.borderColor = "#e2e8f0"; e.target.style.boxShadow = "0 1px 3px rgba(0,0,0,0.06)"; }}
              />
            </div>

            <div style={{ marginTop: 10 }}>
              {searchLoading && (
                <div style={{ padding: "8px 0" }}>
                  <Spinner label="Searching…" />
                </div>
              )}
              {searchErr && (
                <div style={{ color: "#ef4444", fontSize: 13, padding: "8px 0" }}>
                  Error: {searchErr}
                </div>
              )}
              {suggestion && (
                <button
                  onClick={() => setQ(suggestion)}
                  style={{
                    background: "#eff6ff", border: "1px solid #bfdbfe",
                    borderRadius: 999, padding: "4px 12px",
                    cursor: "pointer", fontSize: 13, color: "#1d4ed8",
                  }}
                >
                  Did you mean &ldquo;{suggestion}&rdquo;?
                </button>
              )}
              {noResults && (
                <div style={{ color: "#64748b", fontSize: 13, padding: "8px 0" }}>
                  No results for &ldquo;{q}&rdquo;. Try fewer words or part of the name.
                </div>
              )}

              {hits.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, color: "#94a3b8", margin: "8px 0 6px", fontWeight: 500 }}>
                    {hits.length} restaurant{hits.length !== 1 ? "s" : ""} found
                  </div>
                  <div style={{
                    border: "1px solid #e2e8f0",
                    borderRadius: 14,
                    overflow: "hidden",
                    maxHeight: "calc(100vh - 260px)",
                    overflowY: "auto",
                    background: "#fff",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                  }}>
                    {hits.map((h, i) => {
                      const active = i === highlighted;
                      const isSelected = selected?.camis === h.camis;
                      return (
                        <button
                          key={h.camis}
                          ref={(el) => { itemRefs.current[h.camis] = el; }}
                          onClick={() => selectHit(h)}
                          style={{
                            display: "block", width: "100%", textAlign: "left",
                            padding: "11px 14px",
                            background: isSelected ? "#eff6ff" : active ? "#f8fafc" : "#fff",
                            cursor: "pointer",
                            borderTop: "none", borderRight: "none", borderLeft: isSelected ? "3px solid #3b82f6" : "3px solid transparent",
                            borderBottom: "1px solid #f1f5f9",
                            transition: "background 0.1s",
                            outline: active ? "2px solid #93c5fd" : "none",
                            outlineOffset: -2,
                          }}
                          aria-selected={active}
                        >
                          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                            <div style={{ fontWeight: 600, fontSize: 14, color: "#0f172a", lineHeight: 1.3 }}>{h.name}</div>
                            <span style={{
                              fontSize: 10, padding: "2px 7px", borderRadius: 999, flexShrink: 0,
                              background: "#f1f5f9", border: "1px solid #e2e8f0",
                              color: "#475569", textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600,
                            }}>
                              {h.boro || "NYC"}
                            </span>
                          </div>
                          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{h.address}</div>
                        </button>
                      );
                    })}
                  </div>
                  {selected && (
                    <button
                      onClick={handleStartOver}
                      style={{
                        marginTop: 10, width: "100%", padding: "8px",
                        border: "1px solid #e2e8f0", borderRadius: 10,
                        background: "#fff", cursor: "pointer", fontSize: 13,
                        color: "#64748b",
                      }}
                    >
                      Clear &amp; start over
                    </button>
                  )}
                </div>
              )}
            </div>
          </aside>

          {/* RIGHT: score card or empty state */}
          <section>
            {!selected && <EmptyState />}

            {selected && (
              <div>
                {/* Restaurant name + actions */}
                <div style={{
                  display: "flex", alignItems: "flex-start", justifyContent: "space-between",
                  gap: 12, flexWrap: "wrap", marginBottom: 16,
                }}>
                  <div>
                    <h1 style={{ fontSize: "1.4rem", fontWeight: 700, color: "#0f172a", lineHeight: 1.2 }}>
                      {selected.name}
                    </h1>
                    {selected.address && (
                      <div style={{ fontSize: 13, color: "#64748b", marginTop: 3 }}>{selected.address}</div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {[
                      { label: "Share link", onClick: handleShare, disabled: actionsDisabled },
                      { label: "Copy JSON", onClick: handleCopyJson, disabled: actionsDisabled },
                    ].map(btn => (
                      <button
                        key={btn.label}
                        onClick={btn.onClick}
                        disabled={btn.disabled}
                        style={{
                          padding: "6px 12px", border: "1px solid #e2e8f0", borderRadius: 8,
                          background: "#fff", fontSize: 13, cursor: btn.disabled ? "not-allowed" : "pointer",
                          opacity: btn.disabled ? 0.4 : 1, fontWeight: 500, color: "#334155",
                        }}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                </div>

                {scoreLoading && (
                  <div style={{
                    border: "1px solid #e2e8f0", borderRadius: 16, padding: 32,
                    background: "#fff", textAlign: "center",
                  }}>
                    <Spinner label="Loading score…" />
                  </div>
                )}

                {scoreErr && (
                  <div style={{
                    border: "1px solid #fecaca", borderRadius: 16, padding: 20,
                    background: "#fef2f2", color: "#ef4444", fontSize: 14,
                  }}>
                    Error: {scoreErr}
                  </div>
                )}

                {score && (
                  <div style={{ display: "grid", gap: 16 }}>
                    {/* Risk score card */}
                    <div style={{
                      border: "1px solid #e2e8f0", borderRadius: 16, padding: 24,
                      background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 8 }}>
                        <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "#0f172a" }}>Inspection Risk</h2>
                        <span style={{
                          padding: "4px 12px", borderRadius: 999, fontWeight: 700, fontSize: 13,
                          background: riskColor(score.prob_bc) + "18",
                          color: riskColor(score.prob_bc),
                          border: `1px solid ${riskColor(score.prob_bc)}40`,
                        }}>
                          {riskLabel(score.prob_bc)}
                        </span>
                      </div>

                      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
                        <span style={{ fontSize: "3rem", fontWeight: 800, color: riskColor(score.prob_bc), lineHeight: 1 }}>
                          {(score.prob_bc * 100).toFixed(1)}%
                        </span>
                        <span style={{ color: "#64748b", fontSize: 15 }}>
                          chance of <strong>B or C</strong> next inspection
                        </span>
                      </div>

                      <div style={{ height: 8, background: "#f1f5f9", borderRadius: 999, overflow: "hidden", marginBottom: 20 }}>
                        <div style={{
                          width: `${Math.max(2, Math.min(100, score.prob_bc * 100))}%`,
                          height: "100%",
                          background: riskColor(score.prob_bc),
                          borderRadius: 999,
                          transition: "width 0.4s ease",
                        }} />
                      </div>

                      {/* Rat pressure */}
                      <div style={{
                        background: "#f8fafc", borderRadius: 10, padding: "12px 14px",
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        flexWrap: "wrap", gap: 8,
                      }}>
                        <Tooltip label={dedent(`
                          Local Rat Pressure combines two signals near the restaurant (≈150–200m cell):
                          • 311 rodent complaints in the last 180 days
                          • DOHMH rat inspection failures in the last 365 days
                          Normalized into a 0–1 index using robust quantiles.
                          Low <0.2 · Moderate 0.2–0.4 · Elevated 0.4–0.6 · High 0.6–0.8 · Very High ≥0.8
                        `)}>
                          <span style={{
                            display: "inline-flex", alignItems: "center", gap: 6,
                            fontWeight: 600, fontSize: 13, color: "#334155", cursor: "default",
                          }}>
                            🐀 Local Rat Pressure
                            <span style={{ color: ratPressureColor(score.rat_index), fontWeight: 700 }}>
                              {ratPressureLabel(score.rat_index)}
                            </span>
                            <InfoIcon style={{ color: "#94a3b8" }} />
                          </span>
                        </Tooltip>
                        <span style={{ fontSize: 12, color: "#94a3b8" }}>
                          idx {fmt(score.rat_index, 2)} · 311: {score.rat311_cnt_180d_k1 ?? "—"} · fails: {score.ratinsp_fail_365d_k1 ?? "—"}
                        </span>
                      </div>

                      {/* Predicted points */}
                      <div style={{ marginTop: 16, fontSize: 14, color: "#475569" }}>
                        <strong>Predicted points next inspection: </strong>
                        {(() => {
                          const sameAsLast = score.predicted_points != null && score.last_points != null &&
                            Math.round(score.predicted_points) === Math.round(score.last_points);
                          return sameAsLast ? "≈ last (baseline)" : (score.predicted_points ?? "—");
                        })()}
                      </div>

                      {/* Likely violations */}
                      {score.top_violation_probs && score.top_violation_probs.length > 0 && (
                        <div style={{ marginTop: 16 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: "#334155", marginBottom: 8 }}>
                            Likely Next Violations
                          </div>
                          <div style={{ display: "grid", gap: 8 }}>
                            {score.top_violation_probs.slice(0, 2).map((v, i) => (
                              <div key={i} style={{
                                display: "flex", alignItems: "center", justifyContent: "space-between",
                                background: "#f8fafc", borderRadius: 8, padding: "10px 12px",
                                border: "1px solid #e2e8f0", gap: 8,
                              }}>
                                <span style={{ fontSize: 13, color: "#334155", flex: 1 }}>{v.label}</span>
                                <span style={{
                                  fontSize: 12, fontWeight: 700, color: riskColor(v.probability),
                                  background: riskColor(v.probability) + "15",
                                  padding: "2px 8px", borderRadius: 999,
                                }}>
                                  {(v.probability * 100).toFixed(0)}%
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Last inspection card */}
                    <div style={{
                      border: "1px solid #e2e8f0", borderRadius: 16, padding: 24,
                      background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                    }}>
                      <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "#0f172a", marginBottom: 16 }}>
                        Last Inspection
                      </h2>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
                        <div>
                          <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Date</div>
                          <div style={{ fontWeight: 600, fontSize: 15, color: "#0f172a" }}>
                            {score.last_inspection_date ?? "—"}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Points</div>
                          <div style={{ fontWeight: 600, fontSize: 15, color: "#0f172a" }}>
                            {score.last_points ?? "—"}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Grade</div>
                          <div style={{
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            width: 36, height: 36, borderRadius: 8, fontWeight: 800, fontSize: 18,
                            background: score.last_grade ? gradeColor(score.last_grade) + "18" : "#f1f5f9",
                            color: gradeColor(score.last_grade),
                            border: `2px solid ${gradeColor(score.last_grade)}40`,
                          }}>
                            {score.last_grade ?? "—"}
                          </div>
                        </div>
                      </div>

                      {/* Map */}
                      {score.latitude != null && score.longitude != null && (
                        <div style={{ marginTop: 20 }}>
                          <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Location</div>
                          <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid #e2e8f0" }}>
                            <iframe
                              title="Restaurant location"
                              src={osmEmbedSrc(score.latitude, score.longitude)}
                              style={{ width: "100%", height: 220, border: 0, display: "block" }}
                              loading="lazy"
                              referrerPolicy="no-referrer-when-downgrade"
                            />
                          </div>
                          <a
                            href={`https://www.openstreetmap.org/?mlat=${score.latitude}&mlon=${score.longitude}#map=17/${score.latitude}/${score.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontSize: 12, color: "#3b82f6", display: "inline-block", marginTop: 6 }}
                          >
                            Open full map →
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </main>

      {/* Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed", left: "50%", bottom: "calc(24px + env(safe-area-inset-bottom))",
            transform: "translateX(-50%)",
            background: "#0f172a", color: "#f8fafc",
            padding: "10px 18px", borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
            fontSize: 14, fontWeight: 500,
            zIndex: 9999, pointerEvents: "none",
            animation: "toastfade 200ms ease-out",
          }}
        >
          {toast}
          <style jsx>{`
            @keyframes toastfade {
              from { transform: translateX(-50%) translateY(6px); opacity: 0; }
              to   { transform: translateX(-50%) translateY(0);   opacity: 1; }
            }
          `}</style>
        </div>
      )}
    </>
  );
}
