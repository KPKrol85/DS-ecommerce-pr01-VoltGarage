const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const HOST = process.env.PREVIEW_HOST || '127.0.0.1';
const PORT = Number(process.env.PREVIEW_PORT || 4173);
const ROOT_DIR = process.cwd();
const DIST_DIR = path.join(ROOT_DIR, 'dist');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

const ensureDistExists = async () => {
  try {
    const stats = await fs.stat(DIST_DIR);
    if (!stats.isDirectory()) {
      throw new Error('dist exists but is not a directory.');
    }
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      throw new Error('Missing dist output. Run "npm run build" first.');
    }
    throw error;
  }
};

const getRequestPath = (urlPath) => {
  const [pathname] = (urlPath || '/').split('?');
  const decoded = decodeURIComponent(pathname);
  const withoutLeadingSlash = decoded.replace(/^\/+/, '');

  if (!withoutLeadingSlash || withoutLeadingSlash === '.') {
    return 'index.html';
  }

  return withoutLeadingSlash.endsWith('/')
    ? path.join(withoutLeadingSlash, 'index.html')
    : withoutLeadingSlash;
};

const resolveFile = async (urlPath) => {
  const relativePath = getRequestPath(urlPath);
  const fullPath = path.resolve(DIST_DIR, relativePath);
  const normalizedDist = `${DIST_DIR}${path.sep}`;

  if (!fullPath.startsWith(normalizedDist) && fullPath !== DIST_DIR) {
    return null;
  }

  try {
    const stats = await fs.stat(fullPath);

    if (stats.isDirectory()) {
      const indexPath = path.join(fullPath, 'index.html');
      return {
        content: await fs.readFile(indexPath),
        contentType: MIME_TYPES['.html'],
      };
    }

    return {
      content: await fs.readFile(fullPath),
      contentType: MIME_TYPES[path.extname(fullPath).toLowerCase()] || 'application/octet-stream',
    };
  } catch {
    return null;
  }
};

const startServer = async () => {
  await ensureDistExists();

  const server = http.createServer(async (req, res) => {
    const result = await resolveFile(req.url || '/');

    if (!result) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    res.writeHead(200, {
      'content-type': result.contentType,
      'cache-control': 'no-store',
    });
    res.end(result.content);
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, HOST, resolve);
  });

  console.log(`Previewing dist at http://${HOST}:${PORT}`);
  console.log('Press Ctrl+C to stop.');

  const stopServer = () => {
    server.close(() => process.exit(0));
  };

  process.on('SIGINT', stopServer);
  process.on('SIGTERM', stopServer);
};

startServer().catch((error) => {
  console.error('Unable to preview dist output.');
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
