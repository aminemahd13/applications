import { useEffect, useMemo, useState } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CertificateLayout, CertificateTemplateElement } from "@/lib/certificates";
import type { AssetMode } from "./utils";

interface InspectorPanelProps {
  canManage: boolean;
  layout: CertificateLayout;
  selectedElement: CertificateTemplateElement | null;
  selectedCount: number;
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

export function InspectorPanel(props: InspectorPanelProps) {
  const {
    canManage,
    layout,
    selectedElement,
    selectedCount,
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
  const [isCustomTokenMode, setIsCustomTokenMode] = useState(false);

  const availableSlotKeys = useMemo(
    () => layout.signatureSlots.map((slot) => slot.key),
    [layout.signatureSlots],
  );

  const selectedToken =
    selectedElement?.type === "dynamic_text" || selectedElement?.type === "qr"
      ? String(
          selectedElement.token ?? (selectedElement.type === "qr" ? "qrVerificationUrl" : ""),
        ).trim()
      : "";

  const isKnownToken = selectedToken.length > 0 && tokenOptions.includes(selectedToken);

  useEffect(() => {
    if (selectedElement?.type !== "dynamic_text" && selectedElement?.type !== "qr") {
      setIsCustomTokenMode(false);
      return;
    }
    setIsCustomTokenMode(!isKnownToken);
  }, [isKnownToken, selectedElement?.id, selectedElement?.type]);

  return (
    <aside className="min-w-[340px] rounded-xl border bg-card/60 p-3">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">Inspector</p>
          <p className="text-xs text-muted-foreground">Keyboard-first controls. Collapsed by default.</p>
        </div>
        <Badge variant="outline">{selectedCount} selected</Badge>
      </div>

      <Accordion type="multiple" defaultValue={["selection", "geometry", "background"]} className="space-y-2">
        <AccordionItem value="selection" className="rounded-md border px-3">
          <AccordionTrigger className="py-2 text-sm hover:no-underline">Selection</AccordionTrigger>
          <AccordionContent className="space-y-2 pb-3">
            <div className="rounded-md border bg-muted/30 p-2 text-xs">
              <p className="font-medium">Type: {selectionType}</p>
              <p className="text-muted-foreground">
                {selectedElement ? selectedElement.id : "Select one or more elements on the canvas."}
              </p>
            </div>

            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => {
                onSetAssetMode("image");
              }}
              disabled={!canManage || !selectedElement}
            >
              <WandSparkles className="mr-1.5 h-4 w-4" />
              Use asset picker for selection
            </Button>

            <Button
              size="sm"
              variant="destructive"
              className="w-full"
              onClick={onDeleteSelection}
              disabled={!canManage || selectedCount === 0}
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              Remove selection
            </Button>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="geometry" className="rounded-md border px-3">
          <AccordionTrigger className="py-2 text-sm hover:no-underline">Geometry</AccordionTrigger>
          <AccordionContent className="space-y-2 pb-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">X</span>
                <Input
                  type="number"
                  value={selectedElement ? Math.round(selectedElement.x) : ""}
                  disabled={!canManage || !selectedElement}
                  className="h-8"
                  onChange={(event) => onPatchSelection({ x: Number(event.target.value) })}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Y</span>
                <Input
                  type="number"
                  value={selectedElement ? Math.round(selectedElement.y) : ""}
                  disabled={!canManage || !selectedElement}
                  className="h-8"
                  onChange={(event) => onPatchSelection({ y: Number(event.target.value) })}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Width</span>
                <Input
                  type="number"
                  value={selectedElement ? Math.round(selectedElement.width) : ""}
                  disabled={!canManage || !selectedElement}
                  className="h-8"
                  onChange={(event) => onPatchSelection({ width: Math.max(4, Number(event.target.value)) })}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Height</span>
                <Input
                  type="number"
                  value={selectedElement ? Math.round(selectedElement.height) : ""}
                  disabled={!canManage || !selectedElement}
                  className="h-8"
                  onChange={(event) => onPatchSelection({ height: Math.max(4, Number(event.target.value)) })}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Rotation</span>
                <Input
                  type="number"
                  value={selectedElement ? Math.round(selectedElement.rotation ?? 0) : ""}
                  disabled={!canManage || !selectedElement}
                  className="h-8"
                  onChange={(event) => onPatchSelection({ rotation: Number(event.target.value) })}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Opacity %</span>
                <Input
                  type="number"
                  value={selectedElement ? Math.round((selectedElement.opacity ?? 1) * 100) : ""}
                  disabled={!canManage || !selectedElement}
                  className="h-8"
                  onChange={(event) =>
                    onPatchSelection({ opacity: Math.max(0, Math.min(1, Number(event.target.value) / 100)) })
                  }
                />
              </label>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="typography" className="rounded-md border px-3">
          <AccordionTrigger className="py-2 text-sm hover:no-underline">Typography / Styling</AccordionTrigger>
          <AccordionContent className="space-y-2 pb-3">
            {selectedElement?.type === "text" || selectedElement?.type === "dynamic_text" ? (
              <>
                {selectedElement.type === "text" ? (
                  <label className="space-y-1">
                    <span className="text-xs text-muted-foreground">Text content</span>
                    <Input
                      value={selectedElement.content}
                      onChange={(event) => onUpdatePrimaryTextContent(event.target.value)}
                      disabled={!canManage}
                      className="h-8"
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
                            setIsCustomTokenMode(true);
                            return;
                          }
                          setIsCustomTokenMode(false);
                          onUpdatePrimaryToken(value);
                        }}
                        disabled={!canManage}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue placeholder="Select token" />
                        </SelectTrigger>
                        <SelectContent>
                          {tokenOptions.map((token) => (
                            <SelectItem key={token} value={token}>
                              {token}
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
                          className="h-8"
                          placeholder="tokenName"
                        />
                      </label>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="text-xs text-muted-foreground">Font size</span>
                    <Input
                      type="number"
                      value={readNumber(style.fontSize, 32)}
                      disabled={!canManage}
                      className="h-8"
                      onChange={(event) => onPatchSelectionStyle({ fontSize: Number(event.target.value) })}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs text-muted-foreground">Weight</span>
                    <Input
                      type="number"
                      value={readNumber(style.fontWeight, 600)}
                      disabled={!canManage}
                      className="h-8"
                      onChange={(event) => onPatchSelectionStyle({ fontWeight: Number(event.target.value) })}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs text-muted-foreground">Color</span>
                    <Input
                      type="color"
                      value={readString(style.color, "#0f172a")}
                      disabled={!canManage}
                      className="h-8"
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
                      <SelectTrigger className="h-8">
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
            ) : selectedElement?.type === "image" || selectedElement?.type === "signature" ? (
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="text-xs text-muted-foreground">Fit</span>
                  <Select
                    value={readString(style.fit, "contain")}
                    disabled={!canManage}
                    onValueChange={(value) => onPatchSelectionStyle({ fit: value })}
                  >
                    <SelectTrigger className="h-8">
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
                  <span className="text-xs text-muted-foreground">Radius</span>
                  <Input
                    type="number"
                    value={readNumber(style.borderRadius, 0)}
                    className="h-8"
                    disabled={!canManage}
                    onChange={(event) => onPatchSelectionStyle({ borderRadius: Number(event.target.value) })}
                  />
                </label>
              </div>
            ) : selectedElement?.type === "qr" ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2 space-y-2">
                  <label className="space-y-1">
                    <span className="text-xs text-muted-foreground">Token</span>
                    <Select
                      value={isCustomTokenMode ? CUSTOM_TOKEN_VALUE : isKnownToken ? selectedToken : CUSTOM_TOKEN_VALUE}
                      onValueChange={(value) => {
                        if (value === CUSTOM_TOKEN_VALUE) {
                          setIsCustomTokenMode(true);
                          return;
                        }
                        setIsCustomTokenMode(false);
                        onUpdatePrimaryToken(value);
                      }}
                      disabled={!canManage}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="Select token" />
                      </SelectTrigger>
                      <SelectContent>
                        {tokenOptions.map((token) => (
                          <SelectItem key={token} value={token}>
                            {token}
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
                        className="h-8"
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
                    className="h-8"
                    disabled={!canManage}
                    onChange={(event) => onPatchSelectionStyle({ foregroundColor: event.target.value })}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-muted-foreground">Background</span>
                  <Input
                    type="color"
                    value={readString(style.backgroundColor, "#ffffff")}
                    className="h-8"
                    disabled={!canManage}
                    onChange={(event) => onPatchSelectionStyle({ backgroundColor: event.target.value })}
                  />
                </label>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Select an element to edit styles.</p>
            )}
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="background" className="rounded-md border px-3">
          <AccordionTrigger className="py-2 text-sm hover:no-underline">Background</AccordionTrigger>
          <AccordionContent className="space-y-2 pb-3">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs text-muted-foreground">Canvas background asset</Label>
              <Button size="sm" variant="outline" onClick={() => onSetAssetMode("background")} disabled={!canManage}>
                Open assets
              </Button>
            </div>
            <Input
              value={layout.canvas.backgroundAssetKey ?? ""}
              onChange={(event) => onUpdateCanvas({ backgroundAssetKey: event.target.value })}
              className="h-8"
              disabled={!canManage}
              placeholder="Storage key"
            />
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Background color</span>
                <Input
                  type="color"
                  value={layout.canvas.backgroundColor ?? "#ffffff"}
                  onChange={(event) => onUpdateCanvas({ backgroundColor: event.target.value })}
                  className="h-8"
                  disabled={!canManage}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Grid size</span>
                <Input
                  type="number"
                  value={layout.canvas.gridSize ?? 8}
                  onChange={(event) => onUpdateCanvas({ gridSize: Number(event.target.value) })}
                  className="h-8"
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
                {layout.signatureSlots.map((slot) => (
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
                      <Input
                        value={slot.label}
                        onChange={(event) =>
                          onUpdateSignatureSlot(slot.key, (current) => ({
                            ...current,
                            label: event.target.value,
                          }))
                        }
                        className="h-8"
                        disabled={!canManage}
                        placeholder="Label"
                      />
                      <Input
                        value={slot.signerName ?? ""}
                        onChange={(event) =>
                          onUpdateSignatureSlot(slot.key, (current) => ({
                            ...current,
                            signerName: event.target.value,
                          }))
                        }
                        className="h-8"
                        disabled={!canManage}
                        placeholder="Signer Name"
                      />
                      <Input
                        value={slot.signerTitle ?? ""}
                        onChange={(event) =>
                          onUpdateSignatureSlot(slot.key, (current) => ({
                            ...current,
                            signerTitle: event.target.value,
                          }))
                        }
                        className="h-8"
                        disabled={!canManage}
                        placeholder="Signer Title"
                      />
                      <Input
                        value={slot.assetKey ?? ""}
                        onChange={(event) =>
                          onUpdateSignatureSlot(slot.key, (current) => ({
                            ...current,
                            assetKey: event.target.value,
                          }))
                        }
                        className="h-8"
                        disabled={!canManage}
                        placeholder="Asset Key"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </aside>
  );
}
