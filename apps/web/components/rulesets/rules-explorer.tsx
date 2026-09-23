'use client';

/**
 * The rule table for one ruleset version: phase and tag filters, a search that both narrows
 * the table and jumps straight to a rule, and a row per authored entry.
 *
 * The rules shown are the ones this version *authors*. A rule's surviving body after a layer
 * merge — `ResolvedRule.provenance` — exists only once a profile is resolved, so it belongs to
 * `/profiles`, not here (VR-4).
 */

import type { RuleRow } from '@rules-engine-kit/db';
import { PHASES, type Phase } from '@rules-engine-kit/engine';
import {
  columnFilteringFeature,
  createColumnHelper,
  createFilteredRowModel,
  createSortedRowModel,
  filterFns,
  globalFilteringFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
} from '@tanstack/react-table';
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const features = tableFeatures({
  columnFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  globalFilteringFeature,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  filterFns: {
    ...filterFns,
    /** The row's single value is one of the selected ones. Empty selection means no filter. */
    oneOf: (row, columnId, selected: string[]) =>
      selected.length === 0 || selected.includes(String(row.getValue(columnId) ?? '')),
    /** The row carries at least one of the selected tags. */
    hasAny: (row, columnId, selected: string[]) => {
      if (selected.length === 0) return true;
      const tags = row.getValue<string[] | null>(columnId) ?? [];
      return selected.some((tag) => tags.includes(tag));
    },
    /** Search matches the key or the label, which is what a reader has in mind. */
    ruleText: (row, _columnId, query: string) => {
      const text = query.trim().toLowerCase();
      if (text === '') return true;
      const rule = row.original as RuleRow;
      return (
        rule.ruleKey.toLowerCase().includes(text) || (rule.label ?? '').toLowerCase().includes(text)
      );
    },
  },
});

const helper = createColumnHelper<typeof features, RuleRow>();

/**
 * `phase`, `priority` and `tags` are nullable: a `patch` entry carries only the fields it
 * changes and a `disable` entry carries none, so the body columns are empty for both
 * (ADR-0009). Every seeded rule is an `add` today; the table still has to render the others.
 */
const EM_DASH = '—';

