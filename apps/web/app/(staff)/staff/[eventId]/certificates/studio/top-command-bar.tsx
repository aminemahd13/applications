import {
  AlignCenter,
  AlignHorizontalJustifyCenter,
  AlignHorizontalSpaceAround,
  AlignVerticalJustifyCenter,
  AlignVerticalSpaceAround,
  BringToFront,
  ChevronDown,
  Copy,
  FilePlus2,
  ImagePlus,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  QrCode,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Save,
  Scan,
  SendToBack,
  Signature,
  SquarePen,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
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
  isLeftRailCollapsed: boolean;
  isInspectorCollapsed: boolean;
  onToggleLeftRail: () => void;
  onToggleInspector: () => void;
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

function ToolbarGroup(props: { label: string; children: React.ReactNode }) {
  const { label, children } = props;

  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-lg border bg-background/80 p-2">
      <p className="px-1 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

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
    isLeftRailCollapsed,
    isInspectorCollapsed,
    onToggleLeftRail,
    onToggleInspector,
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
    <div className="z-20 rounded-xl border bg-card/95 p-3 shadow-sm backdrop-blur">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.2fr)_minmax(0,1fr)]">
        <ToolbarGroup label="Insert">
          <Button size="sm" variant="outline" onClick={() => onAddElement("text")} disabled={!canManage}>
            <FilePlus2 className="mr-1.5 h-4 w-4" />
            Add text
          </Button>
          <Button size="sm" variant="outline" onClick={() => onAddElement("dynamic_text")} disabled={!canManage}>
            <SquarePen className="mr-1.5 h-4 w-4" />
            Add token
          </Button>
          <Button size="sm" variant="outline" onClick={() => onAddElement("image")} disabled={!canManage}>
            <ImagePlus className="mr-1.5 h-4 w-4" />
            Add image
          </Button>
          <Button size="sm" variant="outline" onClick={() => onAddElement("signature")} disabled={!canManage}>
            <Signature className="mr-1.5 h-4 w-4" />
            Add signature
          </Button>
          <Button size="sm" variant="outline" onClick={() => onAddElement("qr")} disabled={!canManage}>
            <QrCode className="mr-1.5 h-4 w-4" />
            Add QR
          </Button>
        </ToolbarGroup>

        <ToolbarGroup label="Selection">
          <Button size="sm" variant="outline" onClick={onUndo} disabled={!canUndo || !canManage}>
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={onRedo} disabled={!canRedo || !canManage}>
            <RotateCw className="h-4 w-4" />
          </Button>
          <Separator orientation="vertical" className="hidden h-6 md:block" />
          <Button size="sm" variant="outline" onClick={onDuplicateSelection} disabled={!canManage || selectedCount === 0}>
            <Copy className="mr-1.5 h-4 w-4" />
            Duplicate
          </Button>
          <Button size="sm" variant="outline" onClick={onDeleteSelection} disabled={!canManage || selectedCount === 0}>
            <Trash2 className="mr-1.5 h-4 w-4" />
            Delete
          </Button>
        </ToolbarGroup>

        <ToolbarGroup label="Arrange">
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
                <AlignHorizontalJustifyCenter className="mr-1.5 h-4 w-4" />
                Bring forward
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onReorder("backward")}>
                <AlignVerticalJustifyCenter className="mr-1.5 h-4 w-4" />
                Send backward
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onReorder("back")}>
                <SendToBack className="mr-1.5 h-4 w-4" />
                Send to back
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </ToolbarGroup>

        <ToolbarGroup label="Canvas">
          <Button
            size="sm"
            variant="outline"
            onClick={onToggleLeftRail}
          >
            {isLeftRailCollapsed ? (
              <PanelLeftOpen className="mr-1.5 h-4 w-4" />
            ) : (
              <PanelLeftClose className="mr-1.5 h-4 w-4" />
            )}
            {isLeftRailCollapsed ? "Show left panel" : "Hide left panel"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onToggleInspector}
          >
            {isInspectorCollapsed ? (
              <PanelRightOpen className="mr-1.5 h-4 w-4" />
            ) : (
              <PanelRightClose className="mr-1.5 h-4 w-4" />
            )}
            {isInspectorCollapsed ? "Show inspector" : "Hide inspector"}
          </Button>
          <Button size="sm" variant={snapEnabled ? "secondary" : "outline"} onClick={() => onSetSnapEnabled(!snapEnabled)} disabled={!canManage}>
            Snap {snapEnabled ? "on" : "off"}
          </Button>
          <Select value={String(zoomPercent)} onValueChange={(value) => onZoomChange(Number(value))}>
            <SelectTrigger className="h-8 w-[120px]">
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
            <Scan className="mr-1.5 h-4 w-4" />
            Fit canvas
          </Button>
          <Button size="sm" variant="outline" onClick={onRefresh} disabled={isRefreshing}>
            <RefreshCw className={`mr-1.5 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </ToolbarGroup>

        <ToolbarGroup label="Publish">
          <Button size="sm" variant="default" onClick={() => onPublish(false)} disabled={!canManage || isPublishing}>
            <Save className="mr-1.5 h-4 w-4" />
            Publish version
          </Button>
          <Button size="sm" variant="secondary" onClick={() => onPublish(true)} disabled={!canManage || isPublishing}>
            Publish and activate
          </Button>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Badge variant={hasConflict ? "destructive" : dirty ? "secondary" : "outline"}>
              {hasConflict ? "Conflict" : isSavingDraft ? "Saving draft..." : dirty ? "Unsaved" : "Saved"}
            </Badge>
            <Badge variant="outline">Selection {selectedCount}</Badge>
            <Badge variant="outline">Active v{activeVersionNumber ?? "-"}</Badge>
          </div>
        </ToolbarGroup>
      </div>
    </div>
  );
}
