// Serveur local : sert dist/ et reconstruit à chaque modification.
// Le build tourne dans un processus séparé pour toujours relire le code à jour.
import { execFile } from 'node:child_process';
import { watch } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createStaticServer, listen } from './serve.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 4322;

function build() {
  return new Promise((done) => {
    execFile(process.execPath, [join(ROOT, 'build.mjs')], (error, stdout, stderr) => {
      process.stdout.write(error ? `Build en échec :\n${stderr || error.message}\n` : stdout);
      done();
    });
  });
}

let timer;
for (const folder of ['content', 'src', 'static']) {
  watch(join(ROOT, folder), { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(build, 100);
  });
}

await build();
const port = await listen(createStaticServer(join(ROOT, 'dist')), PORT);
console.log(`http://localhost:${port}`);
