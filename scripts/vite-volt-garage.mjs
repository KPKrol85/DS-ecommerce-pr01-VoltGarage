import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import fg from 'fast-glob';
import * as html from './html.mjs';
import { validatePackage } from './validate-package.mjs';

export function voltGarage(root) {
  let outDir;
  return {
    name: 'volt-garage',
    configResolved(config) {
      outDir = path.resolve(root, config.build.outDir);
    },
    async buildStart() {
      for (const file of fg.sync(['src/partials/**/*.html', 'src/sw.js', 'public/**/*'], {
        cwd: root,
      })) {
        this.addWatchFile(path.join(root, file));
      }
    },
    transformIndexHtml: {
      order: 'pre',
      handler(content, context) {
        return html.renderHtml(root, path.relative(root, context.filename), content);
      },
    },
    handleHotUpdate(context) {
      if (context.file.replaceAll('\\', '/').includes('/src/partials/')) {
        context.server.ws.send({ type: 'full-reload' });
        return [];
      }
    },
    generateBundle: {
      order: 'post',
      async handler(_options, bundle) {
        // A deployment identity is derived from content, never a clock or a release counter.
        const digest = createHash('sha256');
        for (const [filename, output] of Object.entries(bundle).sort(([a], [b]) =>
          a.localeCompare(b)
        )) {
          // HTML parsers convert CR/CRLF to LF before CSP checks. Emit canonical
          // LF HTML so exact file-body hashes work for CRLF and LF checkouts.
          if (output.type === 'asset' && filename.endsWith('.html')) {
            output.source = String(output.source).replace(/\r\n?/g, '\n');
          }
          digest
            .update(filename)
            .update('\0')
            .update(output.type === 'chunk' ? output.code : output.source);
        }
        const publicFiles = fg.sync('**/*', { cwd: path.join(root, 'public'), dot: true }).sort();
        for (const filename of publicFiles) {
          digest
            .update(filename)
            .update('\0')
            .update(await fs.readFile(path.join(root, 'public', filename)));
        }
        const worker = await fs.readFile(path.join(root, 'src/sw.js'), 'utf8');
        digest.update(worker);
        const precache = [
          '/',
          '/offline.html',
          ...Object.keys(bundle)
            .filter((file) => file.startsWith('build/'))
            .sort()
            .map((file) => `/${file}`),
          ...publicFiles
            .filter(
              (file) => file.startsWith('assets/fonts/') || file.startsWith('assets/images/logo/')
            )
            .map((file) => `/${file}`),
        ];
        this.emitFile({
          type: 'asset',
          fileName: 'sw.js',
          source: worker
            .replace('__VOLT_BUILD_ID__', digest.digest('hex').slice(0, 20))
            .replace('/* __VOLT_PRECACHE__ */', JSON.stringify(precache)),
        });
      },
    },
    writeBundle: {
      sequential: true,
      async handler() {
        await validatePackage(root, outDir);
      },
    },
  };
}
