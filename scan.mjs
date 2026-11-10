// Static, offline design anti-pattern scanner for the custom-design skill.
// Usage: node scan.mjs <files-or-dirs...> [--json]
// Ported from Impeccable's detector (Apache-2.0); see NOTICE.md.
import process from 'node:process';

import { main } from './scanner/cli.mjs';

process.exitCode = await main(process.argv.slice(2));
