import {
  alignSelection,
  commitHistory,
  createEditorHistory,
  distributeSelection,
  nudgeSelection,
  redoHistory,
  snapToGrid,
  undoHistory,
} from "./editor-store";
import type { CertificateLayout } from "@/lib/certificates";

const baseLayout: CertificateLayout = {
  layoutSchemaVersion: 2,
  canvas: {
    width: 1600,
    height: 1131,
    unit: "px",
    backgroundColor: "#ffffff",
    gridSize: 8,
    snapEnabled: true,
  },
  elements: [
    {
      id: "a",
      type: "text",
      x: 100,
      y: 100,
      width: 120,
      height: 40,
      content: "A",
      zIndex: 0,
    },
    {
      id: "b",
      type: "text",
      x: 300,
      y: 200,
      width: 120,
      height: 40,
      content: "B",
      zIndex: 1,
    },
    {
      id: "c",
      type: "text",
      x: 620,
      y: 320,
      width: 120,
      height: 40,
      content: "C",
      zIndex: 2,
    },
  ],
  signatureSlots: [],
  metadata: {},
};

describe("certificate studio editor store", () => {
  it("snaps to grid using configured step", () => {
    expect(snapToGrid(17, 8, true)).toBe(16);
    expect(snapToGrid(21, 8, true)).toBe(24);
    expect(snapToGrid(21, 8, false)).toBe(21);
  });

  it("nudges selected elements with grid snapping", () => {
    const next = nudgeSelection(baseLayout, ["a", "b"], 3, 5);
    const a = next.elements.find((element) => element.id === "a");
    const b = next.elements.find((element) => element.id === "b");
    expect(a?.x).toBe(104);
    expect(a?.y).toBe(104);
    expect(b?.x).toBe(304);
    expect(b?.y).toBe(208);
  });

  it("aligns selection to shared edge", () => {
    const next = alignSelection(baseLayout, ["a", "b", "c"], "left");
    expect(next.elements.find((element) => element.id === "a")?.x).toBe(104);
    expect(next.elements.find((element) => element.id === "b")?.x).toBe(104);
    expect(next.elements.find((element) => element.id === "c")?.x).toBe(104);
  });

  it("distributes elements horizontally", () => {
    const next = distributeSelection(baseLayout, ["a", "b", "c"], "horizontal");
    const b = next.elements.find((element) => element.id === "b");
    expect(b?.x).toBe(360);
  });

  it("handles history commit + undo/redo", () => {
    const initial = createEditorHistory(baseLayout);
    const nudged = nudgeSelection(baseLayout, ["a"], 20, 0);
    const committed = commitHistory(initial, nudged);
    expect(committed.past).toHaveLength(1);
    expect(committed.present.elements.find((element) => element.id === "a")?.x).toBe(120);

    const undone = undoHistory(committed);
    expect(undone.present.elements.find((element) => element.id === "a")?.x).toBe(100);

    const redone = redoHistory(undone);
    expect(redone.present.elements.find((element) => element.id === "a")?.x).toBe(120);
  });
});