export function RulesExplorer({ rules }: { rules: RuleRow[] }) {
  const [query, setQuery] = useState('');
  const [phases, setPhases] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);

  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor('ruleKey', {
          header: 'Rule',
          cell: (cell) => (
            <Link
              href={`?rule=${encodeURIComponent(cell.getValue())}`}
              scroll={false}
              className="font-mono text-xs underline decoration-dotted underline-offset-4 hover:decoration-solid"
            >
              {cell.getValue()}
            </Link>
          ),
        }),
        helper.accessor('label', {
          header: 'Label',
          cell: (cell) =>
            cell.getValue() ?? <span className="text-muted-foreground">{EM_DASH}</span>,
        }),
        helper.accessor('phase', {
          header: 'Phase',
          filterFn: 'oneOf',
          cell: (cell) => {
            const phase = cell.getValue();
            return phase ? (
              <Badge variant="secondary">{phase}</Badge>
            ) : (
              <span className="text-muted-foreground">{EM_DASH}</span>
            );
          },
        }),
        helper.accessor('priority', {
          header: 'Priority',
          cell: (cell) =>
            cell.getValue() ?? <span className="text-muted-foreground">{EM_DASH}</span>,
        }),
        helper.accessor('tags', {
          header: 'Tags',
          enableSorting: false,
          filterFn: 'hasAny',
          cell: (cell) => {
            const value = cell.getValue() ?? [];
            if (value.length === 0) {
              return <span className="text-muted-foreground">{EM_DASH}</span>;
            }
            return (
              <span className="flex flex-wrap gap-1">
                {value.map((tag) => (
                  <Badge key={tag} variant="outline">
                    {tag}
                  </Badge>
                ))}
              </span>
            );
          },
        }),
      ]),
    [],
  );

  const table = useTable({
    features,
    data: rules,
    columns,
    state: {
      globalFilter: query,
      columnFilters: [
        { id: 'phase', value: phases },
        { id: 'tags', value: tags },
      ],
    },
    globalFilterFn: 'ruleText',
  });

  /** Counts come from the authored rows, so a phase with no rules reads 0 rather than vanishing. */
  const phaseCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const rule of rules) {
      if (rule.phase) counts.set(rule.phase, (counts.get(rule.phase) ?? 0) + 1);
    }
    return counts;
  }, [rules]);

  const allTags = useMemo(
    () => [...new Set(rules.flatMap((rule) => rule.tags ?? []))].sort(),
    [rules],
  );

  const rows = table.getRowModel().rows;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3">
        <RuleSearch rules={rules} query={query} onQueryChange={setQuery} />

        <fieldset className="flex flex-wrap items-center gap-1.5">
          <legend className="sr-only">Filter by phase</legend>
          <span className="mr-1 text-xs text-muted-foreground">Phase</span>
          {PHASES.map((phase) => (
            <PhaseToggle
              key={phase}
              phase={phase}
              count={phaseCounts.get(phase) ?? 0}
              pressed={phases.includes(phase)}
              onToggle={() =>
                setPhases((current) =>
                  current.includes(phase)
                    ? current.filter((entry) => entry !== phase)
                    : [...current, phase],
                )
              }
            />
          ))}
        </fieldset>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Tags</span>
          <TagFilter all={allTags} selected={tags} onChange={setTags} />
        </div>
      </div>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {rows.length} of {rules.length} {rules.length === 1 ? 'rule' : 'rules'}
      </p>

      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder ? null : header.column.getCanSort() ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="-ml-2.5"
                      onClick={() => header.column.toggleSorting()}
                    >
                      <table.FlexRender header={header} />
                      <SortIcon direction={header.column.getIsSorted()} />
                    </Button>
                  ) : (
                    <table.FlexRender header={header} />
                  )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="h-20 text-center text-muted-foreground"
              >
                No rule in this version matches those filters.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.id}>
                {row.getAllCells().map((cell) => (
                  <TableCell key={cell.id} className="align-top">
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function SortIcon({ direction }: { direction: false | 'asc' | 'desc' }) {
  if (direction === 'asc') return <ArrowUpIcon className="text-muted-foreground" />;
  if (direction === 'desc') return <ArrowDownIcon className="text-muted-foreground" />;
  return <ChevronsUpDownIcon className="text-muted-foreground/50" />;
}

function PhaseToggle({
  phase,
  count,
  pressed,
  onToggle,
}: {
  phase: Phase;
  count: number;
  pressed: boolean;
  onToggle: () => void;
}) {
  return (
    <Button
      size="xs"
      variant={pressed ? 'secondary' : 'outline'}
      aria-pressed={pressed}
      // A phase with no authored rule is still one of the eight the engine runs, so it stays
      // on screen rather than disappearing from the filter (FR-9).
      disabled={count === 0}
      onClick={onToggle}
    >
      {phase}
      <span className="text-muted-foreground">{count}</span>
    </Button>
  );
}

/** Search that narrows the table as you type, and opens a rule when you pick one. */
function RuleSearch({
  rules,
  query,
  onQueryChange,
}: {
  rules: RuleRow[];
  query: string;
  onQueryChange: (value: string) => void;
}) {
  return (
    <Combobox
      items={rules}
      value={null}
      inputValue={query}
      onInputValueChange={onQueryChange}
      itemToStringLabel={(rule: RuleRow) => rule.ruleKey}
      filter={(rule: RuleRow, text) => {
        const needle = text.trim().toLowerCase();
        return (
          needle === '' ||
          rule.ruleKey.toLowerCase().includes(needle) ||
          (rule.label ?? '').toLowerCase().includes(needle)
        );
      }}
      limit={8}
    >
      <ComboboxInput
        placeholder="Search rules by key or label…"
        aria-label="Search rules"
        className="w-full sm:max-w-md"
        showTrigger={false}
        showClear={query !== ''}
      />
      <ComboboxContent>
        <ComboboxEmpty>No rule matches.</ComboboxEmpty>
        <ComboboxList>
          {(rule: RuleRow) => (
            <ComboboxItem key={rule.id} value={rule}>
              <Link
                href={`?rule=${encodeURIComponent(rule.ruleKey)}`}
                scroll={false}
                className="flex min-w-0 flex-col"
              >
                <span className="font-mono text-xs">{rule.ruleKey}</span>
                {rule.label && (
                  <span className="truncate text-xs text-muted-foreground">{rule.label}</span>
                )}
              </Link>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

function TagFilter({
  all,
  selected,
  onChange,
}: {
  all: string[];
  selected: string[];
  onChange: (tags: string[]) => void;
}) {
  return (
    <Combobox items={all} multiple value={selected} onValueChange={onChange}>
      <ComboboxChips className="w-full sm:max-w-md">
        {selected.map((tag) => (
          <ComboboxChip key={tag} aria-label={tag}>
            {tag}
          </ComboboxChip>
        ))}
        <ComboboxChipsInput
          placeholder={selected.length === 0 ? 'Any tag' : ''}
          aria-label="Filter by tag"
        />
      </ComboboxChips>
      <ComboboxContent>
        <ComboboxEmpty>No tag matches.</ComboboxEmpty>
        <ComboboxList>
          {(tag: string) => (
            <ComboboxItem key={tag} value={tag}>
              {tag}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
