// Petit serveur de fichiers statiques, partagé par le serveur local et l'audit.
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

// `pages` ajoute des pages HTML servies depuis la mémoire : { '/chemin.html': '<html>…' }.
// `receive(chemin, corps)` reçoit le texte des requêtes POST.
// `delay(chemin)` renvoie un retard en millisecondes, pour simuler un réseau lent.
export function createStaticServer(directory, { pages = {}, receive, delay } = {}) {
  const base = resolve(directory);
  return createServer(async (request, response) => {
    const send = (status, type, body) => {
      response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
      response.end(body);
    };
    try {
      let path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (request.method === 'POST' && receive) {
        request.setEncoding('utf8');
        let body = '';
        for await (const chunk of request) body += chunk;
        receive(path, body);
        return send(200, 'text/plain; charset=utf-8', 'ok');
      }
      const wait = delay?.(path);
      if (wait) await new Promise((done) => setTimeout(done, wait));
      if (Object.hasOwn(pages, path)) return send(200, TYPES['.html'], pages[path]);
      if (path.endsWith('/')) path += 'index.html';
      const file = resolve(base, `.${path}`);
      if (!file.startsWith(base + sep)) throw new Error('hors du dossier servi');
      send(200, TYPES[extname(file)] ?? 'application/octet-stream', await readFile(file));
    } catch {
      send(404, 'text/plain; charset=utf-8', 'Introuvable');
    }
  });
}

export function listen(server, port = 0) {
  return new Promise((done, fail) => {
    server.once('error', fail);
    server.listen(port, '127.0.0.1', () => done(server.address().port));
  });
}
