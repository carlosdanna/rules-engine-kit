/**
 * What an effect may write, and how a path addresses it.
 *
 * Deliberately narrow. Printed inputs (ability scores, proficiency bonus, base AC) are what
 * the fixture says and rules do not edit them — a rule that wants a different effective AC
 * adds a modifier and lets ADR-0006's derivation report the terms. Derived paths are sealed,
 * not written. That leaves current HP, conditions, and two scratch namespaces.
 */

export type WritablePath =
  | { kind: 'actorField'; actorId: string; field: 'hpCurrent' | 'conditions' }
  | { kind: 'scratch'; path: string }
  | { kind: 'world'; path: string };

const ACTOR_FIELD = /^actor\.([^.]+)\.(hpCurrent|conditions)$/;

export function parseWritablePath(path: string): WritablePath | null {
  const actorField = ACTOR_FIELD.exec(path);
  if (actorField !== null) {
    const [, actorId, field] = actorField;
    if (actorId !== undefined && (field === 'hpCurrent' || field === 'conditions')) {
      return { kind: 'actorField', actorId, field };
    }
  }

  // Two namespaces, not one: `scratch.*` is cleared at the start of every step, so a value
  // left by step 1 cannot be read by step 2 when step 2's rule never fired. `world.*` is for
  // genuinely run-scoped flags and survives.
  if (path.startsWith('scratch.')) return { kind: 'scratch', path };
  if (path.startsWith('world.')) return { kind: 'world', path };

  return null;
}
