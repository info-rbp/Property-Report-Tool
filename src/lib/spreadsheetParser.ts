import * as XLSX from 'xlsx';
import { InspectionArea, InspectionItem, TenancyDetails } from '../types/report';

/**
 * Parses raw 2D array of rows from CSV, Excel, or Google Sheets values into structured inspection data
 * Expected columns (flexible matching):
 * Area | Item | Clean | Undamaged | Working | Comments
 */
export function parseSpreadsheetRowsToReportData(
  rows: (string | number | boolean | null | undefined)[][]
): { areas: InspectionArea[]; detailsPatch?: Partial<TenancyDetails> } {
  if (!rows || rows.length < 2) {
    throw new Error('Spreadsheet must have a header row and at least one data row.');
  }

  // Find header row (check first 5 rows)
  let headerRowIndex = 0;
  let colArea = -1;
  let colItem = -1;
  let colClean = -1;
  let colUndamaged = -1;
  let colWorking = -1;
  let colComments = -1;

  for (let r = 0; r < Math.min(rows.length, 5); r++) {
    const row = rows[r].map(c => String(c || '').trim().toLowerCase());
    const areaIdx = row.findIndex(c => c.includes('area') || c.includes('room'));
    const itemIdx = row.findIndex(c => c.includes('item') || c.includes('element') || c.includes('fixture'));
    
    if (areaIdx !== -1 && itemIdx !== -1) {
      headerRowIndex = r;
      colArea = areaIdx;
      colItem = itemIdx;
      colClean = row.findIndex(c => c === 'clean' || c === 'cln' || c.startsWith('clean'));
      colUndamaged = row.findIndex(c => c === 'undamaged' || c === 'udg' || c.startsWith('undam'));
      colWorking = row.findIndex(c => c === 'working' || c === 'wkg' || c.startsWith('work'));
      colComments = row.findIndex(c => c.includes('comment') || c.includes('notes') || c.includes('remark'));
      break;
    }
  }

  // If header not found by standard names, assume default columns: 0=Area, 1=Item, 2=Clean, 3=Undamaged, 4=Working, 5=Comments
  if (colArea === -1 || colItem === -1) {
    headerRowIndex = 0;
    colArea = 0;
    colItem = 1;
    colClean = 2;
    colUndamaged = 3;
    colWorking = 4;
    colComments = 5;
  }

  const areasMap = new Map<string, InspectionArea>();
  let currentAreaName = 'General';

  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;

    const rowAreaRaw = colArea >= 0 && row[colArea] !== undefined ? String(row[colArea]).trim() : '';
    if (rowAreaRaw) {
      currentAreaName = rowAreaRaw;
    }

    const itemName = colItem >= 0 && row[colItem] !== undefined ? String(row[colItem]).trim() : '';
    if (!itemName && !rowAreaRaw) continue; // skip empty rows

    if (!areasMap.has(currentAreaName)) {
      areasMap.set(currentAreaName, {
        id: `area-${areasMap.size + 1}-${currentAreaName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
        name: currentAreaName,
        items: []
      });
    }

    if (!itemName) continue; // Just defining an area header row

    const parseBool = (val: any): boolean | null => {
      if (val === undefined || val === null || val === '') return null;
      const str = String(val).trim().toLowerCase();
      if (['yes', 'y', 'true', '1', '✔', 'x', 'tick'].includes(str)) return true;
      if (['no', 'n', 'false', '0'].includes(str)) return false;
      return null;
    };

    const clean = colClean >= 0 ? parseBool(row[colClean]) : null;
    const undamaged = colUndamaged >= 0 ? parseBool(row[colUndamaged]) : null;
    const working = colWorking >= 0 ? parseBool(row[colWorking]) : null;
    const agentComments = colComments >= 0 && row[colComments] !== undefined ? String(row[colComments]).trim() : '';

    const area = areasMap.get(currentAreaName)!;
    area.items.push({
      id: `item-${area.items.length + 1}-${itemName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
      name: itemName,
      clean,
      undamaged,
      working,
      agentComments,
    });
  }

  return {
    areas: Array.from(areasMap.values())
  };
}

/**
 * Read local Excel/CSV File
 */
export async function parseLocalSpreadsheetFile(file: File): Promise<{ areas: InspectionArea[] }> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
  return parseSpreadsheetRowsToReportData(rawRows);
}

