// Sunset Courier — entry program for make.fun's best-flight-game-20261126-0057.
// Copies game/ and screenshots/ from this repository into the output
// directory, then writes /output/dossier.json with buildDossier from the
// kit's library. Node 22, standard library only; no network, no install.
//
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The caps the bounty's gate hands buildDossier: 160 KiB of source text,
// at most 4 screenshots of 256 KiB each, game/ at most 993 entries and
// 48 MiB. Passing them makes this program fail exactly where the scorer
// would, instead of writing a dossier the gate refuses.
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
};

function copyTree(name: string): void {
  const from = join(here, name);
  const to = join(out, name);
  if (!existsSync(from)) {
    throw new Error(`sunset courier: no ${name}/ in the repository to hand in`);
  }
  cpSync(from, to, { recursive: true });
}

mkdirSync(out, { recursive: true });
rmSync(join(out, 'game'), { recursive: true, force: true });
rmSync(join(out, 'screenshots'), { recursive: true, force: true });
copyTree('game');
copyTree('screenshots');

const dossier = buildDossier(out, DOSSIER_CAPS);
writeFileSync(join(out, 'dossier.json'), dossier);
process.stdout.write(
  `sunset courier: wrote ${dossier.length} bytes of dossier to ${out}/dossier.json\n`
);
