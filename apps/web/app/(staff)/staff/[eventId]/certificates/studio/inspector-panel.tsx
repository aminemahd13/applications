import { useMemo, useState } from "react";
import { Plus, Trash2, WandSparkles } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type {
  CertificateAsset,
  CertificateLayout,
  CertificateTemplateElement,
} from "@/lib/certificates";
import type { AssetMode, PreviewData } from "./utils";

interface InspectorPanelProps {
  canManage: boolean;
  layout: CertificateLayout;
  assets: CertificateAsset[];
  selectedElement: CertificateTemplateElement | null;
  selectedCount: number;
  previewData: PreviewData;
  previewTokenKeys: string[];
  onPreviewDataChange: (key: string, value: string) => void;
  onResetPreviewData: () => void;
  onPatchSelection: (patch: Partial<CertificateTemplateElement>) => void;
  onPatchSelectionStyle: (patch: Record<string, unknown>) => void;
  onUpdatePrimaryTextContent: (value: string) => void;
  onUpdatePrimaryToken: (value: string) => void;
  tokenOptions: string[];
  onUpdateCanvas: (patch: Partial<CertificateLayout["canvas"]>) => void;
  onSetAssetMode: (mode: AssetMode) => void;
  onDeleteSelection: () => void;
  onAddSignatureSlot: () => void;
  onUpdateSignatureSlot: (
    slotKey: string,
    updater: (slot: CertificateLayout["signatureSlots"][number]) => CertificateLayout["signatureSlots"][number],
  ) => void;
  onRemoveSignatureSlot: (slotKey: string) => void;
}

const CUSTOM_TOKEN_VALUE = "__custom__";
const NONE_ASSET_VALUE = "__none__";

function readNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function readString(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim().length > 0) return value;
  return fallback;
}

