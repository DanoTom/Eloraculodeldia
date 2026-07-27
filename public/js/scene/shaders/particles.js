/**
 * particles.js — Shaders del campo de partículas doradas.
 *
 * Todo el movimiento ocurre en la GPU: el JS sube `uTime` una vez por cuadro y
 * no toca ni un solo vértice. Es la única forma de sostener decenas de miles de
 * partículas a 60fps en un teléfono.
 *
 * El desplazamiento combina tres cosas:
 *   1. deriva por ruido simplex (movimiento orgánico, lento),
 *   2. una rotación muy lenta de todo el campo alrededor del eje Y,
 *   3. un titileo por partícula, desfasado con su semilla.
 */

import { SIMPLEX_3D } from './noise.js';

export const PARTICLE_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uSize;
  uniform float uDrift;
  uniform float uSwirl;
  uniform float uTwinkle;

  attribute float aSeed;
  attribute float aScale;
  attribute float aTone;

  varying float vAlpha;
  varying float vTone;

  ${SIMPLEX_3D}

  void main() {
    vec3 pos = position;

    // 1 · Deriva orgánica: tres muestras de ruido a escalas distintas para que
    //     el campo respire en vez de trasladarse en bloque.
    float t = uTime * 0.05;
    vec3 drift = vec3(
      snoise(pos * 0.16 + vec3(0.0, t, 0.0)),
      snoise(pos * 0.21 + vec3(t, 0.0, t * 0.7)),
      snoise(pos * 0.13 + vec3(t * 0.6, t * 0.4, 0.0))
    );
    pos += drift * uDrift;

    // 2 · Giro global lentísimo, más rápido cerca del centro (rotación
    //     diferencial: da sensación de profundidad sin mover la cámara).
    float radius = length(pos.xz);
    float angle = uTime * uSwirl * (1.0 / (1.0 + radius * 0.12));
    float s = sin(angle);
    float c = cos(angle);
    pos.xz = mat2(c, -s, s, c) * pos.xz;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // 3 · Titileo desfasado por semilla.
    float twinkle = mix(1.0, 0.45 + 0.55 * sin(uTime * 0.7 + aSeed * 6.2831853), uTwinkle);

    float depth = max(-mvPosition.z, 0.1);

    // Tamaño con atenuación por perspectiva, con techo: sin ese min(), una
    // partícula grande que pase cerca de la cámara se convierte en una mancha
    // de cien píxeles que arruina la escena entera (y cuesta fillrate).
    gl_PointSize = min(uSize * aScale * twinkle * (12.0 / depth), 16.0) * uPixelRatio;

    // Se desvanecen en la distancia y también cerca de la cámara, para que nada
    // pase "rozando el lente" y rompa la calma.
    vAlpha = twinkle * smoothstep(42.0, 16.0, depth) * smoothstep(2.0, 7.0, depth);
    vTone = aTone;
  }
`;

export const PARTICLE_FRAGMENT = /* glsl */ `
  uniform vec3 uColorWarm;
  uniform vec3 uColorCool;
  uniform float uOpacity;

  varying float vAlpha;
  varying float vTone;

  void main() {
    // Disco suave: sin texturas, sin peticiones de red, sin bordes duros.
    float d = length(gl_PointCoord - 0.5);
    float core = smoothstep(0.5, 0.0, d);
    float alpha = pow(core, 2.4);
    if (alpha < 0.004) discard;

    // Casi todas las partículas son doradas; el verde teal aparece apenas, en
    // las de tono alto, para dar profundidad sin enfriar la paleta.
    vec3 color = mix(uColorWarm, uColorCool, smoothstep(0.62, 1.0, vTone));

    gl_FragColor = vec4(color, alpha * vAlpha * uOpacity);

    #include <colorspace_fragment>
  }
`;
