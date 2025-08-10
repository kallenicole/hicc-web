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

export default function Home() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);

  const [selected, setSelected] = useState<Hit | null>(null);
  const [score, setScore] = useState<ScoreResp | null>(null);
  const [scoreLoading, setScoreLoading] = useState(false);
  const [scoreErr, setScoreErr] = useState<string | null>(null);

  const timer = useRef<any>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!API_BASE) return;
    if (q.trim().length < 2) {
      setHits([]);
      setSearchErr(null);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setSearchLoading(true);
      setSearchErr(null);
      setScore(null);
      setSelected(null);
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();
      try {
        const r = await fetch(`${API_BASE}/search?name=${encodeURIComponent(q)}`, {
          signal: abortRef.current.signal,
        });
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        const data = (await r.json()) as Hit[];
        setHits(data);
      } catch (e: any) {
        if (e.name !== "AbortError") setSearchErr(e.message || "Search failed");
      } finally {
        setSearchLoading(false);
      }
    }, 350);
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
    } catch (e: any) {
      setScoreErr(e.message || "Scoring failed");
    } finally {
      setScoreLoading(false);
    }
  };

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
        {searchLoading && <div>Searching…</div>}
        {searchErr && <div style={{ color: "crimson" }}>Error: {searchErr}</div>}

        {hits.length > 0 && (
          <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 8 }}>
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
        )}
      </div>

      {selected && (
        <div style={{ marginTop: 24 }}>
          <h2 style={{ marginBottom: 8 }}>{selected.name} Risk Summary</h2>
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
                  Next Inspection Predicted Points: {score.predicted_points ?? "—"}
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
