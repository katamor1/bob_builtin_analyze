import { gateRCanonicalJson, gateRResult } from './gateRPolicy.mjs';
try {
  if (process.argv.slice(2).length && !(process.argv.length === 3 && process.argv[2] === '--check')) throw new TypeError('Gate R accepts only --check');
  process.stdout.write(gateRCanonicalJson(gateRResult()));
} catch (error) { process.stderr.write('Gate R rejected: ' + error.message + '\n'); process.exitCode = 1; }
