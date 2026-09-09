/**
 * BeySide shared-data server.
 * Serves the site and stores tournaments, teams and clubs in ./data.
 * It deliberately uses only Node's built-in modules: no npm dependencies.
 */
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILES = {
  events: path.join(DATA_DIR, 'events.json'),
  teams: path.join(DATA_DIR, 'teams.json'),
  clubs: path.join(DATA_DIR, 'clubs.json')
};
const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

let state = { events: [], teams: [], clubs: [] };
let writeQueue = Promise.resolve();
let stateVersion = 1;

async function readArray(file) {
  try {
    const value = JSON.parse(await fs.readFile(file, 'utf8'));
    return Array.isArray(value) ? value : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function initialiseData() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  state = {
    events: await readArray(DATA_FILES.events),
    teams: await readArray(DATA_FILES.teams),
    clubs: await readArray(DATA_FILES.clubs)
  };
  await persistState();
}

async function persistState() {
  await Promise.all(Object.entries(DATA_FILES).map(([key, file]) =>
    fs.writeFile(file, `${JSON.stringify(state[key], null, 2)}\n`, 'utf8')
  ));
}

function sendJson(response, status, value) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(JSON.stringify(value));
}

function readRequestJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) {
        reject(new Error('Payload troppo grande'));
        request.destroy();
      }
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch {
        reject(new Error('JSON non valido'));
      }
    });
    request.on('error', reject);
  });
}

function isValidState(value) {
  return value && Array.isArray(value.events) && Array.isArray(value.teams) && Array.isArray(value.clubs);
}

async function serveStatic(request, response, pathname) {
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = path.resolve(ROOT, relativePath);
  if (filePath !== ROOT && !filePath.startsWith(`${ROOT}${path.sep}`)) {
    sendJson(response, 403, { error: 'Percorso non consentito' });
    return;
  }
  try {
    const content = await fs.readFile(filePath);
    response.writeHead(200, {
      'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': path.extname(filePath) === '.html' ? 'no-cache' : 'public, max-age=3600'
    });
    response.end(content);
  } catch (error) {
    if (error.code === 'ENOENT') sendJson(response, 404, { error: 'File non trovato' });
    else sendJson(response, 500, { error: 'Impossibile leggere il file' });
  }
}

async function handleRequest(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (url.pathname === '/api/state' && request.method === 'GET') {
    sendJson(response, 200, { ...state, version: stateVersion });
    return;
  }
  if (url.pathname === '/api/state' && request.method === 'PUT') {
    try {
      const incomingState = await readRequestJson(request);
      if (!isValidState(incomingState)) {
        sendJson(response, 400, { error: 'events, teams e clubs devono essere liste.' });
        return;
      }
      const baseVersion = incomingState.baseVersion;
      writeQueue = writeQueue.catch(() => undefined).then(async () => {
        if (!Number.isInteger(baseVersion) || baseVersion !== stateVersion) {
          return { conflict: true, state, version: stateVersion };
        }
        state = { events: incomingState.events, teams: incomingState.teams, clubs: incomingState.clubs };
        await persistState();
        stateVersion += 1;
        return { conflict: false, state, version: stateVersion };
      });
      const result = await writeQueue;
      if (result.conflict) sendJson(response, 409, result);
      else sendJson(response, 200, { ok: true, state: result.state, version: result.version });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }
  if (url.pathname === '/api/health' && request.method === 'GET') {
    sendJson(response, 200, { ok: true });
    return;
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    sendJson(response, 405, { error: 'Metodo non supportato' });
    return;
  }
  await serveStatic(request, response, decodeURIComponent(url.pathname));
}

initialiseData().then(() => {
  http.createServer((request, response) => {
    handleRequest(request, response).catch(error => {
      console.error(error);
      if (!response.headersSent) sendJson(response, 500, { error: 'Errore interno del server' });
      else response.end();
    });
  }).listen(PORT, '0.0.0.0', () => {
    console.log(`BeySide disponibile su http://localhost:${PORT}`);
  });
}).catch(error => {
  console.error('Impossibile inizializzare i dati:', error);
  process.exitCode = 1;
});
