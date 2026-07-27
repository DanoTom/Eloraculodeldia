/**
 * OracleScene.js — La escena completa: renderer, cámara, partículas, figura,
 * post-proceso y bucle de animación.
 *
 * Es la única clase que la aplicación necesita conocer:
 *
 *   const scene = new OracleScene(canvas);
 *   await scene.init();
 *   scene.setFigure(7);
 *   scene.reveal();
 *
 * Decisiones que vale la pena tener presentes:
 *
 *   · Sin OrbitControls, sin arrastre, sin scroll: la figura gira sola y la
 *     cámara deriva sola. La escena se mira, no se manipula.
 *   · El bloom se carga con `import()` dinámico y SOLO en dispositivos que lo
 *     aguantan; en un teléfono modesto esos 20 KB nunca se descargan.
 *   · El bucle se detiene con la pestaña oculta.
 *   · Si el rendimiento real no acompaña, `FrameGuard` baja la calidad en
 *     caliente sin recrear la escena.
 */

import {
  ACESFilmicToneMapping,
  Color,
  MathUtils,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer,
} from 'three';

import { gsap } from '../lib/gsap.js';
import { ParticleField } from './ParticleField.js';
import { createSacredFigure } from './SacredGeometry.js';
import { StarHalo } from './StarHalo.js';
import { FrameGuard, TIERS, buildProfile, detectQuality, nextTierDown } from './quality.js';

/** Tiene que coincidir con --ink de tokens.css: el canvas y el CSS se tocan. */
const BACKGROUND = '#05080b';

/** ¿Hay WebGL en este navegador? Si no, la aplicación muestra su versión sobria. */
export function isWebGLAvailable() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(window.WebGLRenderingContext && (canvas.getContext('webgl2') || canvas.getContext('webgl')));
  } catch {
    return false;
  }
}

