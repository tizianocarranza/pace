"use client";

import { useId } from "react";
import type { RunSummary } from "@/lib/typingStats";

type WpmChartProps = {
  series: RunSummary["series"];
  errors: RunSummary["errors"];
  peak: number;
  className?: string;
};

// View box; the SVG scales uniformly, so the error dots stay round.
const WIDTH = 320;
const HEIGHT = 72;
const PAD = 6;

type Point = { x: number; y: number };

/** Smooth path through every sample (Catmull-Rom as cubic Béziers). Control points are
 * kept inside the plot, so the curve never dips below zero between samples. */
function smoothPath(points: Point[]) {
  const clampY = (y: number) => Math.min(HEIGHT - PAD, Math.max(PAD, y));
  let d = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: clampY(p1.y + (p2.y - p0.y) / 6) };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: clampY(p2.y - (p3.y - p1.y) / 6) };
    d += ` C${c1.x.toFixed(1)},${c1.y.toFixed(1)} ${c2.x.toFixed(1)},${c2.y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

/** Live WPM over the run as one thin line, with each wrong key as a dot on it. */
export function WpmChart({ series, errors, peak, className }: WpmChartProps) {
  const id = useId().replace(/:/g, "");
  if (series.length < 2) return null;

  const duration = series[series.length - 1].t || 1;
  const top = Math.max(10, peak, ...series.map(sample => sample.wpm)) * 1.12;
  const x = (t: number) => (t / duration) * WIDTH;
  const y = (wpm: number) => HEIGHT - PAD - (wpm / top) * (HEIGHT - 2 * PAD);
  const points = series.map(sample => ({ x: x(sample.t), y: y(sample.wpm) }));
  const line = smoothPath(points);
  const area = `${line} L${WIDTH},${HEIGHT} L0,${HEIGHT} Z`;

  /** The line's height at time t (linear between samples). */
  const yAt = (t: number) => {
    const i = series.findIndex(sample => sample.t >= t);
    if (i <= 0) return points[Math.max(0, i)].y;
    const a = series[i - 1], b = series[i];
    const k = (t - a.t) / (b.t - a.t || 1);
    return y(a.wpm + (b.wpm - a.wpm) * k);
  };

  const stroke = `${id}-stroke`, fill = `${id}-fill`;
  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img"
      aria-label={`WPM over time, peaking at ${peak}${errors.length ? `, ${errors.length} ${errors.length === 1 ? "miss" : "misses"}` : ""}`}
      className={`overflow-visible ${className ?? ""}`}>
      <defs>
        <linearGradient id={stroke} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="var(--caret-from)" />
          <stop offset="1" stopColor="var(--caret-to)" />
        </linearGradient>
        <linearGradient id={fill} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--caret-from)" stopOpacity="0.16" />
          <stop offset="1" stopColor="var(--caret-from)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${fill})`} className="results-chart-area" />
      <path d={line} fill="none" stroke={`url(#${stroke})`} strokeWidth="1.75"
        strokeLinecap="round" strokeLinejoin="round" pathLength={1} className="results-chart-line" />
      {errors.map((t, index) => (
        <circle key={index} cx={x(Math.min(t, duration))} cy={yAt(t)} r="2.6"
          className="results-chart-miss" style={{ animationDelay: `${700 + (t / duration) * 400}ms` }} />
      ))}
    </svg>
  );
}
