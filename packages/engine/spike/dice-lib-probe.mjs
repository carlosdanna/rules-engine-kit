/**
 * SPIKE — probe for @dice-roller/rpg-dice-roller v5.5.1. NOT a repo dependency.
 * Run it outside the workspace so nothing lands in pnpm-lock.yaml:
 *
 *   mkdir /tmp/dicetest && cd /tmp/dicetest
 *   npm init -y && npm i @dice-roller/rpg-dice-roller@5.5.1
 *   cp <this file> . && node dice-lib-probe.mjs
 *
 * Results are written up in docs/spike-notes.md.
 */
import { DiceRoll, NumberGenerator } from '@dice-roller/rpg-dice-roller';

const { generator, engines } = NumberGenerator;

// 1. Seeding works and is reproducible -------------------------------------
const seq = (seed) => {
  generator.engine = engines.MersenneTwister19937.seed(seed);
  return [1, 2, 3, 4, 5].map(() => new DiceRoll('1d20').total);
};
console.log('seed 42 (a):', seq(42));
console.log('seed 42 (b):', seq(42), '  <- identical');
console.log('seed  7    :', seq(7));

// 2. ...but `generator` is a module-level singleton -------------------------
const other = (await import('@dice-roller/rpg-dice-roller')).NumberGenerator.generator;
console.log('shared singleton across imports:', other === generator, ' <- ADR-0002 problem');

// 3. Forcing: only all-min / all-max are first class ------------------------
generator.engine = engines.min;
console.log(
  'engines.min  1d20 x3:',
  [1, 2, 3].map(() => new DiceRoll('1d20').total),
);
generator.engine = engines.max;
console.log('engines.max  2d6    :', new DiceRoll('2d6').total);

// 4. Exact per-die forcing via a hand-rolled engine returning `value - 1`.
//    Verified exhaustively for d4/d6/d20; relies on random-js's integer()
//    mapping, which is not part of the dice-roller public API.
const mismatches = [];
for (const [sides, expr] of [
  [20, '1d20'],
  [4, '1d4'],
  [6, '1d6'],
]) {
  for (let v = 1; v <= sides; v++) {
    generator.engine = { next: () => v - 1 };
    const got = new DiceRoll(expr).total;
    if (got !== v) mismatches.push(`${expr} want ${v} got ${got}`);
  }
}
console.log('exact-force mismatches:', mismatches.length ? mismatches : 'none');

// 5. ...and it survives a kept pair (what advantage needs).
let i = 0;
const pair = [7, 15];
generator.engine = { next: () => pair[i++ % 2] - 1 };
console.log('forced 2d20kh1 (7,15):', new DiceRoll('2d20kh1').output);
