import { Capacitor } from '@capacitor/core';

const FORMULA = /^[=+\-@\t\r]/;

/** RFC 4180 CSV; cells that spreadsheet apps would run as formulas are prefixed with '. */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    let s = v == null ? '' : String(v);
    if (typeof v === 'string' && FORMULA.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map(r => r.map(cell).join(',')).join('\r\n');
}

/** Downloads on the web; on the phone writes to cache and opens the share sheet (save to Files, Drive, email…). */
export async function exportCsv(fileName: string, csv: string): Promise<void> {
  const safeName = fileName.replace(/[^\w.-]+/g, '_').slice(0, 80) || 'export.csv';
  const content = `\uFEFF${csv}`; // BOM so Excel reads UTF-8 names correctly
  if (Capacitor.isNativePlatform()) {
    const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
    const file = await Filesystem.writeFile({ path: safeName, data: content, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: safeName, files: [file.uri], dialogTitle: 'Save participant list' });
    return;
  }
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = safeName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
