"use client";

import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { APPROVED_ERROR_STYLE, errorStyle } from "./errorStyle";
import { APPROVED_TYPED_COLOR, typedColor } from "./typedColor";

const approvedStyle = () => APPROVED_ERROR_STYLE;
const approvedColor = () => APPROVED_TYPED_COLOR;

type TypingTextProps = {
  text: string;
  /** The prompt's language, for screen readers and hyphenation. */
  lang?: string;
  currentIndex: number;
  errorCount: number;
  status: "idle" | "running" | "finished";
  /** Resolved visual intensity from `visualSpeed.ts`; drives the caret glow only. */
  intensity: number;
  className?: string;
};

/** Spring stiffness (rad/s): settles in ~250ms, calm but never a letter behind. */
const CARET_OMEGA = 16;

type CaretMotion = {
  x: number; y: number; w: number;
  vx: number; vy: number; vw: number;
  tx: number; ty: number; tw: number;
  raf: number; last: number;
  placed: boolean; reduced: boolean;
  wake: () => void;
};

function applyCaret(caret: HTMLElement, m: CaretMotion) {
  caret.style.transform = `translate3d(${m.x}px, ${m.y}px, 0)`;
  caret.style.width = `${m.w}px`;
}

type Token =
  | { kind: "word"; start: number; chars: string; order: number }
  | { kind: "space"; index: number };

function tokenize(text: string) {
  const tokens: Token[] = [];
  let order = 0;
  let start = 0;

  for (let index = 0; index <= text.length; index++) {
    if (index === text.length || text[index] === " ") {
      if (index > start) {
        tokens.push({ kind: "word", start, chars: text.slice(start, index), order: order++ });
      }
      if (index < text.length) tokens.push({ kind: "space", index });
      start = index + 1;
    }
  }

  return tokens;
}

/**
 * The prompt. Mount it with `key={text}` so a new prompt replays its entrance
 * and the caret is placed without gliding in from the previous position.
 */
