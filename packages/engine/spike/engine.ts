/** SPIKE — throwaway phase loop. Enough of ADR-0005..0010 to run three hard rules. */

import type {
  Action,
  ActiveEffect,
  Actor,
  AppliedModifier,
  Citation,
  Duration,
  Effect,
  FactRead,
  FactReader,
  Outcome,
  Phase,
  ResolvedRule,
  RollTarget,
  RollTransform,
  Rule,
  RuleCtx,
  Situation,
  StackPolicy,
  Step,
  StepOutcome,
  TimePoint,
  Trace,
  TraceEvent,
} from './model';
import { comparePoints, PHASES } from './model';
import { Roller } from './rng';

export const TRACE_SCHEMA_VERSION = 0;

/**
 * SPIKE FINDING: `Omit<TraceEvent, 'seq'>` collapses the union to its shared
 * keys, so the emitter cannot be typed with a plain Omit. Needs a distributive
 * one (or `seq` assigned by the trace builder rather than stripped).
 */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type NewEvent = DistributiveOmit<TraceEvent, 'seq'>;

// ------------------------------------------------------------------ profile

export type Layer = { id: string; version: string; rules: Rule[]; disables?: string[] };

/** ADR-0009, cut down: add/override by key, disable keeps the rule flagged. */
export function resolveProfile(layers: Layer[]): ResolvedRule[] {
  const byKey = new Map<string, ResolvedRule>();
  for (const layer of layers) {
    for (const rule of layer.rules) {
      const prev = byKey.get(rule.key);
      byKey.set(rule.key, {
        ...rule,
        enabled: prev?.enabled ?? true,
        provenance: [
          ...(prev?.provenance ?? []),
          { layer: layer.id, version: layer.version, op: prev ? 'override' : 'add' },
        ],
      });
    }
    for (const key of layer.disables ?? []) {
      const prev = byKey.get(key);
      if (prev) {
        byKey.set(key, {
          ...prev,
          enabled: false,
          provenance: [
            ...prev.provenance,
            { layer: layer.id, version: layer.version, op: 'disable' },
          ],
        });
      }
    }
  }
  return [...byKey.values()].sort((a, b) => a.priority - b.priority || a.key.localeCompare(b.key));
}

// ------------------------------------------------------------------ the bus

type ModeInput = { ruleKey: string; target: RollTarget; mode: 'advantage' | 'disadvantage' };
type TransformInput = {
  ruleKey: string;
  target: RollTarget;
  transform: RollTransform;
  uses: number;
};
type ModInput = {
  ruleKey: string;
  target: RollTarget;
  value: number | { count: number; sides: number };
  modifierType: string;
  stackKey?: string;
  policy: StackPolicy;
};

type Bus = { modes: ModeInput[]; transforms: TransformInput[]; mods: ModInput[] };

// ------------------------------------------------------------------ evaluate

export type EvalOpts = { seed: string; forcedRolls?: Record<string, number[]> };

