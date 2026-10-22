import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/**
 * POS-PROCESSAMENTO "ARCHVIZ" (v0.2)
 * ---------------------------------------------------------------------------
 * A imagem passa por uma pequena "linha de montagem" antes de ir para a tela:
 *  1. RenderPass  - desenha a cena normalmente (em alta faixa dinamica, HDR).
 *  2. GTAOPass    - Oclusao de Ambiente: escurece cantos, frestas e o pe das paredes,
 *                   onde a luz do ceu chega menos. E o que tira o aspecto "maquete de isopor".
 *  3. Bloom       - brilho em volta de luzes fortes (so ao entardecer/noite, nas luminarias).
 *  4. Grade       - ajuste final de cor: contraste suave e vinheta discreta (como uma lente real).
 *  5. OutputPass  - tone mapping (ACES) + conversao para sRGB da tela.
 * Preset "Leve" pula tudo isso e desenha direto (mais FPS em tablet/celular).
 */
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uVignette: { value: 0.22 }, uContrast: { value: 1.04 }, uSat: { value: 1.06 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uVignette, uContrast, uSat; varying vec2 vUv;
  void main(){
    vec4 c = texture2D(tDiffuse, vUv);
    // ainda em HDR linear: contraste em torno do cinza medio (0.18) e saturacao leve
    float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
    c.rgb = mix(vec3(l), c.rgb, uSat);
    c.rgb = 0.18 * pow(max(c.rgb, 0.0) / 0.18, vec3(uContrast));
    vec2 d = vUv - 0.5; c.rgb *= 1.0 - uVignette * smoothstep(0.25, 0.95, dot(d, d) * 2.2);
    gl_FragColor = c;
  }`,
};

export class Post {
  composer: EffectComposer;
  gtao: GTAOPass;
  bloom: UnrealBloomPass;
  grade: ShaderPass;
  enabled = true;
  private lastRadius = 0;

  constructor(private renderer: THREE.WebGLRenderer, private scene: THREE.Scene, private camera: THREE.PerspectiveCamera, hideInAO: () => THREE.Object3D[]) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));
    this.gtao = new GTAOPass(scene, camera, size.x, size.y);
    this.gtao.output = GTAOPass.OUTPUT.Default;
    this.gtao.blendIntensity = 0.85;
    this.gtao.updateGtaoMaterial({ radius: 1.5, distanceExponent: 1.4, thickness: 2, scale: 1.0, samples: 12 });
    this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    // a passada de normais/profundidade do GTAO usa material unico: folhas recortadas (alphaTest)
    // virariam quadrados. Escondemos a folhagem e os decalques so nessa passada.
    const orig = (this.gtao as any)._renderOverride.bind(this.gtao);
    (this.gtao as any)._renderOverride = (...a: any[]) => {
      const hide = hideInAO().filter((o) => o && o.visible); hide.forEach((o) => (o.visible = false));
      // o mapa de sombras ja foi calculado na passada principal: nao recalcular aqui (economiza ~1/3 do quadro)
      const sm = this.renderer.shadowMap, au = sm.autoUpdate; sm.autoUpdate = false;
      orig(...a); sm.autoUpdate = au; hide.forEach((o) => (o.visible = true));
    };
    this.composer.addPass(this.gtao);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.0, 0.6, 0.85);
    this.bloom.enabled = false;
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
  }

  setQuality(q: string) {
    this.enabled = q !== 'leve';
    this.gtao.enabled = q !== 'leve';
    this.gtao.updateGtaoMaterial({ samples: q === 'alta' ? 16 : 10 });
    this.resize();
  }

  resize() {
    const s = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.composer.setPixelRatio(1);
    this.composer.setSize(s.x, s.y);
  }

  /** Raio da oclusao acompanha a escala: ~0,6 m na caminhada, varios metros na vista aerea. */
  setScale(viewDist: number) {
    const r = THREE.MathUtils.clamp(viewDist * 0.012, 0.5, 8);
    if (Math.abs(r - this.lastRadius) / Math.max(this.lastRadius, 1e-3) > 0.08) {
      this.lastRadius = r; this.gtao.updateGtaoMaterial({ radius: r, thickness: r * 1.3 });
    }
  }

  setNight(k: number) {
    this.bloom.enabled = this.enabled && k > 0.02;
    this.bloom.strength = 0.9 * k;
    this.bloom.threshold = 0.9 - 0.3 * k;
    this.grade.uniforms.uVignette.value = 0.22 + 0.15 * k;
  }

  render() { this.composer.render(); }
}
