/**
 * StarHalo.js — El anillo de estrellas alrededor de la figura.
 *
 * Viene directo de la ilustración de referencia: la figura encapuchada tiene un
 * halo circular de estrellas doradas. Es el elemento más reconocible de esa
 * imagen y lo que hace que el centro de la escena se lea como una aparición y no
 * como un diagrama.
 *
 * Se mantiene siempre en el plano XY —el que mira a la cámara— y gira solo sobre
 * Z. Si girara libremente como los sólidos, quedaría de canto y dejaría de ser
 * un halo.
 *
 * Es independiente de la figura: la figura se destruye y se reconstruye cada vez
 * que cambia el número, y el halo tiene que sobrevivir a esos cambios sin
 * parpadear.
 */

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  LineBasicMaterial,
  LineLoop,
  Points,
  ShaderMaterial,
} from 'three';

const TAU = Math.PI * 2;

const VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uSize;
  uniform float uTwinkle;

  attribute float aSeed;
  attribute float aScale;

  varying float vAlpha;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Cada estrella late a su propio ritmo, desfasada por su semilla. Sin esto
    // el anillo entero pulsaría junto y parecería un cartel de neón.
    float twinkle = mix(1.0, 0.4 + 0.6 * sin(uTime * 1.1 + aSeed * 6.2831853), uTwinkle);

    float depth = max(-mvPosition.z, 0.1);
    gl_PointSize = uSize * aScale * twinkle * (12.0 / depth) * uPixelRatio;
    vAlpha = twinkle;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;

  varying float vAlpha;

  void main() {
    // Estrella de cuatro puntas dibujada a mano: un núcleo compacto más dos
    // brazos cruzados. Es la forma que tienen las estrellas de la ilustración, y
    // sale más barata que una textura (cero peticiones, cero memoria).
    vec2 p = (gl_PointCoord - 0.5) * 2.0;
    float r = length(p);

    float core = pow(smoothstep(1.0, 0.0, r), 6.0) * 1.4;
    float armH = smoothstep(0.14, 0.0, abs(p.y)) * smoothstep(1.0, 0.05, abs(p.x));
    float armV = smoothstep(0.14, 0.0, abs(p.x)) * smoothstep(1.0, 0.05, abs(p.y));

    float star = core + (armH + armV) * 0.42;
    if (star < 0.01) discard;

    gl_FragColor = vec4(uColor, min(star, 1.0) * vAlpha * uOpacity);

    #include <colorspace_fragment>
  }
`;

const DEFAULTS = {
  count: 34,
  radius: 1.28,   // en unidades de la figura: apenas por fuera de ella
  jitter: 0.045,  // desprolijidad del anillo — un círculo perfecto se ve impreso
  size: 13,
  color: '#f2e2b4',
  ringColor: '#c9a227',
  ringOpacity: 0.32, // relativo a la opacidad general del halo
  opacity: 0,
  twinkle: 1,
  spin: 0.035,    // rad/s, en sentido contrario a la figura
};

/** PRNG determinista: el halo es idéntico en cada carga. */
function createRandom(seed = 0x1a10) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class StarHalo {
  constructor(options = {}) {
    const config = { ...DEFAULTS, ...options };
    this.config = config;

    const random = createRandom();
    const positions = new Float32Array(config.count * 3);
    const seeds = new Float32Array(config.count);
    const scales = new Float32Array(config.count);

    for (let i = 0; i < config.count; i += 1) {
      // Ángulo repartido en partes iguales más un desvío: el reparto perfecto se
      // lee como un reloj, y el azar puro deja huecos y racimos.
      const angle = (i / config.count) * TAU + (random() - 0.5) * (TAU / config.count) * 0.7;
      const radius = config.radius + (random() - 0.5) * 2 * config.jitter;

      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = Math.sin(angle) * radius;
      positions[i * 3 + 2] = 0;

      seeds[i] = random();
      // Unas pocas notablemente más grandes: la irregularidad es lo que lo hace
      // parecer dibujado a mano.
      scales[i] = 0.55 + random() ** 2 * 0.85;
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('aSeed', new BufferAttribute(seeds, 1));
    geometry.setAttribute('aScale', new BufferAttribute(scales, 1));

    this.material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: 1 },
        uSize: { value: config.size },
        uTwinkle: { value: config.twinkle },
        uOpacity: { value: config.opacity },
        uColor: { value: new Color(config.color) },
      },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });

    this.geometry = geometry;
    this.points = new Points(geometry, this.material);
    this.points.frustumCulled = false;

    /**
     * El aro.
     *
     * Sin él, las estrellas se leen como polvo suelto y no como un halo. En la
     * ilustración de referencia hay un círculo dorado fino con las estrellas
     * apoyadas encima, y es ese aro el que convierte un puñado de puntos en una
     * aureola. Va muy tenue: tiene que insinuarse, no dibujarse.
     */
    const ringPoints = new Float32Array(128 * 3);
    for (let i = 0; i < 128; i += 1) {
      const angle = (i / 128) * TAU;
      ringPoints[i * 3] = Math.cos(angle) * config.radius;
      ringPoints[i * 3 + 1] = Math.sin(angle) * config.radius;
      ringPoints[i * 3 + 2] = 0;
    }
    this.ringGeometry = new BufferGeometry();
    this.ringGeometry.setAttribute('position', new BufferAttribute(ringPoints, 3));

    this.ringMaterial = new LineBasicMaterial({
      color: new Color(config.ringColor),
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
    });

    this.group = new Group();
    this.group.add(new LineLoop(this.ringGeometry, this.ringMaterial));
    this.group.add(this.points);

    this._opacity = config.opacity;
  }

  get object3D() {
    return this.group;
  }

  get opacity() {
    return this._opacity;
  }

  set opacity(value) {
    this._opacity = value;
    this.material.uniforms.uOpacity.value = value;
    this.ringMaterial.opacity = value * this.config.ringOpacity;
  }

  setPixelRatio(value) {
    this.material.uniforms.uPixelRatio.value = value;
  }

  /** El halo se escala con la figura para quedar siempre justo por fuera. */
  setScale(scale) {
    this.group.scale.setScalar(scale);
  }

  setOffsetY(y) {
    this.group.position.y = y;
  }

  update(elapsed, delta, speed = 1) {
    this.material.uniforms.uTime.value = elapsed;
    // Gira al revés que la figura: el contramovimiento es lo que hace que el
    // centro se sienta suspendido en vez de simplemente rotando.
    this.group.rotation.z -= delta * this.config.spin * speed;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.ringGeometry.dispose();
    this.ringMaterial.dispose();
  }
}
