import type { CertificateLayout, CertificateTemplateElement } from "@/lib/certificates";

const MAX_HISTORY_ENTRIES = 120;

type ElementPatch = Partial<CertificateTemplateElement>;

export type AlignMode = "left" | "center" | "right" | "top" | "middle" | "bottom";
export type DistributeAxis = "horizontal" | "vertical";

export interface EditorHistoryState {
  past: CertificateLayout[];
  present: CertificateLayout;
  future: CertificateLayout[];
}

function cloneLayout(layout: CertificateLayout): CertificateLayout {
  return JSON.parse(JSON.stringify(layout)) as CertificateLayout;
}

function normalizeLayout(layout: CertificateLayout): CertificateLayout {
  return {
    ...layout,
    layoutSchemaVersion: 2,
    canvas: {
      ...layout.canvas,
      unit: "px",
      gridSize: Math.max(4, Math.round(layout.canvas.gridSize ?? 8)),
      snapEnabled: layout.canvas.snapEnabled ?? true,
    },
    elements: withNormalizedLayers(layout.elements),
    signatureSlots: [...layout.signatureSlots],
    metadata: layout.metadata ?? {},
  };
}

function layoutHash(layout: CertificateLayout): string {
  return JSON.stringify(layout);
}

function withNormalizedLayers(elements: CertificateTemplateElement[]): CertificateTemplateElement[] {
  const sorted = [...elements].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  return sorted.map((element, index) => ({ ...element, zIndex: index }));
}

function withElements(
  layout: CertificateLayout,
  updater: (elements: CertificateTemplateElement[]) => CertificateTemplateElement[],
): CertificateLayout {
  return normalizeLayout({
    ...layout,
    elements: updater(layout.elements),
  });
}

function updateElementById(
  elements: CertificateTemplateElement[],
  elementId: string,
  updater: (element: CertificateTemplateElement) => CertificateTemplateElement,
): CertificateTemplateElement[] {
  return elements.map((element) => {
    if (element.id !== elementId) return element;
    return updater(element);
  });
}

function selectedSet(selection: string[]): Set<string> {
  return new Set(selection.filter((value) => value.trim().length > 0));
}

function ensureUniqueId(layout: CertificateLayout, baseId: string): string {
  const ids = new Set(layout.elements.map((element) => element.id));
  if (!ids.has(baseId)) return baseId;
  let index = 2;
  let candidate = `${baseId}_${index}`;
  while (ids.has(candidate)) {
    index += 1;
    candidate = `${baseId}_${index}`;
  }
  return candidate;
}