/**
 * Generate a downloadable starter CSV template
 */
export function generateStarterCsv(): string {
  const headers = ['Area', 'Item', 'Clean (Y/N)', 'Undamaged (Y/N)', 'Working (Y/N)', 'Agent Comments'];
  const sampleRows = [
    ['Entry', 'Doors/walls/ceiling', 'Y', 'Y', 'Y', 'Ceiling - great condition. Walls good condition, minor scuffs.'],
    ['Entry', 'Fans/light fittings', 'Y', 'Y', 'Y', '1 x Ceiling/down light-intact and working'],
    ['Entry', 'Floor/floor coverings', 'Y', 'Y', '', 'Dark cream/beige square tiles- great condition.'],
    ['Entry', 'Power points', 'Y', 'Y', '', '1 x power point intact, untested.'],
    ['Lounge Room', 'Doors/walls/ceiling', 'Y', '', '', 'Walls good condition. 1x dirty mark above couch.'],
    ['Lounge Room', 'Windows/screens', 'Y', 'Y', 'Y', 'Windows great condition. Glass sliding doors intact.'],
    ['Lounge Room', 'Blinds/curtains', 'Y', 'Y', 'Y', 'Floor length curtains x3, intact and working.'],
    ['Lounge Room', 'Fans/light fittings', 'Y', '', 'Y', 'Ceiling fan & light intact and working.'],
    ['Lounge Room', 'Floor/floor coverings', 'Y', '', 'Y', 'Grey carpet - 2 small stains near couch.'],
    ['Kitchen / Meals', 'Doors/walls/ceiling', 'Y', 'Y', 'Y', 'Great condition.'],
    ['Kitchen / Meals', 'Cupboards/drawers', 'Y', 'Y', 'Y', 'Clean and working.'],
    ['Kitchen / Meals', 'Stove top', 'Y', '', '', 'Stove top - ok condition, burners have scuff rings.'],
    ['Kitchen / Meals', 'Oven/griller', '', 'Y', '', 'Oven good condition, not completely clean.'],
    ['Kitchen / Meals', 'Dishwasher', 'Y', '', 'Y', '2x broken rack parts.'],
    ['Bedroom 1', 'Doors/walls/ceiling', 'Y', 'Y', 'Y', 'Intact, minor scuff marks on inside of door.'],
    ['Bedroom 1', 'Windows/screens', 'Y', 'Y', 'Y', 'Sliding glass door intact.'],
    ['Bathroom', 'Shower/shower screen', 'Y', 'Y', 'Y', 'Good condition - minor mould on silicone.'],
    ['Bathroom', 'Wash basin/vanity', 'Y', 'Y', 'Y', 'Great condition.'],
    ['Bathroom', 'Toilet', 'Y', 'Y', 'Y', 'Great condition.'],
    ['Laundry', 'Washing machine/dryer', 'Y', 'Y', '', 'Washing machine good, dryer minor marks.'],
    ['General', 'Smoke alarms', 'Y', 'Y', '', 'Smoke alarms and sprinklers untested.'],
    ['General', 'Keys/locks/remotes', 'Y', '', 'Y', 'Front door keys x2, fobs x2, letterbox key x1. TV remote missing cover.']
  ];

  const lines = [headers.join(','), ...sampleRows.map(r => r.map(val => `"${val.replace(/"/g, '""')}"`).join(','))];
  return lines.join('\n');
}

export function downloadStarterCsv() {
  const csv = generateStarterCsv();
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', 'condition_report_template.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
