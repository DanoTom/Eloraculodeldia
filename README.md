# El Oráculo del Día

Una revelación numerológica por día. La persona entrega su nombre y su fecha de
nacimiento; el sistema calcula tres números pitagóricos, los funde en un cuarto
—el **Número Personal del Día**— y sobre ese número construye una revelación
breve. Una sola vez por día, y hasta que el sol vuelva a nacer.

> **Estado: el producto funciona de punta a punta.** Formulario, ceremonia,
> bloqueo diario, backend y respaldo están terminados. Con la clave de NVIDIA
> configurada, el texto lo escribe GLM-5.2; sin ella, salen las doce
> revelaciones escritas a mano y la experiencia es idéntica.

---

## Empezar

```bash
npm install     # instala dependencias y vendoriza three/gsap/tipografías
npm test        # 157 aserciones sobre el núcleo y los textos
npm run dev     # http://localhost:8788  (wrangler: incluye /functions)
npm run serve   # http://localhost:4321  (estático; /api/* no responde)
```

Para probar el flujo completo hace falta `npm run dev`: `npm run serve` no
levanta el runtime de Workers, así que `/api/revelation` no existe y el
navegador cae al respaldo local (que igual funciona, pero no ejercita el
backend).

| Página      | Para qué                                                            |
| ----------- | ------------------------------------------------------------------- |
| `/`         | El oráculo.                                                         |
| `/lab.html` | Laboratorio visual: las 12 figuras, métricas en vivo y los tests.   |

Desde la consola del navegador:

```js
Oraculo.forget();   // borra el bloqueo del día — para probar el flujo más de una vez
Oraculo.setDebug(true);
Oraculo.cast({ name: 'Federico', birthDate: '1980-02-29' });
```

Parámetros del laboratorio:

- `?n=22` — abre directo en una figura.
- `?q=high\|medium\|low` — fuerza el nivel de calidad (así se pueden validar los
  tres perfiles, y el camino con bloom, desde una sola máquina).
- `?test=1` — corre los tests al cargar.
- `?debug=1` — vuelca todos los cálculos en la consola. Funciona en las dos páginas.

---

## Estructura

```
.
├── functions/                 Cloudflare Pages Functions (el backend)
│   └── api/
│       ├── revelation.js      POST — GLM-5.2 + caché en KV + respaldo
│       └── health.js          GET  — verifica bindings y secretos
│
├── public/                    ← esto es exactamente lo que se despliega
│   ├── index.html             el oráculo (las cuatro pantallas)
│   ├── lab.html               laboratorio visual
│   ├── favicon.svg
│   ├── _headers               caché y cabeceras de seguridad
│   │
│   ├── js/
│   │   ├── app.js             el flujo: umbral → ceremonia → revelación
│   │   │
│   │   ├── app/               piezas del flujo
│   │   │   ├── storage.js       identidad y bloqueo diario en localStorage
│   │   │   ├── api.js           cliente de /api/revelation (nunca falla)
│   │   │   ├── ceremony.js      la descomposición del nombre
│   │   │   └── reveal.js        el texto que aparece palabra por palabra
│   │   │
│   │   ├── core/              lógica pura, sin DOM ni three.js
│   │   │   ├── numerology.js    los cuatro números
│   │   │   ├── dates.js         fechas en hora local (nunca UTC)
│   │   │   ├── archetypes.js    número → título, figura y vocabulario
│   │   │   ├── fallbacks.js     las 12 revelaciones a mano + validación de voz
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
│   │   ├── tests/             tests (corren en navegador y en Node)
│   │   └── lab.js             entrada del laboratorio
│   │
│   ├── styles/                tokens.css · base.css · app.css · lab.css
│   └── vendor/                GENERADO — no se commitea (ver más abajo)
│
└── scripts/                   vendor.mjs · run-tests.mjs · serve.mjs
```

`core/` no sabe que existe el navegador y `app/` no sabe que existe three.js.
Por eso la Pages Function puede importar `fallbacks.js` y `numerology.js` tal
cual, sin duplicar una línea: son los mismos archivos que sirve el sitio.

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

También corre `validateRevelation()` sobre las doce revelaciones escritas a mano:
si una regla que se le exige al modelo no la cumplen los textos propios, la que
está mal es la regla.

---

## El flujo

```
  umbral ──(enviás el formulario)──▶ ceremonia ──▶ revelación
     ▲                                                  │
     └────(al día siguiente)──── velo cerrado ◀──────────┘
```

**La ceremonia dura lo que tarda la IA.** La llamada a `/api/revelation` arranca
en el mismo instante en que empieza la animación y se espera recién al final:
los siete segundos de la descomposición del nombre son también los siete
segundos del modelo. No hay spinner porque no hay nada que esperar. Si el texto
igual llega tarde —red lenta, o `prefers-reduced-motion`, donde la ceremonia
dura un segundo—, el número se queda latiendo con una línea que sostiene la
espera.

La animación es DOM y CSS, no three.js: el texto tiene que ser nítido,
seleccionable y legible por un lector de pantalla, y un canvas no da nada de eso.
Por la misma razón, la revelación está entera en el DOM desde el primer
instante y solo se anima su opacidad palabra por palabra — un efecto de máquina
de escribir que va agregando caracteres sería invisible para un lector de
pantalla.