function getSelectionBounds(layout: CertificateLayout, selection: string[]) {
  const selected = layout.elements.filter((element) => selection.includes(element.id));
  if (selected.length === 0) return null;

  const left = Math.min(...selected.map((element) => element.x));
  const top = Math.min(...selected.map((element) => element.y));
  const right = Math.max(...selected.map((element) => element.x + element.width));
  const bottom = Math.max(...selected.map((element) => element.y + element.height));

  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

export function createEditorHistory(initial: CertificateLayout): EditorHistoryState {
  return {
    past: [],
    present: normalizeLayout(cloneLayout(initial)),
    future: [],
  };
}

export function replaceHistoryPresent(
  history: EditorHistoryState,
  nextLayout: CertificateLayout,
): EditorHistoryState {
  return {
    ...history,
    present: normalizeLayout(cloneLayout(nextLayout)),
  };
}

export function commitHistory(
  history: EditorHistoryState,
  nextLayout: CertificateLayout,
): EditorHistoryState {
  const normalizedNext = normalizeLayout(cloneLayout(nextLayout));
  if (layoutHash(normalizedNext) === layoutHash(history.present)) {
    return history;
  }

  const nextPast = [...history.past, cloneLayout(history.present)];
  return {
    past: nextPast.slice(Math.max(0, nextPast.length - MAX_HISTORY_ENTRIES)),
    present: normalizedNext,
    future: [],
  };
}

export function undoHistory(history: EditorHistoryState): EditorHistoryState {
  if (history.past.length === 0) return history;
  const previous = history.past[history.past.length - 1];
  return {
    past: history.past.slice(0, -1),
    present: cloneLayout(previous),
    future: [cloneLayout(history.present), ...history.future],
  };
}

export function redoHistory(history: EditorHistoryState): EditorHistoryState {
  if (history.future.length === 0) return history;
  const [next, ...rest] = history.future;
  return {
    past: [...history.past, cloneLayout(history.present)].slice(-MAX_HISTORY_ENTRIES),
    present: cloneLayout(next),
    future: rest,
  };
}

export function snapToGrid(value: number, gridSize: number, enabled: boolean): number {
  if (!enabled) return value;
  const safeGrid = Math.max(1, Math.round(gridSize || 1));
  return Math.round(value / safeGrid) * safeGrid;
}

export function nudgeSelection(
  layout: CertificateLayout,
  selection: string[],
  deltaX: number,
  deltaY: number,
): CertificateLayout {
  const selected = selectedSet(selection);
  if (selected.size === 0) return layout;
  const gridSize = layout.canvas.gridSize ?? 8;
  const snapEnabled = layout.canvas.snapEnabled ?? true;

  return withElements(layout, (elements) =>
    elements.map((element) => {
      if (!selected.has(element.id)) return element;
      const x = snapToGrid(element.x + deltaX, gridSize, snapEnabled);
      const y = snapToGrid(element.y + deltaY, gridSize, snapEnabled);
      return { ...element, x, y };
    }),
  );
}

export function deleteSelection(layout: CertificateLayout, selection: string[]): CertificateLayout {
  const selected = selectedSet(selection);
  if (selected.size === 0) return layout;

  const remainingSlots = new Set(layout.signatureSlots.map((slot) => slot.key));
  const nextElements = layout.elements.filter((element) => !selected.has(element.id));
  const nextSlots = layout.signatureSlots.filter((slot) => remainingSlots.has(slot.key));

  return normalizeLayout({
    ...layout,
    elements: nextElements,
    signatureSlots: nextSlots,
  });
}

export function duplicateSelection(layout: CertificateLayout, selection: string[]): {
  layout: CertificateLayout;
  newSelection: string[];
} {
  const selected = layout.elements
    .filter((element) => selection.includes(element.id))
    .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

  if (selected.length === 0) {
    return { layout, newSelection: [] };
  }

  const maxLayer = Math.max(0, ...layout.elements.map((element) => element.zIndex ?? 0));
  const duplicates = selected.map((element, index) => {
    const newId = ensureUniqueId(layout, `${element.id}_copy`);
    return {
      ...cloneLayout({
        ...layout,
        elements: [element],
      }).elements[0],
      id: newId,
      x: element.x + 24,
      y: element.y + 24,
      zIndex: maxLayer + index + 1,
    } as CertificateTemplateElement;
  });

  const nextLayout = normalizeLayout({
    ...layout,
    elements: [...layout.elements, ...duplicates],
  });

  return { layout: nextLayout, newSelection: duplicates.map((item) => item.id) };
}

export function applyElementPatches(
  layout: CertificateLayout,
  patches: Array<{ id: string; patch: ElementPatch }>,
): CertificateLayout {
  if (patches.length === 0) return layout;
  const patchById = new Map(patches.map((item) => [item.id, item.patch]));

  return withElements(layout, (elements) =>
    elements.map((element) => {
      const patch = patchById.get(element.id);
      if (!patch) return element;
      return {
        ...element,
        ...patch,
      } as CertificateTemplateElement;
    }),
  );
}

export function reorderSelection(
  layout: CertificateLayout,
  selection: string[],
  mode: "forward" | "backward" | "front" | "back",
): CertificateLayout {
  const selected = selectedSet(selection);
  if (selected.size === 0) return layout;

  const ordered = [...layout.elements].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

  if (mode === "front") {
    const move = ordered.filter((element) => selected.has(element.id));
    const stay = ordered.filter((element) => !selected.has(element.id));
    return withElements(layout, () => [...stay, ...move]);
  }

  if (mode === "back") {
    const move = ordered.filter((element) => selected.has(element.id));
    const stay = ordered.filter((element) => !selected.has(element.id));
    return withElements(layout, () => [...move, ...stay]);
  }

  const mutable = [...ordered];
  if (mode === "forward") {
    for (let index = mutable.length - 2; index >= 0; index -= 1) {
      if (!selected.has(mutable[index].id)) continue;
      if (selected.has(mutable[index + 1].id)) continue;
      [mutable[index], mutable[index + 1]] = [mutable[index + 1], mutable[index]];
    }
  } else {
    for (let index = 1; index < mutable.length; index += 1) {
      if (!selected.has(mutable[index].id)) continue;
      if (selected.has(mutable[index - 1].id)) continue;
      [mutable[index], mutable[index - 1]] = [mutable[index - 1], mutable[index]];
    }
  }

  return withElements(layout, () => mutable);
}

export function alignSelection(
  layout: CertificateLayout,
  selection: string[],
  mode: AlignMode,
): CertificateLayout {
  const selected = selectedSet(selection);
  if (selected.size < 2) return layout;

  const bounds = getSelectionBounds(layout, selection);
  if (!bounds) return layout;

  const gridSize = layout.canvas.gridSize ?? 8;
  const snapEnabled = layout.canvas.snapEnabled ?? true;

  return withElements(layout, (elements) =>
    elements.map((element) => {
      if (!selected.has(element.id)) return element;

      if (mode === "left") {
        return { ...element, x: snapToGrid(bounds.left, gridSize, snapEnabled) };
      }
      if (mode === "center") {
        const x = bounds.left + (bounds.width - element.width) / 2;
        return { ...element, x: snapToGrid(x, gridSize, snapEnabled) };
      }
      if (mode === "right") {
        const x = bounds.right - element.width;
        return { ...element, x: snapToGrid(x, gridSize, snapEnabled) };
      }
      if (mode === "top") {
        return { ...element, y: snapToGrid(bounds.top, gridSize, snapEnabled) };
      }
      if (mode === "middle") {
        const y = bounds.top + (bounds.height - element.height) / 2;
        return { ...element, y: snapToGrid(y, gridSize, snapEnabled) };
      }
      const y = bounds.bottom - element.height;
      return { ...element, y: snapToGrid(y, gridSize, snapEnabled) };
    }),
  );
}

export function distributeSelection(
  layout: CertificateLayout,
  selection: string[],
  axis: DistributeAxis,
): CertificateLayout {
  const selectedElements = layout.elements
    .filter((element) => selection.includes(element.id))
    .sort((a, b) => {
      if (axis === "horizontal") return a.x - b.x;
      return a.y - b.y;
    });

  if (selectedElements.length < 3) return layout;

  const first = selectedElements[0];
  const last = selectedElements[selectedElements.length - 1];
  const middle = selectedElements.slice(1, -1);
  const gridSize = layout.canvas.gridSize ?? 8;
  const snapEnabled = layout.canvas.snapEnabled ?? true;

  if (axis === "horizontal") {
    const span = last.x - (first.x + first.width);
    const totalMiddleWidth = middle.reduce((sum, element) => sum + element.width, 0);
    const gap = (span - totalMiddleWidth) / (middle.length + 1);
    let cursor = first.x + first.width + gap;

    const patches = middle.map((element) => {
      const x = snapToGrid(cursor, gridSize, snapEnabled);
      cursor += element.width + gap;
      return { id: element.id, patch: { x } };
    });

    return applyElementPatches(layout, patches);
  }

  const span = last.y - (first.y + first.height);
  const totalMiddleHeight = middle.reduce((sum, element) => sum + element.height, 0);
  const gap = (span - totalMiddleHeight) / (middle.length + 1);
  let cursor = first.y + first.height + gap;

  const patches = middle.map((element) => {
    const y = snapToGrid(cursor, gridSize, snapEnabled);
    cursor += element.height + gap;
    return { id: element.id, patch: { y } };
  });

  return applyElementPatches(layout, patches);
}

export function addElement(
  layout: CertificateLayout,
  element: CertificateTemplateElement,
): CertificateLayout {
  const maxLayer = Math.max(0, ...layout.elements.map((item) => item.zIndex ?? 0));
  return normalizeLayout({
    ...layout,
    elements: [...layout.elements, { ...element, zIndex: maxLayer + 1 }],
  });
}

export function updateElement(
  layout: CertificateLayout,
  elementId: string,
  updater: (element: CertificateTemplateElement) => CertificateTemplateElement,
): CertificateLayout {
  return withElements(layout, (elements) => updateElementById(elements, elementId, updater));
}

export function updateLayoutCanvas(
  layout: CertificateLayout,
  patch: Partial<CertificateLayout["canvas"]>,
): CertificateLayout {
  return normalizeLayout({
    ...layout,
    canvas: {
      ...layout.canvas,
      ...patch,
    },
  });
}

export function updateSignatureSlot(
  layout: CertificateLayout,
  slotKey: string,
  updater: (slot: CertificateLayout["signatureSlots"][number]) => CertificateLayout["signatureSlots"][number],
): CertificateLayout {
  return normalizeLayout({
    ...layout,
    signatureSlots: layout.signatureSlots.map((slot) => {
      if (slot.key !== slotKey) return slot;
      return updater(slot);
    }),
  });
}

export function addSignatureSlot(
  layout: CertificateLayout,
  slot: CertificateLayout["signatureSlots"][number],
): CertificateLayout {
  const hasSlot = layout.signatureSlots.some((item) => item.key === slot.key);
  if (hasSlot) return layout;
  return normalizeLayout({
    ...layout,
    signatureSlots: [...layout.signatureSlots, slot],
  });
}

export function removeSignatureSlot(layout: CertificateLayout, slotKey: string): CertificateLayout {
  const nextSlots = layout.signatureSlots.filter((slot) => slot.key !== slotKey);
  const nextElements = layout.elements.filter((element) => {
    if (element.type !== "signature") return true;
    return element.signatureSlotKey !== slotKey;
  });

  return normalizeLayout({
    ...layout,
    signatureSlots: nextSlots,
    elements: nextElements,
  });
}
