import fs from 'node:fs/promises';
import path from 'node:path';
import fg from 'fast-glob';
import minimist from 'minimist';
import chalk from 'chalk';
import sharp from 'sharp';

const DEFAULTS = {
  qualityJpg: 80,
  qualityWebp: 70,
  qualityAvif: 50,
  effortAvif: 6,
  mode: 'default',
  only: 'all',
};

const argv = minimist(process.argv.slice(2), {
  string: [
    'quality-jpg',
    'quality-webp',
    'quality-avif',
    'effort-avif',
    'mode',
    'out',
    'only',
    'glob',
  ],
  boolean: ['dry-run'],
  default: {
    'quality-jpg': DEFAULTS.qualityJpg,
    'quality-webp': DEFAULTS.qualityWebp,
    'quality-avif': DEFAULTS.qualityAvif,
    'effort-avif': DEFAULTS.effortAvif,
    mode: DEFAULTS.mode,
    only: DEFAULTS.only,
  },
});

const toNumber = (value, label) => {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return num;
};

const config = {
  qualityJpg: toNumber(argv['quality-jpg'], 'quality-jpg'),
  qualityWebp: toNumber(argv['quality-webp'], 'quality-webp'),
  qualityAvif: toNumber(argv['quality-avif'], 'quality-avif'),
  effortAvif: toNumber(argv['effort-avif'], 'effort-avif'),
  mode: String(argv.mode || DEFAULTS.mode).toLowerCase(),
  out: argv.out ? String(argv.out) : null,
  dryRun: Boolean(argv['dry-run']),
  only: String(argv.only || DEFAULTS.only).toLowerCase(),
  glob: argv.glob ? String(argv.glob) : null,
};

if (!['default', 'output', 'inplace'].includes(config.mode)) {
  console.error(chalk.red(`Invalid --mode: ${config.mode}`));
  process.exit(1);
}

if (!['jpg', 'png', 'all'].includes(config.only)) {
  console.error(chalk.red(`Invalid --only: ${config.only}`));
  process.exit(1);
}

if (config.mode === 'output' && !config.out) {
  console.error(chalk.red('--out is required when --mode=output'));
  process.exit(1);
}

if (config.mode === 'inplace') {
  console.log(chalk.yellow('WARN: --mode=inplace is deprecated; using --mode=default.'));
  config.mode = 'default';
}

const formatBytes = (bytes) => {
  const sign = bytes < 0 ? '-' : '';
  const abs = Math.abs(bytes);
  if (abs < 1024) return `${sign}${abs} B`;
  const kb = abs / 1024;
  if (kb < 1024) return `${sign}${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${sign}${mb.toFixed(2)} MB`;
};

const replaceExt = (filePath, ext) => `${filePath.slice(0, -path.extname(filePath).length)}.${ext}`;

const projectRoot = process.cwd();
const inputRoot = path.resolve(projectRoot, 'assets/images');
const outputRoot =
  config.mode === 'output'
    ? path.resolve(projectRoot, config.out)
    : path.resolve(projectRoot, 'assets/images/_optimized');

const defaultGlob = 'assets/images/**/*.{jpg,jpeg,png,JPG,JPEG,PNG}';
const globPattern = config.glob || defaultGlob;

const isOptimizedPath = (absPath) => absPath.split(path.sep).includes('_optimized');

const isSupportedSource = (absPath) => {
  const ext = path.extname(absPath).toLowerCase();
  if (config.only === 'jpg') {
    return ext === '.jpg' || ext === '.jpeg';
  }
  if (config.only === 'png') {
    return ext === '.png';
  }
  return ext === '.jpg' || ext === '.jpeg' || ext === '.png';
};

const resolveRelativePath = (absPath) => {
  const relFromRoot = path.relative(inputRoot, absPath);
  if (relFromRoot.startsWith('..') || path.isAbsolute(relFromRoot)) {
    return path.basename(absPath);
  }
  return relFromRoot;
};

const resolveOutputPaths = (absPath) => {
  const relPath = resolveRelativePath(absPath);
  const outputBase = path.join(outputRoot, relPath);
  return {
    webpPath: replaceExt(outputBase, 'webp'),
    avifPath: replaceExt(outputBase, 'avif'),
  };
};

const isUpToDate = async (outputPath, inputStat) => {
  try {
    const outStat = await fs.stat(outputPath);
    return outStat.mtimeMs >= inputStat.mtimeMs;
  } catch {
    return false;
  }
};

