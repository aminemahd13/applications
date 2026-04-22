import {
  AlignCenter,
  AlignHorizontalJustifyCenter,
  AlignHorizontalSpaceAround,
  AlignVerticalJustifyCenter,
  AlignVerticalSpaceAround,
  BringToFront,
  ChevronDown,
  Copy,
  Eraser,
  FilePlus2,
  ImagePlus,
  MoveUpRight,
  QrCode,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Save,
  SendToBack,
  Signature,
  SquarePen,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CertificateTemplateElement } from "@/lib/certificates";
import type { AlignMode, DistributeAxis } from "./editor-store";

interface TopCommandBarProps {
  canManage: boolean;
  selectedCount: number;
  canUndo: boolean;
  canRedo: boolean;
  snapEnabled: boolean;
  zoomPercent: number;
  isRefreshing: boolean;
  isPublishing: boolean;
  isSavingDraft: boolean;
  hasConflict: boolean;
  dirty: boolean;
  activeVersionNumber: number | null;
  onRefresh: () => void;
  onAddElement: (type: CertificateTemplateElement["type"]) => void;
  onDeleteSelection: () => void;
  onDuplicateSelection: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onAlign: (mode: AlignMode) => void;
  onDistribute: (axis: DistributeAxis) => void;
  onReorder: (mode: "forward" | "backward" | "front" | "back") => void;
  onSetSnapEnabled: (next: boolean) => void;
  onZoomChange: (nextPercent: number) => void;
  onFitToScreen: () => void;
  onPublish: (activate: boolean) => void;
}

const ZOOM_PRESETS = [25, 50, 75, 100, 150, 200];

export function TopCommandBar(props: TopCommandBarProps) {
  const {
    canManage,
    selectedCount,
    canUndo,
    canRedo,
    snapEnabled,
    zoomPercent,
    isRefreshing,
    isPublishing,
    isSavingDraft,
    hasConflict,
    dirty,
    activeVersionNumber,
    onRefresh,
    onAddElement,
    onDeleteSelection,
    onDuplicateSelection,
    onUndo,
    onRedo,
    onAlign,
    onDistribute,
    onReorder,
    onSetSnapEnabled,
    onZoomChange,
    onFitToScreen,
    onPublish,
  } = props;

  return (
    <div className="space-y-2 rounded-xl border bg-card/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={() => onAddElement("text")} disabled={!canManage}>
            <FilePlus2 className="mr-1.5 h-4 w-4" />
            Text
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onAddElement("dynamic_text")}
            disabled={!canManage}
          >
            <SquarePen className="mr-1.5 h-4 w-4" />
            Token
          </Button>
          <Button size="sm" variant="outline" onClick={() => onAddElement("image")} disabled={!canManage}>
            <ImagePlus className="mr-1.5 h-4 w-4" />
            Image
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onAddElement("signature")}
            disabled={!canManage}
          >
            <Signature className="mr-1.5 h-4 w-4" />
            Signature
          </Button>
          <Button size="sm" variant="outline" onClick={() => onAddElement("qr")} disabled={!canManage}>
            <QrCode className="mr-1.5 h-4 w-4" />
            QR
          </Button>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={onRefresh} disabled={isRefreshing}>
            <RefreshCw className={`mr-1.5 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            variant="default"
            onClick={() => onPublish(false)}
            disabled={!canManage || isPublishing}
          >
            <Save className="mr-1.5 h-4 w-4" />
            Publish version
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onPublish(true)}
            disabled={!canManage || isPublishing}
          >
            Activate latest
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={onUndo} disabled={!canUndo || !canManage}>
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={onRedo} disabled={!canRedo || !canManage}>
            <RotateCw className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onDuplicateSelection}
            disabled={!canManage || selectedCount === 0}
          >
            <Copy className="mr-1.5 h-4 w-4" />
            Duplicate
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onDeleteSelection}
            disabled={!canManage || selectedCount === 0}
          >
            <Trash2 className="mr-1.5 h-4 w-4" />
            Delete
          </Button>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" disabled={!canManage || selectedCount < 2}>
              <AlignCenter className="mr-1.5 h-4 w-4" />
              Align
              <ChevronDown className="ml-1 h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Align</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onAlign("left")}>Left</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAlign("center")}>Center</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAlign("right")}>Right</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAlign("top")}>Top</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAlign("middle")}>Middle</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAlign("bottom")}>Bottom</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Distribute</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onDistribute("horizontal")}>
              <AlignHorizontalSpaceAround className="mr-1.5 h-4 w-4" />
              Horizontal
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDistribute("vertical")}>
              <AlignVerticalSpaceAround className="mr-1.5 h-4 w-4" />
              Vertical
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" disabled={!canManage || selectedCount === 0}>
              <BringToFront className="mr-1.5 h-4 w-4" />
              Layer
              <ChevronDown className="ml-1 h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => onReorder("front")}>
              <BringToFront className="mr-1.5 h-4 w-4" />
              Bring to front
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onReorder("forward")}>
              <MoveUpRight className="mr-1.5 h-4 w-4" />
              Bring forward
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onReorder("backward")}>
              <AlignHorizontalJustifyCenter className="mr-1.5 h-4 w-4" />
              Send backward
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onReorder("back")}>
              <SendToBack className="mr-1.5 h-4 w-4" />
              Send to back
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          size="sm"
          variant={snapEnabled ? "secondary" : "outline"}
          onClick={() => onSetSnapEnabled(!snapEnabled)}
          disabled={!canManage}
        >
          <AlignVerticalJustifyCenter className="mr-1.5 h-4 w-4" />
          Snap {snapEnabled ? "on" : "off"}
        </Button>

        <Select value={String(zoomPercent)} onValueChange={(value) => onZoomChange(Number(value))}>
          <SelectTrigger className="h-8 w-[110px]">
            <SelectValue placeholder="Zoom" />
          </SelectTrigger>
          <SelectContent>
            {ZOOM_PRESETS.map((preset) => (
              <SelectItem key={preset} value={String(preset)}>
                {preset}%
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button size="sm" variant="outline" onClick={onFitToScreen}>
          <Eraser className="mr-1.5 h-4 w-4" />
          Fit
        </Button>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Badge variant={hasConflict ? "destructive" : dirty ? "secondary" : "outline"}>
            {hasConflict ? "Conflict" : isSavingDraft ? "Saving draft..." : dirty ? "Unsaved" : "Saved"}
          </Badge>
          <Badge variant="outline">Selection {selectedCount}</Badge>
          <Badge variant="outline">Active v{activeVersionNumber ?? "-"}</Badge>
        </div>
      </div>
    </div>
  );
}
