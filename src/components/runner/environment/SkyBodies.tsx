"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { theme } from "@/lib/theme";
import { celestialAnchor, celestialHover, type CelestialAnchor } from "./celestial";
import { celestialVertex, moonFragment, sunFragment } from "./celestialShaders";
import { genesisStage } from "./genesisStage";
import { RENDER_ORDER } from "./landscapeMaterials";
import { worldTone } from "./worldTone";

/** How far (CSS px) a body travels along its arc when it sets or rises. */
const ARC = 90;
const anchor: CelestialAnchor = { x: 0, y: 0, size: 0 };

function createBody(fragmentShader: string) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uCenter: { value: new THREE.Vector2() },
      uSize: { value: 0 },
      uViewport: { value: new THREE.Vector2(1, 1) },
      uAlpha: { value: 0 },
      uGlow: { value: 1 },
    },
    vertexShader: celestialVertex, fragmentShader,
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
  });
}

/** Writes one body's place on its arc: `away` 0 is home, 1 is set below the horizon. Setting
 * runs down and outward (`side` +1 to the right, −1 to the left), shrinking and fading. */
function place(material: THREE.ShaderMaterial, away: number, side: number, reveal: number, glow: number,
  scale: number, viewport: { width: number; height: number }) {
  const angle = away * 1.1;
  const live = material.uniforms;
  live.uCenter.value.set(anchor.x + side * Math.sin(angle) * ARC * 0.8, anchor.y + (1 - Math.cos(angle)) * ARC * 1.3);
  live.uSize.value = anchor.size * (1 - 0.35 * away) * scale;
  live.uViewport.value.set(viewport.width, viewport.height);
  live.uAlpha.value = reveal * (1 - THREE.MathUtils.smoothstep(away, 0.15, 0.75));
  live.uGlow.value = glow;
  return live.uAlpha.value > 0.001;
}

/** The sun by day and the crescent moon by night, high on the right: the theme toggle drawn
 * in the sky (CelestialToggle is the button over it). Switching sets one and raises the
 * other. Slot 0: reads the night mix, the floor's warmth and the big bang's page wave, all
 * published earlier this frame. */
export function SkyBodies() {
  const sun = useRef<THREE.Mesh>(null);
  const moon = useRef<THREE.Mesh>(null);
  const geometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const materials = useMemo(() => ({ sun: createBody(sunFragment), moon: createBody(moonFragment) }), []);
  useEffect(() => () => { geometry.dispose(); materials.sun.dispose(); materials.moon.dispose(); },
    [geometry, materials]);

  const motion = useRef({ swap: 0, hover: 0, reduced: false });
  useLayoutEffect(() => {
    motion.current.swap = theme.get() === "night" ? 1 : 0;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => { motion.current.reduced = query.matches; };
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useFrame(({ size }, delta) => {
    if (!sun.current || !moon.current) return;
    const dt = THREE.MathUtils.clamp(delta, 0, 0.05);
    const m = motion.current;
    const goal = theme.get() === "night" ? 1 : 0;
    m.swap = m.reduced ? goal : THREE.MathUtils.damp(m.swap, goal, 3.5, dt);
    if (Math.abs(m.swap - goal) < 0.001) m.swap = goal;
    m.hover = THREE.MathUtils.damp(m.hover, celestialHover.value, 10, dt);

    celestialAnchor(size.width, anchor);
    // Hidden until the first arrival; while the big bang expands, it appears as the page's
    // wave reaches it, like the UI. The finish collapse leaves it alone.
    const stage = genesisStage.state;
    let reveal = stage.arrivals > 0 ? 1 : 0;
    if (stage.active) {
      const distance = Math.hypot(anchor.x - stage.x, anchor.y - stage.y);
      reveal = 1 - THREE.MathUtils.smoothstep(distance, stage.radius - 140, stage.radius);
    }
    const glow = 1 + 0.6 * worldTone.warmth + 0.5 * m.hover;
    const scale = 1 + 0.12 * m.hover;
    sun.current.visible = place(materials.sun, m.swap, 1, reveal, glow, scale, size);
    moon.current.visible = place(materials.moon, 1 - m.swap, -1, reveal, glow, scale, size);
  });

  return (
    <group name="Celestial">
      <mesh ref={sun} name="CelestialSun" geometry={geometry} material={materials.sun}
        renderOrder={RENDER_ORDER.sky} frustumCulled={false} visible={false} dispose={null} />
      <mesh ref={moon} name="CelestialMoon" geometry={geometry} material={materials.moon}
        renderOrder={RENDER_ORDER.sky} frustumCulled={false} visible={false} dispose={null} />
    </group>
  );
}
