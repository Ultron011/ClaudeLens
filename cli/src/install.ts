// `claudelens install` — put a `claudelens` command on your PATH that runs
// this very bundle. Because the wrapper points at the bundle's path, updating
// the code is just `git pull` in the repo (the committed bundle refreshes) —
// no plugin reinstall needed.
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pc from 'picocolors';

export async function runInstall() {
  const bundle = fileURLToPath(import.meta.url); // resolves to .../claudelens.mjs
  const binDir = join(homedir(), '.local', 'bin');
  const wrapper = join(binDir, 'claudelens');

  await mkdir(binDir, { recursive: true });
  await writeFile(wrapper, `#!/bin/sh\nexec node "${bundle}" "$@"\n`, 'utf8');
  await chmod(wrapper, 0o755);

  console.log(pc.green(`\n  Installed  ${wrapper}`));
  console.log(pc.dim(`  runs       node ${bundle}\n`));

  const onPath = (process.env.PATH ?? '').split(':').includes(binDir);
  if (onPath) {
    console.log(`  Try it:  ${pc.cyan('claudelens setup')}\n`);
  } else {
    console.log(pc.yellow(`  ⚠  ${binDir} is not on your PATH. Add it:`));
    console.log(`     ${pc.cyan(`echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc`)}\n`);
  }
  console.log(
    `  ${pc.dim('To update later:')} ${pc.cyan('claudelens update')} ${pc.dim('(pulls + rebuilds — no reinstall)')}\n`,
  );
}
