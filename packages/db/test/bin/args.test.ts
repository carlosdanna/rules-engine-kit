/**
 * The two commands differ by two booleans, and both of them delete rows — so the argument
 * parsing is worth a test of its own, and the `--` case is the reason it is a module.
 */

import { describe, expect, it } from 'vitest';
import { DbCliError, parseDbArgs } from '../../src/bin/args';

describe('db command line', () => {
  it('reads the three commands', () => {
    expect(parseDbArgs(['migrate'])).toEqual({ kind: 'migrate' });
    expect(parseDbArgs(['seed'])).toEqual({ kind: 'seed' });
    expect(parseDbArgs(['reset'])).toEqual({ kind: 'reset', hard: false });
  });

  it('reads --hard on a reset', () => {
    expect(parseDbArgs(['reset', '--hard'])).toEqual({ kind: 'reset', hard: true });
  });

  it('reads `-- --hard` the same way, which is how pnpm forwards a flag', () => {
    // Without the separator being dropped this parses as a positional, and the command
    // succeeds having quietly done a *soft* reset — the one outcome worse than an error.
    expect(parseDbArgs(['reset', '--', '--hard'])).toEqual({ kind: 'reset', hard: true });
  });

  it('refuses --hard on seed: db:seed is the command that never deletes a user row', () => {
    expect(() => parseDbArgs(['seed', '--hard'])).toThrow(DbCliError);
    expect(() => parseDbArgs(['seed', '--hard'])).toThrow(/never deletes a user row/);
  });

  it('refuses --hard on migrate', () => {
    expect(() => parseDbArgs(['migrate', '--hard'])).toThrow(DbCliError);
  });

  it('refuses a command it does not have', () => {
    expect(() => parseDbArgs(['drop'])).toThrow(/unknown command 'drop'/);
  });

  it('prints help for no command and for --help', () => {
    expect(parseDbArgs([])).toEqual({ kind: 'help' });
    expect(parseDbArgs(['--help'])).toEqual({ kind: 'help' });
  });
});
