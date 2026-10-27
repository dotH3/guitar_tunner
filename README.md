# Afinador de guitarra

Web app (Astro) para afinar la guitarra desde el celular. Afinación estándar
E A D G B E, detección automática de la cuerda, aguja de cents y tono de
referencia por cuerda.

## Usar en el celular (misma wifi)

```sh
npm install
npm run dev
```

Abre en Chrome del celular la dirección `https://<IP-del-PC>:4321` que muestra
la consola. El certificado es autofirmado: toca **Configuración avanzada →
Continuar**. Después toca **Empezar a afinar** y acepta el permiso del micrófono.
Desde el menú ⋮ → **Agregar a pantalla principal** queda como icono.

## Cómo se usa

- **Auto:** toca una cuerda y la app detecta cuál es.
- **Fijar cuerda:** toca E, A, D, G, B o e para afinar solo esa (útil si la
  cuerda está muy desafinada). Toca **Auto** para volver.
- **▶:** reproduce el tono de referencia de esa cuerda.
- Verde = afinada (±5 cents). "Sube" = aprieta la clavija; "Baja" = aflójala.

## Desarrollo

```sh
npm test          # tests del detector de tono (node --test)
npx astro check   # tipos
npm run build     # sitio estático en dist/
```

Modo de prueba sin micrófono: `?demo=110` simula una cuerda a 110 Hz.

Código: `src/lib/yin.ts` (detector YIN), `src/lib/tuning.ts` (notas y cents),
`src/lib/tuner.ts` (micrófono y suavizado), `src/lib/tone.ts` (tono de
referencia), `src/scripts/app.ts` (interfaz).
# guitar_tunner
