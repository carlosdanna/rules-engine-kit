# Scenarios

Ready-made situations the app seeds as `scenarios` rows (ADR-0004) and `pnpm engine run` can
evaluate straight from the command line.

A file here is an **envelope**, not a bare `Situation` (ADR-0028). It comes in two forms.

A **template call**, which is what every scenario here is but one:

```yaml
slug: melee-attack
name: Melee attack, SRD 5.1
profile: srd-5.1        # the profile it is *rendered* against; it picks the fixture variant
template: melee-attack  # a template id from content/templates/
params: {}              # omitted or empty renders with the template's declared defaults
```

The situation is rendered at load time by the same `renderTemplate` the golden cases use, so a
template change fails a test rather than leaving a stale copy of its output here. `profile` is a
render input only — which profile the scenario is later *run* under is chosen every time, in the
playground or on the command line.

A **literal situation**, which is what a user scenario exported from the app comes back as, and
what a blank-slate scenario is (FR-18), and what `use-an-object.yaml` is, because no starter
template declares a `useObject` step:

```yaml
slug: my-situation
name: Something I built by hand
situation: { schemaVersion: 3, actors: [...], timeline: [...] }
```

Exactly one of `template` and `situation`. YAML and JSON are both read.

Correcting a fixture is taken up by **re-rendering** a scenario from its template and params —
there is no per-scenario override, because a rendered situation is closed over its content
(ADR-0017).

## The acceptance scenarios

Three files here exist for `docs/requirements.md`'s acceptance table rather than as a template's
defaults, and the home page links each of them into `/compare` under both profiles:
`inspiration-on-an-attack`, `use-an-object` and `prone-and-flanked`. The other two rows reuse
`combat-start` (surprise) and `melee-attack` (weapon mastery). `prone-and-flanked` is rendered
under `srd-5.1`, because no fixture is scoped to a `+flanking` profile, and is meant to be run
under `srd-5.1+flanking` and `srd-5.2.1+flanking`.
