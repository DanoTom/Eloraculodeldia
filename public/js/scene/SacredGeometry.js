/**
 * SacredGeometry.js — Una figura por número del oráculo.
 *
 * Cada figura se describe de forma declarativa como una lista de segmentos de
 * línea en coordenadas canónicas (radio ≈ 1), y un único constructor la
 * convierte en objetos de three.js. Así agregar una figura es escribir
 * geometría, no plomería.
 *
 * Las figuras se dividen en dos modos de rotación:
 *
 *   · `solid`  — sólidos platónicos y compuestos 3D. Giran libremente sobre Y
 *                con una oscilación suave en X.
 *   · `planar` — figuras planas (estrellas, círculos). Giran DENTRO de su plano
 *                y solo se inclinan un poco: si rotaran como los sólidos,
 *                quedarían de canto y desaparecerían.
 *
 * A las figuras planas se les agregan dos copias fantasma desplazadas en Z, con
 * poca opacidad. Es un truco barato que les da volumen al inclinarse, sin
 * extruir geometría ni sumar draw calls significativos.
 *
 * No hay interacción de usuario: la figura gira sola, siempre. Es parte de la
 * ceremonia, no un visor 3D.
 */

import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  OctahedronGeometry,
  Points,
  ShaderMaterial,
  TetrahedronGeometry,
} from 'three';

import { ARCHETYPES } from '../core/archetypes.js';

const TAU = Math.PI * 2;

/* ------------------------------------------------------------------ */
/* Utilidades de construcción                                          */
/* ------------------------------------------------------------------ */

/** Vértices de un polígono regular de `n` lados en el plano XY. */
function polygon(n, radius, rotation = Math.PI / 2) {
  return Array.from({ length: n }, (_, i) => {
    const angle = rotation + (i / n) * TAU;
    return [Math.cos(angle) * radius, Math.sin(angle) * radius, 0];
  });
}

/** Convierte un anillo cerrado de puntos en pares de segmentos consecutivos. */
function loop(points) {
  const segments = [];
  for (let i = 0; i < points.length; i += 1) {
    segments.push(points[i], points[(i + 1) % points.length]);
  }
  return segments;
}

/** Círculo como anillo cerrado. `steps` alto porque son solo líneas: es barato. */
function circle(radius, center = [0, 0, 0], steps = 72) {
  return loop(
    polygon(steps, radius, 0).map(([x, y]) => [x + center[0], y + center[1], center[2] ?? 0]),
  );
}

/**
 * Polígono estrellado {n/step}: une cada vértice con el que está `step`
 * posiciones más allá. {5/2} da el pentagrama, {7/3} el heptagrama.
 */
function star(n, step, radius, rotation = Math.PI / 2) {
  const points = polygon(n, radius, rotation);
  const segments = [];
  for (let i = 0; i < n; i += 1) {
    segments.push(points[i], points[(i + step) % n]);
  }
  return segments;
}

/**
 * Extrae las aristas de una geometría sólida como pares de puntos.
 * `EdgesGeometry` ya devuelve vértices consecutivos de a dos, que es
 * exactamente el formato que usa el resto de este módulo.
 */
function edgesOf(geometry) {
  const edges = new EdgesGeometry(geometry, 1);
  const array = edges.attributes.position.array;
  const segments = [];
  for (let i = 0; i < array.length; i += 3) {
    segments.push([array[i], array[i + 1], array[i + 2]]);
  }
  edges.dispose();
  geometry.dispose();
  return segments;
}

/** Las 8 esquinas de un cubo de lado `side`. */
const cubeCorners = (side) => {
  const h = side / 2;
  const corners = [];
  for (const x of [-h, h]) for (const y of [-h, h]) for (const z of [-h, h]) corners.push([x, y, z]);
  return corners;
};

/* ------------------------------------------------------------------ */
/* Las figuras                                                         */
/* ------------------------------------------------------------------ */

/** Lado de un cubo cuyo radio circunscrito es 1. */
const CUBE_SIDE = 2 / Math.sqrt(3);

