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

const EXAMPLES = [
  { camis: "50117047", name: "$1 Pizza", address: "333B Avenue of the Americas", boro: "Manhattan" },
  { camis: "41311152", name: "Katz's Delicatessen", address: "205 E Houston St", boro: "Manhattan" },
  { camis: "50071959", name: "Lucali", address: "575 Henry St", boro: "Brooklyn" },
  { camis: "40363380", name: "Joe's Shanghai", address: "9 Pell St", boro: "Manhattan" },
];

function softNormalize(s: string) {
  return s.replace(/[^a-z0-9\s]/gi, "").replace(/(.)\1{2,}/gi, "$1$1").trim();
}
function ratPressureLabel(x?: number | null) {
  if (x == null) return "Unknown";
  if (x < 0.2) return "Low";
  if (x < 0.4) return "Moderate";
  if (x < 0.6) return "Elevated";
  if (x < 0.8) return "High";
  return "Very High";
}
function ratPressureColor(x?: number | null) {
  if (x == null) return "#6b7280";
  if (x < 0.2) return "#16a34a";
  if (x < 0.4) return "#84cc16";
  if (x < 0.6) return "#f59e0b";
  if (x < 0.8) return "#f97316";
  return "#ef4444";
}
function riskColor(p: number) {
  if (p < 0.2) return "#16a34a";
  if (p < 0.4) return "#84cc16";
  if (p < 0.6) return "#f59e0b";
  if (p < 0.8) return "#f97316";
  return "#ef4444";
}
function riskLabel(p: number) {
  if (p < 0.2) return "Low risk";
  if (p < 0.4) return "Moderate risk";
  if (p < 0.6) return "Elevated risk";
  if (p < 0.8) return "High risk";
  return "Very high risk";
}
function gradeColor(grade?: string | null) {
  if (grade === "A") return "#16a34a";
  if (grade === "B") return "#f59e0b";
  if (grade === "C") return "#ef4444";
  return "#94a3b8";
}
function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  try { return JSON.stringify(err); } catch { return String(err); }
}
function isAbortError(err: unknown) {
  return typeof err === "object" && err !== null && "name" in err && (err as { name?: string }).name === "AbortError";
}
function dedent(s: string) {
  return s.replace(/^[ \t]+/gm, "").trim();
}
function osmEmbedSrc(lat: number, lon: number, dx = 0.003, dy = 0.002) {
  const l = (lon - dx).toFixed(6), r = (lon + dx).toFixed(6);
  const t = (lat + dy).toFixed(6), b = (lat - dy).toFixed(6);
  return `https://www.openstreetmap.org/export/embed.html?bbox=${l},${b},${r},${t}&layer=mapnik&marker=${lat},${lon}`;
}
async function copyText(text: string) {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch {}
  try {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.left = "-9999px";
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy"); document.body.removeChild(ta); return ok;
  } catch { return false; }
}

function Spinner() {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span style={{
        width: 16, height: 16, border: "2px solid #e2e8f0", borderTopColor: "#3b82f6",
        borderRadius: "50%", display: "inline-block", animation: "spin 0.8s linear infinite",
      }} />
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
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center" }}
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}>
      {children}
      <span role="tooltip" style={{
        position: "absolute", bottom: "125%", left: 0,
        background: "#1e293b", borderRadius: 8, padding: "10px 12px",
        boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
        fontSize: 12, color: "#f1f5f9", whiteSpace: "pre-wrap", maxWidth: 300,
        lineHeight: 1.5, zIndex: 60,
        opacity: open ? 1 : 0, pointerEvents: "none", transition: "opacity 120ms ease",
      }}>{label}</span>
    </span>
  );
}

