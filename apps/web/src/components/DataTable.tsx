import type { ReactNode } from 'react';
import { Feedback } from './ui';

export type TableColumn<Row> = {
  key: string;
  label: string;
  cell: (row: Row) => ReactNode;
  align?: 'right';
};

export function DataTable<Row extends { id: string }>({ rows, columns, label, emptyTitle = 'No records for this period' }: {
  rows: Row[];
  columns: TableColumn<Row>[];
  label: string;
  emptyTitle?: string;
}) {
  if (!rows.length) return <Feedback kind="empty" title={emptyTitle} />;

  return (
    <div className="table-scroll" role="region" aria-label={label} tabIndex={0}>
      <table className="data-table">
        <caption className="sr-only">{label}</caption>
        <thead>
          <tr>{columns.map((column) => (
            <th key={column.key} scope="col" className={column.align === 'right' ? 'cell-numeric' : undefined}>{column.label}</th>
          ))}</tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {columns.map((column, index) => index === 0
                ? <th key={column.key} scope="row">{column.cell(row)}</th>
                : <td key={column.key} className={column.align === 'right' ? 'cell-numeric' : undefined}>{column.cell(row)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
