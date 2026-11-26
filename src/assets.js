// Arquivos do site (public/). Rodando com Node normal, vêm da pasta public/.
// No Draft100.exe, vêm de dentro do próprio .exe (empacotados na hora do build).
const path = require('path');
const express = require('express');
const { isSea } = require('./launcher');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
};

function seaFiles() {
  const sea = require('node:sea');
  const list = JSON.parse(sea.getAsset('manifest.json', 'utf8'));
  const files = new Map();
  for (const key of list) files.set('/' + key, Buffer.from(sea.getAsset(key)));
  return files;
}

// arquivo do cliente do socket.io servido pelo próprio app (no .exe não existe node_modules)
function socketClient() {
  if (isSea) return Buffer.from(require('node:sea').getAsset('vendor/socket.io.min.js'));
  const main = require.resolve('socket.io'); // .../node_modules/socket.io/dist/index.js
  return require('fs').readFileSync(path.join(path.dirname(main), '..', 'client-dist', 'socket.io.min.js'));
}

function publicMiddleware(appDir) {
  if (!isSea) return express.static(path.join(appDir, 'public'));
  const files = seaFiles();
  const etag = `"d100-${require('../package.json').version}"`;
  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    let p = decodeURIComponent(req.path);
    if (p.endsWith('/')) p += 'index.html';
    const buf = files.get(p);
    if (!buf) return next();
    if (req.headers['if-none-match'] === etag) return res.status(304).end();
    res.set('Content-Type', TYPES[path.extname(p).toLowerCase()] || 'application/octet-stream');
    res.set('ETag', etag);
    res.set('Cache-Control', 'no-cache');
    res.send(buf);
  };
}

module.exports = { publicMiddleware, socketClient, TYPES };
