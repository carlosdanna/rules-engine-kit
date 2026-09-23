/**
 * The command line for `src/bin/db.ts`, split out so it can be tested without a process.
 *
 * It is here rather than inline for one reason: `pnpm db:reset -- --hard` is how a flag is
 * conventionally forwarded through a package manager, and pnpm passes the `--` through to the
 * script. Left in the argument list, `parseArgs` reads `--hard` as a *positional* — so the
 * command succeeds and quietly does a soft reset, which is the one outcome worse than an
 * error. Dropping the separator is one line; getting it wrong is silent.
 */

import { parseArgs } from 'node:util';

export type DbCommand =
  | { kind: 'help' }
  | { kind: 'migrate' }
  | { kind: 'seed' }
  | { kind: 'reset'; hard: boolean };

export class DbCliError extends Error {
  readonly code = 'DB_CLI';
}

export function parseDbArgs(argv: readonly string[]): DbCommand {
  const [command, ...rest] = argv;

  if (command === undefined || command === '--help' || command === '-h') return { kind: 'help' };

  const { values } = parseArgs({
    args: rest.filter((argument) => argument !== '--'),
    options: { hard: { type: 'boolean' } },
  });
  const hard = values.hard === true;

  switch (command) {
    case 'migrate':
      if (hard) throw new DbCliError('--hard belongs to `db:reset`: migrating deletes nothing');
      return { kind: 'migrate' };
    case 'seed':
      // Not a synonym for `db:reset --hard`. `db:seed` is the command that never deletes a
      // user row (ADR-0004), and a flag that quietly made it one would be a trap.
      if (hard)
        throw new DbCliError('--hard belongs to `db:reset`: `db:seed` never deletes a user row');
      return { kind: 'seed' };
    case 'reset':
      return { kind: 'reset', hard };
    default:
      throw new DbCliError(`unknown command '${command}'`);
  }
}
