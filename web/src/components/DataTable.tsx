import { useState, type ReactNode } from 'react';

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
}

/** One generic sortable table, used for every list on the site. Wrapped in `.table-scroll`
 *  (tabIndex + role="region") so keyboard users can scroll it horizontally without a mouse. */
export function DataTable<T>({ columns, rows, rowKey, caption, ariaLabel }: DataTableProps<T>) {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);

  const sorted = sort
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
    setSort((s) => (s?.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  }

  return (
    <div className="table-scroll" tabIndex={0} role="region" aria-label={ariaLabel}>
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
                      {active && <span aria-hidden="true">{sort.dir === 'asc' ? ' ▲' : ' ▼'}</span>}
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
