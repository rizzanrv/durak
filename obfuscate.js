/*
 * Obfuscate the browser bundles.
 *
 *   node obfuscate.js              -> writes public/js/*.min.js, sources untouched
 *   node obfuscate.js --in-place   -> backs up to *.source.js, then overwrites
 *
 * The script refuses to run on a file that is already obfuscated, because the
 * previous version overwrote the readable sources and they had to be dug out of
 * git history. Keep sources readable in the repository, ship the *.min.js files.
 */
const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs');
const path = require('path');

const FILES = [
  'public/js/app.js',
  'public/js/game.js',
  'public/js/sound.js',
  'public/js/animations.js'
];

const IN_PLACE = process.argv.includes('--in-place');
const FORCE = process.argv.includes('--force');

const OPTIONS = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.4,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.2,
  debugProtection: false,
  disableConsoleOutput: false,
  identifierNamesGenerator: 'hexadecimal',
  log: false,
  numbersToExpressions: true,
  renameGlobals: false,
  selfDefending: false,
  simplify: true,
  splitStrings: false,
  stringArray: true,
  stringArrayCallsTransform: true,
  stringArrayEncoding: ['base64'],
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayWrappersCount: 1,
  stringArrayWrappersChainedCalls: true,
  stringArrayWrappersParametersMaxCount: 2,
  stringArrayWrappersType: 'function',
  stringArrayThreshold: 0.75,
  transformObjectKeys: true,
  unicodeEscapeSequence: false,
  target: 'browser'
};

/* Obfuscated output starts with the string-array decoder, all identifiers are _0x... */
function looksObfuscated(code) {
  const head = code.slice(0, 400);
  const hasHexIdentifiers = /_0x[0-9a-f]{4,}/.test(head);
  const newlines = (code.match(/\n/g) || []).length;
  return hasHexIdentifiers && newlines < 5;
}

let failures = 0;

for (const file of FILES) {
  const fullPath = path.resolve(file);
  if (!fs.existsSync(fullPath)) {
    console.log(`SKIP  ${file} (not found)`);
    continue;
  }

  const code = fs.readFileSync(fullPath, 'utf8');

  if (looksObfuscated(code) && !FORCE) {
    failures++;
    console.error(`ABORT ${file}: file looks already obfuscated.`);
    console.error('      Restore the readable source (git log -- public/js) or pass --force.');
    continue;
  }

  const result = JavaScriptObfuscator.obfuscate(code, OPTIONS).getObfuscatedCode();

  if (IN_PLACE) {
    const backup = fullPath.replace(/\.js$/, '.source.js');
    if (!fs.existsSync(backup)) fs.copyFileSync(fullPath, backup);
    fs.writeFileSync(fullPath, result);
    console.log(`DONE  ${file} (in place, backup: ${path.basename(backup)})`);
  } else {
    const target = fullPath.replace(/\.js$/, '.min.js');
    fs.writeFileSync(target, result);
    console.log(`DONE  ${file} -> ${path.relative(process.cwd(), target)}`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} file(s) skipped. Sources were not modified.`);
  process.exitCode = 1;
} else {
  console.log(IN_PLACE
    ? '\nObfuscated in place. Sources backed up as *.source.js.'
    : '\nObfuscated copies written as *.min.js — point index.html at them when you are ready.');
}
