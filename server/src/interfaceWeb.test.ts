import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { servirInterfaceWeb } from './interfaceWeb.js';

describe('interface web em produção', () => {
  it('serve o build e deixa /api intacto', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'web-dist-'));
    writeFileSync(path.join(dir, 'index.html'), '<html>gestao</html>');
    const app = express();
    app.get('/api/health', (_req, res) => res.json({ ok: true }));
    expect(servirInterfaceWeb(app, dir)).toBe(true);

    const ui = await request(app).get('/');
    expect(ui.status).toBe(200);
    expect(ui.text).toContain('gestao');

    const api = await request(app).get('/api/health');
    expect(api.status).toBe(200);
    expect(api.body).toEqual({ ok: true });
  });

  it('não altera a API quando o build não existe', () => {
    const app = express();
    expect(servirInterfaceWeb(app, path.join(os.tmpdir(), 'web-dist-ausente'))).toBe(false);
  });
});
