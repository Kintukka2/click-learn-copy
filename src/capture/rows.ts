// Rows of tables and grids: where a clicked element sits (its column), and the same element in every
// other row. Used for steps where the learner picks their own record (Step.learnerChooses), e.g. the
// purchase requisition link in a D365 list page: Assist accepts the same column in any row.
import type { Rect, RowPlace } from "../core/model.js";
import { accessibleName, isVisible, norm, visibleText } from "./dom.js";

const ROW = "tr, [role=row]";
const GRID = "table, [role=grid], [role=treegrid], [role=table]";
const CELL = "td, th, [role=gridcell], [role=cell], [role=rowheader], [role=columnheader]";

/** Path from the row to the element, made of tag:nth-of-type steps ("" when the element is the row). */
function pathFromRow(el: Element, row: Element): string | null {
  const parts: string[] = [];
  for (let n: Element = el; n !== row; ) {
    const parent: Element | null = n.parentElement;
    if (!parent) return null;
    const same = Array.from(parent.children).filter((c) => c.tagName === n.tagName);
    const tag = n.tagName.toLowerCase();
    parts.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(n) + 1})` : tag);
    n = parent;
  }
  return parts.join(" > ");
}

/** Cells of a row, not counting those of nested grids. */
function cellsOf(row: Element): Element[] {
  return Array.from(row.querySelectorAll(CELL)).filter((c) => c.closest(ROW) === row);
}

function rowsOf(grid: Element): Element[] {
  return Array.from(grid.querySelectorAll(ROW)).filter((r) => r.closest(GRID) === grid);
}

function columnHeader(grid: Element, row: Element, cell: Element | null): string | undefined {
  if (!cell) return undefined;
  let header: Element | null = null;
  const colIndex = cell.getAttribute("aria-colindex");
  if (colIndex) header = grid.querySelector(`[role=columnheader][aria-colindex="${colIndex}"]`);
  if (!header) {
    const i = cellsOf(row).indexOf(cell);
    const headRow = rowsOf(grid).find((r) => r !== row && r.querySelector("th, [role=columnheader]"));
    if (i >= 0 && headRow) header = cellsOf(headRow)[i] ?? null;
  }
  const text = header ? norm(accessibleName(header) || visibleText(header)) : "";
  return text && text.length <= 60 ? text : undefined;
}

function union(rects: DOMRect[], view: Rect): Rect | undefined {
  const r = rects.filter((b) => b.width > 0 && b.height > 0);
  if (!r.length) return undefined;
  const x = Math.max(view.x, Math.min(...r.map((b) => b.left)));
  const y = Math.max(view.y, Math.min(...r.map((b) => b.top)));
  const right = Math.min(view.x + view.width, Math.max(...r.map((b) => b.right)));
  const bottom = Math.min(view.y + view.height, Math.max(...r.map((b) => b.bottom)));
  if (right <= x || bottom <= y) return undefined;
  return { x: Math.round(x), y: Math.round(y), width: Math.round(right - x), height: Math.round(bottom - y) };
}

/** Where an element sits in a table/grid row, or undefined when it is not in one. */
export function rowPlaceOf(el: Element, gridPath: (grid: Element) => string): RowPlace | undefined {
  const row = el.closest(ROW);
  const grid = row?.closest(GRID);
  if (!row || !grid) return undefined;
  const inRow = pathFromRow(el, row);
  if (inRow === null) return undefined;
  const place: RowPlace = { grid: gridPath(grid), inRow };
  const column = columnHeader(grid, row, el.closest(CELL));
  if (column) place.column = column;
  const view = { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
  const box = union(sameInRows(grid, inRow).map((e) => e.getBoundingClientRect()), view);
  if (box) place.columnBox = box;
  return place;
}

/** The element at inRow in every row of the grid. */
function sameInRows(grid: Element, inRow: string): Element[] {
  const out: Element[] = [];
  for (const r of rowsOf(grid)) {
    let e: Element | null = r;
    if (inRow) {
      try {
        e = r.querySelector(`:scope > ${inRow}`);
      } catch {
        return [];
      }
    }
    if (e) out.push(e);
  }
  return out;
}

/** Grids the place can refer to: by its CSS path, or else any grid with a column of that header. */
function gridsFor(place: RowPlace, doc: Document): Element[] {
  let byPath: Element[] = [];
  try {
    byPath = Array.from(doc.querySelectorAll(place.grid));
  } catch {
    /* invalid path */
  }
  const visible = byPath.filter(isVisible);
  if (visible.length) return visible;
  if (!place.column) return [];
  const want = norm(place.column).toLowerCase();
  const grids = new Set<Element>();
  for (const h of Array.from(doc.querySelectorAll("th, [role=columnheader]"))) {
    if (norm(accessibleName(h) || visibleText(h)).toLowerCase() !== want) continue;
    const g = h.closest(GRID);
    if (g && isVisible(g)) grids.add(g);
  }
  return [...grids];
}

/** Visible elements at the recorded place in every row, top to bottom (the header row has none). */
export function rowCandidates(place: RowPlace, doc: Document = document): Element[] {
  const out: Element[] = [];
  for (const g of gridsFor(place, doc)) for (const e of sameInRows(g, place.inRow)) if (isVisible(e) && !e.closest("thead, [role=columnheader]")) out.push(e);
  return out;
}