### El bloqueo diario

Dos entradas separadas en `localStorage`, y esa separación es toda la lógica:

| Clave                  | Contenido                        | Cuándo se borra              |
| ---------------------- | -------------------------------- | ---------------------------- |
| `oraculo:v1:identidad` | nombre y fecha de nacimiento     | nunca (precarga el formulario) |
| `oraculo:v1:consulta`  | la revelación de hoy y su fecha  | en cuanto la fecha ya no es hoy |

Al cargar, si la consulta guardada no es de hoy se descarta sola y el oráculo
vuelve a estar disponible. Si la página queda abierta cruzando la medianoche, la
cuenta regresiva la recarga.

Se guarda en texto plano: hashear no protegería nada —el dato es del usuario, en
su propio navegador— y para saludarlo por su nombre hay que poder leerlo. Si
`localStorage` no está disponible (modo privado, cookies bloqueadas), cae a
memoria y el bloqueo dura lo que dure la pestaña, que es lo máximo honesto que se
puede prometer ahí.

**El bloqueo es solo local, a propósito.** Otro navegador, otra puerta. Es parte
de la mística, no un agujero que haya que tapar: no hay cookies de servidor ni
huellas digitales.

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

Para que el texto lo escriba GLM-5.2 hacen falta dos cosas más en el panel:

- **Variable de entorno secreta** `NVIDIA_API_KEY` (Settings → Environment
  variables → *Encrypt*). Nunca en el código.
- **Binding de KV** llamado `REVELATIONS` (Settings → Functions → KV namespace
  bindings).

Sin ninguna de las dos el sitio funciona igual: sale el texto de respaldo. Sin KV
pero con clave, también funciona — solo que genera en cada visita en vez de
reutilizar.

`GET /api/health` informa si ambos están presentes —solo presencia, jamás el
valor— y sirve para verificar de una mirada que quedó bien cableado.

---

## La revelación

`POST /api/revelation` → `{ numbers: {...}, dateKey: 'YYYY-MM-DD' }`

**No recibe el nombre, y es deliberado.** El texto se cachea por
`rev:v1:{número}:{fecha}` y se comparte entre todos los visitantes que ese día
comparten número; un texto con un nombre adentro sería, para casi todos, el
nombre de otra persona. El saludo lo pone el navegador, por fuera del texto
generado. Efecto lateral feliz: **el nombre nunca sale del dispositivo.**

La economía se cae de madura: doce números posibles por día son, como mucho,
doce generaciones diarias, entre cuántos visitantes sea. A partir de la primera
visita de cada número todo son lecturas de KV. Eso también vuelve al endpoint
inmune a que lo martillen — no hay forma de provocar una generación número trece.

**Nunca devuelve un error.** Si falta la clave, si NVIDIA no contesta, o si el
texto que vuelve no pasa la validación de voz, responde 200 con la revelación
escrita a mano. Un oráculo que muestra un 500 deja de ser un oráculo.

Lo que no valida **no se cachea**: así el próximo visitante vuelve a intentar la
generación en vez de heredar un texto flojo hasta la medianoche. El sistema se
cura solo.

### La voz

El prompt de sistema vive en `functions/api/revelation.js` y la materia prima en
`core/archetypes.js`: cada número lleva `motifs` (imágenes concretas para la
metáfora) y una `tension` — una contradicción interna, no una virtud. Eso último
es lo que evita que la revelación suene a cumplido.

Reglas: español neutro con tuteo, 80 a 150 palabras, tres movimientos (una imagen
central, una reflexión sobre la contradicción, un llamado concreto o una pregunta
abierta). Sin nombrar a nadie, sin mencionar números ni el mecanismo, sin
consolar. **Prohibidas** "energía", "vibración", "abundancia", "manifestar" y
todo su registro.

`validateRevelation()` verifica cantidad de palabras, palabras vetadas y los
preámbulos típicos de asistente ("Aquí tienes…", texto entrecomillado). Se aplica
igual a lo que devuelve el modelo y a los textos propios.

---

## Hoja de ruta

Lo que queda, por orden de valor:

1. **Probar la voz de GLM-5.2 en serio.** Los textos de respaldo son el patrón de
   calidad; si el modelo no llega a ese nivel, el que hay que corregir es el
   prompt. `/api/revelation` devuelve `source` (`ai` \| `cache` \| `fallback`)
   justamente para poder medirlo.
2. **Compartir la revelación** — una imagen generada con el número y una línea
   del texto. Es el vector de crecimiento natural de un producto diario.
3. **Sonido.** Un pad muy grave en la ceremonia, silenciado por defecto.
4. **Historial.** Lo que te fue revelado los últimos días, ya guardado en
   `localStorage` si se cambia `consulta` por una lista acotada.

---

## Licencias

Código propio. three.js (MIT) y las tipografías Cormorant Garamond y Jost (SIL
Open Font License 1.1) se vendorizan con sus licencias en `public/vendor/`. GSAP
se usa bajo su licencia estándar sin cargo — ver <https://gsap.com/standard-license>.
