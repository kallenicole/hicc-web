import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import dynamic from "next/dynamic";

const NeighborhoodMap = dynamic(() => import("../components/NeighborhoodMap"), { ssr: false });

type Hit = { camis: string; name: string; address: string; boro: string };
type ViolationProb = { code: string; probability: number; label: string };
type LastViolation = { code: string; description: string; critical: boolean };
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
  pest_index?: number | null;
  rat311_cnt_180d_k1?: number | null;
  mouse311_cnt_180d_k1?: number | null;
  pest311_cnt_180d_k1?: number | null;
  ratinsp_fail_365d_k1?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  score_history?: [string, number][];
  last_violations?: LastViolation[];
  suggested_camis?: { camis: string; name: string; last_inspection_date: string | null }[];
};
type NbHit = {
  camis: string; name: string; address: string; boro: string; cuisine: string;
  last_grade: string | null; last_score: number | null; last_date: string | null; days_since: number | null;
  latitude: number | null; longitude: number | null;
};
type TopViolation = { code: string; description: string; critical: boolean; restaurant_count: number };
type BoroughStat = { boro: string; total: number; avg_score: number | null; grade_counts: { A: number; B: number; C: number }; score_trend?: number | null; critical_rate?: number | null; top_cuisine?: string | null };
type NycInsights = {
  total_restaurants: number;
  grade_counts: { A: number; B: number; C: number; ungraded: number };
  top_violations?: TopViolation[];
  borough_stats?: BoroughStat[];
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "";

function DineSafeLogo() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-label="DineSafe NYC logo">
      <circle cx="18" cy="18" r="18" fill="#1e40af" />
      {/* Fork — tines */}
      <line x1="15" y1="8" x2="15" y2="13" stroke="#93c5fd" strokeWidth="1.6" strokeLinecap="round"/>
      <line x1="18" y1="8" x2="18" y2="13" stroke="#93c5fd" strokeWidth="1.6" strokeLinecap="round"/>
      <line x1="21" y1="8" x2="21" y2="13" stroke="#93c5fd" strokeWidth="1.6" strokeLinecap="round"/>
      {/* Fork — neck curve */}
      <path d="M15 13 Q15 16 18 16 Q21 16 21 13" stroke="#93c5fd" strokeWidth="1.6" fill="none" strokeLinecap="round"/>
      {/* Fork — handle */}
      <line x1="18" y1="16" x2="18" y2="28" stroke="#93c5fd" strokeWidth="1.6" strokeLinecap="round"/>
      {/* Green check badge */}
      <circle cx="27" cy="27" r="7" fill="#0f172a" />
      <circle cx="27" cy="27" r="6" fill="#16a34a" />
      <polyline points="24,27 26.2,29.2 30,24.5" stroke="white" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

const EXAMPLE_POOL = [
  // Manhattan
  { camis: "40732665", name: "Katz's Delicatessen", address: "205 E Houston St", boro: "Manhattan" },
  { camis: "40574871", name: "Balthazar", address: "80 Spring St", boro: "Manhattan" },
  { camis: "40383464", name: "Le Bernardin", address: "155 W 51st St", boro: "Manhattan" },
  { camis: "41626762", name: "Eleven Madison Park", address: "11 Madison Ave", boro: "Manhattan" },
  { camis: "41664978", name: "Gramercy Tavern", address: "42 E 20th St", boro: "Manhattan" },
  { camis: "40665065", name: "Daniel", address: "60 E 65th St", boro: "Manhattan" },
  { camis: "41008641", name: "Per Se", address: "10 Columbus Circle", boro: "Manhattan" },
  { camis: "41067696", name: "The Modern", address: "11 W 53rd St", boro: "Manhattan" },
  { camis: "41092078", name: "Aquavit", address: "65 E 55th St", boro: "Manhattan" },
  { camis: "41543410", name: "Red Rooster Harlem", address: "310 Lenox Ave", boro: "Manhattan" },
  { camis: "50063685", name: "Emily", address: "35 Downing St", boro: "Manhattan" },
  { camis: "41636395", name: "Prince Street Pizza", address: "27 Prince St", boro: "Manhattan" },
  { camis: "50130050", name: "Scarr's Pizza", address: "35 Orchard St", boro: "Manhattan" },
  { camis: "50072055", name: "Soogil", address: "108 E 4th St", boro: "Manhattan" },
  { camis: "50069883", name: "Don Angie", address: "103 Greenwich Ave", boro: "Manhattan" },
  { camis: "50008323", name: "Via Carota", address: "51 Grove St", boro: "Manhattan" },
  { camis: "40400710", name: "Il Buco", address: "47 Bond St", boro: "Manhattan" },
  { camis: "50000989", name: "Estela", address: "47 E Houston St", boro: "Manhattan" },
  { camis: "50072570", name: "Frenchette", address: "241 W Broadway", boro: "Manhattan" },
  { camis: "41541889", name: "Buvette", address: "42 Grove St", boro: "Manhattan" },
  { camis: "50048838", name: "Le Coucou", address: "138 Lafayette St", boro: "Manhattan" },
  { camis: "50076500", name: "Atomix", address: "104 E 30th St", boro: "Manhattan" },
  { camis: "50045768", name: "Indian Accent", address: "123 W 56th St", boro: "Manhattan" },
  { camis: "50010546", name: "Dirty French", address: "180 Ludlow St", boro: "Manhattan" },
  { camis: "40577007", name: "Acme", address: "9 Great Jones St", boro: "Manhattan" },
  { camis: "40618557", name: "Cafe Mogador", address: "101 St Marks Pl", boro: "Manhattan" },
  { camis: "40384528", name: "Veselka", address: "144 Second Ave", boro: "Manhattan" },
  { camis: "50152716", name: "Shake Shack", address: "10 Columbus Circle", boro: "Manhattan" },
  { camis: "40841272", name: "Sylvia's Restaurant", address: "328 Lenox Ave", boro: "Manhattan" },
  { camis: "50012258", name: "The Halal Guys", address: "307 E 14th St", boro: "Manhattan" },
  { camis: "41718160", name: "Carbone", address: "181 Thompson St", boro: "Manhattan" },
  { camis: "50162845", name: "Keens Steakhouse", address: "72 W 36th St", boro: "Manhattan" },
  { camis: "40563475", name: "Mamoun's Falafel", address: "119 Macdougal St", boro: "Manhattan" },
  { camis: "50060822", name: "Nobu Downtown", address: "195 Broadway", boro: "Manhattan" },
  { camis: "50083194", name: "Mission Chinese Food", address: "45 Mott St", boro: "Manhattan" },
  { camis: "50131548", name: "Spicy Village", address: "68 Forsyth St", boro: "Manhattan" },
  { camis: "50001456", name: "Golden Unicorn", address: "18 E Broadway", boro: "Manhattan" },
  { camis: "50090976", name: "Nom Wah Tea Parlor", address: "10 Doyers St", boro: "Manhattan" },
  { camis: "41320866", name: "Wo Hop", address: "17 Mott St", boro: "Manhattan" },
  { camis: "50068743", name: "Jing Fong", address: "380 Amsterdam Ave", boro: "Manhattan" },
  { camis: "50149354", name: "Wondee Siam", address: "782 9th Ave", boro: "Manhattan" },
  { camis: "40365166", name: "Corner Bistro", address: "331 W 4th St", boro: "Manhattan" },
  { camis: "40559892", name: "Quality Meats", address: "57 W 58th St", boro: "Manhattan" },
  { camis: "50076528", name: "Minetta Tavern", address: "113 Macdougal St", boro: "Manhattan" },
  { camis: "41219088", name: "The Waverly Inn", address: "16 Bank St", boro: "Manhattan" },
  { camis: "40930101", name: "The Odeon", address: "145 W Broadway", boro: "Manhattan" },
  { camis: "41065858", name: "Lure Fishbar", address: "142 Mercer St", boro: "Manhattan" },
  { camis: "41543885", name: "The Dutch", address: "131 Sullivan St", boro: "Manhattan" },
  { camis: "41410205", name: "Locanda Verde", address: "377 Greenwich St", boro: "Manhattan" },
  { camis: "40393725", name: "Tribeca Grill", address: "375 Greenwich St", boro: "Manhattan" },
  { camis: "41289647", name: "Bar Boulud", address: "1900 Broadway", boro: "Manhattan" },
  { camis: "50144234", name: "Cafe Boulud", address: "100 E 63rd St", boro: "Manhattan" },
  { camis: "41576935", name: "Red Farm", address: "529 Hudson St", boro: "Manhattan" },
  { camis: "50012093", name: "Mimi Cheng's Dumplings", address: "179 2nd Ave", boro: "Manhattan" },
  { camis: "50055119", name: "Motorino", address: "510 Columbus Ave", boro: "Manhattan" },
  { camis: "50055011", name: "Fish Cheeks", address: "55 Bond St", boro: "Manhattan" },
  { camis: "50141315", name: "Somtum Der", address: "85 Ave A", boro: "Manhattan" },
  { camis: "50084368", name: "Llama San", address: "359 6th Ave", boro: "Manhattan" },
  { camis: "41322735", name: "The Ten Bells", address: "247 Broome St", boro: "Manhattan" },
  { camis: "50009899", name: "Casa Adela", address: "66 Ave C", boro: "Manhattan" },
  { camis: "40369418", name: "Caffe Reggio", address: "119 Macdougal St", boro: "Manhattan" },
  { camis: "50101068", name: "Joe's Shanghai", address: "9 Pell St", boro: "Manhattan" },
  { camis: "50127492", name: "Famous $1 Pizza", address: "333B Ave of the Americas", boro: "Manhattan" },
  // Brooklyn
  { camis: "50125951", name: "Lucali", address: "575 Henry St", boro: "Brooklyn" },
  { camis: "50088242", name: "Grimaldi's Pizzeria", address: "1 Front St", boro: "Brooklyn" },
  { camis: "40364335", name: "Peter Luger Steakhouse", address: "178 Broadway", boro: "Brooklyn" },
  { camis: "40364581", name: "Junior's", address: "386 Flatbush Ave Ext", boro: "Brooklyn" },
  { camis: "41700297", name: "Juliana's Pizza", address: "19 Old Fulton St", boro: "Brooklyn" },
  { camis: "50000923", name: "Di Fara Pizzeria", address: "1424 Avenue J", boro: "Brooklyn" },
  { camis: "40561290", name: "Totonno's Pizzeria", address: "1524 Neptune Ave", boro: "Brooklyn" },
  { camis: "40369608", name: "The River Cafe", address: "1 Water St", boro: "Brooklyn" },
  { camis: "50038241", name: "Kings County Imperial", address: "20 Skillman Ave", boro: "Brooklyn" },
  { camis: "50108910", name: "Maison Premiere", address: "298 Bedford Ave", boro: "Brooklyn" },
  { camis: "50008761", name: "Meadowsweet", address: "149 Broadway", boro: "Brooklyn" },
  { camis: "50103170", name: "Llama Inn", address: "50 Withers St", boro: "Brooklyn" },
  { camis: "50009225", name: "Chuko", address: "565 Vanderbilt Ave", boro: "Brooklyn" },
  { camis: "50081649", name: "Paulie Gee's Slice Shop", address: "110 Franklin St", boro: "Brooklyn" },
  { camis: "41307383", name: "Roberta's", address: "43 Bogart St", boro: "Brooklyn" },
  { camis: "50068078", name: "Ugly Baby", address: "407 Smith St", boro: "Brooklyn" },
  { camis: "50034287", name: "The Four Horsemen", address: "295 Grand St", boro: "Brooklyn" },
  { camis: "50017938", name: "Lilia", address: "567 Union Ave", boro: "Brooklyn" },
  { camis: "41583046", name: "Rucola", address: "190 Dean St", boro: "Brooklyn" },
  { camis: "40661290", name: "Al Di La Trattoria", address: "248 5th Ave", boro: "Brooklyn" },
  { camis: "50076155", name: "Oxomoco", address: "128 Greenpoint Ave", boro: "Brooklyn" },
  { camis: "50168243", name: "Tatiana", address: "3152 Brighton 6th St", boro: "Brooklyn" },
  { camis: "50140819", name: "Kellogg's Diner", address: "518 Metropolitan Ave", boro: "Brooklyn" },
  { camis: "41227319", name: "Juliette", address: "135 N 5th St", boro: "Brooklyn" },
  { camis: "50033781", name: "Red Hook Lobster Pound", address: "284 Van Brunt St", boro: "Brooklyn" },
  { camis: "50088434", name: "Hometown Bar-B-Que", address: "87 35th St", boro: "Brooklyn" },
  { camis: "41610168", name: "Chez Ma Tante", address: "90 Calyer St", boro: "Brooklyn" },
  { camis: "50056175", name: "Sunday in Brooklyn", address: "348 Wythe Ave", boro: "Brooklyn" },
  { camis: "41305003", name: "Hotel Delmano", address: "82 Berry St", boro: "Brooklyn" },
  { camis: "41368926", name: "Vinegar Hill House", address: "72 Hudson Ave", boro: "Brooklyn" },
  { camis: "50007909", name: "Clover Club", address: "210 Smith St", boro: "Brooklyn" },
  { camis: "41229111", name: "Hungry Ghost", address: "183 Sterling Pl", boro: "Brooklyn" },
  // Queens
  { camis: "41215188", name: "De Mole", address: "45-02 48th Ave", boro: "Queens" },
  { camis: "40366230", name: "Don Peppe", address: "135-58 Lefferts Blvd", boro: "Queens" },
  { camis: "40365841", name: "Park Side", address: "107-01 Corona Ave", boro: "Queens" },
  { camis: "50164818", name: "Jora", address: "47-46 11th St", boro: "Queens" },
  // Bronx
  { camis: "50042128", name: "The Bronx Beer Hall", address: "2344 Arthur Ave", boro: "Bronx" },
  { camis: "50000589", name: "El Nuevo Bohio", address: "791 E Tremont Ave", boro: "Bronx" },
  { camis: "41402869", name: "La Morada", address: "308 Willis Ave", boro: "Bronx" },
];
function pickExamples(pool: typeof EXAMPLE_POOL, n = 6) {
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function softNormalize(s: string) {
  return s.replace(/[^a-z0-9\s]/gi, "").replace(/(.)\1{2,}/gi, "$1$1").trim();
}
function toTitleCase(s: string) {
  return s.toLowerCase().replace(/(?:^|[\s\-\/])\S/g, c => c.toUpperCase());
}
function inferGrade(grade?: string | null, points?: number | null): string | null {
  if (grade === "A" || grade === "B" || grade === "C") return grade;
  if (points == null) return null;
  if (points <= 13) return "A";
  if (points <= 27) return "B";
  return "C";
}
function truncateLabel(s: string, max = 72) {
  return s.length > max ? s.slice(0, max).trimEnd() + "…" : s;
}
function formatAddress(address: string, boro?: string): string {
  // Strip trailing zip code (5 digits) the API appends to the address
  const stripped = address.replace(/\s+\d{5}\s*$/, "").trim();
  const titled = toTitleCase(stripped);
  return boro ? `${titled} · ${boro}` : titled;
}
function formatDate(iso?: string | null): string {
  if (!iso) return "";
  try {
    const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  } catch { return iso; }
}
function daysAgo(iso?: string | null): string | null {
  if (!iso) return null;
  try {
    const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
    const diff = Math.floor((Date.now() - new Date(y, m - 1, d).getTime()) / 86400000);
    if (diff === 0) return "today";
    if (diff === 1) return "yesterday";
    if (diff < 30) return `${diff} days ago`;
    const months = Math.round(diff / 30);
    if (diff < 365) return `${months} ${months === 1 ? "month" : "months"} ago`;
    return `${(diff / 365).toFixed(1)} years ago`;
  } catch { return null; }
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
function leafletSrcDoc(lat: number, lon: number) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>html,body,#map{margin:0;padding:0;width:100%;height:100%;}</style>
</head><body><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var map=L.map('map',{zoomControl:true,scrollWheelZoom:false,attributionControl:true}).setView([${lat},${lon}],16);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,detectRetina:true,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map);
L.marker([${lat},${lon}]).addTo(map);
</script></body></html>`;
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
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", close, true);
    document.addEventListener("touchstart", close, true);
    return () => {
      document.removeEventListener("mousedown", close, true);
      document.removeEventListener("touchstart", close, true);
    };
  }, [open]);

  return (
    <span ref={ref} style={{ position: "relative", display: "inline-flex", alignItems: "center" }}
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
      onClick={e => { e.stopPropagation(); setOpen(o => !o); }}>
      {children}
      <span role="tooltip" style={{
        position: "absolute",
        bottom: "calc(100% + 8px)",
        left: "50%",
        transform: "translateX(-50%)",
        background: "#1e293b", borderRadius: 10, padding: "10px 14px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
        fontSize: 12, color: "#f1f5f9", whiteSpace: "pre-wrap",
        width: "min(280px, 80vw)",
        lineHeight: 1.6, zIndex: 9998,
        opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none",
        transition: "opacity 60ms ease",
      }}>{label}</span>
    </span>
  );
}

function ScoreHistoryChart({ history }: { history: [string, number][] }) {
  if (history.length < 2) return null;
  const W = 320, H = 120, PAD = { t: 12, r: 12, b: 28, l: 36 };
  const xs = history.map((_, i) => PAD.l + (i / (history.length - 1)) * (W - PAD.l - PAD.r));
  const scores = history.map(([, s]) => s);
  const minS = Math.min(...scores, 0), maxS = Math.max(...scores, 28);
  const range = maxS - minS || 1;
  const yOf = (s: number) => PAD.t + (1 - (s - minS) / range) * (H - PAD.t - PAD.b);
  const pts = xs.map((x, i) => `${x},${yOf(scores[i])}`).join(" ");

  // grade zone bands
  const aTop = yOf(13), aBot = yOf(0);
  const bTop = yOf(27), bBot = yOf(13);
  const cTop = yOf(maxS), cBot = yOf(27);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} aria-label="Score history chart">
      {/* grade zone bands */}
      {aBot > aTop && <rect x={PAD.l} y={aTop} width={W - PAD.l - PAD.r} height={aBot - aTop} fill="#16a34a10" />}
      {bBot > bTop && <rect x={PAD.l} y={bTop} width={W - PAD.l - PAD.r} height={bBot - bTop} fill="#f59e0b10" />}
      {cBot > cTop && <rect x={PAD.l} y={cTop} width={W - PAD.l - PAD.r} height={cBot - cTop} fill="#ef444410" />}
      {/* y-axis labels */}
      {[0, 13, 27].map(v => (
        <text key={v} x={PAD.l - 4} y={yOf(v) + 4} textAnchor="end" fontSize={8} fill="#94a3b8">{v}</text>
      ))}
      {/* x-axis date labels (first and last) */}
      <text x={xs[0]} y={H - 4} textAnchor="start" fontSize={8} fill="#94a3b8">{history[0][0].slice(0, 7)}</text>
      <text x={xs[xs.length - 1]} y={H - 4} textAnchor="end" fontSize={8} fill="#94a3b8">{history[history.length - 1][0].slice(0, 7)}</text>
      {/* line */}
      <polyline points={pts} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {/* dots */}
      {xs.map((x, i) => (
        <circle key={i} cx={x} cy={yOf(scores[i])} r={3} fill="#3b82f6" />
      ))}
    </svg>
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
  const [dataRefreshed, setDataRefreshed] = useState<string | null>(null);
  const [nbZip, setNbZip] = useState("");
  const [nbQueriedZip, setNbQueriedZip] = useState<string | null>(null);
  const [nbResults, setNbResults] = useState<NbHit[]>([]);
  const [nbLoading, setNbLoading] = useState(false);
  const [nbErr, setNbErr] = useState<string | null>(null);
  const [nbCuisineFilter, setNbCuisineFilter] = useState<string | null>(null);
  const nbInputRef = useRef<HTMLInputElement>(null);
  const [insights, setInsights] = useState<NycInsights | null>(null);
  const [examples] = useState(() => pickExamples(EXAMPLE_POOL));

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 1800); };

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const suppressSearch = useRef(false);
  const suppressRouteEffect = useRef(false);

  const deepLink = useMemo(() => {
    if (!selected) return "";
    const base = typeof window !== "undefined" ? window.location.origin : "";
    const q = new URLSearchParams({ camis: selected.camis, name: selected.name, address: selected.address, boro: selected.boro });
    return `${base}${router.pathname}?${q.toString()}`;
  }, [selected, router.pathname]);

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
    if (suppressSearch.current) { suppressSearch.current = false; return; }
    if (q.trim().length < 2) { setHits([]); setSearchErr(null); setSuggestion(null); setHighlighted(-1); setDropdownOpen(false); return; }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => runSearch(q, { allowFallback: true }), 350);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q]);

  useEffect(() => {
    if (!router.isReady) return;
    if (suppressRouteEffect.current) { suppressRouteEffect.current = false; return; }
    const { camis, name, address, boro } = router.query;
    if (typeof camis === "string" && camis.trim()) {
      const hit: Hit = {
        camis,
        name: typeof name === "string" && name ? name : `Restaurant ${camis}`,
        address: typeof address === "string" ? address : "",
        boro: typeof boro === "string" ? boro : "",
      };
      suppressSearch.current = true;
      setSelected(hit);
      setQ(toTitleCase(hit.name));
      runScore(camis);
    } else {
      setSelected(null);
      setScore(null);
      setScoreErr(null);
      setQ("");
      setHits([]);
    }
  }, [router.isReady, router.query]);

  useEffect(() => {
    if (!API_BASE) return;
    fetch(`${API_BASE}/metadata`).then(r => r.ok ? r.json() : null).then(d => {
      if (d?.last_refreshed) setDataRefreshed(d.last_refreshed);
    }).catch(() => {});
    fetch(`${API_BASE}/insights`).then(r => r.ok ? r.json() : null).then(d => {
      if (d) setInsights(d as NycInsights);
    }).catch(() => {});
  }, []);

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

  const runNeighborhood = async (zip: string) => {
    if (zip.length !== 5 || !/^\d{5}$/.test(zip)) return;
    setNbLoading(true); setNbErr(null); setNbResults([]); setNbQueriedZip(zip); setNbCuisineFilter(null);
    try {
      const r = await fetch(`${API_BASE}/neighborhood?zip=${zip}&limit=500`);
      if (!r.ok) { const t = await r.text(); throw new Error(`${r.status}: ${t}`); }
      setNbResults(await r.json() as NbHit[]);
    } catch (err) { setNbErr(getErrorMessage(err)); }
    finally { setNbLoading(false); }
  };

  const selectHit = (h: Hit) => {
    suppressSearch.current = true;
    suppressRouteEffect.current = true;
    setSelected(h); setQ(toTitleCase(h.name)); setDropdownOpen(false); setHits([]);
    if (timer.current) clearTimeout(timer.current);
    if (abortRef.current) abortRef.current.abort();
    runScore(h.camis);
    router.push({ pathname: router.pathname, query: { camis: h.camis, name: h.name, address: h.address, boro: h.boro } }, undefined, { shallow: true });
  };

  const handleClear = () => {
    setQ(""); setHits([]);
    setDropdownOpen(false); setHighlighted(-1);
    inputRef.current?.focus();
  };
  const handleHome = () => {
    suppressRouteEffect.current = true;
    setQ(""); setHits([]); setSelected(null); setScore(null); setScoreErr(null);
    setDropdownOpen(false); setHighlighted(-1);
    router.replace({ pathname: router.pathname, query: {} }, undefined, { shallow: true });
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

  const noResults = !searchLoading && !searchErr && q.trim().length >= 2 && hits.length === 0 && !selected;

  const pageTitle = selected ? `${toTitleCase(selected.name)} · DineSafe NYC` : "DineSafe NYC — NYC Restaurant Health Inspection Risk";
  const pageDesc = selected
    ? `Health inspection risk score for ${toTitleCase(selected.name)} in ${selected.boro || "NYC"}. See last inspection grade, violation history, and predicted next inspection risk.`
    : "Predict any NYC restaurant's next health inspection risk. See violation history, grade trends, and local rodent pressure — updated nightly from NYC Open Data.";

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDesc} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDesc} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={pageDesc} />
      </Head>

      {/* Header */}
      <header style={{ background: "#0f172a", borderBottom: "1px solid #1e293b" }}>
        <div className="site-header-inner" style={{ maxWidth: 860, margin: "0 auto", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button onClick={handleHome} style={{ display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
            <DineSafeLogo />
            <div style={{ textAlign: "left" }}>
              <div style={{ fontWeight: 700, fontSize: "1rem", color: "#f8fafc", letterSpacing: "-0.01em" }}>DineSafe NYC</div>
              <div style={{ fontSize: 11, color: "#64748b" }}>Health Inspection Compliance Coach</div>
            </div>
          </button>
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
        <div ref={containerRef} style={{ position: "relative", marginBottom: selected ? 32 : 0, marginTop: selected ? 32 : 0 }}>
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
              onChange={e => { setQ(e.target.value); }}
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
                      <div style={{ fontWeight: 600, fontSize: 14, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{toTitleCase(h.name)}</div>
                      <div style={{ fontSize: 12, color: "#64748b", marginTop: 1 }}>{formatAddress(h.address)}</div>
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
                  <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#0f172a", margin: 0, lineHeight: 1.2 }}>{toTitleCase(selected.name)}</h1>
                  {selected.address && <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>{formatAddress(selected.address, selected.boro)}</div>}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={async () => { const ok = await copyText(deepLink); showToast(ok ? "Link copied!" : "Copy failed"); }}
                    disabled={!score} style={{
                      padding: "6px 12px", border: "1px solid #e2e8f0", borderRadius: 8,
                      background: "#fff", fontSize: 13, cursor: score ? "pointer" : "not-allowed",
                      opacity: score ? 1 : 0.4, color: "#334155", fontWeight: 500,
                    }}>Share</button>
                </div>
              </div>
            )}

            {scoreLoading && (
              <div style={{ display: "grid", gap: 16 }}>
                <div className="grid-2col">
                  {[1, 2].map(i => (
                    <div key={i} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 24, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
                      <div style={{ width: 80, height: 10, borderRadius: 6, background: "#f1f5f9", marginBottom: 16 }} />
                      <div style={{ width: 120, height: 40, borderRadius: 8, background: "#f1f5f9", marginBottom: 12 }} />
                      <div style={{ width: "100%", height: 8, borderRadius: 6, background: "#f1f5f9", marginBottom: 8 }} />
                      <div style={{ width: "60%", height: 8, borderRadius: 6, background: "#f1f5f9" }} />
                    </div>
                  ))}
                </div>
                <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
                  <div style={{ width: 140, height: 10, borderRadius: 6, background: "#f1f5f9", marginBottom: 12 }} />
                  <div style={{ width: "100%", height: 8, borderRadius: 6, background: "#f1f5f9" }} />
                </div>
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
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5 }}>Last Inspection</span>
                      {(() => {
                        if (!score.last_inspection_date) return null;
                        const [y, m, d] = score.last_inspection_date.slice(0, 10).split("-").map(Number);
                        const days = Math.floor((Date.now() - new Date(y, m - 1, d).getTime()) / 86400000);
                        if (days <= 30) return (
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
                            background: "#f0fdf4", color: "#15803d",
                            border: "1px solid #bbf7d0",
                          }}>Recently inspected</span>
                        );
                        if (days >= 730) return (
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
                            background: "#fffbeb", color: "#92400e",
                            border: "1px solid #fde68a",
                          }}>Data may be stale</span>
                        );
                        return null;
                      })()}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                      {(() => {
                        const g = inferGrade(score.last_grade, score.last_points);
                        return (
                          <div style={{
                            width: 52, height: 52, borderRadius: 10, fontWeight: 800, fontSize: 22,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            background: g ? gradeColor(g) + "18" : "#f1f5f9",
                            color: gradeColor(g),
                            border: `2px solid ${gradeColor(g)}40`,
                          }}>{g ?? "—"}</div>
                        );
                      })()}
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 24, fontWeight: 700, color: "#0f172a" }}>{score.last_points ?? "—"}</div>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>points</div>
                      </div>
                    </div>
                    {/* Grade scale */}
                    <div style={{ display: "flex", gap: 0, marginBottom: 14, borderRadius: 8, overflow: "hidden", border: "1px solid #e2e8f0", fontSize: 11 }}>
                      {(["A", "B", "C"] as const).map((g, i) => (
                        <div key={g} style={{
                          flex: 1, textAlign: "center", padding: "5px 4px",
                          background: inferGrade(score.last_grade, score.last_points) === g ? gradeColor(g) + "18" : "#fafafa",
                          borderRight: i < 2 ? "1px solid #e2e8f0" : "none",
                        }}>
                          <span style={{ fontWeight: 700, color: gradeColor(g) }}>{g}</span>
                          <span style={{ color: "#94a3b8", marginLeft: 3 }}>
                            {g === "A" ? "0–13" : g === "B" ? "14–27" : "28+"} pts
                          </span>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>
                      {score.last_inspection_date
                        ? <>{formatDate(score.last_inspection_date)}<span style={{ color: "#cbd5e1", margin: "0 4px" }}>·</span>{daysAgo(score.last_inspection_date)}</>
                        : "No date on record"}
                    </div>
                    {score.predicted_points != null && (
                      <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>
                        Predicted next: <strong style={{ color: "#0f172a" }}>{score.predicted_points} pts</strong>
                      </div>
                    )}
                    {score.suggested_camis && score.suggested_camis.length > 0 && (
                      <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #f1f5f9" }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#92400e", marginBottom: 6 }}>
                          Newer record found at this address — ownership may have changed:
                        </div>
                        {score.suggested_camis.map(s => (
                          <button key={s.camis} onClick={() => selectHit({ camis: s.camis, name: s.name, address: "", boro: "" })}
                            style={{ display: "block", width: "100%", textAlign: "left", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "7px 10px", marginBottom: 4, cursor: "pointer" }}>
                            <span style={{ fontWeight: 600, fontSize: 12, color: "#0f172a" }}>{s.name}</span>
                            {s.last_inspection_date && (
                              <span style={{ fontSize: 11, color: "#78716c", marginLeft: 6 }}>Last inspected {formatDate(s.last_inspection_date)}</span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Pest pressure */}
                <div className="rat-bar" style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 24 }}>🐀</span>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5 }}>Local Pest Pressure</div>
                        <div style={{ fontWeight: 700, fontSize: 18, color: ratPressureColor(score.pest_index ?? score.rat_index) }}>
                          {ratPressureLabel(score.pest_index ?? score.rat_index)}
                        </div>
                      </div>
                    </div>
                    <div className="rat-stats" style={{ display: "flex", gap: 24, marginLeft: "auto", flexWrap: "wrap" }}>
                      {[
                        {
                          label: "Pest Index",
                          value: (score.pest_index ?? score.rat_index) != null ? (score.pest_index ?? score.rat_index)!.toFixed(2) : "—",
                          desc: "0–1 composite score",
                          tooltip: "A 0–1 composite of nearby rat sightings, mouse sightings, indoor pest/cockroach complaints, and city rat inspection failures — normalized across all NYC restaurants.\nScale: Low <0.2 · Moderate 0.2–0.4 · Elevated 0.4–0.6 · High 0.6–0.8 · Very High ≥0.8",
                        },
                        {
                          label: "Rat Complaints",
                          value: score.rat311_cnt_180d_k1 ?? "—",
                          desc: "Last 180 days nearby",
                          tooltip: "311 rodent sighting complaints (excluding mice) filed within ≈150–200m of this restaurant over the last 180 days.",
                        },
                        {
                          label: "Mouse Complaints",
                          value: score.mouse311_cnt_180d_k1 ?? "—",
                          desc: "Last 180 days nearby",
                          tooltip: "311 mouse sighting complaints filed within ≈150–200m of this restaurant over the last 180 days.",
                        },
                        {
                          label: "Pest/Roach Complaints",
                          value: score.pest311_cnt_180d_k1 ?? "—",
                          desc: "Last 180 days nearby",
                          tooltip: "311 indoor pest complaints (cockroaches, insects) filed by residents within ≈150–200m over the last 180 days. Filed under 'Unsanitary Condition — Pests'.",
                        },
                        {
                          label: "Rat Inspection Fails",
                          value: score.ratinsp_fail_365d_k1 ?? "—",
                          desc: "Last 365 days nearby",
                          tooltip: "Number of failed DOHMH rat inspections at properties within ≈150–200m of this restaurant over the last 365 days.",
                        },
                      ].map(stat => (
                        <div key={stat.label} style={{ textAlign: "center" }}>
                          <div style={{ fontWeight: 700, fontSize: 20, color: "#0f172a" }}>{stat.value}</div>
                          <Tooltip label={stat.tooltip}>
                            <div style={{ cursor: "default" }}>
                              <div style={{ fontSize: 12, color: "#334155", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 3 }}>
                                {stat.label} <InfoIcon style={{ color: "#cbd5e1" }} />
                              </div>
                              <div style={{ fontSize: 11, color: "#94a3b8" }}>{stat.desc}</div>
                            </div>
                          </Tooltip>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Score history chart */}
                {score.score_history && score.score_history.length >= 2 && (
                  <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 24, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 14 }}>Score History</div>
                    <ScoreHistoryChart history={score.score_history as [string, number][]} />
                    <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 11, color: "#94a3b8" }}>
                      <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "#16a34a20", border: "1px solid #16a34a50", marginRight: 4 }} />A (0–13)</span>
                      <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "#f59e0b20", border: "1px solid #f59e0b50", marginRight: 4 }} />B (14–27)</span>
                      <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "#ef444420", border: "1px solid #ef444450", marginRight: 4 }} />C (28+)</span>
                      <span style={{ marginLeft: "auto" }}>{score.score_history.length} inspections</span>
                    </div>
                  </div>
                )}

                {/* Last inspection violations */}
                {score.last_violations && score.last_violations.length > 0 && (
                  <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 24, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 14 }}>
                      Last Inspection Violations
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {score.last_violations.map((v) => (
                        <div key={v.code} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                          <span style={{
                            flexShrink: 0, alignSelf: "flex-start",
                            fontSize: 10, fontWeight: 700,
                            width: 76, textAlign: "center", padding: "2px 0", borderRadius: 999,
                            background: v.critical ? "#fef2f2" : "#f8fafc",
                            color: v.critical ? "#dc2626" : "#64748b",
                            border: `1px solid ${v.critical ? "#fecaca" : "#e2e8f0"}`,
                          }}>
                            {v.critical ? "Critical" : "Not Critical"}
                          </span>
                          <div>
                            <span style={{ fontSize: 13, color: "#334155", lineHeight: 1.4 }}>{v.description}</span>
                            <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: 6 }}>{v.code}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Predicted violations + map */}
                <div className={score.latitude != null ? "grid-2col" : ""} style={{ display: "grid", gap: 16 }}>
                  {/* Violations */}
                  <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 24, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 14 }}>Likely Next Violations</div>
                    {score.top_violation_probs && score.top_violation_probs.length > 0 ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {score.top_violation_probs.slice(0, 2).map((v, i) => {
                          const displayProb = Math.min(0.9, v.probability);
                          return (
                            <div key={i}>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, gap: 8 }}>
                                <span style={{ fontSize: 13, color: "#334155", flex: 1, lineHeight: 1.3 }}>{truncateLabel(v.label)}</span>
                                <span style={{ fontWeight: 700, fontSize: 13, color: riskColor(displayProb), flexShrink: 0 }}>
                                  {(displayProb * 100).toFixed(0)}%
                                </span>
                              </div>
                              <div style={{ height: 4, background: "#f1f5f9", borderRadius: 999, overflow: "hidden" }}>
                                <div style={{ width: `${displayProb * 100}%`, height: "100%", background: riskColor(displayProb), borderRadius: 999 }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#16a34a" }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                        </svg>
                        <span style={{ fontSize: 13, fontWeight: 500 }}>No violations in last inspection — nothing to flag</span>
                      </div>
                    )}
                  </div>

                  {/* Map */}
                  {score.latitude != null && score.longitude != null && (
                    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
                      <iframe
                        title="Restaurant location"
                        srcDoc={leafletSrcDoc(score.latitude, score.longitude)}
                        style={{ width: "100%", height: "100%", minHeight: 200, border: 0, display: "block" }}
                        loading="lazy"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Empty state: stats + examples + neighborhood */}
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

            {/* NYC at a Glance */}
            {insights && (
              <div style={{ marginBottom: 40 }}>
                {/* Section header */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                  <div style={{ width: 3, borderRadius: 2, alignSelf: "stretch", background: "#1d4ed8" }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: "#0f172a" }}>NYC at a Glance</div>
                    <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 1 }}>
                      {insights.total_restaurants.toLocaleString()} restaurants · latest inspection per restaurant
                    </div>
                  </div>
                </div>

                <div style={{ display: "grid", gap: 12 }}>
                  {/* Card 1: Grade distribution + borough breakdown */}
                  <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 12 }}>Grade distribution</div>
                    {(() => {
                      const total = insights.total_restaurants;
                      const grades = [
                        { key: "A", label: "A", color: "#16a34a", count: insights.grade_counts.A },
                        { key: "B", label: "B", color: "#f59e0b", count: insights.grade_counts.B },
                        { key: "C", label: "C", color: "#ef4444", count: insights.grade_counts.C },
                        { key: "ungraded", label: "Pending", color: "#94a3b8", count: insights.grade_counts.ungraded },
                      ];
                      return (
                        <>
                          <div style={{ display: "flex", height: 24, borderRadius: 6, overflow: "hidden", gap: 2 }}>
                            {grades.map(g => {
                              const pct = (g.count / total) * 100;
                              if (pct < 0.5) return null;
                              return <div key={g.key} style={{ flex: pct, background: g.color, minWidth: 0 }} title={`${g.label}: ${g.count.toLocaleString()} (${pct.toFixed(1)}%)`} />;
                            })}
                          </div>
                          <div style={{ display: "flex", gap: 16, marginTop: 8, flexWrap: "wrap" }}>
                            {grades.map(g => (
                              <div key={g.key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                <span style={{ width: 9, height: 9, borderRadius: 2, background: g.color, flexShrink: 0, display: "inline-block" }} />
                                <span style={{ fontSize: 12, color: "#334155", fontWeight: 600 }}>{g.label}</span>
                                <span style={{ fontSize: 12, color: "#94a3b8" }}>{g.count.toLocaleString()} ({((g.count / total) * 100).toFixed(1)}%)</span>
                              </div>
                            ))}
                          </div>
                        </>
                      );
                    })()}

                    {insights.borough_stats && insights.borough_stats.length > 0 && (
                      <div style={{ marginTop: 16 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>By borough</div>
                        <div style={{ display: "grid", gap: 1, background: "#f1f5f9", borderRadius: 10, overflow: "hidden", border: "1px solid #e2e8f0" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 58px 64px 44px 44px 44px", background: "#f8fafc", padding: "6px 12px", gap: 4 }}>
                            <span />
                            <span style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textAlign: "center" }}>Avg pts</span>
                            <span style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textAlign: "center" }}>vs last yr</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: "#16a34a", textAlign: "center" }}>A</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: "#f59e0b", textAlign: "center" }}>B</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: "#ef4444", textAlign: "center" }}>C</span>
                          </div>
                          {insights.borough_stats.map(b => {
                            const trend = b.score_trend;
                            const improving = trend != null && trend < 0;
                            const worsening = trend != null && trend > 0;
                            const trendColor = improving ? "#16a34a" : worsening ? "#ef4444" : "#94a3b8";
                            const trendArrow = improving ? "↓" : worsening ? "↑" : "→";
                            const trendLabel = trend != null
                              ? `${trendArrow} ${Math.abs(trend).toFixed(1)}`
                              : "—";
                            return (
                              <div key={b.boro} style={{ display: "grid", gridTemplateColumns: "1fr 58px 64px 44px 44px 44px", background: "#fff", padding: "8px 12px", gap: 4, alignItems: "center" }}>
                                <div>
                                  <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{b.boro}</div>
                                  {b.critical_rate != null && (
                                    <div style={{ fontSize: 11, marginTop: 2, color: b.critical_rate > 40 ? "#ef4444" : b.critical_rate > 25 ? "#f59e0b" : "#94a3b8" }}>
                                      {b.critical_rate}% critical violations
                                    </div>
                                  )}
                                </div>
                                <span style={{ fontSize: 13, color: "#334155", textAlign: "center" }}>{b.avg_score ?? "—"}</span>
                                <span style={{ fontSize: 12, fontWeight: 600, color: trendColor, textAlign: "center" }}
                                  title={improving ? "Avg score improved vs last year" : worsening ? "Avg score worsened vs last year" : "Roughly flat vs last year"}>
                                  {trendLabel}
                                </span>
                                <span style={{ fontSize: 12, color: "#16a34a", textAlign: "center", fontWeight: 500 }}>{((b.grade_counts.A / b.total) * 100).toFixed(0)}%</span>
                                <span style={{ fontSize: 12, color: "#f59e0b", textAlign: "center", fontWeight: 500 }}>{((b.grade_counts.B / b.total) * 100).toFixed(0)}%</span>
                                <span style={{ fontSize: 12, color: "#ef4444", textAlign: "center", fontWeight: 500 }}>{((b.grade_counts.C / b.total) * 100).toFixed(0)}%</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Card 2: Top violations */}
                  {insights.top_violations && insights.top_violations.length > 0 && (
                    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 12 }}>Most common violations</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {insights.top_violations.map((v) => (
                          <div key={v.code} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                            <span style={{
                              flexShrink: 0, alignSelf: "flex-start",
                              fontSize: 10, fontWeight: 700,
                              width: 76, textAlign: "center",
                              padding: "2px 0", borderRadius: 999,
                              background: v.critical ? "#fef2f2" : "#f8fafc",
                              color: v.critical ? "#dc2626" : "#64748b",
                              border: `1px solid ${v.critical ? "#fecaca" : "#e2e8f0"}`,
                            }}>
                              {v.critical ? "Critical" : "Not Critical"}
                            </span>
                            <span style={{ flex: 1, fontSize: 13, color: "#334155", minWidth: 0, lineHeight: 1.5 }}>{v.description}</span>
                            <span style={{ flexShrink: 0, fontSize: 13, fontWeight: 700, color: "#0f172a", whiteSpace: "nowrap" }}>
                              {v.restaurant_count.toLocaleString()}
                              <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 400, marginLeft: 3 }}>restaurants</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Zip code neighborhood search */}
            <div style={{ marginBottom: 40 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#0f172a", marginBottom: 6 }}>Browse by zip code</div>
              <div style={{ fontSize: 13, color: "#64748b", marginBottom: 12 }}>See all restaurants in a NYC zip code ranked by inspection risk.</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  ref={nbInputRef}
                  placeholder="e.g. 10002"
                  maxLength={5}
                  value={nbZip}
                  onChange={e => setNbZip(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={e => { if (e.key === "Enter") runNeighborhood(nbZip); }}
                  style={{
                    flex: 1, padding: "10px 14px", fontSize: 15, borderRadius: 10,
                    border: "1px solid #e2e8f0", outline: "none", color: "#0f172a",
                    letterSpacing: "0.1em",
                  }}
                  aria-label="Zip code"
                />
                <button
                  onClick={() => runNeighborhood(nbZip)}
                  disabled={nbZip.length !== 5 || nbLoading}
                  style={{
                    padding: "10px 18px", borderRadius: 10, fontSize: 14, fontWeight: 600,
                    background: nbZip.length === 5 ? "#1d4ed8" : "#e2e8f0",
                    color: nbZip.length === 5 ? "#fff" : "#94a3b8",
                    border: "none", cursor: nbZip.length === 5 ? "pointer" : "default",
                  }}
                >
                  {nbLoading ? <Spinner /> : "Search"}
                </button>
              </div>

              {nbErr && <div style={{ marginTop: 8, color: "#ef4444", fontSize: 13 }}>Error: {nbErr}</div>}

              {nbResults.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <NeighborhoodMap
                    restaurants={nbResults}
                    onSelect={(r) => selectHit({ camis: r.camis, name: r.name, address: r.address, boro: r.boro })}
                  />
                </div>
              )}
              {nbResults.length > 0 && (() => {
                const cuisines = Array.from(new Set(nbResults.map(r => r.cuisine).filter(Boolean))).sort() as string[];
                const filtered = nbCuisineFilter ? nbResults.filter(r => r.cuisine === nbCuisineFilter) : nbResults;
                return (
                  <div style={{ marginTop: 16 }}>
                    {cuisines.length > 1 && (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                        <button
                          onClick={() => setNbCuisineFilter(null)}
                          style={{
                            fontSize: 12, padding: "3px 10px", borderRadius: 999, border: "1px solid",
                            borderColor: nbCuisineFilter === null ? "#1d4ed8" : "#e2e8f0",
                            background: nbCuisineFilter === null ? "#eff6ff" : "#fff",
                            color: nbCuisineFilter === null ? "#1d4ed8" : "#64748b",
                            cursor: "pointer", fontWeight: 500,
                          }}>All</button>
                        {cuisines.map(c => (
                          <button key={c}
                            onClick={() => setNbCuisineFilter(nbCuisineFilter === c ? null : c)}
                            style={{
                              fontSize: 12, padding: "3px 10px", borderRadius: 999, border: "1px solid",
                              borderColor: nbCuisineFilter === c ? "#1d4ed8" : "#e2e8f0",
                              background: nbCuisineFilter === c ? "#eff6ff" : "#fff",
                              color: nbCuisineFilter === c ? "#1d4ed8" : "#64748b",
                              cursor: "pointer", fontWeight: 500,
                            }}>{toTitleCase(c)}</button>
                        ))}
                      </div>
                    )}
                    <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 10 }}>
                      {filtered.length} restaurant{filtered.length !== 1 ? "s" : ""} in {nbZip}{nbCuisineFilter ? ` · ${toTitleCase(nbCuisineFilter)}` : ""} — sorted by highest inspection score
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 480, overflowY: "auto", overflowX: "hidden", paddingRight: 4 }}>
                      {filtered.map((nb, i) => {
                        const g = inferGrade(nb.last_grade, nb.last_score);
                        return (
                          <button
                            key={nb.camis}
                            onClick={() => selectHit({ camis: nb.camis, name: nb.name, address: nb.address, boro: nb.boro })}
                            style={{
                              display: "flex", alignItems: "center", gap: 12, width: "100%",
                              padding: "12px 14px", background: "#fff",
                              border: "1px solid #e2e8f0", borderRadius: 12,
                              cursor: "pointer", textAlign: "left",
                              transition: "box-shadow 0.12s",
                            }}
                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 2px 12px rgba(0,0,0,0.08)"; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = "none"; }}
                          >
                            <span style={{ fontSize: 12, color: "#94a3b8", width: 20, textAlign: "right", flexShrink: 0 }}>{i + 1}</span>
                            <div style={{
                              width: 32, height: 32, borderRadius: 7, flexShrink: 0,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontWeight: 800, fontSize: 14,
                              background: g ? gradeColor(g) + "18" : "#f1f5f9",
                              color: gradeColor(g),
                              border: `1px solid ${gradeColor(g)}40`,
                            }}>{g ?? "—"}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: 13, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{toTitleCase(nb.name)}</div>
                              <div style={{ fontSize: 11, color: "#64748b", marginTop: 1 }}>{nb.cuisine || ""}{nb.cuisine && nb.last_date ? " · " : ""}{nb.last_date ? daysAgo(nb.last_date) : ""}</div>
                            </div>
                            {nb.last_score != null && (
                              <div style={{ textAlign: "right", flexShrink: 0 }}>
                                <div style={{ fontWeight: 700, fontSize: 14, color: nb.last_score >= 28 ? "#ef4444" : nb.last_score >= 14 ? "#f59e0b" : "#16a34a" }}>{nb.last_score} pts</div>
                                <div style={{ fontSize: 10, color: "#94a3b8" }}>score</div>
                              </div>
                            )}
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round" aria-hidden style={{ flexShrink: 0 }}>
                              <polyline points="9,18 15,12 9,6" />
                            </svg>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {!nbLoading && nbResults.length === 0 && nbQueriedZip === nbZip && !nbErr && (
                <div style={{ marginTop: 8, fontSize: 13, color: "#64748b" }}>No restaurants found for zip code {nbZip}.</div>
              )}
            </div>

            {/* Example restaurants — always visible */}
            <div className="examples-header" style={{ marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#0f172a" }}>Try an example</div>
              <div style={{ fontSize: 12, color: "#94a3b8" }}>Click any restaurant to see its risk score</div>
            </div>
            <div className="grid-examples">
              {examples.map(ex => (
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

      {/* Footer */}
      <footer style={{ borderTop: "1px solid #f1f5f9", marginTop: 80, padding: "32px 24px", background: "#fff" }}>
        <div style={{ maxWidth: 860, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.6 }}>
            <strong style={{ color: "#64748b" }}>Disclaimer:</strong> DineSafe NYC is an unofficial tool and is not affiliated with the NYC Department of Health and Mental Hygiene.
            Scores are predictive estimates based on historical data — not official grades.
            For official inspection records, visit{" "}
            <a href="https://www.nyc.gov/site/doh/business/food-operators/restaurants.page" target="_blank" rel="noopener noreferrer" style={{ color: "#3b82f6" }}>NYC DOHMH</a>.
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#cbd5e1" }}>
              Data: <a href="https://data.cityofnewyork.us/Health/DOHMH-New-York-City-Restaurant-Inspection-Results/43nn-pn8j" target="_blank" rel="noopener noreferrer" style={{ color: "#94a3b8" }}>NYC Open Data</a>
              {dataRefreshed ? ` · Updated ${formatDate(dataRefreshed)}` : " · Updated nightly"}
            </span>
            <span style={{ fontSize: 12, color: "#cbd5e1" }}>
              Maps: <a href="https://leafletjs.com" target="_blank" rel="noopener noreferrer" style={{ color: "#94a3b8" }}>Leaflet</a>
              {" · "}
              <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" style={{ color: "#94a3b8" }}>© OpenStreetMap contributors</a>
            </span>
            <span style={{ fontSize: 12, color: "#cbd5e1", marginLeft: "auto" }}>
              <a href={`${API_BASE}/docs`} target="_blank" rel="noopener noreferrer" style={{ color: "#94a3b8" }}>API Docs</a>
            </span>
          </div>
        </div>
      </footer>

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