/**
 * @typedef {object} FigureSpec
 * @property {number[][]} segments  pares consecutivos de puntos = un segmento
 * @property {'solid'|'planar'} mode
 * @property {number[][]} [nodes]   vértices que se iluminan como puntos de luz
 *
 * Sobre `nodes`: si el builder no lo declara, se deducen de los extremos únicos
 * de los segmentos. Eso funciona para los sólidos (un tetraedro tiene 4
 * vértices y punto), pero es desastroso para cualquier figura con círculos: un
 * círculo son 72 muestras, y auto-deducir convertiría la línea en una hilera de
 * cuentas. Por eso toda figura con círculos declara sus nodos a mano.
 *
 * @type {Record<string, () => FigureSpec>}
 * Cada builder devuelve geometría en coordenadas canónicas (radio ≈ 1).
 */
const BUILDERS = {
  /** 1 · El Umbral — tetraedro: el sólido mínimo, el primer volumen posible. */
  tetrahedron: () => ({
    mode: 'solid',
    segments: edgesOf(new TetrahedronGeometry(1)),
  }),

  /** 2 · La Vesica — dos círculos que se cruzan y el ojo que abren. */
  vesica: () => {
    const r = 0.68;
    const offset = r / 2;
    const lens = (r * Math.sqrt(3)) / 2;
    return {
      mode: 'planar',
      segments: [
        ...circle(r, [-offset, 0, 0]),
        ...circle(r, [offset, 0, 0]),
        // El eje vertical de la lente y la recta que une los dos centros.
        [0, lens, 0],
        [0, -lens, 0],
        [-r - offset, 0, 0],
        [r + offset, 0, 0],
      ],
      nodes: [
        [0, lens, 0],
        [0, -lens, 0],
        [-offset, 0, 0],
        [offset, 0, 0],
      ],
    };
  },

  /** 3 · El Triángulo — triángulo con sus círculos inscrito y circunscrito. */
  triad: () => ({
    mode: 'planar',
    segments: [
      ...loop(polygon(3, 1)),
      ...circle(1),
      ...circle(0.5), // inradio de un triángulo equilátero = R/2
    ],
    nodes: polygon(3, 1),
  }),

  /** 4 · La Piedra — el cubo, único sólido que apoya en una cara plana. */
  cube: () => ({
    mode: 'solid',
    segments: edgesOf(new BoxGeometry(CUBE_SIDE, CUBE_SIDE, CUBE_SIDE)),
  }),

  /** 5 · El Pentagrama — {5/2}, el pentágono interior y el círculo que lo ata. */
  pentagram: () => ({
    mode: 'planar',
    segments: [
      ...star(5, 2, 1),
      ...circle(1),
      // Círculo inscrito en el pentágono interior. Dibujar ese pentágono sería
      // redundante: sus lados son exactamente las cuerdas del pentagrama que ya
      // están trazadas, así que no se vería nada nuevo.
      ...circle((1 / 1.618034 ** 2) * Math.cos(Math.PI / 5)),
    ],
    nodes: polygon(5, 1),
  }),

  /** 6 · La Flor — semilla de la vida: siete círculos que se tocan. */
  flower: () => {
    const r = 0.5;
    const centers = polygon(6, r, 0);
    return {
      mode: 'planar',
      segments: [
        ...circle(r),
        ...centers.flatMap(([x, y]) => circle(r, [x, y, 0])),
        ...circle(2 * r),
        ...loop(polygon(6, 2 * r, 0)),
      ],
      nodes: [[0, 0, 0], ...centers],
    };
  },

  /** 7 · El Retiro — heptagrama {7/3}: la estrella que no se puede construir con regla y compás. */
  heptagram: () => ({
    mode: 'planar',
    segments: [...star(7, 3, 1), ...circle(1), ...circle(0.34)],
    nodes: polygon(7, 1),
  }),

  /** 8 · La Balanza — octaedro: dos pirámides en equilibrio sobre una base común. */
  octahedron: () => ({
    mode: 'solid',
    segments: edgesOf(new OctahedronGeometry(1)),
  }),

  /** 9 · El Cierre — tres triángulos rotados 40°: nueve puntas, un solo círculo. */
  enneagram: () => ({
    mode: 'planar',
    segments: [
      ...loop(polygon(3, 1, Math.PI / 2)),
      ...loop(polygon(3, 1, Math.PI / 2 + TAU / 9)),
      ...loop(polygon(3, 1, Math.PI / 2 + (2 * TAU) / 9)),
      ...circle(1),
    ],
    // Los tres triángulos rotados de a 40° apoyan sus vértices justo en los
    // nueve puntos de un eneágono regular.
    nodes: polygon(9, 1),
  }),

  /** 11 · Las Columnas — dos pilares, un dintel y la vesica del umbral. */
  pillars: () => {
    const x = 0.58;
    const halfWidth = 0.17;
    const height = 0.78;
    const column = (cx) =>
      loop([
        [cx - halfWidth, -height, 0],
        [cx + halfWidth, -height, 0],
        [cx + halfWidth, height, 0],
        [cx - halfWidth, height, 0],
      ]);
    const r = 0.34;
    const lens = (r * Math.sqrt(3)) / 2;
    return {
      mode: 'planar',
      nodes: [
        [-x - halfWidth, height, 0],
        [x + halfWidth, height, 0],
        [-x - halfWidth, -height, 0],
        [x + halfWidth, -height, 0],
        [0, height, 0],
        [0, lens, 0],
        [0, -lens, 0],
      ],
      segments: [
        ...column(-x),
        ...column(x),
        // Solo el dintel de arriba. Con la línea de abajo también, las cuatro
        // rectas cierran un rectángulo y la figura se lee como una caja en vez
        // de como una puerta.
        [-x - halfWidth, height, 0],
        [x + halfWidth, height, 0],
        // La vesica que se abre entre las dos columnas.
        ...circle(r, [-r / 2, 0, 0]),
        ...circle(r, [r / 2, 0, 0]),
      ],
    };
  },

  /** 22 · El Constructor — teseracto: un cubo dentro de otro, y las aristas que los ligan. */
  tesseract: () => {
    const outer = CUBE_SIDE;
    const inner = CUBE_SIDE * 0.48;
    // `cubeCorners` recorre las esquinas en el mismo orden para cualquier lado,
    // así que el índice i empareja cada esquina externa con su homóloga interna.
    const innerCorners = cubeCorners(inner);
    const links = cubeCorners(outer).flatMap((corner, i) => [corner, innerCorners[i]]);
    return {
      mode: 'solid',
      segments: [
        ...edgesOf(new BoxGeometry(outer, outer, outer)),
        ...edgesOf(new BoxGeometry(inner, inner, inner)),
        ...links,
      ],
    };
  },

  /** 33 · La Merkaba — dos tetraedros atravesados, uno el reflejo del otro. */
  merkaba: () => {
    const up = edgesOf(new TetrahedronGeometry(1));
    const down = up.map(([x, y, z]) => [-x, -y, -z]);
    return { mode: 'solid', segments: [...up, ...down] };
  },
};