export function evaluate(
  situation: Situation,
  profile: ResolvedRule[],
  opts: EvalOpts,
): { outcome: Outcome; trace: Trace } {
  const roller = new Roller(opts.seed, opts.forcedRolls ?? {});
  const events: TraceEvent[] = [];
  let seq = 0;
  const push = (e: NewEvent) => {
    events.push({ ...e, seq: seq++ } as TraceEvent);
  };

  let active: ActiveEffect[] = [];
  let effectCounter = 0;
  const steps: StepOutcome[] = [];

  const baseActors: Record<string, Actor> = Object.fromEntries(
    situation.actors.map((a) => [a.id, a]),
  );

  /** Conditions = the fixture's own plus every active effect granting one. */
  const actorsNow = (): Record<string, Actor> => {
    const out: Record<string, Actor> = {};
    for (const [id, a] of Object.entries(baseActors)) {
      const granted = active
        .filter((e) => e.actorId === id)
        .flatMap((e) =>
          e.payload.flatMap((p) => (p.type === 'applyCondition' ? [p.condition] : [])),
        );
      out[id] = { ...a, conditions: [...a.conditions, ...granted] };
    }
    return out;
  };

  situation.timeline.forEach((step, stepIndex) => {
    const bus: Bus = { modes: [], transforms: [], mods: [] };
    let stepOutcome: StepOutcome = { stepId: step.id, round: step.round, actorId: step.actorId };

    for (const phase of PHASES) {
      push({ kind: 'phaseStart', stepId: step.id, round: step.round, phase });

      if (phase === 'upkeep' || phase === 'expire') {
        const edge = phase === 'upkeep' ? 'start' : 'end';
        const now: TimePoint = { round: step.round, stepIndex, edge };
        const [kept, gone] = partition(
          active,
          (e) => !(e.expiresAt?.edge === edge && comparePoints(e.expiresAt, now) <= 0),
        );
        for (const e of gone) {
          if (!e.expiresAt) continue; // unreachable: the partition matched on expiresAt
          push({
            kind: 'expiry',
            stepId: step.id,
            round: step.round,
            phase,
            effectId: e.id,
            sourceRuleKey: e.sourceRuleKey,
            expiresAt: e.expiresAt,
          });
        }
        active = kept;
      }

      const ctx: RuleCtx = {
        step,
        stepIndex,
        now: { round: step.round, stepIndex, edge: 'start' },
        actors: actorsNow(),
        intents: situation.intents,
        active,
      };

      for (const rule of profile.filter((r) => r.phase === phase)) {
        const record = (
          status: 'fired' | 'skipped' | 'disabled',
          conditionResult: boolean | null,
          factsRead: FactRead[],
          reason?: string,
        ) =>
          push({
            kind: 'rule',
            stepId: step.id,
            round: step.round,
            phase,
            ruleKey: rule.key,
            status,
            ...(reason === undefined ? {} : { reason }),
            conditionResult,
            factsRead,
            citation: rule.citation,
            provenance: lastProvenance(rule),
          } as NewEvent);

        if (!rule.enabled) {
          record('disabled', null, [], 'disabledByLayer');
          continue;
        }
        const f = makeFactReader();
        const fired = rule.condition(f, ctx);
        if (!fired) {
          record('skipped', false, f.reads, 'conditionFalse');
          continue;
        }
        record('fired', true, f.reads);

        for (const effect of rule.effects(f, ctx)) {
          applyEffect(effect, rule.key);
        }
      }

      if (phase === 'roll' && step.action.type === 'attack') {
        stepOutcome = { ...stepOutcome, attack: resolveAttack(step, bus) };
      }
      if (phase === 'compare' && stepOutcome.attack) {
        push({
          kind: 'compare',
          stepId: step.id,
          round: step.round,
          phase,
          target: `attack:${step.actorId}`,
          total: stepOutcome.attack.total,
          dc: stepOutcome.attack.dc,
          result: stepOutcome.attack.result,
        });
      }
    }

    steps.push(stepOutcome);

    // ---- helpers closing over the step ----
    function applyEffect(effect: Effect, ruleKey: string) {
      switch (effect.type) {
        case 'rollMode':
          bus.modes.push({ ruleKey, target: effect.target, mode: effect.mode });
          return;
        case 'rollTransform':
          bus.transforms.push({
            ruleKey,
            target: effect.target,
            transform: effect.transform,
            uses: effect.uses,
          });
          return;
        case 'addModifier':
          bus.mods.push({
            ruleKey,
            target: effect.target,
            value: effect.value,
            modifierType: effect.modifierType,
            ...(effect.stackKey === undefined ? {} : { stackKey: effect.stackKey }),
            policy: effect.policy,
          });
          return;
        case 'applyCondition': {
          const id = `eff-${effectCounter++}`;
          const appliedAt: TimePoint = { round: step.round, stepIndex, edge: 'start' };
          const expiresAt = resolveExpiry(effect.duration, step, stepIndex, situation.timeline);
          active = [
            ...active,
            {
              id,
              sourceRuleKey: ruleKey,
              actorId: effect.actorId,
              duration: effect.duration,
              appliedAt,
              expiresAt,
              payload: [effect],
            },
          ];
          push({
            kind: 'effectApplied',
            stepId: step.id,
            round: step.round,
            phase: 'apply',
            effectId: id,
            sourceRuleKey: ruleKey,
            onActorId: effect.actorId,
            expiresAt,
          });
          return;
        }
        default:
          return;
      }
    }

    function resolveAttack(s: Step, b: Bus) {
      const action = s.action as Extract<Action, { type: 'attack' }>;
      const target: RollTarget = `attack:${s.actorId}`;

      // 1. roll mode — advantage and disadvantage cancel regardless of count.
      const modeInputs = b.modes.filter((m) => m.target === target);
      const adv = modeInputs.some((m) => m.mode === 'advantage');
      const dis = modeInputs.some((m) => m.mode === 'disadvantage');
      const mode: 'normal' | 'advantage' | 'disadvantage' =
        adv && dis ? 'normal' : adv ? 'advantage' : dis ? 'disadvantage' : 'normal';

      // 2. roll the pool
      const poolSize = mode === 'normal' ? 1 : 2;
      const records = Array.from({ length: poolSize }, () => roller.roll(s.id, target, 20));
      const dice = records.map((r) => r.value);

      // 3. transforms, on the POOL (see docs/spike-notes.md — ADR-0008 says on the kept die)
      const pool = [...dice];
      const transforms: {
        ruleKey: string;
        kind: string;
        dieIndex: number;
        from: number;
        to: number;
      }[] = [];
      const chosen = Number(situation.intents.rerollDieIndex ?? 0);
      for (const t of b.transforms.filter((x) => x.target === target)) {
        for (let u = 0; u < t.uses; u++) {
          const i = Math.min(chosen, pool.length - 1);
          const from = at(pool, i);
          if (t.transform.kind === 'reroll') {
            const fresh = roller.roll(s.id, `${target}:reroll`, 20).value;
            pool[i] = t.transform.keep === 'higher' ? Math.max(from, fresh) : fresh;
          } else {
            pool[i] = Math.max(from, t.transform.value);
          }
          transforms.push({
            ruleKey: t.ruleKey,
            kind: t.transform.kind,
            dieIndex: i,
            from,
            to: at(pool, i),
          });
        }
      }

      // 4. keep
      const keptIndex =
        mode === 'advantage'
          ? pool.indexOf(Math.max(...pool))
          : mode === 'disadvantage'
            ? pool.indexOf(Math.min(...pool))
            : 0;
      const kept = at(pool, keptIndex);

      // 5. numeric modifiers, after stacking policies
      const { applied, dropped } = stack(
        b.mods.filter((m) => m.target === target),
        s,
        target,
      );
      const total = applied.reduce((n, m) => n + m.value, kept);

      const dc = baseActors[action.targetId]?.ac ?? 10;
      const result: 'hit' | 'miss' = total >= dc ? 'hit' : 'miss';

      push({
        kind: 'roll',
        stepId: s.id,
        round: s.round,
        phase: 'roll',
        target,
        mode,
        modeInputs: modeInputs.map((m) => ({ ruleKey: m.ruleKey, mode: m.mode })),
        dice,
        diceAfterTransforms: pool,
        kept,
        keptIndex,
        forced: records.some((r) => r.forced),
        transforms,
        modifiers: applied,
        dropped,
        total,
      });

      return { mode, dice, kept, total, dc, result };
    }

    function stack(mods: ModInput[], s: Step, target: RollTarget) {
      const applied: AppliedModifier[] = [];
      const dropped: { modifier: AppliedModifier; policy: StackPolicy; beatenBy?: string }[] = [];
      const seenStackKeys = new Map<string, string>();
      const bestByType = new Map<string, AppliedModifier>();

      for (const m of mods) {
        let value: number;
        let rolled: { expr: string; dice: number[] } | undefined;
        if (typeof m.value === 'number') {
          value = m.value;
        } else {
          const d = Array.from(
            { length: m.value.count },
            () =>
              roller.roll(s.id, `${target}:${m.modifierType}`, (m.value as { sides: number }).sides)
                .value,
          );
          value = d.reduce((a, b2) => a + b2, 0);
          rolled = { expr: `${m.value.count}d${m.value.sides}`, dice: d };
        }
        const am: AppliedModifier = {
          ruleKey: m.ruleKey,
          modifierType: m.modifierType,
          ...(m.stackKey === undefined ? {} : { stackKey: m.stackKey }),
          policy: m.policy,
          value,
          ...(rolled === undefined ? {} : { rolled }),
        };

        if (m.policy === 'unique' && m.stackKey) {
          const owner = seenStackKeys.get(m.stackKey);
          if (owner) {
            dropped.push({ modifier: am, policy: 'unique', beatenBy: owner });
            continue;
          }
          seenStackKeys.set(m.stackKey, m.ruleKey);
        }
        if (m.policy === 'highest') {
          const best = bestByType.get(m.modifierType);
          if (best && best.value >= value) {
            dropped.push({ modifier: am, policy: 'highest', beatenBy: best.ruleKey });
            continue;
          }
          if (best) {
            dropped.push({ modifier: best, policy: 'highest', beatenBy: m.ruleKey });
            applied.splice(applied.indexOf(best), 1);
          }
          bestByType.set(m.modifierType, am);
        }
        applied.push(am);
      }
      return { applied, dropped };
    }
  });

  return {
    outcome: {
      steps,
      activeAtEnd: active.map((e) => ({
        id: e.id,
        sourceRuleKey: e.sourceRuleKey,
        actorId: e.actorId,
      })),
      seed: opts.seed,
    },
    trace: { traceSchemaVersion: TRACE_SCHEMA_VERSION, events },
  };
}

