import type { InspectionArea, InspectionItem } from '../types/report';

export interface CsvMergeResult {
  areas: InspectionArea[];
  updatedItems: number;
  addedItems: number;
  addedAreas: number;
}

function key(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function uniqueArea(areas: InspectionArea[], name: string): InspectionArea | undefined {
  const matches = areas.filter((area) => key(area.name) === key(name));
  if (matches.length > 1) {
    throw new Error(`Multiple existing areas match "${name}". Rename them uniquely before importing.`);
  }
  return matches[0];
}

function uniqueItem(area: InspectionArea, name: string): InspectionItem | undefined {
  const matches = area.items.filter((item) => key(item.name) === key(name));
  if (matches.length > 1) {
    throw new Error(`Multiple items named "${name}" in "${area.name}". Import cannot safely identify the target.`);
  }
  return matches[0];
}

/**
 * CSV is a commentary patch, not a report-template replacement. Match uniquely by
 * area + item name and preserve all existing area/item IDs, extra item fields and
 * ordering. Blank CSV fields never erase existing observations or condition flags.
 * New rows are appended without disturbing existing photo item references.
 */
export function mergeCsvCommentary(
  existing: InspectionArea[],
  imported: InspectionArea[],
): CsvMergeResult {
  const areas = existing.map((area) => ({
    ...area,
    items: area.items.map((item) => ({ ...item })),
  }));
  let updatedItems = 0;
  let addedItems = 0;
  let addedAreas = 0;
  const seenAreas = new Set<string>();

  for (const incomingArea of imported) {
    const areaKey = key(incomingArea.name);
    if (!areaKey) throw new Error('CSV area names cannot be empty.');
    if (seenAreas.has(areaKey)) {
      throw new Error(`CSV contains duplicate area "${incomingArea.name}" with inconsistent naming.`);
    }
    seenAreas.add(areaKey);
    const previous = uniqueArea(areas, incomingArea.name);
    const target: InspectionArea = previous || {
      ...incomingArea, items: [],
    };
    if (!previous) {
      areas.push(target);
      addedAreas += 1;
    }
    const seenItems = new Set<string>();
    for (const incoming of incomingArea.items) {
      const itemKey = key(incoming.name);
      if (!itemKey) continue;
      if (seenItems.has(itemKey)) {
        throw new Error(`CSV contains duplicate "${incoming.name}" rows in "${incomingArea.name}".`);
      }
      seenItems.add(itemKey);
      const old = uniqueItem(target, incoming.name);
      if (!old) {
        target.items.push({ ...incoming });
        addedItems += 1;
        continue;
      }
      const commentary = incoming.agentComments.trim();
      const next: InspectionItem = {
        ...old,
        ...(commentary ? { agentComments: commentary } : {}),
        ...(incoming.clean != null ? { clean: incoming.clean } : {}),
        ...(incoming.undamaged != null ? { undamaged: incoming.undamaged } : {}),
        ...(incoming.working != null ? { working: incoming.working } : {}),
      };
      if (JSON.stringify(next) !== JSON.stringify(old)) {
        const index = target.items.findIndex((item) => item.id === old.id);
        target.items[index] = next;
        updatedItems += 1;
      }
    }
  }
  return { areas, updatedItems, addedItems, addedAreas };
}
