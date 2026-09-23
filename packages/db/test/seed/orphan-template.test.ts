/**
 * What a reseed says when a user scenario outlives its template (ADR-0029).
 *
 * `deleteSeeded` drops `templates` wholesale and writes them back under the same deterministic
 * ids (ADR-0027), so a user scenario's `template_id` normally survives a rebuild untouched.
 * It does not survive the template being deleted from `content/` — and because the foreign key
 * check is deferred to the commit, SQLite reports that as a bare `FOREIGN KEY constraint
 * failed` naming neither the row nor the table. That message is unactionable, which is the
 * whole reason this test exists.
 */

import { describe, expect, it } from 'vitest';
import { scenarios } from '../../src/schema/scenarios';
import { seedDatabase } from '../../src/seed/seed';
import { openTestDb, seedContent } from './helpers';

describe('reseeding with a user scenario whose template is gone', () => {
  it('names the scenario and what to do about it', () => {
    const db = openTestDb();
    try {
      const content = seedContent();
      seedDatabase(db.db, content, { guardPublished: false });

      // A user scenario built from a template, as `/scenarios/new` writes one.
      const seeded = db.db.select().from(scenarios).all();
      const fromTemplate = seeded.find((row) => row.templateId !== null);
      if (fromTemplate === undefined) throw new Error('no seeded scenario has a template');

      db.db
        .insert(scenarios)
        .values({ ...fromTemplate, id: 'mine', name: 'Mine', origin: 'user' })
        .run();

      // The author deletes that template from `content/` and reseeds.
      const without = {
        ...content,
        templates: content.templates.filter((template) => template.id !== fromTemplate.templateId),
      };

      expect(() => seedDatabase(db.db, without, { guardPublished: false })).toThrow(/Mine|mine/);
      expect(() => seedDatabase(db.db, without, { guardPublished: false })).toThrow(
        new RegExp(String(fromTemplate.templateId)),
      );
    } finally {
      db.close();
    }
  });
});