function formatTokenLabel(token: string): string {
  const spaced = token
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  if (!spaced) return token;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatSelectionType(type: CertificateTemplateElement["type"] | "none"): string {
  if (type === "dynamic_text") return "Dynamic text";
  if (type === "qr") return "QR";
  if (type === "none") return "None";
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export function InspectorPanel(props: InspectorPanelProps) {
  const {
    canManage,
    layout,
    assets,
    selectedElement,
    selectedCount,
    previewData,
    previewTokenKeys,
    onPreviewDataChange,
    onResetPreviewData,
    onPatchSelection,
    onPatchSelectionStyle,
    onUpdatePrimaryTextContent,
    onUpdatePrimaryToken,
    tokenOptions,
    onUpdateCanvas,
    onSetAssetMode,
    onDeleteSelection,
    onAddSignatureSlot,
    onUpdateSignatureSlot,
    onRemoveSignatureSlot,
  } = props;

  const style = (selectedElement?.style ?? {}) as Record<string, unknown>;
  const selectionType = selectedElement?.type ?? "none";
  const [customTokenElementId, setCustomTokenElementId] = useState<string | null>(null);

  const availableSlotKeys = useMemo(
    () => layout.signatureSlots.map((slot) => slot.key),
    [layout.signatureSlots],
  );
  const fontAssets = useMemo(
    () => assets.filter((asset) => asset.kind === "font"),
    [assets],
  );
  const backgroundAssets = useMemo(
    () => assets.filter((asset) => asset.kind === "background"),
    [assets],
  );
  const signatureAssets = useMemo(
    () => assets.filter((asset) => asset.kind === "signature"),
    [assets],
  );

  const selectedToken =
    selectedElement?.type === "dynamic_text" || selectedElement?.type === "qr"
      ? String(
          selectedElement.token ?? (selectedElement.type === "qr" ? "qrVerificationUrl" : ""),
        ).trim()
      : "";

  const isKnownToken = selectedToken.length > 0 && tokenOptions.includes(selectedToken);

  const preferredSections = useMemo(() => {
    if (selectionType === "none") {
      return previewTokenKeys.length > 0
        ? ["selection", "background", "preview-data"]
        : ["selection", "background", "signature-slots"];
    }
    return ["selection", "content", "geometry"];
  }, [previewTokenKeys.length, selectionType]);
  const currentTokenElementId =
    selectedElement?.type === "dynamic_text" || selectedElement?.type === "qr"
      ? selectedElement.id
      : null;
  const isCustomTokenMode =
    Boolean(currentTokenElementId) &&
    (customTokenElementId === currentTokenElementId || !isKnownToken);
  const accordionResetKey = `${selectionType}:${selectedElement?.id ?? "none"}:${previewTokenKeys.length > 0 ? "tokens" : "no-tokens"}`;

  const contentTitle =
    selectionType === "text" || selectionType === "dynamic_text"
      ? "Content & typography"
      : selectionType === "image" || selectionType === "signature"
        ? "Asset styling"
        : selectionType === "qr"
          ? "QR settings"
          : "Content";
  const currentBackgroundAssetKey = String(layout.canvas.backgroundAssetKey ?? "").trim();
  const backgroundAssetSelectValue = !currentBackgroundAssetKey
    ? NONE_ASSET_VALUE
    : backgroundAssets.some((asset) => asset.storageKey === currentBackgroundAssetKey)
      ? currentBackgroundAssetKey
      : NONE_ASSET_VALUE;
  const isMultiSelection = selectedCount > 1;
  const selectedCountLabel = `${selectedCount} selected`;
  const fontSourceValue = String(style.fontAssetKey ?? "").trim() ? "uploaded" : "system";

  return (
    <aside className="flex min-h-[72vh] min-w-[340px] max-w-[360px] flex-col overflow-hidden rounded-xl border bg-card/60">
      <div className="border-b p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Inspector</p>
            <p className="text-xs text-muted-foreground">
              Edit selected layers and canvas settings.
            </p>
          </div>
          <Badge variant="outline">{selectedCountLabel}</Badge>
        </div>
      </div>

      <ScrollArea className="h-full">
        <div className="space-y-3 p-3">
          <Accordion key={accordionResetKey} type="multiple" defaultValue={preferredSections} className="space-y-2">
            <AccordionItem value="selection" className="rounded-md border px-3">
              <AccordionTrigger className="py-2 text-sm hover:no-underline">Selection</AccordionTrigger>
              <AccordionContent className="space-y-2 pb-3">
                <div className="rounded-md border bg-muted/30 p-3 text-xs">
                  <p className="font-medium">Type: {formatSelectionType(selectionType)}</p>
                  <p className="mt-1 break-all text-muted-foreground">
                    {selectedElement ? selectedElement.id : "Select an element on the canvas to edit it."}
                  </p>
                  {isMultiSelection && (
                    <p className="mt-2 text-muted-foreground">
                      Geometry and style edits apply to all selected layers. Content edits apply to the primary
                      selection.
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      if (selectedElement?.type === "text" || selectedElement?.type === "dynamic_text") {
                        onSetAssetMode("font");
                        return;
                      }
                      onSetAssetMode(selectedElement?.type === "signature" ? "signature" : "image");
                    }}
                    disabled={!canManage || !selectedElement}
                  >
                    <WandSparkles className="mr-1.5 h-4 w-4" />
                    Asset picker
                  </Button>

                  <Button
                    size="sm"
                    variant="destructive"
                    className="w-full"
                    onClick={onDeleteSelection}
                    disabled={!canManage || selectedCount === 0}
                  >
                    <Trash2 className="mr-1.5 h-4 w-4" />
                    Delete
                  </Button>
                </div>
              </AccordionContent>
            </AccordionItem>

            {selectionType !== "none" && (
              <AccordionItem value="content" className="rounded-md border px-3">
                <AccordionTrigger className="py-2 text-sm hover:no-underline">{contentTitle}</AccordionTrigger>
                <AccordionContent className="space-y-2 pb-3">
                  {(selectedElement?.type === "text" || selectedElement?.type === "dynamic_text") && (
                    <>
                      {selectedElement.type === "text" ? (
                        <label className="space-y-1">
                          <span className="text-xs text-muted-foreground">Text content</span>
                          <Input
                            value={selectedElement.content}
                            onChange={(event) => onUpdatePrimaryTextContent(event.target.value)}
                            disabled={!canManage}
                          />
                        </label>
                      ) : (
                        <div className="space-y-2">
                          <label className="space-y-1">
                            <span className="text-xs text-muted-foreground">Token</span>
                            <Select
                              value={isCustomTokenMode ? CUSTOM_TOKEN_VALUE : isKnownToken ? selectedToken : CUSTOM_TOKEN_VALUE}
                              onValueChange={(value) => {
                                if (value === CUSTOM_TOKEN_VALUE) {
                                  setCustomTokenElementId(currentTokenElementId);
                                  return;
                                }
                                setCustomTokenElementId(null);
                                onUpdatePrimaryToken(value);
                              }}
                              disabled={!canManage}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select token" />
                              </SelectTrigger>
                              <SelectContent>
                                {tokenOptions.map((token) => (
                                  <SelectItem key={token} value={token}>
                                    {formatTokenLabel(token)}
                                  </SelectItem>
                                ))}
                                <SelectItem value={CUSTOM_TOKEN_VALUE}>Custom token</SelectItem>
                              </SelectContent>
                            </Select>
                          </label>
                          {isCustomTokenMode && (
                            <label className="space-y-1">
                              <span className="text-xs text-muted-foreground">Custom token</span>
                              <Input
                                value={selectedToken}
                                onChange={(event) => onUpdatePrimaryToken(event.target.value)}
                                disabled={!canManage}
                                placeholder="tokenName"
                              />
                            </label>
                          )}
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-2">
                        <label className="space-y-1">
                          <span className="text-xs text-muted-foreground">Font source</span>
                          <Select
                            value={fontSourceValue}
                            disabled={!canManage}
                            onValueChange={(value) => {
                              if (value === "uploaded") {
                                const firstFont = fontAssets[0];
                                if (!firstFont) {
                                  onSetAssetMode("font");
                                  return;
                                }
                                onPatchSelectionStyle({
                                  fontAssetKey: firstFont.storageKey,
                                  fontFamily:
                                    readString(style.fontFamily, "").trim() ||
                                    firstFont.originalFilename.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim() ||
                                    "Uploaded Font",
                                });
                                return;
                              }
                              onPatchSelectionStyle({ fontAssetKey: undefined });
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Font source" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="system">System</SelectItem>
                              <SelectItem value="uploaded">Uploaded</SelectItem>
                            </SelectContent>
                          </Select>
                        </label>
                        <label className="space-y-1">
                          <span className="text-xs text-muted-foreground">Font family</span>
                          <Input
                            value={readString(style.fontFamily, "Geist")}
                            disabled={!canManage}
                            onChange={(event) => onPatchSelectionStyle({ fontFamily: event.target.value })}
                          />
                        </label>
                      </div>

                      {fontSourceValue === "uploaded" && (
                        <div className="space-y-2 rounded-md border border-dashed p-2">
                          <div className="flex items-center justify-between gap-3">
                            <Label className="text-xs text-muted-foreground">Uploaded font</Label>
                            <Button size="sm" variant="outline" onClick={() => onSetAssetMode("font")} disabled={!canManage}>
                              Open assets
                            </Button>
                          </div>
                          {fontAssets.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                              No uploaded fonts found yet.
                            </p>
                          ) : (
                            <Select
                              value={
                                fontAssets.some((asset) => asset.storageKey === String(style.fontAssetKey ?? "").trim())
                                  ? String(style.fontAssetKey ?? "").trim()
                                  : fontAssets[0].storageKey
                              }
                              disabled={!canManage}
                              onValueChange={(value) => onPatchSelectionStyle({ fontAssetKey: value })}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select uploaded font" />
                              </SelectTrigger>
                              <SelectContent>
                                {fontAssets.map((asset) => (
                                  <SelectItem key={asset.id} value={asset.storageKey}>
                                    {asset.originalFilename}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-2">
                        <label className="space-y-1">
                          <span className="text-xs text-muted-foreground">Font size</span>
                          <Input
                            type="number"
                            min={8}
                            step={1}
                            value={readNumber(style.fontSize, 32)}
                            disabled={!canManage}
                            onChange={(event) => onPatchSelectionStyle({ fontSize: Number(event.target.value) })}
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-xs text-muted-foreground">Weight</span>
                          <Input
                            type="number"
                            min={100}
                            max={900}
                            step={100}
                            value={readNumber(style.fontWeight, 600)}
                            disabled={!canManage}
                            onChange={(event) => onPatchSelectionStyle({ fontWeight: Number(event.target.value) })}
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-xs text-muted-foreground">Color</span>
                          <Input
                            type="color"
                            value={readString(style.color, "#0f172a")}
                            disabled={!canManage}
                            onChange={(event) => onPatchSelectionStyle({ color: event.target.value })}
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-xs text-muted-foreground">Align</span>
                          <Select
                            value={readString(style.textAlign, "left")}
                            disabled={!canManage}
                            onValueChange={(value) => onPatchSelectionStyle({ textAlign: value })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Alignment" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="left">Left</SelectItem>
                              <SelectItem value="center">Center</SelectItem>
                              <SelectItem value="right">Right</SelectItem>
                            </SelectContent>
                          </Select>
                        </label>
                      </div>
                    </>
                  )}

                  {(selectedElement?.type === "image" || selectedElement?.type === "signature") && (
                    <div className="space-y-2">
                      {selectedElement.type === "signature" && (
                        availableSlotKeys.length > 0 ? (
                          <label className="space-y-1">
                            <span className="text-xs text-muted-foreground">Signature slot</span>
                            <Select
                              value={selectedElement.signatureSlotKey}
                              disabled={!canManage}
                              onValueChange={(value) => onPatchSelection({ signatureSlotKey: value })}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select slot" />
                              </SelectTrigger>
                              <SelectContent>
                                {layout.signatureSlots.map((slot) => (
                                  <SelectItem key={slot.key} value={slot.key}>
                                    {slot.label} ({slot.key})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </label>
                        ) : (
                          <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
                            Add a signature slot first, then assign this layer to it.
                          </p>
                        )
                      )}

                      <div className="grid grid-cols-2 gap-2">
                        <label className="space-y-1">
                          <span className="text-xs text-muted-foreground">Fit</span>
                          <Select
                            value={readString(style.fit, "contain")}
                            disabled={!canManage}
                            onValueChange={(value) => onPatchSelectionStyle({ fit: value })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Fit mode" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="contain">Contain</SelectItem>
                              <SelectItem value="cover">Cover</SelectItem>
                              <SelectItem value="fill">Fill</SelectItem>
                            </SelectContent>
                          </Select>
                        </label>
                        <label className="space-y-1">
                          <span className="text-xs text-muted-foreground">Corner radius</span>
                          <Input
                            type="number"
                            min={0}
                            step={1}
                            value={readNumber(style.borderRadius, 0)}
                            disabled={!canManage}
                            onChange={(event) => onPatchSelectionStyle({ borderRadius: Number(event.target.value) })}
                          />
                        </label>
                      </div>
                    </div>
                  )}

                  {selectedElement?.type === "qr" && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="col-span-2 space-y-2">
                        <label className="space-y-1">
                          <span className="text-xs text-muted-foreground">Token</span>
                          <Select
                            value={isCustomTokenMode ? CUSTOM_TOKEN_VALUE : isKnownToken ? selectedToken : CUSTOM_TOKEN_VALUE}
                            onValueChange={(value) => {
                              if (value === CUSTOM_TOKEN_VALUE) {
                                setCustomTokenElementId(currentTokenElementId);
                                return;
                              }
                              setCustomTokenElementId(null);
                              onUpdatePrimaryToken(value);
                            }}
                            disabled={!canManage}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select token" />
                            </SelectTrigger>
                            <SelectContent>
                              {tokenOptions.map((token) => (
                                <SelectItem key={token} value={token}>
                                  {formatTokenLabel(token)}
                                </SelectItem>
                              ))}
                              <SelectItem value={CUSTOM_TOKEN_VALUE}>Custom token</SelectItem>
                            </SelectContent>
                          </Select>
                        </label>
                        {isCustomTokenMode && (
                          <label className="space-y-1">
                            <span className="text-xs text-muted-foreground">Custom token</span>
                            <Input
                              value={selectedToken}
                              disabled={!canManage}
                              onChange={(event) => onUpdatePrimaryToken(event.target.value)}
                              placeholder="tokenName"
                            />
                          </label>
                        )}
                      </div>
                      <label className="space-y-1">
                        <span className="text-xs text-muted-foreground">Foreground</span>
                        <Input
                          type="color"
                          value={readString(style.foregroundColor, "#0f172a")}
                          disabled={!canManage}
                          onChange={(event) => onPatchSelectionStyle({ foregroundColor: event.target.value })}
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs text-muted-foreground">Background</span>
                        <Input
                          type="color"
                          value={readString(style.backgroundColor, "#ffffff")}
                          disabled={!canManage}
                          onChange={(event) => onPatchSelectionStyle({ backgroundColor: event.target.value })}
                        />
                      </label>
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            )}

            {selectionType !== "none" && (
              <AccordionItem value="geometry" className="rounded-md border px-3">
                <AccordionTrigger className="py-2 text-sm hover:no-underline">Geometry</AccordionTrigger>
                <AccordionContent className="space-y-2 pb-3">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="space-y-1">
                      <span className="text-xs text-muted-foreground">X</span>
                      <Input
                        type="number"
                        step={1}
                        value={selectedElement ? Math.round(selectedElement.x) : ""}
                        disabled={!canManage || !selectedElement}
                        onChange={(event) => onPatchSelection({ x: Number(event.target.value) })}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs text-muted-foreground">Y</span>
                      <Input
                        type="number"
                        step={1}
                        value={selectedElement ? Math.round(selectedElement.y) : ""}
                        disabled={!canManage || !selectedElement}
                        onChange={(event) => onPatchSelection({ y: Number(event.target.value) })}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs text-muted-foreground">Width</span>
                      <Input
                        type="number"
                        min={4}
                        step={1}
                        value={selectedElement ? Math.round(selectedElement.width) : ""}
                        disabled={!canManage || !selectedElement}
                        onChange={(event) => onPatchSelection({ width: Math.max(4, Number(event.target.value)) })}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs text-muted-foreground">Height</span>
                      <Input
                        type="number"
                        min={4}
                        step={1}
                        value={selectedElement ? Math.round(selectedElement.height) : ""}
                        disabled={!canManage || !selectedElement}
                        onChange={(event) => onPatchSelection({ height: Math.max(4, Number(event.target.value)) })}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs text-muted-foreground">Rotation</span>
                      <Input
                        type="number"
                        step={1}
                        value={selectedElement ? Math.round(selectedElement.rotation ?? 0) : ""}
                        disabled={!canManage || !selectedElement}
                        onChange={(event) => onPatchSelection({ rotation: Number(event.target.value) })}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs text-muted-foreground">Opacity %</span>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={selectedElement ? Math.round((selectedElement.opacity ?? 1) * 100) : ""}
                        disabled={!canManage || !selectedElement}
                        onChange={(event) =>
                          onPatchSelection({ opacity: Math.max(0, Math.min(1, Number(event.target.value) / 100)) })
                        }
                      />
                    </label>
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}

            <AccordionItem value="background" className="rounded-md border px-3">
              <AccordionTrigger className="py-2 text-sm hover:no-underline">Canvas & background</AccordionTrigger>
              <AccordionContent className="space-y-2 pb-3">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs text-muted-foreground">Canvas background asset</Label>
                  <Button size="sm" variant="outline" onClick={() => onSetAssetMode("background")} disabled={!canManage}>
                    Open assets
                  </Button>
                </div>
                <Select
                  value={backgroundAssetSelectValue}
                  disabled={!canManage}
                  onValueChange={(value) => {
                    if (value === NONE_ASSET_VALUE) {
                      onUpdateCanvas({ backgroundAssetKey: undefined });
                      return;
                    }
                    onUpdateCanvas({ backgroundAssetKey: value });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select background asset" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_ASSET_VALUE}>None</SelectItem>
                    {backgroundAssets.map((asset) => (
                      <SelectItem key={asset.id} value={asset.storageKey}>
                        {asset.originalFilename}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={layout.canvas.backgroundAssetKey ?? ""}
                  onChange={(event) => onUpdateCanvas({ backgroundAssetKey: event.target.value })}
                  disabled={!canManage}
                  placeholder="Storage key (manual override)"
                />
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="text-xs text-muted-foreground">Background color</span>
                    <Input
                      type="color"
                      value={layout.canvas.backgroundColor ?? "#ffffff"}
                      onChange={(event) => onUpdateCanvas({ backgroundColor: event.target.value })}
                      disabled={!canManage}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs text-muted-foreground">Grid size</span>
                    <Input
                      type="number"
                      min={2}
                      step={1}
                      value={layout.canvas.gridSize ?? 8}
                      onChange={(event) => onUpdateCanvas({ gridSize: Number(event.target.value) })}
                      disabled={!canManage}
                    />
                  </label>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="signature-slots" className="rounded-md border px-3">
              <AccordionTrigger className="py-2 text-sm hover:no-underline">Signature slots</AccordionTrigger>
              <AccordionContent className="space-y-2 pb-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Slot registry</Label>
                  <Button size="sm" variant="outline" onClick={onAddSignatureSlot} disabled={!canManage}>
                    <Plus className="mr-1.5 h-4 w-4" />
                    Add slot
                  </Button>
                </div>

                {layout.signatureSlots.length === 0 ? (
                  <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
                    No signature slots configured.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {layout.signatureSlots.map((slot) => {
                      const slotAssetKey = String(slot.assetKey ?? "").trim();
                      const slotAssetSelectValue = !slotAssetKey
                        ? NONE_ASSET_VALUE
                        : signatureAssets.some((asset) => asset.storageKey === slotAssetKey)
                          ? slotAssetKey
                          : NONE_ASSET_VALUE;

                      return (
                        <div key={slot.key} className="rounded-md border p-2">
                          <div className="mb-2 flex items-center justify-between">
                            <Badge variant="outline">{slot.key}</Badge>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-destructive"
                              onClick={() => onRemoveSignatureSlot(slot.key)}
                              disabled={!canManage || availableSlotKeys.length <= 1}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                          <div className="space-y-2">
                            <label className="space-y-1">
                              <span className="text-xs text-muted-foreground">Label</span>
                              <Input
                                value={slot.label}
                                onChange={(event) =>
                                  onUpdateSignatureSlot(slot.key, (current) => ({
                                    ...current,
                                    label: event.target.value,
                                  }))
                                }
                                disabled={!canManage}
                                placeholder="Label"
                              />
                            </label>
                            <label className="space-y-1">
                              <span className="text-xs text-muted-foreground">Signer name</span>
                              <Input
                                value={slot.signerName ?? ""}
                                onChange={(event) =>
                                  onUpdateSignatureSlot(slot.key, (current) => ({
                                    ...current,
                                    signerName: event.target.value,
                                  }))
                                }
                                disabled={!canManage}
                                placeholder="Signer name"
                              />
                            </label>
                            <label className="space-y-1">
                              <span className="text-xs text-muted-foreground">Signer title</span>
                              <Input
                                value={slot.signerTitle ?? ""}
                                onChange={(event) =>
                                  onUpdateSignatureSlot(slot.key, (current) => ({
                                    ...current,
                                    signerTitle: event.target.value,
                                  }))
                                }
                                disabled={!canManage}
                                placeholder="Signer title"
                              />
                            </label>
                            <label className="space-y-1">
                              <span className="text-xs text-muted-foreground">Signature asset</span>
                              <Select
                                value={slotAssetSelectValue}
                                disabled={!canManage}
                                onValueChange={(value) => {
                                  if (value === NONE_ASSET_VALUE) {
                                    onUpdateSignatureSlot(slot.key, (current) => ({
                                      ...current,
                                      assetKey: undefined,
                                    }));
                                    return;
                                  }
                                  onUpdateSignatureSlot(slot.key, (current) => ({
                                    ...current,
                                    assetKey: value,
                                  }));
                                }}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select signature asset" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={NONE_ASSET_VALUE}>None</SelectItem>
                                  {signatureAssets.map((asset) => (
                                    <SelectItem key={asset.id} value={asset.storageKey}>
                                      {asset.originalFilename}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </label>
                            <Input
                              value={slot.assetKey ?? ""}
                              onChange={(event) =>
                                onUpdateSignatureSlot(slot.key, (current) => ({
                                  ...current,
                                  assetKey: event.target.value,
                                }))
                              }
                              disabled={!canManage}
                              placeholder="Storage key (manual override)"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="preview-data" className="rounded-md border px-3">
              <AccordionTrigger className="py-2 text-sm hover:no-underline">Preview data</AccordionTrigger>
              <AccordionContent className="space-y-2 pb-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    Only tokens used in the current layout are shown here.
                  </p>
                  <Button size="sm" variant="ghost" onClick={onResetPreviewData}>
                    Reset
                  </Button>
                </div>

                {previewTokenKeys.length === 0 ? (
                  <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                    Add a token or QR element to edit preview values.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {previewTokenKeys.map((token) => (
                      <label key={token} className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground">{formatTokenLabel(token)}</span>
                          <span className="font-mono text-[11px] text-muted-foreground">{token}</span>
                        </div>
                        <Input
                          value={previewData[token] ?? ""}
                          onChange={(event) => onPreviewDataChange(token, event.target.value)}
                        />
                      </label>
                    ))}
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </ScrollArea>
    </aside>
  );
}
