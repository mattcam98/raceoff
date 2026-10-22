/**
 * The picture after the scene is drawn. Every viewport renders into one HDR
 * buffer, then the whole screen goes through:
 *
 *   depth of field   far scenery melts into a soft blur, the miniature look
 *   bloom            sparks, flames, glowing things and sun glints spill light
 *   grade            speed blur at the edges, vignette, contrast, saturation
 *   output           tone mapping to the screen
 *
 * Effects that depend on a camera (depth of field, vignette, speed blur) are
 * worked out per viewport, so split screen gets four of each.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

export const MAX_VIEWS = 4;

/** What the post effects need to know about one viewport, in drawing-buffer pixels from the bottom left. */
export interface PostView {
  x: number;
  y: number;
  w: number;
  h: number;
  near: number;
  far: number;
  /** Everything nearer than this stays sharp; blur builds beyond it. */
  focus: number;
  /** 0 to 1: how much speed blur pulls at the edges. */
  speed: number;
}

export interface Grade {
  saturation: number;
  contrast: number;
  /** Multiplies the image: a warm kitchen morning, a cold garage night. */
  tint: string;
  vignette: number;
  bloom: number;
  /** Blur strength at full depth, in pixels at 1080p. 0 turns depth of field off. */
  dof: number;
}

const RECT_GLSL = /* glsl */ `
  uniform vec4 uRects[${MAX_VIEWS}];
  uniform int uCount;
  // Which viewport a pixel is in, and where in it (0-1).
  int viewAt(vec2 px, out vec2 local) {
    for (int i = 0; i < ${MAX_VIEWS}; i++) {
      if (i >= uCount) break;
      vec4 r = uRects[i];
      if (px.x >= r.x && px.y >= r.y && px.x < r.x + r.z && px.y < r.y + r.w) {
        local = (px - r.xy) / r.zw;
        return i;
      }
    }
    local = vec2(0.5);
    return -1;
  }
`;

/** One direction of a separable blur whose radius grows with distance. The first pass works out the blur
 * radius from depth and keeps it in alpha for the second. Samples only count where their own blur reaches
 * this pixel, so a sharp kart never smears onto the blurred room behind it. */
function dofMaterial(first: boolean) {
  return new THREE.ShaderMaterial({
    uniforms: {
      tColor: { value: null },
      tDepth: { value: null },
      uRects: { value: Array.from({ length: MAX_VIEWS }, () => new THREE.Vector4()) },
      uCount: { value: 0 },
      uClip: { value: Array.from({ length: MAX_VIEWS }, () => new THREE.Vector3(0.3, 2400, 60)) },
      uDir: { value: new THREE.Vector2(1, 0) },
      uTexel: { value: new THREE.Vector2() },
      uMaxR: { value: 4 },
    },
    vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */ `
      #include <packing>
      uniform sampler2D tColor;
      uniform sampler2D tDepth;
      uniform vec3 uClip[${MAX_VIEWS}];
      uniform vec2 uDir;
      uniform vec2 uTexel;
      uniform float uMaxR;
      varying vec2 vUv;
      ${RECT_GLSL}
      float cocAt(vec2 uv) {
        ${first ? `
        vec2 local;
        int i = viewAt(uv / uTexel, local);
        if (i < 0) return 0.0;
        vec3 c = uClip[i];
        float d = texture2D(tDepth, uv).x;
        if (d >= 1.0) return uMaxR;
        float dist = -perspectiveDepthToViewZ(d, c.x, c.y);
        return uMaxR * smoothstep(c.z, c.z * 3.5, dist);` : `return texture2D(tColor, uv).a;`}
      }
      void main() {
        float coc = cocAt(vUv);
        vec3 sum = texture2D(tColor, vUv).rgb;
        float wsum = 1.0;
        if (coc > 0.25) {
          for (int k = -4; k <= 4; k++) {
            if (k == 0) continue;
            float off = float(k) * coc / 4.0;
            vec2 uv = vUv + uDir * uTexel * off;
            float sc = cocAt(uv);
            float w = clamp(sc - abs(off) + 1.0, 0.0, 1.0);
            sum += texture2D(tColor, uv).rgb * w;
            wsum += w;
          }
        }
        gl_FragColor = vec4(sum / wsum, coc);
      }`,
    depthTest: false,
    depthWrite: false,
  });
}

