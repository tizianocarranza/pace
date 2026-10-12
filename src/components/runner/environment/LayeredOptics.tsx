"use client";

import { useLayoutEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useMaterialStudy } from "../MaterialStudy";
import { useAtmosphere } from "../AtmosphereStudy";
import { ForegroundSoftness } from "./ForegroundSoftness";

export function createOpticalUniforms() {
  return {
    uOpticalBase: { value: null as THREE.Texture | null },
    uOpticalLayers: { value: null as THREE.Texture | null },
    uOpticalMineral: { value: null as THREE.Texture | null },
    uOpticalMineralDepth: { value: null as THREE.Texture | null },
    uOpticalDepth: { value: null as THREE.Texture | null },
    uOpticalSize: { value: new THREE.Vector2(1, 1) },
    uOpticalCapture: { value: 0 },
    uOpticalSplit: { value: 0 },
  };
}
export type OpticalUniforms = ReturnType<typeof createOpticalUniforms>;

/** Bounded optical layers; no duplicate meshes or new landscape geometry. */
class FoldCapture {
  readonly base: THREE.WebGLRenderTarget;
  readonly layers: THREE.WebGLRenderTarget;
  readonly completeFold: THREE.WebGLRenderTarget;
  private readonly meshes: THREE.Mesh[] = [];
  private readonly visibility: boolean[] = [];
  private readonly size = new THREE.Vector2();
  private readonly frustum = new THREE.Frustum();
  private readonly projection = new THREE.Matrix4();
  private readonly viewport = new THREE.Vector4();
  private readonly scissor = new THREE.Vector4();

  constructor(private readonly scene: THREE.Scene, private readonly uniforms: OpticalUniforms,
    private readonly sheet: THREE.Mesh, private readonly mineral: THREE.Mesh, gl: THREE.WebGLRenderer) {
    const type = gl.extensions.has("EXT_color_buffer_float") ? THREE.HalfFloatType : THREE.UnsignedByteType;
    const target = (name: string) => {
      const value = new THREE.WebGLRenderTarget(1, 1, {
        type, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
        depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType),
      });
      value.texture.name = name;
      return value;
    };
    this.base = target("Pace / optical background");
    this.layers = target("Pace / rear fold");
    this.completeFold = target("Pace / complete fold");
    scene.traverse(object => { if (object instanceof THREE.Mesh) this.meshes.push(object); });
    // The two lobes already occupy consecutive, equal-sized indexed ranges.
    uniforms.uOpticalSplit.value = sheet.geometry.getAttribute("position").count / 2;
  }

  render(gl: THREE.WebGLRenderer, camera: THREE.Camera) {
    this.scene.updateMatrixWorld();
    this.projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projection);
    const sheetVisible = this.sheet.visible && this.frustum.intersectsObject(this.sheet);
    const mineralVisible = this.mineral.visible && this.frustum.intersectsObject(this.mineral);
    if (!sheetVisible && !mineralVisible) return;

    gl.getDrawingBufferSize(this.size);
    this.size.multiplyScalar(Math.min(0.5, 1024 / Math.max(this.size.x, this.size.y))).floor();
    this.size.set(Math.max(1, this.size.x), Math.max(1, this.size.y));
    this.base.setSize(this.size.x, this.size.y);
    this.layers.setSize(this.size.x, this.size.y);
    if (sheetVisible && mineralVisible) this.completeFold.setSize(this.size.x, this.size.y);
    this.uniforms.uOpticalSize.value.copy(this.size);
    this.uniforms.uOpticalBase.value = this.base.texture;
    // Never leave a destination texture bound to an active sampler while drawing
    // that destination, even when a uniform branch would avoid the lookup.
    this.uniforms.uOpticalLayers.value = this.base.texture;
    this.uniforms.uOpticalMineral.value = this.base.texture;
    this.uniforms.uOpticalDepth.value = this.base.depthTexture;
    this.uniforms.uOpticalMineralDepth.value = this.base.depthTexture;

    const target = gl.getRenderTarget(), tone = gl.toneMapping, autoClear = gl.autoClear;
    const background = this.scene.background;
    const scissorTest = gl.getScissorTest();
    gl.getViewport(this.viewport); gl.getScissor(this.scissor);
    const rangeStart = this.sheet.geometry.drawRange.start;
    const rangeCount = this.sheet.geometry.drawRange.count;
    for (let i = 0; i < this.meshes.length; i++) this.visibility[i] = this.meshes[i].visible;
    try {
      gl.toneMapping = THREE.NoToneMapping;
      gl.autoClear = true;
      gl.setScissorTest(false);
      this.sheet.visible = this.mineral.visible = false;
      gl.setRenderTarget(this.base);
      gl.render(this.scene, camera);

      if (!sheetVisible) {
        this.uniforms.uOpticalLayers.value = this.base.texture;
        return; // The finally block still restores the main-frame state.
      }

      // Preserve the background color AND its opaque depth without redrawing it.
      gl.setRenderTarget(this.layers);
      gl.clear();
      gl.copyTextureToTexture(this.base.texture, this.layers.texture);
      gl.copyTextureToTexture(this.base.depthTexture!, this.layers.depthTexture!);
      gl.setRenderTarget(this.layers);
      if (sheetVisible) {
        for (const mesh of this.meshes) mesh.visible = mesh === this.sheet;
        this.scene.background = null;
        gl.autoClear = false;
        this.uniforms.uOpticalCapture.value = 1;
        const half = this.sheet.geometry.index!.count / 2;
        this.sheet.geometry.setDrawRange(half, half);
        gl.render(this.scene, camera);
      }
      this.uniforms.uOpticalLayers.value = this.layers.texture;
      if (mineralVisible) {
        // The mineral needs both fold lobes. Rendering the existing full sheet
        // once gives it the same nested background as the main-frame sheet.
        gl.setRenderTarget(this.completeFold);
        gl.clear();
        gl.copyTextureToTexture(this.base.texture, this.completeFold.texture);
        gl.copyTextureToTexture(this.base.depthTexture!, this.completeFold.depthTexture!);
        gl.setRenderTarget(this.completeFold);
        this.uniforms.uOpticalCapture.value = 0;
        this.sheet.geometry.setDrawRange(rangeStart, rangeCount);
        gl.render(this.scene, camera);
        this.uniforms.uOpticalMineral.value = this.completeFold.texture;
        this.uniforms.uOpticalMineralDepth.value = this.completeFold.depthTexture;
      }
    } finally {
      for (let i = 0; i < this.meshes.length; i++) this.meshes[i].visible = this.visibility[i];
      this.sheet.geometry.setDrawRange(rangeStart, rangeCount);
      this.uniforms.uOpticalCapture.value = 0;
      this.scene.background = background;
      gl.autoClear = autoClear; gl.toneMapping = tone;
      gl.setRenderTarget(target);
      gl.setViewport(this.viewport); gl.setScissor(this.scissor); gl.setScissorTest(scissorTest);
    }
  }

  dispose() { this.base.dispose(); this.layers.dispose(); this.completeFold.dispose(); }
}

