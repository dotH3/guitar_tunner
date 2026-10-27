// @ts-check
import { defineConfig } from 'astro/config';
import basicSsl from '@vitejs/plugin-basic-ssl';

// https://astro.build/config
export default defineConfig({
  // Escuchar en la red local para abrirla desde el celular.
  server: { host: true },
  vite: {
    // HTTPS con certificado autofirmado: el micrófono (getUserMedia) exige
    // una conexión segura cuando no es localhost.
    plugins: [basicSsl({ name: 'afinador' })],
  },
});
