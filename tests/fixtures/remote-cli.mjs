// Network-free child-process fixture. The production entry is always pinned skills.
import fs from 'node:fs/promises';
import { join } from 'node:path';
const args = process.argv.slice(2);
const source = args[1];
const mode = await fs.readFile(join(source, 'mode'), 'utf8').catch(() => 'copy');
if (mode === 'fail') process.exit(7);
if (mode === 'flood') { process.stdout.write('x'.repeat(300 * 1024)); setInterval(() => {}, 1000); }
else if (mode === 'hang') setInterval(() => {}, 1000);
else {
  if (args[0] !== 'add' || !args.includes('--json') || args.includes('--global')) process.exit(9);
  const target = join(process.cwd(), '.agents', 'skills');
  await fs.mkdir(target, { recursive: true });
  for (const entry of await fs.readdir(source, { withFileTypes: true })) {
    if (entry.isDirectory()) await fs.cp(join(source, entry.name), join(target, entry.name), { recursive: true });
  }
}