export class OracleScene {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} [options]
   * @param {HTMLElement} [options.container]  elemento cuyo tamaño manda (por defecto, el padre del canvas)
   * @param {number} [options.figure=1]        número inicial
   * @param {'high'|'medium'|'low'} [options.quality]  fuerza un nivel de calidad
   *   en vez de deducirlo. Es para poder validar los tres perfiles desde una
   *   sola máquina; en producción no se pasa nunca.
   * @param {(profile: object) => void} [options.onQualityChange]
   */
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.container = options.container ?? canvas.parentElement ?? document.body;
    this.options = options;

    this.profile = options.quality ? buildProfile(options.quality) : detectQuality();
    this.guard = new FrameGuard();
    this.running = false;
    this.frameId = 0;

    // Reloj propio en vez de THREE.Clock (deprecado desde r185). El tiempo
    // acumulado suma deltas ya acotados, así que volver a una pestaña oculta
    // reanuda la animación donde estaba en lugar de dar un salto.
    this._elapsed = 0;
    this._lastFrame = 0;

    // Encuadre de la figura. `figureOffsetY` la sube en unidades de mundo y
    // `figureScale` la agranda o achica, para dejarle aire al texto sin mover la
    // cámara (moverla arrastraría también el campo de partículas).
    this.figureOffsetY = options.figureOffsetY ?? 0;
    this.figureScale = options.figureScale ?? 1;

    // Opacidad a la que tiende SIEMPRE la figura. La guarda la escena y no cada
    // figura suelta, para que al transmutar la nueva entre al nivel actual: si
    // la figura está atenuada detrás de un texto, cambiar de número no puede
    // hacer que de golpe suba a full y le pase por encima.
    this.figureOpacity = options.figureOpacity ?? 1;
    this.composer = null;
    this.bloomPass = null;
    this.figure = null;

    this.renderer = new WebGLRenderer({
      canvas,
      // Con bloom, el post-proceso escribe en su propio target y el MSAA del
      // framebuffer por defecto no se usaría: sería puro costo.
      antialias: !this.profile.bloom,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setClearColor(new Color(BACKGROUND), 1);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new Scene();
    this.scene.background = new Color(BACKGROUND);

    this.camera = new PerspectiveCamera(42, 1, 0.1, 120);
    this.camera.position.set(0, 0, 6.2);

    this.particles = new ParticleField({
      count: this.profile.particles,
      size: this.profile.particleSize,
      twinkle: this.profile.twinkle,
      drift: 1.5 * this.profile.motionScale,
      swirl: 0.012 * this.profile.motionScale,
    });
    this.scene.add(this.particles.object3D);

    // El halo de estrellas es independiente de la figura: la figura se destruye
    // y se reconstruye en cada cambio de número, y el halo tiene que sobrevivir
    // a eso sin parpadear.
    this.halo = new StarHalo({
      twinkle: this.profile.twinkle,
      spin: 0.035 * this.profile.motionScale,
      count: this.profile.tier === 'low' ? 22 : 34,
    });
    this.halo.setOffsetY(this.figureOffsetY);
    this.scene.add(this.halo.object3D);

    this._onResize = () => this.resize();
    this._onVisibility = () => (document.hidden ? this.stop() : this.start());
    this._onContextLost = (event) => {
      event.preventDefault();
      this.stop();
    };
    this._onContextRestored = () => this.start();
  }

  /**
   * Carga el post-proceso si el perfil lo permite y deja todo listo para animar.
   * Es async solo por el `import()` del bloom.
   */
  async init() {
    this.resize();

    if (this.profile.bloom) {
      await this._setupComposer();
    }

    if (typeof ResizeObserver === 'function') {
      this.resizeObserver = new ResizeObserver(this._onResize);
      this.resizeObserver.observe(this.container);
    } else {
      window.addEventListener('resize', this._onResize);
    }
    document.addEventListener('visibilitychange', this._onVisibility);
    this.canvas.addEventListener('webglcontextlost', this._onContextLost);
    this.canvas.addEventListener('webglcontextrestored', this._onContextRestored);

    this.setFigure(this.options.figure ?? 1, { animate: false });
    return this;
  }

  async _setupComposer() {
    const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }] = await Promise.all([
      import('three/addons/postprocessing/EffectComposer.js'),
      import('three/addons/postprocessing/RenderPass.js'),
      import('three/addons/postprocessing/UnrealBloomPass.js'),
      import('three/addons/postprocessing/OutputPass.js'),
    ]);

    const { width, height } = this._size();
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    // strength / radius / threshold.
    // El bloom acá es un velo, no un efecto: las líneas ya van en blending
    // aditivo, así que con fuerza alta los cruces se funden en un borrón blanco
    // y la figura pierde el dibujo. El umbral alto hace que solo florezcan las
    // líneas y los núcleos de las partículas, nunca el fondo.
    this.bloomPass = new UnrealBloomPass(new Vector2(width, height), 0.48, 0.42, 0.28);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());

    this.composer.setPixelRatio(this.profile.devicePixelRatio);
    this.composer.setSize(width, height);
  }

  _size() {
    const rect = this.container.getBoundingClientRect();
    return {
      width: Math.max(1, Math.round(rect.width || window.innerWidth)),
      height: Math.max(1, Math.round(rect.height || window.innerHeight)),
    };
  }

  /**
   * Escala de la figura según el viewport: se calcula a partir de lo que la
   * cámara realmente ve, no de píxeles. Así ocupa la misma proporción de
   * pantalla en un monitor ancho y en un teléfono vertical.
   */
  _figureScale() {
    const visibleHeight = 2 * Math.tan(MathUtils.degToRad(this.camera.fov) / 2) * this.camera.position.z;
    const visibleWidth = visibleHeight * this.camera.aspect;
    return MathUtils.clamp(Math.min(visibleHeight, visibleWidth) * 0.21, 0.5, 1.15) * this.figureScale;
  }

  resize() {
    const { width, height } = this._size();

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setPixelRatio(this.profile.devicePixelRatio);
    this.renderer.setSize(width, height, false);

    if (this.composer) {
      this.composer.setPixelRatio(this.profile.devicePixelRatio);
      this.composer.setSize(width, height);
    }

    this.particles.setPixelRatio(this.profile.devicePixelRatio);
    this.halo.setPixelRatio(this.profile.devicePixelRatio);
    this.halo.setScale(this._figureScale());
    if (this.figure) {
      this.figure.setPixelRatio(this.profile.devicePixelRatio);
      this.figure.setScale(this._figureScale());
    }
  }

  /**
   * Cambia la figura central.
   * Con `animate`, la anterior se desvanece y se destruye recién cuando
   * terminó de irse: nunca hay un parpadeo con la escena vacía.
   */
  setFigure(number, { animate = true, duration = 1.1 } = {}) {
    const previous = this.figure;

    const next = createSacredFigure(number, {
      scale: this._figureScale(),
      opacity: 0,
      nodeSize: this.profile.nodeSize,
    });
    next.setPixelRatio(this.profile.devicePixelRatio);
    next.object3D.position.y = this.figureOffsetY;
    this.scene.add(next.object3D);
    this.figure = next;

    // La figura nueva hereda la rotación de la anterior para que el cambio se
    // sienta como una transmutación y no como un corte.
    if (previous) next.object3D.rotation.copy(previous.object3D.rotation);

    if (!animate) {
      next.opacity = this.figureOpacity;
      if (previous) this._removeFigure(previous);
      return next;
    }

    gsap.to(next, { opacity: this.figureOpacity, duration, ease: 'power2.out' });

    if (previous) {
      gsap.to(previous, {
        opacity: 0,
        duration: duration * 0.6,
        ease: 'power2.in',
        onComplete: () => this._removeFigure(previous),
      });
    }

    return next;
  }

  _removeFigure(figure) {
    gsap.killTweensOf(figure);
    this.scene.remove(figure.object3D);
    figure.dispose();
  }

  /**
   * Lleva la figura a una opacidad y la deja ahí.
   *
   * Cada pantalla pide la suya: la figura es fondo cuando hay que leer un
   * párrafo, y protagonista cuando el número aterriza.
   */
  setFigureOpacity(value, { duration = 1 } = {}) {
    this.figureOpacity = value;
    if (this.figure) {
      gsap.to(this.figure, { opacity: value, duration, ease: 'power2.inOut', overwrite: 'auto' });
    }
    return this;
  }

  /**
   * Opacidad del halo, por separado de la figura.
   *
   * Van desacopladas porque no siempre quieren lo mismo: en el clímax el halo es
   * protagonista, y sobre un párrafo de cien palabras el aro cruza justo las
   * líneas de texto y hay que bajarlo casi a cero. Atarlo a la figura con un
   * multiplicador fijo daba bien en una pantalla y mal en la otra.
   */
  setHaloOpacity(value, { duration = 1 } = {}) {
    gsap.to(this.halo, { opacity: value, duration, ease: 'power2.inOut', overwrite: 'auto' });
    return this;
  }

  /** Reencuadra la figura (posición y tamaño) según lo que pida la pantalla. */
  setFraming({ offsetY, scale, duration = 1 } = {}) {
    if (typeof offsetY === 'number') {
      this.figureOffsetY = offsetY;
      gsap.to(this.halo.object3D.position, { y: offsetY, duration, ease: 'power2.inOut' });
      if (this.figure) {
        gsap.to(this.figure.object3D.position, { y: offsetY, duration, ease: 'power2.inOut' });
      }
    }
    if (typeof scale === 'number') {
      this.figureScale = scale;
      // Se anima `baseScale` y no la escala del objeto: el bucle de la figura
      // reescribe scale en cada cuadro para la respiración, así que cualquier
      // tween sobre object3D.scale lo pisaría al instante siguiente.
      gsap.to(this.halo.object3D.scale, {
        x: this._figureScale(),
        y: this._figureScale(),
        z: this._figureScale(),
        duration,
        ease: 'power2.inOut',
      });
      if (this.figure) {
        gsap.to(this.figure, { baseScale: this._figureScale(), duration, ease: 'power2.inOut' });
      }
    }
    return this;
  }

  /** Aparición inicial del campo de partículas. Es el telón que se levanta. */
  reveal({ duration = 2.6, delay = 0 } = {}) {
    gsap.to(this.particles, {
      opacity: 1,
      duration: this.profile.reducedMotion ? 0.6 : duration,
      delay,
      ease: 'power2.out',
    });
    return this;
  }

  start() {
    if (this.running) return this;
    this.running = true;
    this._lastFrame = performance.now(); // descarta el hueco en que estuvo parada
    const tick = () => {
      this.frameId = requestAnimationFrame(tick);
      this._frame();
    };
    this.frameId = requestAnimationFrame(tick);
    return this;
  }

  stop() {
    if (!this.running) return this;
    this.running = false;
    cancelAnimationFrame(this.frameId);
    return this;
  }

  _frame() {
    const now = performance.now();
    const delta = Math.min((now - this._lastFrame) / 1000, 0.1);
    this._lastFrame = now;
    this._elapsed += delta;
    const elapsed = this._elapsed;

    this.particles.update(elapsed);
    this.halo.update(elapsed, delta, this.profile.motionScale);
    if (this.figure) this.figure.update(elapsed, delta, this.profile.motionScale);

    // Deriva de cámara: automática, mínima, sin intervención del usuario.
    const drift = this.profile.reducedMotion ? 0 : 1;
    this.camera.position.x = Math.sin(elapsed * 0.07) * 0.24 * drift;
    this.camera.position.y = Math.cos(elapsed * 0.05) * 0.16 * drift;
    this.camera.lookAt(0, 0, 0);

    if (this.composer) this.composer.render(delta);
    else this.renderer.render(this.scene, this.camera);

    if (this.guard.sample(delta * 1000)) this._degrade();
  }

  /** Baja un nivel de calidad en caliente, sin recrear la escena. */
  _degrade() {
    const tier = nextTierDown(this.profile.tier);
    if (!tier) return;

    this.profile = { ...buildProfile(tier), tier };

    // Menos partículas dibujadas (mismos buffers) y menos resolución.
    this.particles.setDrawFraction(TIERS[tier].particles / this.particles.options.count);
    this.particles.material.uniforms.uSize.value = this.profile.particleSize;

    if (!this.profile.bloom && this.composer) {
      this.composer.dispose();
      this.composer = null;
      this.bloomPass = null;
    }

    this.resize();
    this.options.onQualityChange?.(this.profile);
  }

  /** Instrumentación para el panel del laboratorio. */
  get stats() {
    return {
      tier: this.profile.tier,
      fps: this.guard.fps,
      particles: this.particles.drawnCount,
      bloom: Boolean(this.composer),
      pixelRatio: this.profile.devicePixelRatio,
      figure: this.figure ? `${this.figure.number} · ${this.figure.archetype.title}` : '—',
      calls: this.renderer.info.render.calls,
    };
  }

  dispose() {
    this.stop();

    this.resizeObserver?.disconnect();
    window.removeEventListener('resize', this._onResize);
    document.removeEventListener('visibilitychange', this._onVisibility);
    this.canvas.removeEventListener('webglcontextlost', this._onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this._onContextRestored);

    gsap.killTweensOf(this.particles);
    gsap.killTweensOf(this.halo);
    this.halo.dispose();
    if (this.figure) {
      gsap.killTweensOf(this.figure);
      this.figure.dispose();
    }
    this.particles.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
  }
}
