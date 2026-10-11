import { readFileSync } from 'node:fs';
import { buildGateRInventory, gateRCanonicalJson, validateGateRInventory } from './gateRPolicy.mjs';
try {
  if (process.argv.length !== 3 || !['--check','--print'].includes(process.argv[2])) throw new TypeError('Inventory accepts only --check or --print');
  if(process.argv[2]==='--check') { validateGateRInventory(readFileSync(new URL('./gate-r-archive-inventory.json',import.meta.url))); process.stdout.write('Gate R inventory valid\n'); }
  else process.stdout.write(gateRCanonicalJson(buildGateRInventory()));
} catch(error) { process.stderr.write('Gate R inventory rejected: '+error.message+'\n');process.exitCode=1; }