/* ------------------------------------------------------------------ */
/* Materiales                                                          */
/* ------------------------------------------------------------------ */

const NODE_VERTEX = /* glsl */ `
  uniform float uSize;
  uniform float uPixelRatio;
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = uSize * uPixelRatio * (12.0 / max(-mvPosition.z, 0.1));
  }
`;

const NODE_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float alpha = pow(smoothstep(0.5, 0.0, d), 2.0);
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(uColor, alpha * uOpacity);
    #include <colorspace_fragment>
  }
`;

function lineGeometry(segments) {
  const positions = new Float32Array(segments.length * 3);
  segments.forEach(([x, y, z], i) => {
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  return geometry;
}

/** Vértices únicos de la figura: son los que se iluminan como nodos. */
function uniquePoints(segments, precision = 3) {
  const seen = new Map();
  for (const point of segments) {
    const key = point.map((n) => n.toFixed(precision)).join(',');
    if (!seen.has(key)) seen.set(key, point);
  }
  return [...seen.values()];
}

/* ------------------------------------------------------------------ */
/* La figura                                                           */
/* ------------------------------------------------------------------ */

const DEFAULTS = {
  scale: 1,
  color: '#e3bd6b',
  opacity: 0,        // entra con GSAP
  ghosts: true,      // copias fantasma en Z para las figuras planas
  nodes: true,       // puntos de luz en los vértices
  nodeSize: 5,
};

export class SacredFigure {
  constructor(number, options = {}) {
    const config = { ...DEFAULTS, ...options };
    const archetype = ARCHETYPES[number] ?? ARCHETYPES[1];
    const build = BUILDERS[archetype.figure] ?? BUILDERS.tetrahedron;
    const { segments, mode, nodes } = build();

    this.number = archetype.number;
    this.archetype = archetype;
    this.mode = mode;
    this.baseScale = config.scale;

    this.group = new Group();
    this.group.scale.setScalar(config.scale);

    const color = new Color(config.color);
    this.materials = [];
    this.geometries = [];

    const geometry = lineGeometry(segments);
    this.geometries.push(geometry);

    const mainMaterial = new LineBasicMaterial({
      color,
      transparent: true,
      opacity: config.opacity,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    this.materials.push({ material: mainMaterial, weight: 1 });
    this.group.add(new LineSegments(geometry, mainMaterial));

    // Copias fantasma: solo para figuras planas, que sin esto se ven como una
    // calcomanía. Comparten la misma geometría, así que no cuestan memoria.
    if (config.ghosts && mode === 'planar') {
      for (const offset of [-0.05, 0.05]) {
        const ghostMaterial = new LineBasicMaterial({
          color,
          transparent: true,
          opacity: config.opacity * 0.25,
          blending: AdditiveBlending,
          depthWrite: false,
        });
        this.materials.push({ material: ghostMaterial, weight: 0.25 });
        const ghost = new LineSegments(geometry, ghostMaterial);
        ghost.position.z = offset;
        ghost.scale.setScalar(0.985);
        this.group.add(ghost);
      }
    }

    if (config.nodes) {
      // Nodos declarados por la figura; si no los declara, se deducen (solo es
      // seguro en los sólidos, que no tienen círculos).
      const points = nodes ?? uniquePoints(segments);
      const nodeGeometry = lineGeometry(points);
      this.geometries.push(nodeGeometry);

      this.nodeMaterial = new ShaderMaterial({
        vertexShader: NODE_VERTEX,
        fragmentShader: NODE_FRAGMENT,
        uniforms: {
          uSize: { value: config.nodeSize },
          uPixelRatio: { value: 1 },
          uColor: { value: new Color('#f4e2b0') },
          uOpacity: { value: config.opacity },
        },
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      });
      this.materials.push({ material: this.nodeMaterial, weight: 1, uniform: true });
      this.group.add(new Points(nodeGeometry, this.nodeMaterial));
    }

    this._opacity = config.opacity;
  }

  get object3D() {
    return this.group;
  }

  get opacity() {
    return this._opacity;
  }

  /** Opacidad global de la figura. Es lo que anima GSAP al revelar y al salir. */
  set opacity(value) {
    this._opacity = value;
    for (const entry of this.materials) {
      const target = value * entry.weight;
      if (entry.uniform) entry.material.uniforms.uOpacity.value = target;
      else entry.material.opacity = target;
    }
  }

  setPixelRatio(value) {
    if (this.nodeMaterial) this.nodeMaterial.uniforms.uPixelRatio.value = value;
  }

  setScale(scale) {
    this.baseScale = scale;
  }

  /**
   * Rotación automática. `speed` (0..1) permite frenarla casi del todo cuando
   * el sistema pide `prefers-reduced-motion`.
   */
  update(elapsed, delta, speed = 1) {
    const g = this.group;

    if (this.mode === 'solid') {
      g.rotation.y += delta * 0.16 * speed;
      g.rotation.x = Math.sin(elapsed * 0.13 * speed) * 0.28;
    } else {
      // En el plano: gira sobre Z y solo se asoma un poco en X e Y, para que
      // nunca quede de canto.
      g.rotation.z += delta * 0.055 * speed;
      g.rotation.x = Math.sin(elapsed * 0.17 * speed) * 0.24;
      g.rotation.y = Math.cos(elapsed * 0.12 * speed) * 0.26;
    }

    // Respiración: apenas perceptible, pero es lo que separa "girando" de "vivo".
    const breath = 1 + Math.sin(elapsed * 0.45 * speed) * 0.014;
    g.scale.setScalar(this.baseScale * breath);
  }

  dispose() {
    for (const geometry of this.geometries) geometry.dispose();
    for (const { material } of this.materials) material.dispose();
    this.group.clear();
  }
}

/** Crea la figura correspondiente a un número del oráculo. */
export function createSacredFigure(number, options) {
  return new SacredFigure(number, options);
}

/** Claves de figura disponibles — lo usan los tests y el panel del laboratorio. */
export const FIGURE_KEYS = Object.freeze(Object.keys(BUILDERS));
