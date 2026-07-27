/**
 * scripts/vendor.mjs
 *
 * Copia las dependencias de node_modules a public/vendor/.
 *
 * ¿Por qué vendorizar en vez de usar un CDN?
 *  - Cero peticiones a terceros: nada de jsdelivr/unpkg/Google Fonts. El sitio
 *    entero se sirve desde Cloudflare Pages, así que no hay saltos de red extra
 *    ni dependencia de la disponibilidad de un CDN ajeno.
 *  - Sin paso de build: `public/` es exactamente lo que se despliega.
 *  - Reproducible: las versiones quedan fijadas en package.json.
 *
 * Se ejecuta solo en `npm install` (postinstall) o con `npm run vendor`.
 * El contenido de public/vendor/ NO se commitea (ver .gitignore); Cloudflare
 * Pages lo regenera en cada build al correr `npm install`.
 */

import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NM = join(ROOT, 'node_modules');
const OUT = join(ROOT, 'public', 'vendor');

/** Archivos sueltos: [origen relativo a node_modules, destino relativo a public/vendor] */
const FILES = [
  // three.js — build ESM minificado (three.module.min.js importa three.core.min.js).
  ['three/build/three.module.min.js', 'three/three.module.js'],
  ['three/build/three.core.min.js', 'three/three.core.min.js'],
  ['three/LICENSE', 'three/LICENSE'],

  // Addons de three: solo la cadena mínima para el post-proceso (bloom).
  ...[
    'EffectComposer',
    'Pass',
    'RenderPass',
    'ShaderPass',
    'MaskPass',
    'OutputPass',
    'UnrealBloomPass',
  ].map((n) => [`three/examples/jsm/postprocessing/${n}.js`, `three/addons/postprocessing/${n}.js`]),
  ...['CopyShader', 'LuminosityHighPassShader', 'OutputShader'].map((n) => [
    `three/examples/jsm/shaders/${n}.js`,
    `three/addons/shaders/${n}.js`,
  ]),

  // GSAP — build UMD (un solo archivo, se expone como window.gsap).
  // El paquete no trae LICENSE suelto: el banner de licencia va dentro del .js.
  ['gsap/dist/gsap.min.js', 'gsap/gsap.min.js'],
];

/**
 * Tipografías: solo el subset `latin` (cubre el castellano completo: á é í ó ú
 * ü ñ ¿ ¡) y solo los pesos que realmente usa la interfaz.
 */
const FONTS = [
  // Texto revelado: un Garamond, que es exactamente el registro de manuscrito
  // renacentista de las referencias.
  {
    pkg: '@fontsource/cormorant-garamond',
    family: 'Cormorant Garamond',
    slug: 'cormorant-garamond',
    weights: [300, 400, 500],
    italics: [400],
  },
  // Interfaz: sans geométrica.
  { pkg: '@fontsource/jost', family: 'Jost', slug: 'jost', weights: [300, 400, 500], italics: [] },
  // Display: solo para los números grandes y los titulares. Contraste altísimo
  // y capitales geométricas — es el reemplazo libre de Luna Negra (TAN Type Co),
  // que es comercial. Si algún día se compra, se agrega acá y cambia
  // --font-display en tokens.css. Un solo peso, sin cursiva.
  { pkg: '@fontsource/italiana', family: 'Italiana', slug: 'italiana', weights: [400], italics: [] },
];

/** Rango unicode del subset `latin` de Google Fonts. */
const LATIN_RANGE =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,' +
  'U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';

const faceFile = (slug, weight, style) =>
  `${slug}-latin-${weight}-${style === 'italic' ? 'italic' : 'normal'}.woff2`;

function faceRule({ family, slug, weight, style }) {
  return [
    '@font-face {',
    `  font-family: '${family}';`,
    `  font-style: ${style};`,
    `  font-weight: ${weight};`,
    '  font-display: swap;',
    `  src: url('./files/${faceFile(slug, weight, style)}') format('woff2');`,
    `  unicode-range: ${LATIN_RANGE};`,
    '}',
  ].join('\n');
}

async function vendorFonts() {
  const rules = [];

  for (const font of FONTS) {
    const src = join(NM, font.pkg);
    if (!existsSync(src)) throw new Error(`Falta la dependencia ${font.pkg}. Corré \`npm install\`.`);

    const faces = [
      ...font.weights.map((weight) => ({ ...font, weight, style: 'normal' })),
      ...font.italics.map((weight) => ({ ...font, weight, style: 'italic' })),
    ];

    for (const face of faces) {
      const name = faceFile(font.slug, face.weight, face.style);
      await cp(join(src, 'files', name), join(OUT, 'fonts', 'files', name));
      rules.push(faceRule(face));
    }

    await cp(join(src, 'LICENSE'), join(OUT, 'fonts', `LICENSE-${font.slug}.txt`));
  }

  const header = [
    '/* Generado por scripts/vendor.mjs — no editar a mano. */',
    '/* Tipografías bajo SIL Open Font License 1.1 (ver LICENSE-*.txt). */',
    '',
  ].join('\n');

  await writeFile(join(OUT, 'fonts', 'fonts.css'), `${header}${rules.join('\n\n')}\n`, 'utf8');
  return rules.length;
}

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  for (const [from, to] of FILES) {
    const src = join(NM, from);
    if (!existsSync(src)) throw new Error(`No se encontró ${from}. Corré \`npm install\`.`);
    const dest = join(OUT, to);
    await mkdir(dirname(dest), { recursive: true });
    await cp(src, dest);
  }

  // Renombramos three.module.min.js → three.module.js para que la ruta del
  // importmap sea estable, así que verificamos que su import interno de
  // ./three.core.min.js siga resolviendo tras la copia.
  const moduleSrc = await readFile(join(OUT, 'three', 'three.module.js'), 'utf8');
  if (!moduleSrc.includes('./three.core.min.js')) {
    throw new Error('three.module.min.js ya no importa ./three.core.min.js — revisá scripts/vendor.mjs.');
  }

  const faces = await vendorFonts();
  console.log(`✓ vendor: ${FILES.length} archivos + ${faces} tipografías → public/vendor/`);
}

main().catch((error) => {
  console.error(`✗ vendor falló: ${error.message}`);
  process.exit(1);
});