export function TypingText({ text, lang, currentIndex, errorCount, status, intensity, className }: TypingTextProps) {
  const containerRef = useRef<HTMLParagraphElement>(null);
  const caretRef = useRef<HTMLSpanElement>(null);
  const tokens = useMemo(() => tokenize(text), [text]);

  // Production always uses the approved style; Pace Debug switches it in development.
  const style = useSyncExternalStore(errorStyle.subscribe,
    process.env.NODE_ENV === "development" ? errorStyle.get : approvedStyle, approvedStyle);
  const color = useSyncExternalStore(typedColor.subscribe,
    process.env.NODE_ENV === "development" ? typedColor.get : approvedColor, approvedColor);

  // Remember where the latest mistake happened so only that letter flashes,
  // and only until the player gets past it. `missed` keeps every letter that was
  // mistyped (for the `marks` style); a new prompt remounts this component, clearing it.
  const [errorMark, setErrorMark] = useState({ count: errorCount, index: -1, missed: [] as number[] });
  if (errorMark.count !== errorCount) {
    const increased = errorCount > errorMark.count;
    setErrorMark({
      count: errorCount,
      index: increased ? currentIndex : -1,
      missed: !increased ? [] : errorMark.missed.includes(currentIndex)
        ? errorMark.missed : [...errorMark.missed, currentIndex],
    });
  }
  const erroredHere = errorMark.index === currentIndex;

  // The caret follows its target with a critically damped spring, so it keeps
  // its momentum between keystrokes and never jerks or overshoots.
  const motion = useRef<CaretMotion>({
    x: 0, y: 0, w: 0, vx: 0, vy: 0, vw: 0, tx: 0, ty: 0, tw: 0,
    raf: 0, last: 0, placed: false, reduced: false, wake: () => {},
  });

  useLayoutEffect(() => {
    const caret = caretRef.current;
    const m = motion.current;
    if (!caret) return;

    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onQuery = () => { m.reduced = query.matches; };
    onQuery();
    query.addEventListener("change", onQuery);

    // Analytic critically damped step per axis: frame-rate independent.
    const step = (now: number) => {
      const dt = Math.min(Math.max((now - m.last) / 1000, 0), 0.05);
      m.last = now;

      const e = Math.exp(-CARET_OMEGA * dt);
      let d = m.x - m.tx;
      let k = m.vx + CARET_OMEGA * d;
      m.x = m.tx + (d + k * dt) * e;
      m.vx = (m.vx - CARET_OMEGA * k * dt) * e;

      d = m.y - m.ty;
      k = m.vy + CARET_OMEGA * d;
      m.y = m.ty + (d + k * dt) * e;
      m.vy = (m.vy - CARET_OMEGA * k * dt) * e;

      d = m.w - m.tw;
      k = m.vw + CARET_OMEGA * d;
      m.w = m.tw + (d + k * dt) * e;
      m.vw = (m.vw - CARET_OMEGA * k * dt) * e;

      const settled =
        Math.abs(m.x - m.tx) < 0.1 && Math.abs(m.y - m.ty) < 0.1 && Math.abs(m.w - m.tw) < 0.1 &&
        Math.abs(m.vx) < 1 && Math.abs(m.vy) < 1 && Math.abs(m.vw) < 1;

      if (settled) {
        m.x = m.tx; m.y = m.ty; m.w = m.tw;
        m.vx = m.vy = m.vw = 0;
        m.raf = 0;
      } else {
        m.raf = requestAnimationFrame(step);
      }

      applyCaret(caret, m);
    };

    m.wake = () => {
      if (m.raf) return;
      m.last = performance.now();
      m.raf = requestAnimationFrame(step);
    };

    return () => {
      query.removeEventListener("change", onQuery);
      cancelAnimationFrame(m.raf);
      m.raf = 0;
    };
  }, []);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const caret = caretRef.current;
    const m = motion.current;
    if (!container || !caret) return;

    const place = () => {
      const atEnd = currentIndex >= text.length;
      const target = container.querySelector<HTMLElement>(
        `[data-i="${atEnd ? text.length - 1 : currentIndex}"]`,
      );
      if (!target) return;

      // Layout offsets up to the container: unaffected by entrance transforms,
      // and correct even when an animated word becomes the offsetParent.
      let left = 0;
      let top = 0;
      for (let node: HTMLElement | null = target; node && node !== container; node = node.offsetParent as HTMLElement | null) {
        left += node.offsetLeft;
        top += node.offsetTop;
      }

      // Underline the current letter, taking that letter's width without the
      // trailing letter-spacing each inline-block letter carries.
      const spacing = parseFloat(getComputedStyle(container).letterSpacing) || 0;
      m.tx = left;
      m.ty = top + target.offsetHeight * 0.9;
      m.tw = target.offsetWidth - spacing;

      if (!m.placed || m.reduced) {
        // First placement (and reduced motion) jumps straight into position.
        m.x = m.tx; m.y = m.ty; m.w = m.tw;
        m.vx = m.vy = m.vw = 0;
        m.placed = true;
        applyCaret(caret, m);
        caret.dataset.placed = "true";
        return;
      }

      m.wake();
    };

    place();

    const observer = new ResizeObserver(place);
    observer.observe(container);
    return () => observer.disconnect();
  }, [currentIndex, text]);

  const finished = status === "finished";

  return (
    <p
      ref={containerRef}
      aria-label={text}
      lang={lang}
      data-error-style={style}
      data-typed-color={color}
      className={`typing-text relative whitespace-pre-wrap ${finished ? "text-exit" : ""} ${className ?? ""}`}
      style={{ "--caret-glow": intensity.toFixed(3) } as CSSProperties}
    >
      {tokens.map((token) => {
        if (token.kind === "space") {
          return (
            <span key={token.index} data-i={token.index} aria-hidden>
              {" "}
            </span>
          );
        }

        // The `word` error style washes the whole current word; keyed so each mistake replays.
        const wordError = style === "word" && erroredHere
          && currentIndex >= token.start && currentIndex < token.start + token.chars.length;

        return (
          <span
            key={token.start}
            aria-hidden
            className="word-enter relative inline-block whitespace-nowrap"
            style={{ animationDelay: `${token.order * 22}ms` }}
          >
            {wordError && <span key={errorCount} className="word-error" />}
            {Array.from(token.chars, (char, offset) => {
              const index = token.start + offset;
              const state = index < currentIndex ? "char-typed" : "char-pending";
              const flash = index === currentIndex && erroredHere;
              const missed = style === "marks" && errorMark.missed.includes(index);

              return (
                <span
                  key={flash ? `${index}:${errorCount}` : index}
                  data-i={index}
                  className={`char relative inline-block ${state} ${flash ? "char-error" : ""} ${missed ? "char-missed" : ""}`}
                  // The `gradient` typed color runs violet → cobalt along the prompt.
                  style={color === "gradient"
                    ? { "--t": (index / Math.max(1, text.length - 1)).toFixed(3) } as CSSProperties : undefined}
                >
                  {char}
                </span>
              );
            })}
          </span>
        );
      })}

      <span
        ref={caretRef}
        aria-hidden
        className={`caret pointer-events-none absolute top-0 left-0 ${finished ? "caret-hidden" : ""}`}
      >
        <span
          key={errorCount}
          className={`block h-full ${erroredHere ? (style === "current" ? "caret-shake" : style === "caret" ? "caret-flare" : "caret-pulse") : ""}`}
        >
          <span
            key={`${currentIndex}:${errorCount}`}
            className={`caret-bar block h-full ${erroredHere ? "caret-bar-error" : ""}`}
          />
        </span>
      </span>
    </p>
  );
}
