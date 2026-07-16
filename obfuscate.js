const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs');
const path = require('path');

const FILES = [
  'public/js/app.js',
  'public/js/game.js',
  'public/js/sound.js',
  'public/js/animations.js'
];

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

for (const file of FILES) {
  const fullPath = path.resolve(file);
  if (!fs.existsSync(fullPath)) {
    console.log(`SKIP: ${file} not found`);
    continue;
  }

  const code = fs.readFileSync(fullPath, 'utf8');
  const result = JavaScriptObfuscator.obfuscate(code, OPTIONS);
  fs.writeFileSync(fullPath, result.getObfuscatedCode());
  console.log(`DONE: ${file}`);
}

console.log('All files obfuscated.');
