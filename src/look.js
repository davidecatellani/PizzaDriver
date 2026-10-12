import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// Late-afternoon Neapolitan light: physical sky, warm sun, image-based fill light from the sky,
// and a light post-processing stack (bloom, colour grade, vignette). Drops the post effects and
// pixel ratio by itself when the frame rate is low.

export const SUN_DIR = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(38), THREE.MathUtils.degToRad(215));

const Grade = {
  uniforms: { tDiffuse: { value: null }, vignette: { value: 0.35 }, saturation: { value: 1.12 }, warmth: { value: 0.04 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float vignette, saturation, warmth; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb = mix(vec3(l), c.rgb, saturation);
      c.rgb += vec3(warmth, warmth * 0.4, -warmth);
      vec2 d = vUv - 0.5;
      c.rgb *= 1.0 - vignette * dot(d, d) * 2.2;
      gl_FragColor = c;
    }`,
};

export class Look {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;

    const sky = new Sky();
    sky.scale.setScalar(1000);
    const u = sky.material.uniforms;
    u.turbidity.value = 4;
    u.rayleigh.value = 1.4;
    u.mieCoefficient.value = 0.004;
    u.mieDirectionalG.value = 0.85;
    u.sunPosition.value.copy(SUN_DIR);
    this.sky = sky;
    scene.add(sky);
    scene.background = null;

    // Fill light from the sky itself.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    envScene.add(sky.clone());
    const ground = new THREE.Mesh(new THREE.CircleGeometry(900, 16), new THREE.MeshBasicMaterial({ color: 0x5a5148 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -10;
    envScene.add(ground);
    scene.environment = pmrem.fromScene(envScene, 0, 0.1, 2000).texture;
    scene.environmentIntensity = 0.55;
    pmrem.dispose();

    scene.fog = new THREE.Fog(0xc9d9e6, 140, 520);

    const size = renderer.getSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.22, 0.5, 0.95);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(Grade);
    this.composer.addPass(this.grade);

    this.post = true;
    this.frames = 0;
    this.checks = 0;
    this.watch = false;   // set once a race starts, so menus and loading do not count
  }

  setSize(w, h) {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
  }

  // Keeps the sky centred on the camera so it never clips.
  render() {
    this.sky.position.copy(this.camera.position);
    if (this.post) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
    this.adapt();
  }

  // After the first seconds of play, step quality down while the frame rate stays under ~45 fps.
  adapt() {
    if (this.checks >= 2 || !this.watch) return;
    const now = performance.now();
    this.start ??= now;
    this.frames++;
    if (now - this.start < 3000) return;
    const fps = this.frames / ((now - this.start) / 1000);
    this.frames = 0;
    this.start = now;
    if (fps > 45) return;
    this.checks++;
    if (this.post) {
      this.post = false;
    } else {
      this.renderer.setPixelRatio(1);
      const s = this.renderer.getSize(new THREE.Vector2());
      this.setSize(s.x, s.y);
    }
  }
}
