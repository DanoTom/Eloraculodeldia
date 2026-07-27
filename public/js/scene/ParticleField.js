/**
 * ParticleField.js — El polvo dorado del fondo.
 *
 * Un único THREE.Points con ShaderMaterial. Las posiciones se generan una sola
 * vez y nunca se vuelven a tocar desde el CPU: el movimiento entero vive en el
 * vertex shader (ver shaders/particles.js).
 *
 * Las partículas se distribuyen en una CÁSCARA esférica, no en una esfera
 * llena: el centro se deja vacío a propósito para que la figura de geometría
 * sagrada no quede sepultada en polvo.
 */

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Points,
  ShaderMaterial,
} from 'three';

import { PARTICLE_FRAGMENT, PARTICLE_VERTEX } from './shaders/particles.js';

const DEFAULTS = {
  count: 6000,
  innerRadius: 5.5,
  outerRadius: 26,
  size: 9,
  drift: 1.5,
  swirl: 0.012,
  twinkle: 1,
  warm: '#e8c56a', // dorado envejecido
  cool: '#4f8f86', // verde teal, muy en minoría
  opacity: 0,      // arranca invisible; la aparición la maneja GSAP
};

/**
 * Generador pseudoaleatorio determinista (mulberry32).
 * Con semilla fija, el campo de partículas es idéntico en cada carga: si algo
 * se ve raro, se puede reproducir exactamente.
 */
function createRandom(seed = 0x5eed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class ParticleField {
  constructor(options = {}) {
    this.options = { ...DEFAULTS, ...options };

    const { count, innerRadius, outerRadius } = this.options;
    const random = createRandom();

    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    const scales = new Float32Array(count);
    const tones = new Float32Array(count);

    for (let i = 0; i < count; i += 1) {
      // Dirección uniforme sobre la esfera (método de Marsaglia por inversión:
      // cos(phi) uniforme, si no las partículas se apelotonan en los polos).
      const u = random() * 2 - 1;
      const theta = random() * Math.PI * 2;
      const planar = Math.sqrt(Math.max(0, 1 - u * u));

      // Radio sesgado hacia afuera (^(1/3) da densidad pareja por volumen).
      const t = Math.cbrt(random());
      const radius = innerRadius + (outerRadius - innerRadius) * t;

      positions[i * 3] = Math.cos(theta) * planar * radius;
      // Achatamos el eje Y: el campo se lee como una nube ancha, no como una
      // pelota, que es lo que conviene en pantallas horizontales.
      positions[i * 3 + 1] = u * radius * 0.62;
      positions[i * 3 + 2] = Math.sin(theta) * planar * radius;

      seeds[i] = random();
      // Curva cúbica: la enorme mayoría queda chica y unas pocas se destacan
      // como estrellas. Sin el exponente, el campo se ve parejo y sintético.
      scales[i] = 0.4 + random() ** 3 * 1.1;
      tones[i] = random();
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('aSeed', new BufferAttribute(seeds, 1));
    geometry.setAttribute('aScale', new BufferAttribute(scales, 1));
    geometry.setAttribute('aTone', new BufferAttribute(tones, 1));

    // Sin frustum culling: la esfera envuelve a la cámara, y el shader mueve
    // los vértices, así que la bounding sphere calculada por three miente.
    geometry.boundingSphere = null;

    const material = new ShaderMaterial({
      vertexShader: PARTICLE_VERTEX,
      fragmentShader: PARTICLE_FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: 1 },
        uSize: { value: this.options.size },
        uDrift: { value: this.options.drift },
        uSwirl: { value: this.options.swirl },
        uTwinkle: { value: this.options.twinkle },
        uOpacity: { value: this.options.opacity },
        uColorWarm: { value: new Color(this.options.warm) },
        uColorCool: { value: new Color(this.options.cool) },
      },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });

    this.geometry = geometry;
    this.material = material;
    this.points = new Points(geometry, material);
    this.points.frustumCulled = false;
    this.points.renderOrder = -1;
  }

  /** El objeto que se agrega a la escena. */
  get object3D() {
    return this.points;
  }

  /** Opacidad global 0..1 — es la propiedad que anima GSAP en la entrada. */
  get opacity() {
    return this.material.uniforms.uOpacity.value;
  }

  set opacity(value) {
    this.material.uniforms.uOpacity.value = value;
  }

  setPixelRatio(value) {
    this.material.uniforms.uPixelRatio.value = value;
  }

  /**
   * Recorta cuántas partículas se dibujan sin reasignar buffers.
   * Es la palanca del degradado automático de calidad: pasar de 1 a 0.5 baja el
   * costo a la mitad en un cuadro, sin recrear nada.
   */
  setDrawFraction(fraction) {
    const clamped = Math.min(1, Math.max(0.05, fraction));
    this.geometry.setDrawRange(0, Math.floor(this.options.count * clamped));
  }

  get drawnCount() {
    const { count } = this.geometry.drawRange;
    return Number.isFinite(count) ? Math.min(count, this.options.count) : this.options.count;
  }

  update(elapsed) {
    this.material.uniforms.uTime.value = elapsed;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
