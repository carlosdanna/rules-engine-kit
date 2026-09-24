'use client';

/**
 * The two runs side by side (FR-16): each panel an outcome and a trace, resizable against the
 * other, with the events that differ outlined and their phases opened.
 *
 * Highlight keys arrive as a list from the server — `alignmentKey` of every event `diffTraces`
 * found changed or one-sided — so the full diff, which carries both events per row, never has
 * to cross to the browser.
 */

import type { Outcome, Situation, Trace } from '@rules-engine-kit/engine';
import { useMemo } from 'react';
import { OutcomeSummary } from '@/components/evaluations/outcome-summary';
import { TraceViewer } from '@/components/evaluations/trace-viewer';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';

export type CompareSideView = {
  profile: { id: string; name: string };
  outcome: Outcome;
  trace: Trace;
};

export type CompareViewProps = {
  situation: Situation;
  scenario: { id: string; name: string };
  a: CompareSideView;
  b: CompareSideView;
  highlight: string[];
};

function Side({
  side,
  label,
  situation,
  scenario,
  highlight,
}: {
  side: CompareSideView;
  label: string;
  situation: Situation;
  scenario: CompareViewProps['scenario'];
  highlight: ReadonlySet<string>;
}) {
  return (
    <div className="min-w-0 space-y-4 p-3" data-testid={`compare-side-${label}`}>
      <h2 className="text-lg font-semibold">
        {label} · <span className="font-mono">{side.profile.id}</span>
      </h2>
      <OutcomeSummary
        outcome={side.outcome}
        situation={situation}
        scenario={scenario}
        profile={side.profile}
      />
      <TraceViewer trace={side.trace} situation={situation} highlight={highlight} />
    </div>
  );
}

export function CompareView({ situation, scenario, a, b, highlight }: CompareViewProps) {
  const keys = useMemo(() => new Set(highlight), [highlight]);

  return (
    <ResizablePanelGroup orientation="horizontal" className="rounded-lg border">
      <ResizablePanel defaultSize="50" minSize="25">
        <Side side={a} label="A" situation={situation} scenario={scenario} highlight={keys} />
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize="50" minSize="25">
        <Side side={b} label="B" situation={situation} scenario={scenario} highlight={keys} />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