export function LayeredOptics({ uniforms, nearCapture }: { uniforms: OpticalUniforms; nearCapture: { value: number } }) {
  const { scene, gl } = useThree();
  const mode = useMaterialStudy();
  const atmosphere = useAtmosphere();
  const capture = useRef<FoldCapture | null>(null);
  const foreground = useRef<ForegroundSoftness | null>(null);
  useLayoutEffect(() => {
    const sheet = scene.getObjectByName("WesternFold"), mineral = scene.getObjectByName("SuspendedStone");
    if (sheet instanceof THREE.Mesh && mineral instanceof THREE.Mesh) {
      capture.current = new FoldCapture(scene, uniforms, sheet, mineral, gl);
    }
    foreground.current = new ForegroundSoftness(scene, gl, nearCapture);
    return () => {
      capture.current?.dispose(); capture.current = null;
      foreground.current?.dispose(); foreground.current = null;
    };
  }, [scene, gl, uniforms, nearCapture]);
  // After motion/contact updates, take ownership of the complete frame.
  useFrame(({ camera, scene: frameScene, gl: renderer }) => {
    if (process.env.NODE_ENV !== "production") {
      frameScene.userData.opticalFrame = (frameScene.userData.opticalFrame ?? 0) + 1;
      frameScene.userData.atmosphere = atmosphere;
    }
    const drawSharp = () => {
      if (mode === "pilot") capture.current?.render(renderer, camera);
      renderer.render(frameScene, camera);
    };
    if (atmosphere === "on" && foreground.current) foreground.current.render(renderer, camera, drawSharp);
    else drawSharp();
  }, 1);
  return null;
}
