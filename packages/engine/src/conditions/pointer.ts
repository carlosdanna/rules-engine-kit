/**
 * RFC 6901 JSON pointers into a condition tree. `failedAt` and the lint report address
 * sub-expressions with these, so an explanation can point at the exact node (ADR-0010).
 *
 * A node's pointer ends in its own operator token — `{ all: [a, { '==': [...] }] }` puts
 * its second child at `/all/1/==`. That is why the empty root pointer never escapes:
 * every node has at least one token, so `SkipReason.failedAt` (`min(1)`) always holds.
 */

/** The container pointer of the whole condition. Never reported on its own. */
export const ROOT_POINTER = '';

export function childPointer(parent: string, token: string | number): string {
  const escaped = String(token).replace(/~/g, '~0').replace(/\//g, '~1');
  return `${parent}/${escaped}`;
}
