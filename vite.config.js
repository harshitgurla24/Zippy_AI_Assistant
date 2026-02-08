import { defineConfig } from 'vite';
import path from 'path';
import fs from 'fs';

// Custom plugin to serve ONNX runtime files
function serveOrtFiles() {
  return {
    name: 'serve-ort-files',
    configureServer(server) {
      server.middlewares.use('/ort', (req, res, next) => {
        const urlPath = req.url.split('?')[0];
        const fileName = path.basename(urlPath);
        const filePath = path.join(
          process.cwd(),
          'node_modules',
          'onnxruntime-web',
          'dist',
          fileName
        );

        if (fs.existsSync(filePath)) {
          const ext = path.extname(fileName);
          const contentType = ext === '.wasm' ? 'application/wasm' : 'application/javascript';
          res.setHeader('Content-Type', contentType);
          res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
          res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
          fs.createReadStream(filePath).pipe(res);
        } else {
          next();
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [serveOrtFiles()],
  server: {
    port: 3000,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    fs: {
      allow: ['..'],
    },
  },
  optimizeDeps: {
    include: ['onnxruntime-web', '@realtimex/piper-tts-web', 'openai'],
    esbuildOptions: {
      target: 'esnext',
    },
  },
  worker: {
    format: 'es',
  },
  build: {
    target: 'esnext',
  },
  assetsInclude: ['**/*.wasm', '**/*.onnx'],
});
