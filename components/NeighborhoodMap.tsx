import { useEffect, useRef } from "react";
import type { Map as LeafletMap } from "leaflet";

type Restaurant = {
  camis: string;
  name: string;
  address: string;
  boro: string;
  last_grade: string | null;
  last_score: number | null;
  latitude: number | null;
  longitude: number | null;
};

type Props = {
  restaurants: Restaurant[];
  onSelect: (r: Restaurant) => void;
};

const GRADE_COLOR: Record<string, string> = {
  A: "#16a34a",
  B: "#f59e0b",
  C: "#ef4444",
};

export default function NeighborhoodMap({ restaurants, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    import("leaflet").then((L) => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      const map = L.map(containerRef.current!, {
        center: [40.7128, -74.006],
        zoom: 14,
        zoomControl: true,
      });
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      const bounds: [number, number][] = [];

      restaurants.forEach((r) => {
        if (r.latitude == null || r.longitude == null) return;
        const color = GRADE_COLOR[r.last_grade ?? ""] ?? "#94a3b8";
        const marker = L.circleMarker([r.latitude, r.longitude], {
          radius: 8,
          fillColor: color,
          color: "#fff",
          weight: 2,
          opacity: 1,
          fillOpacity: 0.9,
        }).addTo(map);

        const scoreText = r.last_score != null ? `${r.last_score} pts` : "No score";
        const gradeText = r.last_grade ?? "—";
        marker.bindPopup(
          `<div style="font-family:sans-serif;min-width:140px">
            <div style="font-weight:700;font-size:13px;margin-bottom:4px">${r.name}</div>
            <div style="font-size:11px;color:#64748b;margin-bottom:6px">${r.address}</div>
            <div style="display:flex;gap:8px;align-items:center">
              <span style="font-weight:700;color:${color}">${gradeText}</span>
              <span style="font-size:11px;color:#475569">${scoreText}</span>
            </div>
            <button onclick="window._mapSelect('${r.camis}')"
              style="margin-top:8px;width:100%;padding:5px 0;background:#0f172a;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer">
              View details →
            </button>
          </div>`,
          { maxWidth: 200 }
        );

        bounds.push([r.latitude, r.longitude]);
      });

      (window as Record<string, unknown>)._mapSelect = (camis: string) => {
        const r = restaurants.find((x) => x.camis === camis);
        if (r) onSelect(r);
      };

      if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [32, 32], maxZoom: 16 });
      }
    });

    return () => {
      (window as Record<string, unknown>)._mapSelect = undefined;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [restaurants, onSelect]);

  return (
    <div style={{ position: "relative", borderRadius: 16, overflow: "hidden", border: "1px solid #e2e8f0", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
      <div ref={containerRef} style={{ height: 400, width: "100%" }} />
      <div style={{
        position: "absolute", bottom: 10, left: 10, zIndex: 1000,
        background: "rgba(255,255,255,0.95)", borderRadius: 8, padding: "6px 10px",
        fontSize: 11, display: "flex", gap: 10, boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
        pointerEvents: "none",
      }}>
        {Object.entries(GRADE_COLOR).map(([grade, color]) => (
          <span key={grade} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, display: "inline-block" }} />
            <span style={{ fontWeight: 600, color: "#334155" }}>Grade {grade}</span>
          </span>
        ))}
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#94a3b8", display: "inline-block" }} />
          <span style={{ fontWeight: 600, color: "#334155" }}>Ungraded</span>
        </span>
      </div>
    </div>
  );
}
