import * as THREE from "three";

const vertexShader = `
  varying vec2 vUv;
  void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// Tap spacing in CSS pixels; with two passes this gives roughly 20px of softness.
const FOREGROUND_STEP = 4.5;

/** Only the authored near layer enters these buffers. Pip is always drawn sharp. */
export class ForegroundSoftness {
  private readonly source: THREE.WebGLRenderTarget;
  private readonly scratch: THREE.WebGLRenderTarget;
  private readonly triangle = new THREE.BufferGeometry();
  private readonly screen = new THREE.Scene();
  private readonly camera = new THREE.Camera();
  private readonly blur: THREE.ShaderMaterial;
  private readonly composite: THREE.ShaderMaterial;
  private readonly quad: THREE.Mesh;
  private readonly meshes: THREE.Mesh[] = [];
  private readonly near = new Set<THREE.Mesh>();
  private readonly visibility: boolean[] = [];
  private readonly size = new THREE.Vector2();
  private readonly cssSize = new THREE.Vector2();
  private readonly viewport = new THREE.Vector4();
  private readonly scissor = new THREE.Vector4();
  private readonly clearColor = new THREE.Color();
  private readonly frustum = new THREE.Frustum();
  private readonly projection = new THREE.Matrix4();

  constructor(private readonly scene: THREE.Scene, gl: THREE.WebGLRenderer,
    private readonly capture: { value: number }) {
    const type = gl.extensions.has("EXT_color_buffer_float") ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.source = new THREE.WebGLRenderTarget(1, 1, { type });
    this.source.texture.name = "Pace / near coverage";
    this.scratch = new THREE.WebGLRenderTarget(1, 1, { type, depthBuffer: false });
    this.scratch.texture.name = "Pace / near blur";
    const names = new Set(["NearWesternBank", "NearEasternBank", "NearMineralFragment"]);
    scene.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      this.meshes.push(object);
      if (names.has(object.name)) this.near.add(object);
    });
    this.triangle.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.blur = new THREE.ShaderMaterial({
      vertexShader, depthTest: false, depthWrite: false, toneMapped: false,
      blending: THREE.NoBlending,
      uniforms: { uImage: { value: this.source.texture }, uStep: { value: new THREE.Vector2() } },
      fragmentShader: `
        uniform sampler2D uImage; uniform vec2 uStep; varying vec2 vUv;
        void main() {
          // Normalized Gaussian, in linear premultiplied RGBA including empty space.
          vec4 c = texture2D(uImage, vUv);
          float total = 1.0;
          for (int i = 1; i <= 8; i++) {
            float weight = exp(-float(i * i) / 24.5);
            vec2 offset = uStep * float(i);
            c += (texture2D(uImage, vUv + offset) + texture2D(uImage, vUv - offset)) * weight;
            total += 2.0 * weight;
          }
          gl_FragColor = c / total;
        }
      `,
    });
    this.composite = new THREE.ShaderMaterial({
      vertexShader, depthTest: false, depthWrite: false, transparent: true,
      premultipliedAlpha: true,
      uniforms: { uImage: { value: this.source.texture } },
      fragmentShader: `
        uniform sampler2D uImage; varying vec2 vUv;
        void main() {
          vec4 c = texture2D(uImage, vUv);
          gl_FragColor = vec4(c.rgb / max(c.a, 0.00001), c.a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          gl_FragColor.rgb *= gl_FragColor.a;
        }
      `,
    });
    this.quad = new THREE.Mesh(this.triangle, this.blur);
    this.quad.frustumCulled = false;
    this.screen.add(this.quad);
  }

  render(gl: THREE.WebGLRenderer, camera: THREE.Camera, drawSharp: () => void) {
    this.scene.updateMatrixWorld();
    this.projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projection);
    let visible = false;
    for (const mesh of this.near) visible ||= mesh.visible && this.frustum.intersectsObject(mesh);
    if (!visible) { drawSharp(); return; }

    gl.getDrawingBufferSize(this.size);
    // Quarter resolution is plenty for a lens-like defocus and keeps it cheap.
    this.size.multiplyScalar(Math.min(0.25, 512 / Math.max(this.size.x, this.size.y))).floor();
    this.size.set(Math.max(1, this.size.x), Math.max(1, this.size.y));
    this.source.setSize(this.size.x, this.size.y);
    this.scratch.setSize(this.size.x, this.size.y);
    gl.getSize(this.cssSize);
    const target = gl.getRenderTarget(), autoClear = gl.autoClear, background = this.scene.background;
    const clearAlpha = gl.getClearAlpha(), scissorTest = gl.getScissorTest();
    gl.getClearColor(this.clearColor); gl.getViewport(this.viewport); gl.getScissor(this.scissor);
    for (let i = 0; i < this.meshes.length; i++) this.visibility[i] = this.meshes[i].visible;
    try {
      for (const mesh of this.near) mesh.visible = false;
      drawSharp(); // Includes refraction captures, without a near layer behind the glass.
      for (let i = 0; i < this.meshes.length; i++) this.meshes[i].visible = this.visibility[i] && this.near.has(this.meshes[i]);
      this.scene.background = null;
      this.capture.value = 1;
      gl.setClearColor(0, 0); gl.setScissorTest(false); gl.autoClear = true;
      gl.setRenderTarget(this.source);
      gl.render(this.scene, camera);
      this.capture.value = 0;

      this.quad.material = this.blur;
      // CSS-pixel radius stays consistent across DPR and capped target sizes.
      // Two separable passes approach a wide, smooth bokeh-like defocus.
      for (let pass = 0; pass < 2; pass++) {
        this.blur.uniforms.uImage.value = this.source.texture;
        this.blur.uniforms.uStep.value.set(FOREGROUND_STEP / this.cssSize.x, 0);
        gl.setRenderTarget(this.scratch); gl.render(this.screen, this.camera);
        this.blur.uniforms.uImage.value = this.scratch.texture;
        this.blur.uniforms.uStep.value.set(0, FOREGROUND_STEP / this.cssSize.y);
        gl.setRenderTarget(this.source); gl.render(this.screen, this.camera);
      }
      this.quad.material = this.composite;
      gl.setRenderTarget(target); gl.setViewport(this.viewport);
      gl.setScissor(this.scissor); gl.setScissorTest(scissorTest); gl.autoClear = false;
      gl.render(this.screen, this.camera);
    } finally {
      this.capture.value = 0;
      this.scene.background = background;
      for (let i = 0; i < this.meshes.length; i++) this.meshes[i].visible = this.visibility[i];
      gl.setClearColor(this.clearColor, clearAlpha); gl.autoClear = autoClear;
      gl.setRenderTarget(target); gl.setViewport(this.viewport);
      gl.setScissor(this.scissor); gl.setScissorTest(scissorTest);
    }
  }

  dispose() {
    this.source.dispose(); this.scratch.dispose(); this.triangle.dispose();
    this.blur.dispose(); this.composite.dispose();
  }
}
