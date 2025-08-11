import { useEffect, useRef, useState } from "react";

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

export default function Home() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [attemptedFallback, setAttemptedFallback] = useState(false);

  const [selected, setSelected] = useState<Hit | null>(null);
  const [score, setScore] = useState<ScoreResp | null>(null);
  const [scoreLoading, setScoreLoading] = useState(false);
  const [scoreErr, setScoreErr] = useState<string | null>(null);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function runSearch(term: string, { allowFallback }: { allowFallback: boolean }) {
    setSearchLoading(true);
    setSearchErr(null);
    setScore(null);
    setSelected(null);
    setSuggestion(null);

    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    try {
      const r = await fetch(`${API_BASE}/search?name=${encodeURIComponent(term)}`, {
        signal: abortRef.current.signal,
      });
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      const data = (await r.json()) as Hit[];

      if (data.length === 0 && allowFallback) {
        // try a softer query once
        const soft = softNormalize(term);
        if (soft && soft !== term) {
          setAttemptedFallback(true);
          const r2 = await fetch(`${API_BASE}/search?name=${encodeURIComponent(soft)}`, {
            signal: abortRef.current.signal,
          });
          if (r2.ok) {
            const data2 = (await r2.json()) as Hit[];
            if (data2.length > 0) {
              setSuggestion(soft);
              setHits(data2);
              return;
            }
          }
        }
      }

      setHits(data);
    } catch (err: unknown) {
      if (!isAbortError(err)) setSearchErr(getErrorMessage(err));
    } finally {
      setSearchLoading(false);
    }
  }

  useEffect(() => {
    if (!API_BASE) return;
    if (q.trim().length < 2) {
      setHits([]);
      setSearchErr(null);
      setSuggestion(null);
      setAttemptedFallback(false);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => runSearch(q, { allowFallback: true }), 350);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q]);

  const runScore = async (camis: string) => {
    setScoreLoading(true);
    setScoreErr(null);
    setScore(null);
    try {
      const r = await fetch(`${API_BASE}/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ camis }),
      });
      if (!r.ok) { const t = await r.text(); throw new Error(`${r.status}: ${t}`); }
      const data = (await r.json()) as ScoreResp;
      setScore(data);
    } catch (err: unknown) {
      setScoreErr(getErrorMessage(err));
    } finally {
      setScoreLoading(false);
    }
  };

  const noResults = !searchLoading && !searchErr && q.trim().length >= 2 && hits.length === 0;

  return (
    <main style={{ maxWidth: 820, margin: "2rem auto", padding: "0 1rem", fontFamily: "ui-sans-serif, system-ui" }}>
      <h1 style={{ fontSize: "1.8rem", marginBottom: 8 }}>DineSafe NYC — Compliance Coach</h1>
      <p style={{ color: "#555", marginTop: 0 }}>Type a NYC restaurant name to search, then click one to see predicted next-inspection risk.</p>

      {!API_BASE && (
        <p style={{ background: "#fff3cd", padding: 12, borderRadius: 8, border: "1px solid #ffe58f" }}>
          <b>Heads up:</b> Set <code>NEXT_PUBLIC_API_BASE</code> to your Cloud Run URL to use the API.
        </p>
      )}

      <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
        <input
          placeholder="e.g. pizza, sushi, coffee"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ padding: "0.65rem 0.8rem", border: "1px solid #ccc", borderRadius: 10 }}
        />
        {searchLoading && <div aria-live="polite">Searching…</div>}
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
            <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 8, maxHeight: 360, overflowY: "auto" }}>
              {hits.map((h) => (
                <button
                  key={h.camis}
                  onClick={() => { setSelected(h); runScore(h.camis); }}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 12px",
                    border: "1px solid #eee",
                    borderRadius: 10,
                    margin: "6px 0",
                    background: "#fff",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontWeight: 600, color: "#000" }}>{h.name}</div>
                  <div style={{ fontSize: 13, color: "#555" }}>
                    {h.boro} • {h.address}
                  </div>
                  <div style={{ fontSize: 12, color: "#888" }}>CAMIS: {h.camis}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {selected && (
        <div style={{ marginTop: 24 }}>
          <h2 style={{ marginBottom: 8, position: "sticky", top: 0, background: "#fff" }}>{selected.name} Risk Summary</h2>
          <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 16 }}>
            {scoreLoading && <div>Scoring…</div>}
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
    </main>
  );
}


