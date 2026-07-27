# El Oráculo del Día

Una revelación numerológica por día. La persona entrega su nombre y su fecha de
nacimiento; el sistema calcula tres números pitagóricos, los funde en un cuarto
—el **Número Personal del Día**— y sobre ese número construye una revelación
breve. Una sola vez por día, y hasta que el sol vuelva a nacer.

> **Estado: primer entregable.** Están terminados el cálculo numerológico (con
> tests), la base 3D y la identidad visual. El formulario, el bloqueo diario y la
> integración con GLM-5.2 son las próximas iteraciones — ver
> [Hoja de ruta](#hoja-de-ruta).

---

## Empezar

```bash
npm install     # instala dependencias y vendoriza three/gsap/tipografías
npm test        # 100 aserciones sobre el núcleo numerológico
npm run serve   # http://localhost:4321  (servidor estático, sin Workers)
npm run dev     # http://localhost:8788  (wrangler: incluye /functions)
```

| Página      | Para qué                                                                    |
| ----------- | --------------------------------------------------------------------------- |
| `/`         | Portada. Muestra la figura del Número del Día de hoy.                       |
| `/lab.html` | Laboratorio visual: las 12 figuras, métricas en vivo y los tests.           |

Parámetros útiles del laboratorio:

- `?n=22` — abre directo en una figura.
- `?q=high\|medium\|low` — fuerza el nivel de calidad (así se pueden validar los
  tres perfiles, y el camino con bloom, desde una sola máquina).
- `?test=1` — corre los tests numerológicos al cargar.
- `?debug=1` — vuelca todos los cálculos en la consola.

Desde la consola del navegador:

```js
Oraculo.cast({ name: 'Federico', birthDate: '1980-02-29' }); // lectura completa, con tabla
Oraculo.test(); // los mismos tests que npm test
```

---

## Estructura

```
.
├── functions/                 Cloudflare Pages Functions (el backend)
│   └── api/
│       └── health.js          GET /api/health — verifica bindings y secretos
│
├── public/                    ← esto es exactamente lo que se despliega
│   ├── index.html             portada
│   ├── lab.html               laboratorio visual
│   ├── favicon.svg
│   ├── _headers               caché y cabeceras de seguridad
│   │
│   ├── js/
│   │   ├── core/              lógica pura, sin DOM ni three.js
│   │   │   ├── numerology.js    los cuatro números
│   │   │   ├── dates.js         fechas en hora local (nunca UTC)
│   │   │   ├── archetypes.js    número → título, figura y vocabulario
│   │   │   └── debug.js         volcado a consola
│   │   │
│   │   ├── scene/             todo lo que toca la GPU
│   │   │   ├── OracleScene.js   orquesta renderer, cámara, bucle y calidad
│   │   │   ├── ParticleField.js campo de partículas doradas
│   │   │   ├── SacredGeometry.js las 12 figuras
│   │   │   ├── quality.js       perfiles de dispositivo y vigilante de fps
│   │   │   └── shaders/
│   │   │
│   │   ├── lib/gsap.js        puente UMD → módulo ES
│   │   ├── tests/             tests del núcleo (corren en navegador y en Node)
│   │   ├── cover.js           entrada de la portada
│   │   └── lab.js             entrada del laboratorio
│   │
│   ├── styles/                tokens.css · base.css · cover.css · lab.css
│   └── vendor/                GENERADO — no se commitea (ver más abajo)
│
└── scripts/                   vendor.mjs · run-tests.mjs · serve.mjs
```

### Sobre `public/vendor/`

Está en `.gitignore` y lo genera `scripts/vendor.mjs` desde `node_modules` en
cada `npm install` (hook `postinstall`). Copia el build ESM de three.js, la
cadena mínima de post-proceso, el UMD de GSAP y los `.woff2` del subset latino de
Cormorant Garamond y Jost.

**El sitio no hace ni una sola petición a un tercero.** Sin CDN, sin Google
Fonts. Eso significa: una fuente menos de fallas, nada de latencia de terceros,
nada de fugas de datos de los visitantes, y las versiones fijadas en
`package.json` en lugar de una URL que puede cambiar bajo los pies.

Los módulos resuelven `three`, `three/addons/` y `gsap` con un **importmap**
declarado en cada HTML, así que no hay bundler ni paso de build: `public/` se
sirve tal cual.

---

## La numerología

Todo vive en `public/js/core/numerology.js`. Sin dependencias, sin estado, sin
efectos: entra un nombre y una fecha, sale un objeto con los cuatro números y el
**rastro completo de cada reducción** (`steps`), que es lo que va a alimentar la
animación de descomposición del nombre.

**Regla de los maestros.** Al reducir se corta en 11, 22 o 33 en vez de seguir
hasta un dígito. La comprobación ocurre *antes* de cada paso, así que `47 → 11`
se detiene en 11 y no sigue a 2.

| # | Número            | Cómo se calcula                                                                  |
| - | ----------------- | -------------------------------------------------------------------------------- |
| 1 | Expresión         | Cada letra vale 1-9 (tabla pitagórica); se suman todas y se reduce.              |
| 2 | Misión de Vida    | Se reducen día, mes y año **por separado**, se suman los tres y se reduce.       |
| 3 | Del Día           | Se suman **todos** los dígitos de la fecha de hoy y se reduce el total.          |
| 4 | **Personal del Día** | Expresión + Misión de Vida + Del Día, reducido una última vez.               |

```
Ana · 1990-05-29 · consultado el 2026-07-27

  Expresión       ANA = 1+5+1 = 7                              →  7
  Misión de Vida  día 29→11 · mes 5 · año 1990→19→10→1 = 17    →  8
  Del Día         2+7 + 0+7 + 2+0+2+6 = 26                     →  8
  ───────────────────────────────────────────────────────────────
  Personal        7 + 8 + 8 = 23                               →  5
```

Detalles que importan:

- **Tildes y eñes.** El nombre se normaliza a A-Z descomponiendo en NFD y
  borrando diacríticos: José → JOSE, Rocío → ROCIO, Iñaki → INAKI. La tabla
  pitagórica solo define A-Z, y tratar Ñ como N es la convención en castellano.
- **Fechas siempre locales.** `new Date('2026-01-01')` se interpreta como UTC y
  en toda América devuelve el día anterior. Como el bloqueo diario depende de
  "qué día es hoy *para vos*", `dates.js` trabaja siempre con componentes
  locales. Hay tests que fallarían si alguien metiera un `toISOString()`.
- **Fechas imposibles.** 2025-02-30 y 2025-13-01 lanzan un error tipado en vez de
  deslizarse en silencio al mes siguiente, como haría un `Date` normal.
- **Los números crudos nunca se muestran.** Van a la consola con `?debug=1`; a la
  pantalla solo llegan envueltos en la narrativa.

### Tests

`npm test` corre 100 aserciones. Los valores esperados están calculados a mano en
los comentarios, así que un test que falla dice cuál era la cuenta correcta. El
mismo archivo corre en el navegador (`Oraculo.test()`), sin framework ni
adaptación.

Cubre: la tabla de letras, normalización, la regla de los maestros en los cuatro
números, casos límite de fechas (bisiestos, meses inválidos, la trampa de UTC) y
una prueba de **cobertura total**: toda suma alcanzable (3 a 99) reduce a un
número que tiene arquetipo y figura, así que la interfaz no puede quedarse sin
qué dibujar.

---

## La escena

| Número | Figura                | Número | Figura                       |
| ------ | --------------------- | ------ | ---------------------------- |
| 1      | Tetraedro             | 8      | Octaedro                     |
| 2      | Vesica piscis         | 9      | Eneagrama (tres triángulos)  |
| 3      | Triángulo y círculos  | 11     | Columnas y dintel            |
| 4      | Cubo                  | 22     | Teseracto                    |
| 5      | Pentagrama            | 33     | Merkaba                      |
| 6      | Semilla de la vida    |        |                              |
| 7      | Heptagrama {7/3}      |        |                              |

Las figuras se declaran como listas de segmentos en coordenadas canónicas
(radio ≈ 1) y un solo constructor las convierte en objetos de three.js. Se
dividen en dos modos de rotación: los sólidos giran libremente; las planas giran
*dentro* de su plano y solo se inclinan un poco, porque si rotaran como los
sólidos quedarían de canto y desaparecerían. A las planas se les suman dos copias
fantasma desplazadas en Z, que les dan volumen al inclinarse sin extruir nada.

No hay `OrbitControls` ni interacción de ningún tipo: la figura gira sola y la
cámara deriva sola. La escena se mira, no se manipula.

El campo de partículas es un único `THREE.Points` con `ShaderMaterial`. Las
posiciones se generan una vez con un PRNG sembrado —el campo es idéntico en cada
carga, así que cualquier cosa rara es reproducible— y **el CPU no vuelve a tocar
un solo vértice**: la deriva por ruido simplex, el giro diferencial y el titileo
ocurren enteros en el vertex shader.

### Rendimiento

La meta es 60fps también en móvil, y se ataca por dos vías:

1. **Perfil inicial** (`quality.js`), deducido de ancho de pantalla, núcleos,
   memoria y tipo de puntero. Móvil arranca en `low`: es preferible subir después
   de comprobar que rinde a arrancar lindo y trabarse en la primera animación,
   que es justo el momento en que el usuario está mirando.

   | Nivel  | Partículas | DPR máx | Bloom |
   | ------ | ---------- | ------- | ----- |
   | high   | 9000       | 2       | sí    |
   | medium | 4500       | 1.75    | sí    |
   | low    | 1800       | 1.5     | no    |

2. **Degradado en caliente.** `FrameGuard` mide el tiempo real de cuadro con una
   media exponencial; si se sostiene mal, baja un nivel **sin recrear la escena**
   (recorta el rango de dibujo y descarta el post-proceso). Ninguna heurística a
   priori le gana a medir.

Además: el bloom se carga con `import()` dinámico y solo donde se usa, así que en
un teléfono modesto esos KB nunca se descargan; el bucle se detiene con la
pestaña oculta; y `prefers-reduced-motion` frena rotación, deriva y titileo —es
accesibilidad, no rendimiento, así que se respeta aunque la máquina sobre.

---

## Despliegue en Cloudflare Pages

Conectar el repo de GitHub y configurar:

| Ajuste                    | Valor           |
| ------------------------- | --------------- |
| Build command             | `npm run vendor` |
| Build output directory    | `public`        |
| Root directory            | *(la raíz)*     |

> **El build command no es opcional.** `public/vendor/` no está versionado; si el
> build no corre, three.js, GSAP y las tipografías dan 404.

`/functions` en la raíz lo detecta Pages solo: cada archivo es una ruta y el
runtime son V8 isolates con `fetch`/`Request`/`Response` estándar — no hay
Express, ni servidor, ni `listen`.

Cuando se sume la integración con la IA hará falta, en el panel de Cloudflare:

- **Variable de entorno secreta** `NVIDIA_API_KEY` (Settings → Environment
  variables → *Encrypt*). Nunca en el código.
- **Binding de KV** `REVELATIONS` (Settings → Functions → KV namespace bindings).

`GET /api/health` informa si ambos están presentes —solo presencia, jamás el
valor— y sirve para verificar de una mirada que el proyecto quedó bien cableado.

---

## Hoja de ruta

**Siguiente — formulario y bloqueo diario**

Campo de nombre y fecha con transición ceremonial; animación de descomposición
del nombre letra por letra (`expression.letters` y los `steps` de cada reducción
ya entregan exactamente los datos que necesita); bloqueo por `localStorage` con
la clave del día, y estado "ya consultaste hoy" con la revelación guardada y una
cuenta regresiva hasta la próxima medianoche local
(`msUntilNextLocalMidnight()` ya está).

El bloqueo es **solo local, a propósito**: entrar desde otro navegador vuelve a
abrir la puerta. Es parte de la mística —cada puerta es distinta—, no un agujero
que haya que tapar. Sin cookies de servidor ni fingerprinting.

**Después — GLM-5.2 vía NVIDIA NIM**

`POST /api/revelation` recibe los tres números y el nombre; nunca la fecha de
nacimiento, que no hace falta del otro lado. La llamada sale desde la Function,
jamás desde el navegador, para que la clave no se exponga.

- Endpoint `https://integrate.api.nvidia.com/v1` (compatible con OpenAI), modelo
  `z-ai/glm-5.2`.
- **Caché en KV con clave `revelacion:{númeroPersonal}:{YYYY-MM-DD}`** — por
  número y día, *no* por usuario. Todos los que comparten número ese día reciben
  el mismo texto, así que un día entero cuesta como mucho 12 generaciones y 12
  escrituras a KV.
- El navegador además guarda su revelación en `localStorage`, así que recargar la
  página el mismo día no vuelve a llamar a nada.
- Fallback a un texto pre-escrito por número si la API no responde: el oráculo
  nunca muestra un error.

La voz editorial está esbozada en `core/archetypes.js`: cada número lleva
`motifs` (imágenes concretas para la metáfora) y una `tension` —una contradicción
interna, no una virtud, que es lo que evita que la revelación suene a cumplido—.
Reglas del prompt: castellano, 80 a 150 palabras, una imagen central, una
reflexión y una pregunta abierta; tono poético con referencias sutiles a
psicoanálisis y filosofía existencial; **prohibidas** las palabras "energía",
"vibración" y "abundancia", y el registro new age en general. Hay un test que
verifica que los arquetipos no las usen.

---

## Licencias

Código propio. three.js (MIT) y las tipografías Cormorant Garamond y Jost (SIL
Open Font License 1.1) se vendorizan con sus licencias en `public/vendor/`. GSAP
se usa bajo su licencia estándar sin cargo — ver <https://gsap.com/standard-license>.