export default function Home() {
  const router = useRouter();

  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [selected, setSelected] = useState<Hit | null>(null);
  const [score, setScore] = useState<ScoreResp | null>(null);
  const [scoreLoading, setScoreLoading] = useState(false);
  const [scoreErr, setScoreErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 1800); };

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const deepLink = useMemo(() => {
    if (!selected) return "";
    const base = typeof window !== "undefined" ? window.location.origin : "";
    return `${base}${router.pathname}?camis=${encodeURIComponent(selected.camis)}`;
  }, [selected?.camis, router.pathname]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

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
            if (data2.length > 0) { setSuggestion(soft); setHits(data2); setHighlighted(0); setDropdownOpen(true); return; }
          }
        }
      }
      setHits(data); setHighlighted(data.length ? 0 : -1); setDropdownOpen(data.length > 0);
    } catch (err: unknown) {
      if (!isAbortError(err)) setSearchErr(getErrorMessage(err));
    } finally { setSearchLoading(false); }
  }

  useEffect(() => {
    if (!API_BASE) return;
    if (q.trim().length < 2) { setHits([]); setSearchErr(null); setSuggestion(null); setHighlighted(-1); setDropdownOpen(false); return; }
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
    setDropdownOpen(false);
    try {
      const r = await fetch(`${API_BASE}/score`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ camis }),
      });
      if (!r.ok) { const t = await r.text(); throw new Error(`${r.status}: ${t}`); }
      setScore(await r.json() as ScoreResp);
    } catch (err: unknown) {
      setScoreErr(getErrorMessage(err));
    } finally { setScoreLoading(false); }
  };

  const selectHit = (h: Hit) => {
    setSelected(h); setQ(h.name); setDropdownOpen(false); setHits([]);
    if (timer.current) clearTimeout(timer.current);
    if (abortRef.current) abortRef.current.abort();
    runScore(h.camis);
    router.replace({ pathname: router.pathname, query: { ...router.query, camis: h.camis } }, undefined, { shallow: true });
  };

  const handleClear = () => {
    setQ(""); setHits([]); setSelected(null); setScore(null); setScoreErr(null);
    setDropdownOpen(false); setHighlighted(-1);
    const { camis, ...rest } = router.query;
    void camis;
    router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true });
    inputRef.current?.focus();
  };

  const onInputKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === "Escape") { setDropdownOpen(false); return; }
    if (!hits.length || !dropdownOpen) return;
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
      <header style={{ background: "#0f172a", borderBottom: "1px solid #1e293b" }}>
        <div style={{ maxWidth: 860, margin: "0 auto", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 20 }}>🍽️</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: "1rem", color: "#f8fafc", letterSpacing: "-0.01em" }}>DineSafe NYC</div>
              <div style={{ fontSize: 11, color: "#64748b" }}>Health Inspection Compliance Coach</div>
            </div>
          </div>
          <a href={`${API_BASE}/docs`} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 12, color: "#64748b", border: "1px solid #1e293b", borderRadius: 6, padding: "4px 10px" }}>
            API Docs
          </a>
        </div>
      </header>

      <main style={{ maxWidth: 860, margin: "0 auto", padding: "0 24px 80px" }} className="main-content">

        {/* Hero — only shown when nothing is selected */}
        {!selected && !scoreLoading && (
          <div className="hero" style={{ textAlign: "center", padding: "64px 0 40px" }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: "#f0fdf4", border: "1px solid #bbf7d0",
              borderRadius: 999, padding: "4px 12px", marginBottom: 20,
              fontSize: 12, fontWeight: 600, color: "#15803d", letterSpacing: 0.3,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#16a34a", display: "inline-block" }} />
              Updated nightly from NYC Open Data
            </div>
            <h1 style={{
              fontSize: "clamp(2rem, 5vw, 3rem)", fontWeight: 800,
              color: "#0f172a", lineHeight: 1.1, margin: "0 0 16px",
              letterSpacing: "-0.03em",
            }}>
              Know before you go.
            </h1>
            <p style={{ fontSize: 18, color: "#64748b", margin: "0 0 40px", lineHeight: 1.6, maxWidth: 480, marginLeft: "auto", marginRight: "auto" }}>
              Predict any NYC restaurant&apos;s next health inspection risk — before the inspector shows up.
            </p>
          </div>
        )}

        {/* Search */}
        <div ref={containerRef} style={{ position: "relative", marginBottom: selected ? 32 : 0 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14,
            padding: "12px 16px",
            boxShadow: dropdownOpen ? "0 0 0 3px rgba(59,130,246,0.12), 0 4px 16px rgba(0,0,0,0.08)" : "0 2px 8px rgba(0,0,0,0.06)",
            transition: "box-shadow 0.15s",
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={inputRef}
              placeholder="Search any NYC restaurant…"
              value={q}
              onChange={e => { setQ(e.target.value); if (selected) { setSelected(null); setScore(null); } }}
              onKeyDown={onInputKeyDown}
              onFocus={() => { if (hits.length) setDropdownOpen(true); }}
              aria-label="Search restaurants"
              style={{
                flex: 1, border: "none", outline: "none", fontSize: 16,
                background: "transparent", color: "#0f172a",
              }}
            />
            {searchLoading && <Spinner />}
            {q && (
              <button onClick={handleClear} aria-label="Clear search" style={{
                border: "none", background: "none", cursor: "pointer", padding: 4,
                color: "#94a3b8", display: "flex", alignItems: "center", borderRadius: 4,
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>

          {/* Dropdown results */}
          {dropdownOpen && hits.length > 0 && (
            <div style={{
              position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 50,
              background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14,
              boxShadow: "0 8px 32px rgba(0,0,0,0.12)", overflow: "hidden",
              maxHeight: 360, overflowY: "auto",
            }}>
              {suggestion && (
                <div style={{ padding: "8px 14px", background: "#eff6ff", fontSize: 13, color: "#1d4ed8", borderBottom: "1px solid #e2e8f0" }}>
                  Showing results for &ldquo;{suggestion}&rdquo;
                </div>
              )}
              {hits.map((h, i) => {
                const active = i === highlighted;
                return (
                  <button
                    key={h.camis}
                    ref={el => { itemRefs.current[h.camis] = el; }}
                    onClick={() => selectHit(h)}
                    style={{
                      display: "flex", width: "100%", textAlign: "left",
                      padding: "12px 16px", alignItems: "center", gap: 12,
                      background: active ? "#f8fafc" : "#fff",
                      border: "none", borderBottom: "1px solid #f1f5f9",
                      cursor: "pointer", outline: "none",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{h.name}</div>
                      <div style={{ fontSize: 12, color: "#64748b", marginTop: 1 }}>{h.address}</div>
                    </div>
                    <span style={{
                      fontSize: 10, padding: "2px 8px", borderRadius: 999, flexShrink: 0,
                      background: "#f1f5f9", color: "#475569",
                      textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600,
                    }}>{h.boro || "NYC"}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Inline feedback (no results, error) */}
          {noResults && (
            <div style={{ marginTop: 8, fontSize: 13, color: "#64748b" }}>
              No results for &ldquo;{q}&rdquo; — try fewer words or part of the name.
            </div>
          )}
          {searchErr && <div style={{ marginTop: 8, fontSize: 13, color: "#ef4444" }}>Error: {searchErr}</div>}
        </div>

        {/* Score card */}
        {(selected || scoreLoading) && (
          <div>
            {/* Restaurant header */}
            {selected && (
              <div className="restaurant-header" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
                <div>
                  <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#0f172a", margin: 0, lineHeight: 1.2 }}>{selected.name}</h1>
                  {selected.address && <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>{selected.address}{selected.boro ? ` · ${selected.boro}` : ""}</div>}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={async () => { const ok = await copyText(deepLink); showToast(ok ? "Link copied!" : "Copy failed"); }}
                    disabled={!score} style={{
                      padding: "6px 12px", border: "1px solid #e2e8f0", borderRadius: 8,
                      background: "#fff", fontSize: 13, cursor: score ? "pointer" : "not-allowed",
                      opacity: score ? 1 : 0.4, color: "#334155", fontWeight: 500,
                    }}>Share</button>
                  <button onClick={async () => { const ok = await copyText(JSON.stringify(score, null, 2)); showToast(ok ? "Copied!" : "Failed"); }}
                    disabled={!score} style={{
                      padding: "6px 12px", border: "1px solid #e2e8f0", borderRadius: 8,
                      background: "#fff", fontSize: 13, cursor: score ? "pointer" : "not-allowed",
                      opacity: score ? 1 : 0.4, color: "#334155", fontWeight: 500,
                    }}>Copy JSON</button>
                </div>
              </div>
            )}

            {scoreLoading && (
              <div style={{ textAlign: "center", padding: 60, color: "#64748b" }}>
                <Spinner /><div style={{ marginTop: 12, fontSize: 14 }}>Scoring…</div>
              </div>
            )}
            {scoreErr && (
              <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, padding: 16, color: "#ef4444", fontSize: 14 }}>
                Error: {scoreErr}
              </div>
            )}

            {score && (
              <div style={{ display: "grid", gap: 16 }}>
                {/* Top row: risk + last inspection */}
                <div className="grid-2col">
                  {/* Risk score */}
                  <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 24, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>Risk Score</div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
                      <span style={{ fontSize: "2.8rem", fontWeight: 800, color: riskColor(score.prob_bc), lineHeight: 1 }}>
                        {(score.prob_bc * 100).toFixed(0)}%
                      </span>
                      <span style={{
                        fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 999,
                        background: riskColor(score.prob_bc) + "18",
                        color: riskColor(score.prob_bc),
                        border: `1px solid ${riskColor(score.prob_bc)}30`,
                      }}>{riskLabel(score.prob_bc)}</span>
                    </div>
                    <div style={{ fontSize: 13, color: "#64748b", marginBottom: 12 }}>chance of B or C next inspection</div>
                    <div style={{ height: 6, background: "#f1f5f9", borderRadius: 999, overflow: "hidden" }}>
                      <div style={{
                        width: `${Math.max(2, Math.min(100, score.prob_bc * 100))}%`,
                        height: "100%", background: riskColor(score.prob_bc),
                        borderRadius: 999, transition: "width 0.5s ease",
                      }} />
                    </div>
                    {score.top_reasons && score.top_reasons.length > 0 && (
                      <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {score.top_reasons.map((r, i) => (
                          <span key={i} style={{
                            fontSize: 11, padding: "2px 8px", borderRadius: 999,
                            background: "#f8fafc", border: "1px solid #e2e8f0", color: "#475569",
                          }}>{r}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Last inspection */}
                  <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 24, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>Last Inspection</div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                      <div style={{
                        width: 52, height: 52, borderRadius: 10, fontWeight: 800, fontSize: 22,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: score.last_grade ? gradeColor(score.last_grade) + "18" : "#f1f5f9",
                        color: gradeColor(score.last_grade),
                        border: `2px solid ${gradeColor(score.last_grade)}40`,
                      }}>{score.last_grade ?? "—"}</div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 24, fontWeight: 700, color: "#0f172a" }}>{score.last_points ?? "—"}</div>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>points</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>
                      {score.last_inspection_date ? `Inspected ${score.last_inspection_date}` : "No date on record"}
                    </div>
                    {score.predicted_points != null && (
                      <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>
                        Predicted next: <strong style={{ color: "#0f172a" }}>{score.predicted_points} pts</strong>
                      </div>
                    )}
                  </div>
                </div>

                {/* Rat pressure */}
                <div className="rat-bar" style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.05)", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                  <Tooltip label={dedent(`
                    Local Rat Pressure combines two signals near the restaurant (≈150–200m cell):
                    • 311 rodent complaints in the last 180 days
                    • DOHMH rat inspection failures in the last 365 days
                    Normalized into a 0–1 index.
                    Low <0.2 · Moderate 0.2–0.4 · Elevated 0.4–0.6 · High 0.6–0.8 · Very High ≥0.8
                  `)}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "default" }}>
                      <span style={{ fontSize: 24 }}>🐀</span>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5 }}>Local Rat Pressure</div>
                        <div style={{ fontWeight: 700, fontSize: 18, color: ratPressureColor(score.rat_index) }}>
                          {ratPressureLabel(score.rat_index)}
                          <InfoIcon style={{ color: "#cbd5e1", marginLeft: 5, verticalAlign: "middle" }} />
                        </div>
                      </div>
                    </div>
                  </Tooltip>
                  <div className="rat-stats" style={{ display: "flex", gap: 20, marginLeft: "auto", flexWrap: "wrap" }}>
                    {[
                      { label: "Rat index", value: score.rat_index != null ? score.rat_index.toFixed(2) : "—" },
                      { label: "311 (180d)", value: score.rat311_cnt_180d_k1 ?? "—" },
                      { label: "Fails (365d)", value: score.ratinsp_fail_365d_k1 ?? "—" },
                    ].map(stat => (
                      <div key={stat.label} style={{ textAlign: "center" }}>
                        <div style={{ fontWeight: 700, fontSize: 18, color: "#0f172a" }}>{stat.value}</div>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>{stat.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Violations + map */}
                <div className={score.latitude != null ? "grid-2col" : ""} style={{ display: "grid", gap: 16 }}>
                  {/* Violations */}
                  {score.top_violation_probs && score.top_violation_probs.length > 0 && (
                    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 24, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 14 }}>Likely Next Violations</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {score.top_violation_probs.slice(0, 2).map((v, i) => (
                          <div key={i}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, gap: 8 }}>
                              <span style={{ fontSize: 13, color: "#334155", flex: 1, lineHeight: 1.3 }}>{v.label}</span>
                              <span style={{ fontWeight: 700, fontSize: 13, color: riskColor(v.probability), flexShrink: 0 }}>
                                {(v.probability * 100).toFixed(0)}%
                              </span>
                            </div>
                            <div style={{ height: 4, background: "#f1f5f9", borderRadius: 999, overflow: "hidden" }}>
                              <div style={{ width: `${Math.min(100, v.probability * 100)}%`, height: "100%", background: riskColor(v.probability), borderRadius: 999 }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Map */}
                  {score.latitude != null && score.longitude != null && (
                    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
                      <iframe
                        title="Restaurant location"
                        src={osmEmbedSrc(score.latitude, score.longitude)}
                        style={{ width: "100%", height: "100%", minHeight: 180, border: 0, display: "block" }}
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Empty state: stats + examples */}
        {!selected && !scoreLoading && (
          <div style={{ marginTop: 40 }}>

            {/* Stats bar */}
            <div className="grid-stats" style={{ marginBottom: 40 }}>
              {[
                { value: "26,000+", label: "Restaurants tracked" },
                { value: "Nightly", label: "Data refresh" },
                { value: "5 signals", label: "Per prediction" },
                { value: "Free", label: "No account needed" },
              ].map((s, i) => (
                <div key={s.label} style={{
                  flex: 1, textAlign: "center", padding: "20px 12px",
                  borderLeft: i > 0 ? "1px solid #f1f5f9" : "none",
                }}>
                  <div style={{ fontWeight: 800, fontSize: 20, color: "#0f172a" }}>{s.value}</div>
                  <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Example restaurants */}
            <div className="examples-header" style={{ marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#0f172a" }}>Try an example</div>
              <div style={{ fontSize: 12, color: "#94a3b8" }}>Click any restaurant to see its risk score</div>
            </div>
            <div className="grid-examples">
              {EXAMPLES.map(ex => (
                <button
                  key={ex.camis}
                  onClick={() => selectHit(ex)}
                  style={{
                    display: "flex", flexDirection: "column", textAlign: "left",
                    padding: "16px 18px", background: "#fff",
                    border: "1px solid #e2e8f0", borderRadius: 14,
                    cursor: "pointer", transition: "box-shadow 0.15s, border-color 0.15s",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.1)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#cbd5e1"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 1px 3px rgba(0,0,0,0.04)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#e2e8f0"; }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, width: "100%" }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a", lineHeight: 1.3 }}>{ex.name}</div>
                    <span style={{
                      fontSize: 10, padding: "2px 7px", borderRadius: 999, flexShrink: 0,
                      background: "#f1f5f9", color: "#475569",
                      textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600,
                    }}>{ex.boro}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{ex.address}</div>
                  <div style={{ marginTop: 12, fontSize: 12, color: "#3b82f6", fontWeight: 600 }}>
                    View risk score →
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Toast */}
      {toast && (
        <div role="status" aria-live="polite" style={{
          position: "fixed", left: "50%", bottom: "calc(24px + env(safe-area-inset-bottom))",
          transform: "translateX(-50%)",
          background: "#0f172a", color: "#f8fafc",
          padding: "10px 18px", borderRadius: 10,
          boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
          fontSize: 14, fontWeight: 500, zIndex: 9999, pointerEvents: "none",
          animation: "toastfade 200ms ease-out",
        }}>
          {toast}
        </div>
      )}
    </>
  );
}
