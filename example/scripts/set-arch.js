#!/usr/bin/env node
/**
 * Flips the Android architecture flag.
 *
 * Android reads `newArchEnabled` from gradle.properties at build time; iOS reads
 * the RCT_NEW_ARCH_ENABLED environment variable at `pod install` time, which is
 * why only Android needs a file edit and iOS is handled by the pods:new/pods:old
 * scripts instead.
 */
const fs = require('fs');
const path = require('path');

const mode = process.argv[2];
if (mode !== 'new' && mode !== 'old') {
  console.error('Usage: node scripts/set-arch.js <new|old>');
  process.exit(1);
}

const file = path.join(__dirname, '..', 'android', 'gradle.properties');
const enabled = mode === 'new';
const source = fs.readFileSync(file, 'utf8');
const updated = source.replace(
  /^newArchEnabled=.*$/m,
  `newArchEnabled=${enabled}`
);

if (updated === source && !/^newArchEnabled=/m.test(source)) {
  console.error(`No newArchEnabled entry found in ${file}`);
  process.exit(1);
}

fs.writeFileSync(file, updated);
console.log(
  `Android: newArchEnabled=${enabled} (${enabled ? 'TurboModule' : 'Bridge'} path). ` +
    'Run a clean build if you switched: cd android && ./gradlew clean'
);