const run = async () => {
  const start = Date.now();
  let warnings = 0;
  let errors = 0;
  let processed = 0;
  let sourcesFound = 0;
  let generatedWebp = 0;
  let generatedAvif = 0;
  let skipped = 0;
  let warnedOutsideRoot = false;

  const files = await fg(globPattern, {
    onlyFiles: true,
    unique: true,
    absolute: true,
    cwd: projectRoot,
    dot: false,
    caseSensitiveMatch: false,
    ignore: ['**/_optimized/**'],
  });

  if (files.length === 0) {
    console.log(chalk.yellow(`No source images found for glob: ${globPattern}`));
    return;
  }

  files.sort();

  for (const filePath of files) {
    const absPath = path.resolve(projectRoot, filePath);
    if (isOptimizedPath(absPath)) {
      continue;
    }
    if (!isSupportedSource(absPath)) {
      continue;
    }

    const relFromRoot = path.relative(inputRoot, absPath);
    const relPath =
      relFromRoot.startsWith('..') || path.isAbsolute(relFromRoot)
        ? path.basename(absPath)
        : relFromRoot;

    if (
      !warnedOutsideRoot &&
      relPath === path.basename(absPath) &&
      absPath !== path.join(inputRoot, relPath)
    ) {
      warnedOutsideRoot = true;
      warnings += 1;
      console.log(
        chalk.yellow('WARN: Some files are outside assets/images; output paths will use basenames.')
      );
    }

    try {
      sourcesFound += 1;
      const inputStat = await fs.stat(absPath);
      const { webpPath, avifPath } = resolveOutputPaths(absPath);
      const webpUpToDate = await isUpToDate(webpPath, inputStat);
      const avifUpToDate = await isUpToDate(avifPath, inputStat);

      const relInput = path.relative(projectRoot, absPath);
      const relWebp = path.relative(projectRoot, webpPath);
      const relAvif = path.relative(projectRoot, avifPath);

      if (webpUpToDate && avifUpToDate) {
        skipped += 2;
        processed += 1;
        console.log(
          `${chalk.yellow('SKIP')} ${relInput} -> webp: ${relWebp} (up-to-date) | avif: ${relAvif} (up-to-date)`
        );
        continue;
      }

      const inputBuffer = await fs.readFile(absPath);
      const baseImage = sharp(inputBuffer, { failOn: 'none' });

      let webpInfo = `webp: ${relWebp}`;
      let avifInfo = `avif: ${relAvif}`;

      if (webpUpToDate) {
        skipped += 1;
        webpInfo += ' (up-to-date)';
      } else {
        try {
          const webpBuffer = await baseImage
            .clone()
            .webp({ quality: config.qualityWebp })
            .toBuffer();
          if (!config.dryRun) {
            await fs.mkdir(path.dirname(webpPath), { recursive: true });
            await fs.writeFile(webpPath, webpBuffer);
          }
          generatedWebp += 1;
          webpInfo += ` (${formatBytes(webpBuffer.length)})`;
        } catch (err) {
          errors += 1;
          webpInfo += ` (ERROR: ${err.message})`;
        }
      }

      if (avifUpToDate) {
        skipped += 1;
        avifInfo += ' (up-to-date)';
      } else {
        try {
          const avifBuffer = await baseImage
            .clone()
            .avif({ quality: config.qualityAvif, effort: config.effortAvif })
            .toBuffer();
          if (!config.dryRun) {
            await fs.mkdir(path.dirname(avifPath), { recursive: true });
            await fs.writeFile(avifPath, avifBuffer);
          }
          generatedAvif += 1;
          avifInfo += ` (${formatBytes(avifBuffer.length)})`;
        } catch (err) {
          errors += 1;
          avifInfo += ` (ERROR: ${err.message})`;
        }
      }

      processed += 1;
      const tag = config.dryRun ? chalk.cyan('DRY') : chalk.green('OK');
      console.log(`${tag} ${relInput} -> ${webpInfo} | ${avifInfo}`);
    } catch (err) {
      errors += 1;
      console.log(chalk.red(`ERROR: ${path.relative(projectRoot, filePath)} - ${err.message}`));
    }
  }

  const durationSec = ((Date.now() - start) / 1000).toFixed(2);

  console.log('');
  console.log(chalk.bold('Summary'));
  console.log(`Sources found: ${sourcesFound}`);
  console.log(`Files processed: ${processed}`);
  console.log(`WebP generated: ${generatedWebp}`);
  console.log(`AVIF generated: ${generatedAvif}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Warnings: ${warnings}`);
  console.log(`Errors: ${errors}`);
  console.log(`Duration: ${durationSec}s`);
};

run().catch((err) => {
  console.error(chalk.red(err.message));
  process.exit(1);
});
