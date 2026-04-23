import { useEffect, useMemo, useRef, useState } from "react";
import Konva from "konva";
import { Group, Layer, Line, Rect, Stage, Text, Transformer, Image as KonvaImage } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type {
  CertificateAsset,
  CertificateLayout,
  CertificateTemplateElement,
} from "@/lib/certificates";
import type { PreviewData } from "./utils";
import { resolveAssetUrl } from "./utils";

interface CanvasPatch {
  id: string;
  patch: Partial<CertificateTemplateElement>;
}

interface SnapGuides {
  vertical: number[];
  horizontal: number[];
}

interface DragState {
  draggedId: string;
  initial: Map<string, { x: number; y: number }>;
}

interface LassoRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface EditorCanvasProps {
  canManage: boolean;
  layout: CertificateLayout;
  assets: CertificateAsset[];
  previewData: PreviewData;
  selectedIds: string[];
  zoomPercent: number;
  sessionKey: string | null;
  fitRequestId: number;
  onSelectionChange: (ids: string[]) => void;
  onCommitPatches: (patches: CanvasPatch[]) => void;
  onFitCalculated: (zoomPercent: number) => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function intersects(a: LassoRect, b: LassoRect): boolean {
  return !(a.x + a.width < b.x || b.x + b.width < a.x || a.y + a.height < b.y || b.y + b.height < a.y);
}

function normalizeRect(startX: number, startY: number, endX: number, endY: number): LassoRect {
  return {
    x: Math.min(startX, endX),
    y: Math.min(startY, endY),
    width: Math.abs(endX - startX),
    height: Math.abs(endY - startY),
  };
}

function getTokenValue(element: CertificateTemplateElement, previewData: PreviewData): string {
  if (element.type === "text") return element.content;
  if (element.type === "dynamic_text") {
    const token = element.token.trim();
    if (!token) return "";
    return previewData[token] ?? `{{${token}}}`;
  }
  if (element.type === "qr") {
    const token = (element.token ?? "").trim();
    if (!token) return previewData.qrVerificationUrl ?? "QR";
    return previewData[token] ?? `{{${token}}}`;
  }
  return "";
}

function buildUploadedFontFamilyName(storageKey: string): string {
  let hash = 2166136261;
  for (let index = 0; index < storageKey.length; index += 1) {
    hash ^= storageKey.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const hex = (hash >>> 0).toString(16).padStart(8, "0");
  return `CertificateUploadedFont_${hex}`;
}

function getSnapResult(
  layout: CertificateLayout,
  movingElement: CertificateTemplateElement,
  candidateX: number,
  candidateY: number,
  selectedIds: string[],
): { x: number; y: number; guides: SnapGuides } {
  const gridSize = Math.max(1, Math.round(layout.canvas.gridSize ?? 8));
  const snapEnabled = layout.canvas.snapEnabled ?? true;
  if (!snapEnabled) {
    return { x: candidateX, y: candidateY, guides: { vertical: [], horizontal: [] } };
  }

  const threshold = 5;
  let x = Math.round(candidateX / gridSize) * gridSize;
  let y = Math.round(candidateY / gridSize) * gridSize;
  const guides: SnapGuides = { vertical: [], horizontal: [] };
  const selected = new Set(selectedIds);

  const movingEdgesX = [x, x + movingElement.width / 2, x + movingElement.width];
  const movingEdgesY = [y, y + movingElement.height / 2, y + movingElement.height];

  let bestXDelta = threshold + 1;
  let bestXTarget: number | null = null;
  let bestXSourceIndex = 0;
  let bestYDelta = threshold + 1;
  let bestYTarget: number | null = null;
  let bestYSourceIndex = 0;

  for (const element of layout.elements) {
    if (selected.has(element.id) || element.id === movingElement.id) continue;

    const targetEdgesX = [element.x, element.x + element.width / 2, element.x + element.width];
    const targetEdgesY = [element.y, element.y + element.height / 2, element.y + element.height];

    for (let index = 0; index < movingEdgesX.length; index += 1) {
      for (const target of targetEdgesX) {
        const delta = Math.abs(movingEdgesX[index] - target);
        if (delta < bestXDelta && delta <= threshold) {
          bestXDelta = delta;
          bestXTarget = target;
          bestXSourceIndex = index;
        }
      }
    }

    for (let index = 0; index < movingEdgesY.length; index += 1) {
      for (const target of targetEdgesY) {
        const delta = Math.abs(movingEdgesY[index] - target);
        if (delta < bestYDelta && delta <= threshold) {
          bestYDelta = delta;
          bestYTarget = target;
          bestYSourceIndex = index;
        }
      }
    }
  }

  if (bestXTarget !== null) {
    if (bestXSourceIndex === 0) x = bestXTarget;
    if (bestXSourceIndex === 1) x = bestXTarget - movingElement.width / 2;
    if (bestXSourceIndex === 2) x = bestXTarget - movingElement.width;
    guides.vertical.push(bestXTarget);
  }

  if (bestYTarget !== null) {
    if (bestYSourceIndex === 0) y = bestYTarget;
    if (bestYSourceIndex === 1) y = bestYTarget - movingElement.height / 2;
    if (bestYSourceIndex === 2) y = bestYTarget - movingElement.height;
    guides.horizontal.push(bestYTarget);
  }

  x = clamp(x, 0, Math.max(0, layout.canvas.width - movingElement.width));
  y = clamp(y, 0, Math.max(0, layout.canvas.height - movingElement.height));

  return { x, y, guides };
}

function drawGrid(layout: CertificateLayout): Array<{ points: number[]; key: string }> {
  const step = Math.max(4, Math.round(layout.canvas.gridSize ?? 8));
  const lines: Array<{ points: number[]; key: string }> = [];

  for (let x = 0; x <= layout.canvas.width; x += step) {
    lines.push({ key: `vx-${x}`, points: [x, 0, x, layout.canvas.height] });
  }
  for (let y = 0; y <= layout.canvas.height; y += step) {
    lines.push({ key: `hy-${y}`, points: [0, y, layout.canvas.width, y] });
  }

  return lines;
}

export function EditorCanvas(props: EditorCanvasProps) {
  const {
    canManage,
    layout,
    assets,
    previewData,
    selectedIds,
    zoomPercent,
    sessionKey,
    fitRequestId,
    onSelectionChange,
    onCommitPatches,
    onFitCalculated,
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const nodeRefs = useRef<Map<string, Konva.Group>>(new Map());
  const dragStateRef = useRef<DragState | null>(null);
  const lassoStartRef = useRef<{ x: number; y: number } | null>(null);

  const [imageMap, setImageMap] = useState<Record<string, HTMLImageElement>>({});
  const [fontFamilyByAssetKey, setFontFamilyByAssetKey] = useState<Record<string, string>>({});
  const [lassoRect, setLassoRect] = useState<LassoRect | null>(null);
  const [snapGuides, setSnapGuides] = useState<SnapGuides>({ vertical: [], horizontal: [] });

  const zoom = clamp(zoomPercent / 100, 0.2, 2);

  const elementById = useMemo(() => {
    return new Map(layout.elements.map((element) => [element.id, element]));
  }, [layout.elements]);

  const sortedElements = useMemo(() => {
    return [...layout.elements].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  }, [layout.elements]);

  const gridLines = useMemo(() => drawGrid(layout), [layout]);

  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;

    const nodes = selectedIds
      .map((id) => nodeRefs.current.get(id))
      .filter((node): node is Konva.Group => Boolean(node));

    transformer.nodes(nodes);
    transformer.getLayer()?.batchDraw();
  }, [selectedIds, sortedElements]);

  useEffect(() => {
    const urls = new Set<string>();

    if (layout.canvas.backgroundAssetKey) {
      urls.add(resolveAssetUrl(layout.canvas.backgroundAssetKey));
    }

    for (const element of layout.elements) {
      if (element.type === "image" && element.assetKey) {
        urls.add(resolveAssetUrl(element.assetKey));
      }
      if (element.type === "signature") {
        const slot = layout.signatureSlots.find((item) => item.key === element.signatureSlotKey);
        if (slot?.assetKey) {
          urls.add(resolveAssetUrl(slot.assetKey));
        }
      }
    }

    let cancelled = false;
    const missing = Array.from(urls).filter((url) => url && !imageMap[url]);
    if (missing.length === 0) return;

    Promise.all(
      missing.map(
        (url) =>
          new Promise<{ url: string; image: HTMLImageElement | null }>((resolve) => {
            const image = new window.Image();
            image.crossOrigin = "anonymous";
            image.onload = () => resolve({ url, image });
            image.onerror = () => resolve({ url, image: null });
            image.src = url;
          }),
      ),
    ).then((rows) => {
      if (cancelled) return;
      setImageMap((previous) => {
        const next = { ...previous };
        for (const row of rows) {
          if (row.image) next[row.url] = row.image;
        }
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [imageMap, layout.canvas.backgroundAssetKey, layout.elements, layout.signatureSlots]);

  useEffect(() => {
    const availableFontKeys = new Set(
      assets
        .filter((asset) => asset.kind === "font")
        .map((asset) => asset.storageKey.trim())
        .filter((value) => value.length > 0),
    );

    const pendingKeys = new Set<string>();
    for (const element of layout.elements) {
      if (element.type !== "text" && element.type !== "dynamic_text") {
        continue;
      }
      const style = (element.style ?? {}) as Record<string, unknown>;
      const fontAssetKey = String(style.fontAssetKey ?? "").trim();
      if (!fontAssetKey) {
        continue;
      }
      if (availableFontKeys.size > 0 && !availableFontKeys.has(fontAssetKey)) {
        continue;
      }
      if (!fontFamilyByAssetKey[fontAssetKey]) {
        pendingKeys.add(fontAssetKey);
      }
    }

    if (pendingKeys.size === 0) {
      return;
    }

    let cancelled = false;

    Promise.all(
      Array.from(pendingKeys).map(async (fontAssetKey) => {
        const familyName = buildUploadedFontFamilyName(fontAssetKey);
        if (document.fonts.check(`12px "${familyName}"`)) {
          return { fontAssetKey, familyName, loaded: true };
        }

        try {
          const fontFace = new FontFace(
            familyName,
            `url(${resolveAssetUrl(fontAssetKey)})`,
          );
          await fontFace.load();
          document.fonts.add(fontFace);
          return { fontAssetKey, familyName, loaded: true };
        } catch {
          return { fontAssetKey, familyName, loaded: false };
        }
      }),
    ).then((rows) => {
      if (cancelled) return;
      setFontFamilyByAssetKey((previous) => {
        const next = { ...previous };
        for (const row of rows) {
          if (!row.loaded) continue;
          next[row.fontAssetKey] = row.familyName;
        }
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [assets, fontFamilyByAssetKey, layout.elements]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !sessionKey) return;

    const raw = window.localStorage.getItem(`cert-studio-viewport:${sessionKey}`);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as { left?: number; top?: number };
      container.scrollLeft = Number(parsed.left ?? 0);
      container.scrollTop = Number(parsed.top ?? 0);
    } catch {
      // Ignore malformed cache
    }
  }, [sessionKey]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !sessionKey) return;

    const save = () => {
      window.localStorage.setItem(
        `cert-studio-viewport:${sessionKey}`,
        JSON.stringify({ left: container.scrollLeft, top: container.scrollTop }),
      );
    };

    container.addEventListener("scroll", save);
    return () => container.removeEventListener("scroll", save);
  }, [sessionKey]);

  useEffect(() => {
    if (!fitRequestId) return;
    const container = containerRef.current;
    if (!container) return;

    const width = Math.max(container.clientWidth - 48, 120);
    const height = Math.max(container.clientHeight - 48, 120);
    const fitScale = Math.min(width / layout.canvas.width, height / layout.canvas.height);
    const fitPercent = clamp(Math.round(fitScale * 100), 25, 200);
    onFitCalculated(fitPercent);

    container.scrollLeft = 0;
    container.scrollTop = 0;
  }, [fitRequestId, layout.canvas.height, layout.canvas.width, onFitCalculated]);

  const handleStageMouseDown = (event: KonvaEventObject<MouseEvent>) => {
    const clickedOnEmpty = event.target === event.target.getStage() || event.target.name() === "canvas-background";
    if (!clickedOnEmpty) return;

    const stage = stageRef.current;
    if (!stage) return;

    const point = stage.getPointerPosition();
    if (!point) return;

    lassoStartRef.current = point;
    setLassoRect({ x: point.x, y: point.y, width: 0, height: 0 });
    onSelectionChange([]);
  };

  const handleStageMouseMove = () => {
    if (!lassoStartRef.current) return;
    const stage = stageRef.current;
    if (!stage) return;

    const point = stage.getPointerPosition();
    if (!point) return;

    setLassoRect(normalizeRect(lassoStartRef.current.x, lassoStartRef.current.y, point.x, point.y));
  };

  const handleStageMouseUp = () => {
    const lasso = lassoRect;
    lassoStartRef.current = null;

    if (!lasso || lasso.width < 4 || lasso.height < 4) {
      setLassoRect(null);
      return;
    }

    const selected = layout.elements
      .filter((element) =>
        intersects(lasso, {
          x: element.x,
          y: element.y,
          width: element.width,
          height: element.height,
        }),
      )
      .map((element) => element.id);

    onSelectionChange(selected);
    setLassoRect(null);
  };

  const handleElementPointerDown = (
    elementId: string,
    event: KonvaEventObject<MouseEvent>,
  ) => {
    event.cancelBubble = true;
    const withShift = event.evt.shiftKey;

    if (withShift) {
      const current = new Set(selectedIds);
      if (current.has(elementId)) current.delete(elementId);
      else current.add(elementId);
      onSelectionChange(Array.from(current));
      return;
    }

    if (!selectedIds.includes(elementId)) {
      onSelectionChange([elementId]);
    }
  };

  const handleDragStart = (elementId: string) => {
    const selected = selectedIds.includes(elementId) ? selectedIds : [elementId];
    const initial = new Map<string, { x: number; y: number }>();
    for (const id of selected) {
      const node = nodeRefs.current.get(id);
      if (!node) continue;
      initial.set(id, { x: node.x(), y: node.y() });
    }
    dragStateRef.current = { draggedId: elementId, initial };
  };

  const handleDragMove = (elementId: string) => {
    const dragState = dragStateRef.current;
    const draggedNode = nodeRefs.current.get(elementId);
    const movingElement = elementById.get(elementId);
    if (!dragState || !draggedNode || !movingElement) return;

    const origin = dragState.initial.get(elementId);
    if (!origin) return;

    const snap = getSnapResult(layout, movingElement, draggedNode.x(), draggedNode.y(), selectedIds);
    draggedNode.position({ x: snap.x, y: snap.y });
    setSnapGuides(snap.guides);

    const deltaX = snap.x - origin.x;
    const deltaY = snap.y - origin.y;
    for (const [id, point] of dragState.initial.entries()) {
      if (id === elementId) continue;
      const node = nodeRefs.current.get(id);
      const element = elementById.get(id);
      if (!node || !element) continue;
      const nextX = point.x + deltaX;
      const nextY = point.y + deltaY;
      node.position({ x: nextX, y: nextY });
    }
  };

  const handleDragEnd = (elementId: string) => {
    const dragState = dragStateRef.current;
    dragStateRef.current = null;
    setSnapGuides({ vertical: [], horizontal: [] });

    const activeIds = dragState ? Array.from(dragState.initial.keys()) : [elementId];
    const patches: CanvasPatch[] = [];

    for (const id of activeIds) {
      const node = nodeRefs.current.get(id);
      if (!node) continue;
      patches.push({
        id,
        patch: {
          x: node.x(),
          y: node.y(),
        },
      });
    }

    if (patches.length > 0) {
      onCommitPatches(patches);
    }
  };

  const handleTransformEnd = () => {
    const patches: CanvasPatch[] = [];

    for (const id of selectedIds) {
      const node = nodeRefs.current.get(id);
      const element = elementById.get(id);
      if (!node || !element) continue;

      const scaleX = node.scaleX();
      const scaleY = node.scaleY();
      const width = Math.max(8, element.width * scaleX);
      const height = Math.max(8, element.height * scaleY);

      patches.push({
        id,
        patch: {
          x: node.x(),
          y: node.y(),
          width,
          height,
          rotation: node.rotation(),
        },
      });

      node.scaleX(1);
      node.scaleY(1);
    }

    if (patches.length > 0) {
      onCommitPatches(patches);
    }
  };

  const backgroundImage = layout.canvas.backgroundAssetKey
    ? imageMap[resolveAssetUrl(layout.canvas.backgroundAssetKey)]
    : undefined;

  return (
    <div
      ref={containerRef}
      className="relative h-[74vh] overflow-auto rounded-xl border bg-muted/20"
      style={{ minHeight: 420 }}
    >
      <div
        style={{
          width: layout.canvas.width * zoom + 40,
          height: layout.canvas.height * zoom + 40,
          padding: 20,
        }}
      >
        <div
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: "top left",
            width: layout.canvas.width,
            height: layout.canvas.height,
            boxShadow: "0 8px 28px rgba(15, 23, 42, 0.16)",
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          <Stage
            ref={(node) => {
              stageRef.current = node;
            }}
            width={layout.canvas.width}
            height={layout.canvas.height}
            onMouseDown={handleStageMouseDown}
            onMouseMove={handleStageMouseMove}
            onMouseUp={handleStageMouseUp}
          >
            <Layer listening={false}>
              <Rect
                name="canvas-background"
                x={0}
                y={0}
                width={layout.canvas.width}
                height={layout.canvas.height}
                fill={layout.canvas.backgroundColor ?? "#ffffff"}
              />
              {backgroundImage ? (
                <KonvaImage
                  image={backgroundImage}
                  x={0}
                  y={0}
                  width={layout.canvas.width}
                  height={layout.canvas.height}
                />
              ) : null}

              {(layout.canvas.snapEnabled ?? true) &&
                gridLines.map((line) => (
                  <Line
                    key={line.key}
                    points={line.points}
                    stroke="#e5e7eb"
                    strokeWidth={0.5}
                    opacity={0.45}
                  />
                ))}
            </Layer>

            <Layer>
              {sortedElements.map((element) => {
                const isSelected = selectedIds.includes(element.id);
                const style = (element.style ?? {}) as Record<string, unknown>;
                const textAlign = (style.textAlign as "left" | "center" | "right" | undefined) ?? "left";
                const fontSize = Number(style.fontSize ?? 32);
                const fontWeight = Number(style.fontWeight ?? 500);
                const color = String(style.color ?? "#0f172a");
                const fontAssetKey = String(style.fontAssetKey ?? "").trim();
                const uploadedFontFamily = fontAssetKey ? fontFamilyByAssetKey[fontAssetKey] : undefined;
                const textFontFamily = uploadedFontFamily
                  ? `${uploadedFontFamily}, ${String(style.fontFamily ?? "Geist")}`
                  : String(style.fontFamily ?? "Geist");

                let imageSource: HTMLImageElement | undefined;
                if (element.type === "image" && element.assetKey) {
                  imageSource = imageMap[resolveAssetUrl(element.assetKey)];
                }
                if (element.type === "signature") {
                  const slot = layout.signatureSlots.find((item) => item.key === element.signatureSlotKey);
                  if (slot?.assetKey) {
                    imageSource = imageMap[resolveAssetUrl(slot.assetKey)];
                  }
                }

                const label = getTokenValue(element, previewData);

                return (
                  <Group
                    key={element.id}
                    x={element.x}
                    y={element.y}
                    width={element.width}
                    height={element.height}
                    rotation={element.rotation ?? 0}
                    opacity={element.opacity ?? 1}
                    draggable={Boolean(canManage && isSelected && !element.locked)}
                    onMouseDown={(event) => handleElementPointerDown(element.id, event)}
                    onTap={(event) => handleElementPointerDown(element.id, event as unknown as KonvaEventObject<MouseEvent>)}
                    onDragStart={() => handleDragStart(element.id)}
                    onDragMove={() => handleDragMove(element.id)}
                    onDragEnd={() => handleDragEnd(element.id)}
                    ref={(node) => {
                      if (!node) {
                        nodeRefs.current.delete(element.id);
                        return;
                      }
                      nodeRefs.current.set(element.id, node);
                    }}
                  >
                    <Rect
                      x={0}
                      y={0}
                      width={element.width}
                      height={element.height}
                      fill="rgba(255,255,255,0.001)"
                      stroke={isSelected ? "#2563eb" : "rgba(100, 116, 139, 0.22)"}
                      strokeWidth={isSelected ? 2 : 1}
                      dash={isSelected ? undefined : [4, 4]}
                      cornerRadius={Number(style.borderRadius ?? 0)}
                    />

                    {(element.type === "text" || element.type === "dynamic_text") && (
                      <Text
                        x={6}
                        y={6}
                        width={Math.max(8, element.width - 12)}
                        height={Math.max(8, element.height - 12)}
                        fontFamily={textFontFamily}
                        fontSize={fontSize}
                        fontStyle={fontWeight >= 700 ? "bold" : "normal"}
                        align={textAlign}
                        verticalAlign="middle"
                        fill={color}
                        text={label || (element.type === "text" ? "Text" : "{{token}}")}
                        listening={false}
                      />
                    )}

                    {(element.type === "image" || element.type === "signature") && (
                      <>
                        {imageSource ? (
                          <KonvaImage
                            image={imageSource}
                            x={0}
                            y={0}
                            width={element.width}
                            height={element.height}
                            listening={false}
                          />
                        ) : (
                          <Text
                            x={0}
                            y={0}
                            width={element.width}
                            height={element.height}
                            text={element.type === "image" ? "Image" : "Signature"}
                            align="center"
                            verticalAlign="middle"
                            fill="#64748b"
                            fontSize={15}
                            listening={false}
                          />
                        )}
                      </>
                    )}

                    {element.type === "qr" && (
                      <>
                        <Rect
                          x={8}
                          y={8}
                          width={Math.max(20, element.width - 16)}
                          height={Math.max(20, element.height - 16)}
                          fill={String(style.backgroundColor ?? "#ffffff")}
                          stroke={String(style.foregroundColor ?? "#0f172a")}
                          strokeWidth={2}
                          listening={false}
                        />
                        <Text
                          x={0}
                          y={0}
                          width={element.width}
                          height={element.height}
                          text="QR"
                          align="center"
                          verticalAlign="middle"
                          fill={String(style.foregroundColor ?? "#0f172a")}
                          fontSize={20}
                          fontStyle="bold"
                          listening={false}
                        />
                      </>
                    )}
                  </Group>
                );
              })}

              {lassoRect ? (
                <Rect
                  x={lassoRect.x}
                  y={lassoRect.y}
                  width={lassoRect.width}
                  height={lassoRect.height}
                  fill="rgba(37, 99, 235, 0.14)"
                  stroke="#2563eb"
                  dash={[8, 4]}
                  listening={false}
                />
              ) : null}

              {snapGuides.vertical.map((x) => (
                <Line
                  key={`snap-x-${x}`}
                  points={[x, 0, x, layout.canvas.height]}
                  stroke="#f97316"
                  strokeWidth={1}
                  dash={[6, 4]}
                  listening={false}
                />
              ))}
              {snapGuides.horizontal.map((y) => (
                <Line
                  key={`snap-y-${y}`}
                  points={[0, y, layout.canvas.width, y]}
                  stroke="#f97316"
                  strokeWidth={1}
                  dash={[6, 4]}
                  listening={false}
                />
              ))}

              <Transformer
                ref={(node) => {
                  transformerRef.current = node;
                }}
                rotateEnabled
                enabledAnchors={[
                  "top-left",
                  "top-center",
                  "top-right",
                  "middle-left",
                  "middle-right",
                  "bottom-left",
                  "bottom-center",
                  "bottom-right",
                ]}
                borderStroke="#2563eb"
                anchorStroke="#1d4ed8"
                anchorFill="#bfdbfe"
                anchorSize={8}
                onTransformEnd={handleTransformEnd}
              />
            </Layer>
          </Stage>
        </div>
      </div>
    </div>
  );
}
