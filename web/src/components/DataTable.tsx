import { useState, type ReactNode } from 'react';
import { Icon } from './Icon.js';

export interface Column<T> {
  key: string;
  header: ReactNode;
  numeric?: boolean;
  sortable?: boolean;
  render: (row: T) => ReactNode;
  /** Comparable value for sorting. Required when `sortable` is true. */
  sortValue?: (row: T) => string | number;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Visually hidden — names the table for screen reader users. */
  caption: string;
  ariaLabel: string;
  className?: string;
  /** Controlled sort. With `onSortChange` set the table does NOT reorder `rows` itself — the
   *  owner re-fetches in the new order. Needed for paginated lists, where sorting only the loaded
   *  page showed "the most expensive of these 10", not of the whole range. */
  sort?: SortState | null;
  onSortChange?: (s: SortState) => void;
}

export type SortState = { key: string; dir: 'asc' | 'desc' };

/** One generic sortable table, used for every list on the site. Wrapped in `.table-scroll`
 *  (tabIndex + role="region") so keyboard users can scroll it horizontally without a mouse. */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  ariaLabel,
  className,
  sort: controlledSort,
  onSortChange,
}: DataTableProps<T>) {
  const [localSort, setLocalSort] = useState<SortState | null>(null);
  const controlled = !!onSortChange;
  const sort = controlled ? (controlledSort ?? null) : localSort;

  const sorted = sort && !controlled
    ? [...rows].sort((a, b) => {
        const col = columns.find((c) => c.key === sort.key);
        const av = col?.sortValue?.(a) ?? '';
        const bv = col?.sortValue?.(b) ?? '';
        const cmp =
          typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
        return sort.dir === 'asc' ? cmp : -cmp;
      })
    : rows;

  function toggleSort(key: string) {
    // Numbers start descending (biggest first is what you're usually after), text ascending.
    const numeric = columns.find((c) => c.key === key)?.numeric;
    const next: SortState =
      sort?.key === key
        ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: numeric ? 'desc' : 'asc' };
    if (controlled) onSortChange!(next);
    else setLocalSort(next);
  }

  return (
    <div className={className ? "table-scroll " + className : "table-scroll"} tabIndex={0} role="region" aria-label={ariaLabel}>
      <table className="data-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => {
              const active = sort?.key === c.key;
              const ariaSort = active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : c.sortable ? 'none' : undefined;
              return (
                <th key={c.key} scope="col" className={c.numeric ? 'num' : undefined} aria-sort={ariaSort}>
                  {c.sortable ? (
                    <button type="button" className="th-sort" onClick={() => toggleSort(c.key)}>
                      {c.header}
                      {/* Idle columns get a faint caret so sortability is visible before a click. */}
                      <Icon
                        className={active ? 'sort-arrow' : 'sort-arrow idle'}
                        name={active && sort.dir === 'asc' ? 'caretUp' : 'caretDown'}
                        size={9}
                      />
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((c) => (
                <td key={c.key} className={c.numeric ? 'num' : undefined}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
