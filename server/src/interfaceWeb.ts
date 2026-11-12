import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Express } from 'express';
import express from 'express';

export function diretorioWebDist(): string {
  return process.env.WEB_DIST
    ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');
}

/** Serves the Vite build from the same origin as the API. No-op in `npm run dev`. */
export function servirInterfaceWeb(app: Express, webDist = diretorioWebDist()): boolean {
  if (!existsSync(path.join(webDist, 'index.html'))) return false;

  app.use(express.static(webDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(webDist, 'index.html'));
  });
  return true;
}