const gradeMaterial = () =>
  new THREE.ShaderMaterial({
    uniforms: {
      tColor: { value: null },
      uRects: { value: Array.from({ length: MAX_VIEWS }, () => new THREE.Vector4()) },
      uCount: { value: 0 },
      uSpeed: { value: new Array(MAX_VIEWS).fill(0) },
      uTexel: { value: new THREE.Vector2() },
      uSat: { value: 1.1 },
      uContrast: { value: 1.05 },
      uTint: { value: new THREE.Color('#ffffff') },
      uVignette: { value: 0.3 },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tColor;
      uniform float uSpeed[${MAX_VIEWS}];
      uniform vec2 uTexel;
      uniform float uSat;
      uniform float uContrast;
      uniform vec3 uTint;
      uniform float uVignette;
      uniform float uTime;
      varying vec2 vUv;
      ${RECT_GLSL}
      void main() {
        vec2 local;
        int i = viewAt(vUv / uTexel, local);
        vec3 col = texture2D(tColor, vUv).rgb;
        vec2 fromMid = local - 0.5;
        float edge = length(fromMid * vec2(1.25, 1.0));
        if (i >= 0) {
          float s = 0.0;
          for (int k = 0; k < ${MAX_VIEWS}; k++) if (k == i) s = uSpeed[k];
          // Speed: the edges of the view stream toward the middle, the centre stays crisp.
          float pull = s * smoothstep(0.22, 0.75, edge);
          if (pull > 0.001) {
            vec4 r = uRects[i];
            vec2 dir = -fromMid * r.zw * uTexel * pull * 0.09;
            vec3 acc = col;
            for (int k = 1; k <= 6; k++) acc += texture2D(tColor, vUv + dir * float(k) / 6.0).rgb;
            col = acc / 7.0;
          }
        }
        col *= uTint;
        float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
        col = max(mix(vec3(l), col, uSat), 0.0);
        // Contrast around a mid grey, in a way that cannot push colours negative.
        col = 0.18 * pow(col / 0.18, vec3(uContrast));
        col *= 1.0 - uVignette * smoothstep(0.35, 0.95, edge);
        // A whisper of noise breaks up banding in smooth gradients.
        float n = fract(sin(dot(gl_FragCoord.xy + uTime, vec2(12.9898, 78.233))) * 43758.5453);
        col += (n - 0.5) / 255.0;
        gl_FragColor = vec4(col, 1.0);
      }`,
    depthTest: false,
    depthWrite: false,
  });

class ShaderStep extends Pass {
  readonly quad: FullScreenQuad;
  constructor(readonly material: THREE.ShaderMaterial, private source: () => THREE.Texture | null = () => null) {
    super();
    this.quad = new FullScreenQuad(material);
  }
  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget) {
    this.material.uniforms.tColor.value = this.source() ?? readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
  override dispose() {
    this.material.dispose();
    this.quad.dispose();
  }
}

export class Post {
  /** The scene is drawn here: HDR, multisampled, with depth for the depth of field. */
  private scene: THREE.WebGLRenderTarget;
  private composer: EffectComposer;
  private dofH = dofMaterial(true);
  private dofV = dofMaterial(false);
  private grade = gradeMaterial();
  private bloom: UnrealBloomPass;
  private width = 1;
  private height = 1;
  private dofOn = true;
  private dofStrength = 4;

  constructor(private renderer: THREE.WebGLRenderer) {
    this.scene = this.makeTarget();
    this.composer = new EffectComposer(renderer);
    // The scene is not drawn by a pass: the view draws it, viewport by viewport, then hands over.
    this.composer.addPass(new ShaderStep(this.dofH, () => this.scene.texture));
    this.composer.addPass(new ShaderStep(this.dofV));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.35, 0.5, 1.6);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new ShaderStep(this.grade));
    this.composer.addPass(new OutputPass());
    this.dofH.uniforms.uDir.value.set(1, 0);
    this.dofV.uniforms.uDir.value.set(0, 1);
  }

  /** A fresh scene target: three resizes a target's colour but not its depth texture, so it is remade. */
  private makeTarget() {
    const t = new THREE.WebGLRenderTarget(this.width, this.height, {
      type: THREE.HalfFloatType,
      samples: this.dofOn ? 4 : 0,
      depthTexture: new THREE.DepthTexture(this.width, this.height),
    });
    this.dofH.uniforms.tDepth.value = t.depthTexture;
    return t;
  }

  private remakeTarget() {
    this.scene.depthTexture?.dispose();
    this.scene.dispose();
    this.scene = this.makeTarget();
  }

  setSize(w: number, h: number, pixelRatio: number) {
    this.width = Math.max(1, Math.round(w * pixelRatio));
    this.height = Math.max(1, Math.round(h * pixelRatio));
    this.remakeTarget();
    this.composer.setPixelRatio(1);
    this.composer.setSize(this.width, this.height);
    for (const m of [this.dofH, this.dofV, this.grade]) m.uniforms.uTexel.value.set(1 / this.width, 1 / this.height);
    this.applyDof();
  }

  /** Lower quality on slow machines: no depth of field, no multisampling. */
  setQuality(high: boolean) {
    this.dofOn = high;
    this.remakeTarget();
    this.applyDof();
  }

  setGrade(g: Grade) {
    const u = this.grade.uniforms;
    u.uSat.value = g.saturation;
    u.uContrast.value = g.contrast;
    u.uTint.value.set(g.tint);
    u.uVignette.value = g.vignette;
    this.bloom.strength = g.bloom;
    this.dofStrength = g.dof;
    this.applyDof();
  }

  private applyDof() {
    // Blur is set for 1080p and scales with the buffer, so it looks the same at any resolution.
    const r = this.dofOn ? (this.dofStrength * this.height) / 1080 : 0;
    this.dofH.uniforms.uMaxR.value = r;
    this.dofV.uniforms.uMaxR.value = r;
  }

  /** Begin a frame: the scene target is cleared and ready for the viewports. */
  begin() {
    this.renderer.setRenderTarget(this.scene);
    this.renderer.setClearColor('#000000', 1);
    this.scene.scissorTest = false;
    this.renderer.setRenderTarget(this.scene);
    this.renderer.clear();
  }

  /** Point drawing at one viewport of the scene target. */
  viewport(v: PostView) {
    this.scene.viewport.set(v.x, v.y, v.w, v.h);
    this.scene.scissor.set(v.x, v.y, v.w, v.h);
    this.scene.scissorTest = true;
    this.renderer.setRenderTarget(this.scene);
  }

  /** Finish a frame: run the effects over every viewport and draw to the screen. */
  end(views: PostView[], time: number) {
    this.scene.scissorTest = false;
    const n = Math.min(MAX_VIEWS, views.length);
    for (const m of [this.dofH, this.dofV, this.grade]) {
      m.uniforms.uCount.value = n;
      views.slice(0, n).forEach((v, i) => m.uniforms.uRects.value[i].set(v.x, v.y, v.w, v.h));
    }
    views.slice(0, n).forEach((v, i) => {
      this.dofH.uniforms.uClip.value[i].set(v.near, v.far, v.focus);
      this.grade.uniforms.uSpeed.value[i] = v.speed;
    });
    this.grade.uniforms.uTime.value = time % 100;
    this.composer.render();
  }

  dispose() {
    this.scene.depthTexture?.dispose();
    this.scene.dispose();
    this.composer.dispose();
    this.dofH.dispose();
    this.dofV.dispose();
    this.grade.dispose();
  }
}
