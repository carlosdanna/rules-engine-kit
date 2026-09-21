# ADR-0003: Core subset, fixed phases, choices up front

- Status: accepted
- Date: 2026-09-21

## Context
Full D&D rules need reactions, interrupts and interactive choices, which would dominate the project.

## Decision
Encode only the core subset in `requirements.md`. Evaluation runs through fixed phases with no forward chaining. Player choices are declared in `situation.intents`; evaluation never pauses. Reactions, movement and most spells are out of scope.

## Consequences
The engine stays one pure function. Features like reactions can be added later as new phases or a stepper API via a new ADR.