// ------------------------------------------------------------------ bits

function lastProvenance(rule: ResolvedRule): { layer: string; version: string } {
  const p = rule.provenance[rule.provenance.length - 1];
  return { layer: p?.layer ?? '?', version: p?.version ?? '?' };
}

function partition<T>(xs: T[], keep: (x: T) => boolean): [T[], T[]] {
  const a: T[] = [];
  const b: T[] = [];
  for (const x of xs) (keep(x) ? a : b).push(x);
  return [a, b];
}

function makeFactReader(): FactReader {
  const reads: FactRead[] = [];
  const f = ((path: string) => {
    // the caller resolves the value; this just records what it asked for
    return reads.find((r) => r.path === path)?.value;
  }) as FactReader;
  f.reads = reads;
  return f;
}

/** Actor lookup that fails loudly: unknown paths are errors, not silent nulls. */
export function actorOf(ctx: RuleCtx, id: string): Actor {
  const a = ctx.actors[id];
  if (!a) throw new Error(`unknown actor: ${id}`);
  return a;
}

/** Indexed read that fails loudly, so `noUncheckedIndexedAccess` needs no `!`. */
function at<T>(xs: readonly T[], i: number): T {
  const x = xs[i];
  if (x === undefined) throw new Error(`index ${i} out of range (length ${xs.length})`);
  return x;
}

/** Record a fact read and return the value, so conditions read like `v(f,'x',val)`. */
export function v<T>(f: FactReader, path: string, value: T): T {
  f.reads.push({ path, value });
  return value;
}

/** ADR-0007: resolve a declared duration to a concrete TimePoint against the timeline. */
export function resolveExpiry(
  duration: Duration,
  step: Step,
  stepIndex: number,
  timeline: Step[],
): TimePoint | null {
  if (duration.kind === 'permanent') return null;
  if (duration.kind === 'instant') return { round: step.round, stepIndex, edge: 'end' };

  const [actorId, edge, round] =
    duration.kind === 'untilTurn'
      ? [duration.actorId, duration.edge, step.round + duration.afterRounds]
      : [duration.anchorActorId, duration.edge, step.round + duration.rounds];

  const idx = timeline.findIndex((s) => s.round === round && s.actorId === actorId);
  // Anchor turn is outside the declared timeline: the effect simply outlives the run.
  if (idx === -1) return null;
  return { round, stepIndex: idx, edge };
}

export type { Citation, Phase };
