import type { Response } from 'express';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import type { Report } from './reporting.js';

function formatMoney(value: string | number) {
  if (!/^-?\d+$/.test(String(value))) return value;
  const cents = BigInt(value);
  const magnitude = cents < 0n ? -cents : cents;
  return `${cents < 0n ? '-' : ''}Rs. ${(magnitude / 100n).toLocaleString('en-LK')}.${(magnitude % 100n).toString().padStart(2, '0')}`;
}

function periodLabel(report: Report) {
  const lastDay = new Date(Date.parse(report.range.toExclusive) - 86_400_000).toISOString().slice(0, 10);
  return report.range.month ?? `${report.range.from} to ${lastDay}`;
}

export async function renderExport(response: Response, report: Report, format: 'pdf' | 'xlsx', slug: string) {
  response.attachment(`${slug}-${report.range.from}.${format}`);
  if (format === 'xlsx') {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Report');
    sheet.addRow([report.company]);
    sheet.addRow([report.title]);
    sheet.addRow([periodLabel(report), 'LKR', report.generatedAt]);
    sheet.addRow(report.columns.map((column) => column.label)).font = { bold: true };
    report.columns.forEach((column, index) => {
      sheet.getColumn(index + 1).width = column.kind === 'money' ? 19 : Math.max(16, column.label.length + 4);
    });
    for (const values of report.rows) {
      const row = sheet.addRow(values.map((value, index) => {
        const kind = report.columns[index]?.kind;
        if (kind === 'date' && value !== '—') return new Date(`${value}T00:00:00Z`);
        if (kind === 'money' && /^-?\d{1,15}$/.test(String(value))) return Number(value) / 100;
        return kind === 'money' ? formatMoney(value) : value;
      }));
      row.eachCell((cell, index) => {
        if (cell.value instanceof Date) cell.numFmt = 'yyyy-mm-dd';
        if (typeof cell.value === 'number' && report.columns[index - 1]?.kind === 'money') cell.numFmt = '#,##0.00;[Red]-#,##0.00';
      });
    }
    sheet.views = [{ state: 'frozen', ySplit: 4 }];
    await workbook.xlsx.write(response);
    response.end();
    return;
  }

  const doc = new PDFDocument({ size: 'A4', layout: report.columns.length > 6 ? 'landscape' : 'portrait', margin: 35 });
  response.on('close', () => { if (!response.writableFinished) doc.destroy(); });
  doc.on('error', () => response.destroy());
  doc.pipe(response);
  const width = (doc.page.width - 70) / report.columns.length;
  let y = 0;
  const cellOptions = { width: width - 6, height: 36, ellipsis: true };
  const heading = () => {
    doc.font('Helvetica-Bold').fontSize(16).text(report.company, 35, 35);
    doc.fontSize(12).text(report.title);
    doc.font('Helvetica').fontSize(9).text(`${periodLabel(report)}  |  LKR  |  Generated ${report.generatedAt}`);
    y = doc.y + 16;
    doc.font('Helvetica-Bold').fontSize(8);
    report.columns.forEach((column, index) => doc.text(column.label, 35 + index * width, y, cellOptions));
    y += 30;
  };
  heading();
  for (const row of report.rows) {
    if (y > doc.page.height - 75) {
      doc.addPage();
      heading();
    }
    doc.font('Helvetica').fontSize(8);
    row.forEach((value, index) => doc.text(String(report.columns[index]?.kind === 'money' ? formatMoney(value) : value),
      35 + index * width, y, cellOptions));
    y += 39;
  }
  doc.end();
}
