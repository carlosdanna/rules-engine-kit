'use server';

/**
 * The app's write path (FR-18, ADR-0029).
 *
 * A thin adapter, on purpose: every action reads the rows the write needs, hands them to
 * `lib/scenarios/write.ts` — which takes its database as an argument and is unit-tested
 * against an in-memory one — and translates the result into a revalidation or a redirect.
 * Keeping the rules out of this file is what lets them be tested without a browser or a
 * server, and keeps `'use server'` to its one constraint: only async exports.
 *
 * Input is validated here with `ScenarioInput`, the Zod schema `packages/db` exports beside
 * `ScenarioFile`. An action is a public POST endpoint reachable without going through the UI
 * (Next's own `server-actions` guide is explicit about it), so what arrives is untrusted:
 * nothing here believes the client's rendered preview, its choice of `origin`, or that a slug
 * it was offered is still free.
 *
 * On revalidation: a Next 16 action's response carries both its return value and a re-rendered
 * route when it calls `revalidatePath` or `redirect`, so neither the list nor the detail page
 * needs a follow-up fetch. `revalidatePath` goes *before* `redirect`, because `redirect` throws
 * a control-flow exception and nothing after it runs.
 */

import {
  ScenarioInput,
  type ScenarioInput as ScenarioInputType,
  type TemplateRow,
} from '@rules-engine-kit/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db';
import { getScenario, getTemplate, listFixtures } from '@/lib/queries';
import { type ScenarioExport, scenarioExport } from '@/lib/scenarios/export';
import type { ActionResult, SavedScenario } from '@/lib/scenarios/types';
import {
  createUserScenario,
  deleteUserScenario,
  type RenderSources,
  updateUserScenario,
} from '@/lib/scenarios/write';

/** Zod's issues, flattened onto the field names the form's controls carry. */
function parseInput(payload: unknown): ActionResult<ScenarioInputType> {
  const parsed = ScenarioInput.safeParse(payload);
  if (parsed.success) return { ok: true, data: parsed.data };

  const fieldErrors: Record<string, string[]> = {};
  const formErrors: string[] = [];

  for (const issue of parsed.error.issues) {
    // `body.situation.timeline.0.round` reads as a situation problem; `slug` reads as a slug one.
    const [head, ...rest] = issue.path.map(String);
    const key =
      head === 'body' ? (rest[0] === 'params' ? `params.${rest[1]}` : 'situation') : (head ?? '');

    if (key === '') {
      formErrors.push(issue.message);
      continue;
    }
    const messages = fieldErrors[key] ?? [];
    messages.push(`${issue.path.join('.')}: ${issue.message}`);
    fieldErrors[key] = messages;
  }

  return { ok: false, formErrors, fieldErrors };
}

/** The template and fixtures a template-mode save re-renders from, read fresh. */
async function renderSources(input: ScenarioInputType): Promise<RenderSources> {
  if (input.body.kind !== 'template') return { template: null, fixtures: [] };

  const [template, fixtures] = await Promise.all([
    getTemplate(input.body.templateId),
    listFixtures(),
  ]);
  return { template: template as TemplateRow | null, fixtures };
}

export async function createScenarioAction(
  _previous: unknown,
  payload: unknown,
): Promise<ActionResult<SavedScenario>> {
  const input = parseInput(payload);
  if (!input.ok) return input;

  const result = createUserScenario(getDb(), input.data, await renderSources(input.data));
  if (!result.ok) return result;

  revalidatePath('/scenarios');
  redirect(`/scenarios/${result.data.slug}`);
}

export async function updateScenarioAction(
  _previous: unknown,
  payload: { slug: string; input: unknown },
): Promise<ActionResult<SavedScenario>> {
  const input = parseInput(payload.input);
  if (!input.ok) return input;

  const result = updateUserScenario(
    getDb(),
    payload.slug,
    input.data,
    await renderSources(input.data),
  );
  if (!result.ok) return result;

  revalidatePath('/scenarios');
  revalidatePath(`/scenarios/${payload.slug}`);
  redirect(`/scenarios/${payload.slug}`);
}

/**
 * Delete stays on `/scenarios`, so it revalidates rather than redirecting — the re-rendered
 * list arrives in the same response as the result.
 */
export async function deleteScenarioAction(
  _previous: unknown,
  payload: { slug: string },
): Promise<ActionResult<null>> {
  const result = deleteUserScenario(getDb(), payload.slug);
  if (result.ok) revalidatePath('/scenarios');
  return result;
}

/**
 * The bytes for the download. Serialising happens here rather than in the browser so `yaml`
 * stays a dependency of `packages/db` alone; the client makes a Blob of the string.
 */
export async function exportScenarioAction(
  _previous: unknown,
  payload: { slug: string },
): Promise<ActionResult<ScenarioExport>> {
  const row = await getScenario(payload.slug);
  if (row === null) {
    return { ok: false, formErrors: [`no scenario '${payload.slug}'`], fieldErrors: {} };
  }

  try {
    return { ok: true, data: scenarioExport(row) };
  } catch (thrown) {
    return {
      ok: false,
      formErrors: [`that scenario cannot be exported: ${(thrown as Error).message}`],
      fieldErrors: {},
    };
  }
}
