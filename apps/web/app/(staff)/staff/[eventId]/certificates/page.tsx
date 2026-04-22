"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FilePlus2,
  ImagePlus,
  Loader2,
  PanelLeft,
  Plus,
  QrCode,
  RefreshCw,
  Save,
  Signature,
  SlidersHorizontal,
  SquarePen,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth, usePermissions } from "@/lib/auth-context";
import { computeCanvasScale } from "@/lib/certificate-viewer";
import {
  CERTIFICATE_DYNAMIC_TOKENS,
  createCertificateTemplate,
  createCertificateTemplateVersion,
  DEFAULT_CERTIFICATE_LAYOUT,
  deleteCertificateAsset,
  issueCertificatesBulk,
  listCertificateAssets,
  listCertificateRenderJobs,
  listCertificateTemplateVersions,
  listCertificateTemplates,
  listIssuedCertificates,
  retryCertificateRenderJob,
  revokeIssuedCertificate,
  type CertificateAsset,
  type CertificateLayout,
  type CertificateSignatureSlot,
  type CertificateTemplateElement,
  type CertificateTemplateSummary,
  type CertificateTemplateVersion,
  type IssuedCertificateSummary,
  type CertificateRenderJobSummary,
  updateCertificateTemplate,
  uploadCertificateAsset,
  activateCertificateTemplateVersion,
} from "@/lib/certificates";
import { PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

type AssetKind = "all" | "background" | "signature" | "logo" | "image";

type PreviewData = Record<string, string>;

const DEFAULT_PREVIEW_DATA: PreviewData = {
  participantName: "Participant Name",
  participantEmail: "participant@example.com",
  eventTitle: "Math&Maroc Event",
  certificateTypeLabel: "Participation",
  issuedDate: "2026-04-22",
  issuedAt: "2026-04-22T12:00:00.000Z",
  certificateId: "00000000-0000-0000-0000-000000000001",
  credentialId: "00000000-0000-0000-0000-000000000002",
  verificationUrl: "https://example.com/credentials/verify/credential-id",
  certificateUrl: "https://example.com/credentials/certificate/certificate-id",
  qrVerificationUrl: "https://example.com/credentials/qr/token",
};

function slugifyTypeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function deepCloneLayout(layout: CertificateLayout): CertificateLayout {
  return JSON.parse(JSON.stringify(layout)) as CertificateLayout;
}

function buildElementLabel(element: CertificateTemplateElement): string {
  if (element.type === "dynamic_text") {
    return `Dynamic (${element.token ?? "token"})`;
  }
  if (element.type === "text") {
    return `Text (${(element.content ?? "text").slice(0, 20)})`;
  }
  if (element.type === "image") {
    return `Image (${element.assetKey ? "bound" : "empty"})`;
  }
  if (element.type === "signature") {
    return `Signature (${element.signatureSlotKey ?? "slot"})`;
  }
  return "QR";
}

function resolveAssetUrl(storageKey?: string | null): string {
  const raw = (storageKey ?? "").trim();
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://") || raw.startsWith("data:")) {
    return raw;
  }
  return `/uploads/${encodeURIComponent(raw)}`;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-GB");
}

function blurActiveElement(): void {
  if (typeof document === "undefined") return;
  const active = document.activeElement;
  if (active instanceof HTMLElement) {
    active.blur();
  }
}

function getStyleNumber(
  style: Record<string, unknown> | undefined,
  key: string,
  fallback: number,
): number {
  const raw = style?.[key];
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function getStyleString(
  style: Record<string, unknown> | undefined,
  key: string,
  fallback: string,
): string {
  const raw = style?.[key];
  if (typeof raw === "string" && raw.trim().length > 0) return raw;
  return fallback;
}

export default function CertificatesPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  const { csrfToken } = useAuth();
  const { hasPermission } = usePermissions(eventId);
  const canManage = hasPermission("event.update");

  const [templates, setTemplates] = useState<CertificateTemplateSummary[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [versions, setVersions] = useState<CertificateTemplateVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [editorLayout, setEditorLayout] = useState<CertificateLayout>(
    deepCloneLayout(DEFAULT_CERTIFICATE_LAYOUT),
  );
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [assets, setAssets] = useState<CertificateAsset[]>([]);
  const [assetKindFilter, setAssetKindFilter] = useState<AssetKind>("all");
  const [issuedCertificates, setIssuedCertificates] = useState<IssuedCertificateSummary[]>([]);
  const [renderJobs, setRenderJobs] = useState<CertificateRenderJobSummary[]>([]);
  const [previewData, setPreviewData] = useState<PreviewData>(DEFAULT_PREVIEW_DATA);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingVersion, setIsSavingVersion] = useState(false);
  const [isRefreshingJobs, setIsRefreshingJobs] = useState(false);
  const [isUploadingAsset, setIsUploadingAsset] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDrawSignatureDialog, setShowDrawSignatureDialog] = useState(false);
  const [showTemplateLibrarySheet, setShowTemplateLibrarySheet] = useState(false);
  const [showInspectorSheet, setShowInspectorSheet] = useState(false);
  const [templateSearch, setTemplateSearch] = useState("");
  const [createName, setCreateName] = useState("Participation Certificate");
  const [createTypeLabel, setCreateTypeLabel] = useState("Participation");
  const [createTypeKey, setCreateTypeKey] = useState("participation");
  const [drawingSlotKey, setDrawingSlotKey] = useState("");
  const drawCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const canvasWrapperRef = useRef<HTMLDivElement | null>(null);
  const [canvasScale, setCanvasScale] = useState(1);
  const dragStateRef = useRef<{
    elementId: string;
    pointerOffsetX: number;
    pointerOffsetY: number;
  } | null>(null);

  const handleCreateDialogOpenChange = useCallback((open: boolean) => {
    if (!open) {
      blurActiveElement();
    }
    setShowCreateDialog(open);
  }, []);

  const handleDrawSignatureDialogOpenChange = useCallback((open: boolean) => {
    if (!open) {
      blurActiveElement();
    }
    setShowDrawSignatureDialog(open);
  }, []);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? null,
    [templates, selectedTemplateId],
  );
  const selectedElement = useMemo(
    () => editorLayout.elements.find((element) => element.id === selectedElementId) ?? null,
    [editorLayout.elements, selectedElementId],
  );
  const selectedElementSupportsTypography =
    selectedElement?.type === "text" || selectedElement?.type === "dynamic_text";

  const tokenValidation = useMemo(() => {
    const allowed = new Set<string>(CERTIFICATE_DYNAMIC_TOKENS);
    const usedTokens = editorLayout.elements
      .filter((element) => element.type === "dynamic_text" || element.type === "qr")
      .map((element) => (element.token ?? "").trim())
      .filter((token) => token.length > 0);
    const unknown = Array.from(new Set(usedTokens.filter((token) => !allowed.has(token))));
    return {
      used: Array.from(new Set(usedTokens)),
      unknown,
    };
  }, [editorLayout.elements]);

  const groupedTemplates = useMemo(() => {
    const groups = new Map<
      string,
      { typeKey: string; typeLabel: string; templates: CertificateTemplateSummary[] }
    >();
    for (const template of templates) {
      const key = template.typeKey;
      if (!groups.has(key)) {
        groups.set(key, {
          typeKey: key,
          typeLabel: template.typeLabel,
          templates: [],
        });
      }
      groups.get(key)?.templates.push(template);
    }
    return Array.from(groups.values()).sort((a, b) => a.typeKey.localeCompare(b.typeKey));
  }, [templates]);

  const normalizedTemplateSearch = templateSearch.trim().toLowerCase();
  const visibleTemplateGroups = useMemo(() => {
    if (!normalizedTemplateSearch) {
      return groupedTemplates;
    }

    return groupedTemplates
      .map((group) => ({
        ...group,
        templates: group.templates.filter((template) => {
          const haystack = [
            template.name,
            template.typeLabel,
            template.typeKey,
            template.description ?? "",
          ]
            .join(" ")
            .toLowerCase();
          return haystack.includes(normalizedTemplateSearch);
        }),
      }))
      .filter((group) => group.templates.length > 0);
  }, [groupedTemplates, normalizedTemplateSearch]);

  const visibleTemplatesCount = useMemo(
    () =>
      visibleTemplateGroups.reduce((count, group) => {
        return count + group.templates.length;
      }, 0),
    [visibleTemplateGroups],
  );

  const sortedElementsByLayer = useMemo(
    () => [...editorLayout.elements].sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0)),
    [editorLayout.elements],
  );

  const refreshDashboard = useCallback(async () => {
    const [templateRows, assetRows, issuedRows, jobRows] = await Promise.all([
      listCertificateTemplates(eventId),
      listCertificateAssets(eventId, assetKindFilter),
      listIssuedCertificates(eventId, { limit: 100 }),
      listCertificateRenderJobs(eventId, { limit: 100 }),
    ]);
    setTemplates(templateRows);
    setAssets(assetRows);
    setIssuedCertificates(issuedRows);
    setRenderJobs(jobRows);

    if (!selectedTemplateId && templateRows.length > 0) {
      const preferred =
        templateRows.find((template) => template.isDefault && template.isActive) ?? templateRows[0];
      setSelectedTemplateId(preferred.id);
    } else if (
      selectedTemplateId &&
      !templateRows.some((template) => template.id === selectedTemplateId)
    ) {
      setSelectedTemplateId(templateRows[0]?.id ?? null);
    }
  }, [assetKindFilter, eventId, selectedTemplateId]);

  useEffect(() => {
    if (!canManage) return;
    setIsLoading(true);
    refreshDashboard()
      .catch(() => toast.error("Failed to load certificates data."))
      .finally(() => setIsLoading(false));
  }, [canManage, refreshDashboard]);

  useEffect(() => {
    if (!selectedTemplateId) {
      setVersions([]);
      setSelectedVersionId(null);
      setEditorLayout(deepCloneLayout(DEFAULT_CERTIFICATE_LAYOUT));
      setSelectedElementId(null);
      return;
    }

    listCertificateTemplateVersions(eventId, selectedTemplateId)
      .then((versionRows) => {
        setVersions(versionRows);
        const selectedTemplateRow =
          templates.find((template) => template.id === selectedTemplateId) ?? null;
        const preferred =
          versionRows.find((version) => version.id === selectedTemplateRow?.activeVersionId) ??
          versionRows[0] ??
          null;
        setSelectedVersionId(preferred?.id ?? null);
        if (preferred?.layout) {
          setEditorLayout(deepCloneLayout(preferred.layout));
          setSelectedElementId(preferred.layout.elements[0]?.id ?? null);
        } else {
          setEditorLayout(deepCloneLayout(DEFAULT_CERTIFICATE_LAYOUT));
          setSelectedElementId(null);
        }
      })
      .catch(() => {
        toast.error("Failed to load template versions.");
        setVersions([]);
        setSelectedVersionId(null);
      });
  }, [eventId, selectedTemplateId, templates]);

  useEffect(() => {
    if (!selectedVersionId) return;
    const current = versions.find((version) => version.id === selectedVersionId);
    if (!current) return;
    setEditorLayout(deepCloneLayout(current.layout));
    setSelectedElementId(current.layout.elements[0]?.id ?? null);
  }, [selectedVersionId, versions]);

  useEffect(() => {
    const wrapper = canvasWrapperRef.current;
    if (!wrapper) return;
    const updateScale = () => {
      const width = Math.max(wrapper.clientWidth - 32, 1);
      const height = Math.max(wrapper.clientHeight - 32, 1);
      setCanvasScale(
        computeCanvasScale({
          containerWidth: width,
          containerHeight: height,
          canvasWidth: editorLayout.canvas.width,
          canvasHeight: editorLayout.canvas.height,
          maxScale: 1,
        }),
      );
    };
    const observer = new ResizeObserver(updateScale);
    observer.observe(wrapper);
    updateScale();
    return () => observer.disconnect();
  }, [editorLayout.canvas.height, editorLayout.canvas.width]);

  const updateElement = useCallback(
    (elementId: string, updater: (element: CertificateTemplateElement) => CertificateTemplateElement) => {
      setEditorLayout((previous) => ({
        ...previous,
        elements: previous.elements.map((element) =>
          element.id === elementId ? updater(element) : element,
        ),
      }));
    },
    [],
  );

  const onCanvasPointerMove = useCallback(
    (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState) return;
      const wrapper = canvasWrapperRef.current;
      if (!wrapper) return;

      const rect = wrapper.getBoundingClientRect();
      const x = (event.clientX - rect.left) / canvasScale - dragState.pointerOffsetX;
      const y = (event.clientY - rect.top) / canvasScale - dragState.pointerOffsetY;
      const clampedX = Math.max(0, Math.round(x));
      const clampedY = Math.max(0, Math.round(y));

      updateElement(dragState.elementId, (element) => ({
        ...element,
        x: clampedX,
        y: clampedY,
      }));
    },
    [canvasScale, updateElement],
  );

  const onCanvasPointerUp = useCallback(() => {
    dragStateRef.current = null;
  }, []);

  useEffect(() => {
    window.addEventListener("pointermove", onCanvasPointerMove);
    window.addEventListener("pointerup", onCanvasPointerUp);
    return () => {
      window.removeEventListener("pointermove", onCanvasPointerMove);
      window.removeEventListener("pointerup", onCanvasPointerUp);
    };
  }, [onCanvasPointerMove, onCanvasPointerUp]);

  const addElement = useCallback((type: CertificateTemplateElement["type"]) => {
    const id = `${type}_${Math.random().toString(36).slice(2, 10)}`;
    const defaults: CertificateTemplateElement = {
      id,
      type,
      x: 120,
      y: 120,
      width: type === "qr" ? 180 : 420,
      height: type === "qr" ? 180 : 72,
      zIndex: editorLayout.elements.length + 1,
      style: {},
    };

    if (type === "text") {
      defaults.content = "Text";
      defaults.style = { fontSize: 36, color: "#0f172a" };
    }
    if (type === "dynamic_text") {
      defaults.token = "participantName";
      defaults.style = { fontSize: 44, fontWeight: 700, color: "#0f172a" };
    }
    if (type === "image") {
      defaults.assetKey = "";
    }
    if (type === "signature") {
      defaults.signatureSlotKey = editorLayout.signatureSlots[0]?.key ?? "";
      defaults.height = 140;
      defaults.width = 360;
    }
    if (type === "qr") {
      defaults.token = "qrVerificationUrl";
    }

    setEditorLayout((previous) => ({
      ...previous,
      elements: [...previous.elements, defaults],
    }));
    setSelectedElementId(id);
  }, [editorLayout.elements.length, editorLayout.signatureSlots]);

  const removeSelectedElement = useCallback(() => {
    if (!selectedElementId) return;
    setEditorLayout((previous) => ({
      ...previous,
      elements: previous.elements.filter((element) => element.id !== selectedElementId),
    }));
    setSelectedElementId(null);
  }, [selectedElementId]);

  const saveAsNewVersion = useCallback(async () => {
    if (!selectedTemplateId) {
      toast.error("Select a template first.");
      return;
    }
    setIsSavingVersion(true);
    try {
      const createdVersion = await createCertificateTemplateVersion(
        eventId,
        selectedTemplateId,
        editorLayout,
        csrfToken ?? undefined,
      );
      const versionRows = await listCertificateTemplateVersions(eventId, selectedTemplateId);
      setVersions(versionRows);
      setSelectedVersionId(createdVersion.id);
      toast.success(`Saved version ${createdVersion.versionNumber}.`);
    } catch {
      toast.error("Failed to save template version.");
    } finally {
      setIsSavingVersion(false);
    }
  }, [csrfToken, editorLayout, eventId, selectedTemplateId]);

  const activateVersion = useCallback(
    async (versionId: string) => {
      if (!selectedTemplateId) return;
      try {
        await activateCertificateTemplateVersion(
          eventId,
          selectedTemplateId,
          versionId,
          csrfToken ?? undefined,
        );
        await refreshDashboard();
        toast.success("Activated template version.");
      } catch {
        toast.error("Failed to activate version.");
      }
    },
    [csrfToken, eventId, refreshDashboard, selectedTemplateId],
  );

  const createTemplateFromDialog = useCallback(async () => {
    const name = createName.trim();
    const typeLabel = createTypeLabel.trim();
    const typeKey = slugifyTypeKey(createTypeKey || createTypeLabel);
    if (!name || !typeLabel || !typeKey) {
      toast.error("Name, type key and type label are required.");
      return;
    }

    try {
      const created = await createCertificateTemplate(
        eventId,
        {
          name,
          typeKey,
          typeLabel,
          description: "",
          isDefault: templates.filter((template) => template.typeKey === typeKey).length === 0,
          layout: deepCloneLayout(DEFAULT_CERTIFICATE_LAYOUT),
        },
        csrfToken ?? undefined,
      );
      handleCreateDialogOpenChange(false);
      await refreshDashboard();
      setSelectedTemplateId(created.id);
      toast.success("Template created.");
    } catch {
      toast.error("Failed to create template.");
    }
  }, [
    createName,
    createTypeKey,
    createTypeLabel,
    csrfToken,
    eventId,
    handleCreateDialogOpenChange,
    refreshDashboard,
    templates,
  ]);

  const toggleTemplateDefault = useCallback(
    async (template: CertificateTemplateSummary) => {
      try {
        await updateCertificateTemplate(
          eventId,
          template.id,
          { isDefault: true },
          csrfToken ?? undefined,
        );
        await refreshDashboard();
      } catch {
        toast.error("Failed to update default template.");
      }
    },
    [csrfToken, eventId, refreshDashboard],
  );

  const toggleTemplateArchive = useCallback(
    async (template: CertificateTemplateSummary) => {
      try {
        await updateCertificateTemplate(
          eventId,
          template.id,
          { isActive: !template.isActive },
          csrfToken ?? undefined,
        );
        await refreshDashboard();
      } catch {
        toast.error("Failed to update template status.");
      }
    },
    [csrfToken, eventId, refreshDashboard],
  );

  const refreshJobsAndHistory = useCallback(async () => {
    setIsRefreshingJobs(true);
    try {
      const [issuedRows, jobRows] = await Promise.all([
        listIssuedCertificates(eventId, { limit: 100 }),
        listCertificateRenderJobs(eventId, { limit: 100 }),
      ]);
      setIssuedCertificates(issuedRows);
      setRenderJobs(jobRows);
    } catch {
      toast.error("Failed to refresh issuance queues.");
    } finally {
      setIsRefreshingJobs(false);
    }
  }, [eventId]);

  const onUploadAsset = useCallback(
    async (file: File, kind: Exclude<AssetKind, "all">) => {
      setIsUploadingAsset(true);
      try {
        await uploadCertificateAsset(eventId, file, kind, csrfToken ?? undefined);
        const rows = await listCertificateAssets(eventId, assetKindFilter);
        setAssets(rows);
        toast.success("Asset uploaded.");
      } catch {
        toast.error("Asset upload failed.");
      } finally {
        setIsUploadingAsset(false);
      }
    },
    [assetKindFilter, csrfToken, eventId],
  );

  const onDeleteAsset = useCallback(
    async (asset: CertificateAsset) => {
      if (!window.confirm("Delete this asset? This cannot be undone.")) return;
      try {
        await deleteCertificateAsset(eventId, asset.id, csrfToken ?? undefined);
        setAssets((previous) => previous.filter((item) => item.id !== asset.id));
      } catch {
        toast.error("Failed to delete asset.");
      }
    },
    [csrfToken, eventId],
  );

  useEffect(() => {
    if (!canManage) return;
    listCertificateAssets(eventId, assetKindFilter)
      .then(setAssets)
      .catch(() => toast.error("Failed to load assets."));
  }, [assetKindFilter, canManage, eventId]);

  const applyAssetToSelection = useCallback(
    (asset: CertificateAsset) => {
      if (selectedElement?.type === "image") {
        updateElement(selectedElement.id, (element) => ({
          ...element,
          assetKey: asset.storageKey,
        }));
        return;
      }
      if (selectedElement?.type === "signature") {
        const slotKey = selectedElement.signatureSlotKey ?? "";
        if (!slotKey) return;
        setEditorLayout((previous) => ({
          ...previous,
          signatureSlots: previous.signatureSlots.map((slot) =>
            slot.key === slotKey ? { ...slot, assetKey: asset.storageKey } : slot,
          ),
        }));
        return;
      }
      setEditorLayout((previous) => ({
        ...previous,
        canvas: {
          ...previous.canvas,
          backgroundAssetKey: asset.storageKey,
        },
      }));
    },
    [selectedElement, updateElement],
  );

  const addSignatureSlot = useCallback(() => {
    const key = `signature_${Math.random().toString(36).slice(2, 8)}`;
    const slot: CertificateSignatureSlot = {
      key,
      label: "Signatory",
      signerName: "",
      signerTitle: "",
      assetKey: "",
    };
    setEditorLayout((previous) => ({
      ...previous,
      signatureSlots: [...previous.signatureSlots, slot],
    }));
  }, []);

  const updateSignatureSlot = useCallback(
    (slotKey: string, updater: (slot: CertificateSignatureSlot) => CertificateSignatureSlot) => {
      setEditorLayout((previous) => ({
        ...previous,
        signatureSlots: previous.signatureSlots.map((slot) =>
          slot.key === slotKey ? updater(slot) : slot,
        ),
      }));
    },
    [],
  );

  const issueSampleApplications = useCallback(async () => {
    if (!selectedTemplateId) {
      toast.error("Select a template.");
      return;
    }
    const rawIds = window.prompt(
      "Enter application IDs separated by commas. Certificates are issued manually.",
    );
    if (!rawIds) return;
    const applicationIds = rawIds
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    if (applicationIds.length === 0) {
      toast.error("No application IDs provided.");
      return;
    }
    try {
      const result = await issueCertificatesBulk(
        eventId,
        {
          templateId: selectedTemplateId,
          templateVersionId: selectedVersionId ?? undefined,
          applicationIds,
        },
        csrfToken ?? undefined,
      );
      toast.success(
        `Issued: ${result.issued}, already issued: ${result.alreadyIssued}, failed: ${result.failed.length}.`,
      );
      await refreshJobsAndHistory();
    } catch {
      toast.error("Certificate issuance failed.");
    }
  }, [csrfToken, eventId, refreshJobsAndHistory, selectedTemplateId, selectedVersionId]);

  const clearDrawCanvas = useCallback(() => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  useEffect(() => {
    if (!showDrawSignatureDialog) return;
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "#111827";
    context.lineWidth = 2.5;
    context.lineJoin = "round";
    context.lineCap = "round";
  }, [showDrawSignatureDialog]);

  const drawSignaturePointerStart = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
    isDrawingRef.current = true;
    lastPointRef.current = { x, y };
  }, []);

  const drawSignaturePointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
    const last = lastPointRef.current;
    if (!last) {
      lastPointRef.current = { x, y };
      return;
    }
    context.beginPath();
    context.moveTo(last.x, last.y);
    context.lineTo(x, y);
    context.stroke();
    lastPointRef.current = { x, y };
  }, []);

  const drawSignaturePointerEnd = useCallback(() => {
    isDrawingRef.current = false;
    lastPointRef.current = null;
  }, []);

  const saveDrawnSignature = useCallback(async () => {
    if (!drawingSlotKey) {
      toast.error("Select a signature slot first.");
      return;
    }
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((value) => resolve(value), "image/png"),
    );
    if (!blob) {
      toast.error("Could not generate signature image.");
      return;
    }
    const file = new File([blob], `signature-${Date.now()}.png`, {
      type: "image/png",
    });
    try {
      const asset = await uploadCertificateAsset(
        eventId,
        file,
        "signature",
        csrfToken ?? undefined,
      );
      updateSignatureSlot(drawingSlotKey, (slot) => ({
        ...slot,
        assetKey: asset.storageKey,
      }));
      handleDrawSignatureDialogOpenChange(false);
      toast.success("Signature saved.");
      const rows = await listCertificateAssets(eventId, assetKindFilter);
      setAssets(rows);
    } catch {
      toast.error("Failed to save signature.");
    }
  }, [
    assetKindFilter,
    csrfToken,
    drawingSlotKey,
    eventId,
    handleDrawSignatureDialogOpenChange,
    updateSignatureSlot,
  ]);

  if (!canManage) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Certificates"
          description="You do not have permission to manage certificates for this event."
        />
      </div>
    );
  }

  const canvasBackgroundImage = resolveAssetUrl(editorLayout.canvas.backgroundAssetKey);
  const templateLibraryScrollClass = "h-[min(62svh,700px)] pr-2";

  const renderTemplateLibraryPanel = (className?: string) => (
    <Card className={`min-h-0 ${className ?? ""}`.trim()}>
      <CardHeader className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Template Library</CardTitle>
          <Badge variant="outline" className="text-[10px]">
            {visibleTemplatesCount}/{templates.length} shown
          </Badge>
        </div>
        <Input
          value={templateSearch}
          onChange={(event) => setTemplateSearch(event.target.value)}
          placeholder="Search by template name, type, or key"
          className="h-8"
        />
      </CardHeader>
      <CardContent className="space-y-3">
        <Accordion type="multiple" defaultValue={["templates", "versions"]} className="w-full space-y-2">
          <AccordionItem value="templates" className="rounded-md border px-3 last:border">
            <AccordionTrigger className="py-3 hover:no-underline">
              <div className="flex items-center gap-2">
                <span className="text-sm">Templates</span>
                <Badge variant="secondary" className="text-[10px]">
                  {visibleTemplatesCount}
                </Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-3">
              <ScrollArea className={templateLibraryScrollClass}>
                <div className="space-y-3 pr-2">
                  {visibleTemplateGroups.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {normalizedTemplateSearch
                        ? "No templates match your search."
                        : "No templates yet. Create your first certificate template."}
                    </p>
                  ) : (
                    <Accordion
                      type="multiple"
                      className="w-full space-y-2"
                      defaultValue={visibleTemplateGroups.map((group) => `group-${group.typeKey}`)}
                    >
                      {visibleTemplateGroups.map((group) => (
                        <AccordionItem
                          key={group.typeKey}
                          value={`group-${group.typeKey}`}
                          className="rounded-md border px-2 last:border"
                        >
                          <AccordionTrigger className="py-2 hover:no-underline">
                            <div className="flex w-full items-center gap-2">
                              <span className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                {group.typeLabel}
                              </span>
                              <Badge variant="secondary" className="text-[10px]">
                                {group.templates.length}
                              </Badge>
                              <Badge variant="outline" className="text-[10px]">
                                {group.typeKey}
                              </Badge>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="pb-2">
                            <div className="space-y-2">
                              {group.templates.map((template) => (
                                <button
                                  type="button"
                                  key={template.id}
                                  className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${
                                    selectedTemplateId === template.id
                                      ? "border-primary bg-primary/5"
                                      : "border-border hover:border-primary/50"
                                  }`}
                                  onClick={() => {
                                    setSelectedTemplateId(template.id);
                                    setShowTemplateLibrarySheet(false);
                                  }}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div>
                                      <p className="text-sm font-medium">{template.name}</p>
                                      <p className="text-xs text-muted-foreground">
                                        v{template.activeVersionNumber ?? "-"}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      {template.isDefault && (
                                        <Badge className="text-[10px]">Default</Badge>
                                      )}
                                      {!template.isActive && (
                                        <Badge variant="secondary" className="text-[10px]">
                                          Archived
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                  <div className="mt-2 flex flex-wrap items-center gap-1">
                                    {!template.isDefault && template.isActive && (
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="h-6 text-[10px]"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          void toggleTemplateDefault(template);
                                        }}
                                      >
                                        Set default
                                      </Button>
                                    )}
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="h-6 text-[10px]"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        void toggleTemplateArchive(template);
                                      }}
                                    >
                                      {template.isActive ? "Archive" : "Restore"}
                                    </Button>
                                  </div>
                                </button>
                              ))}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  )}
                </div>
              </ScrollArea>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="versions" className="rounded-md border px-3 last:border">
            <AccordionTrigger className="py-3 hover:no-underline">
              <div className="flex items-center gap-2">
                <span className="text-sm">Versions</span>
                <Badge variant="outline" className="text-[10px]">
                  {versions.length}
                </Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-3">
              <div className="space-y-2">
                <Select
                  value={selectedVersionId ?? ""}
                  onValueChange={(value) => setSelectedVersionId(value)}
                  disabled={versions.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select version" />
                  </SelectTrigger>
                  <SelectContent>
                    {versions.map((version) => (
                      <SelectItem key={version.id} value={version.id}>
                        Version {version.versionNumber}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={saveAsNewVersion}
                    disabled={!selectedTemplateId || isSavingVersion}
                  >
                    {isSavingVersion ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Save version
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!selectedTemplateId || !selectedVersionId}
                    onClick={() => selectedVersionId && void activateVersion(selectedVersionId)}
                  >
                    Activate
                  </Button>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );

  const renderInspectorPanel = (className?: string) => (
    <Card className={`min-h-0 ${className ?? ""}`.trim()}>
      <CardHeader className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Inspector</CardTitle>
          <Badge variant="outline" className="text-[10px]">
            {editorLayout.elements.length} elements
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {selectedElement
            ? `Editing ${buildElementLabel(selectedElement)}`
            : "Select an element to start editing settings."}
        </p>
      </CardHeader>
      <CardContent className="max-h-[min(78svh,920px)] space-y-5 overflow-y-auto pr-2">
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            disabled={!selectedElementId}
            onClick={removeSelectedElement}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Remove
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={() => setShowDrawSignatureDialog(true)}
          >
            <Signature className="mr-1.5 h-3.5 w-3.5" />
            Draw signature
          </Button>
        </div>

        <Accordion
          type="multiple"
          defaultValue={["layers", "element", "background", "signatures"]}
          className="w-full space-y-2"
        >
          <AccordionItem value="layers" className="rounded-md border px-3 last:border">
            <AccordionTrigger className="py-3 hover:no-underline">
              <div className="flex items-center gap-2">
                <span className="text-sm">Layers</span>
                <Badge variant="secondary" className="text-[10px]">
                  {sortedElementsByLayer.length}
                </Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-3">
              {sortedElementsByLayer.length === 0 ? (
                <p className="text-sm text-muted-foreground">No elements on canvas yet.</p>
              ) : (
                <ScrollArea className="h-[min(28svh,220px)] rounded-md border p-2">
                  <div className="space-y-2 pr-1">
                    {sortedElementsByLayer.map((element) => (
                      <button
                        key={element.id}
                        type="button"
                        className={`w-full rounded-md border px-2 py-1.5 text-left transition-colors ${
                          selectedElementId === element.id
                            ? "border-primary bg-primary/10"
                            : "border-border hover:border-primary/50"
                        }`}
                        onClick={() => setSelectedElementId(element.id)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm">{buildElementLabel(element)}</span>
                          <span className="text-[11px] text-muted-foreground">
                            z{element.zIndex ?? 0}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="element" className="rounded-md border px-3 last:border">
            <AccordionTrigger className="py-3 hover:no-underline">
              <div className="flex items-center gap-2">
                <span className="text-sm">Element Settings</span>
                {selectedElement ? (
                  <Badge variant="outline" className="text-[10px]">
                    {selectedElement.type}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]">
                    none selected
                  </Badge>
                )}
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-3">
              {!selectedElement ? (
                <p className="text-sm text-muted-foreground">
                  Select an element on the canvas or from the Layers list.
                </p>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label>Element</Label>
                    <Input value={buildElementLabel(selectedElement)} disabled />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="space-y-1">
                      <span className="text-xs text-muted-foreground">X</span>
                      <Input
                        type="number"
                        value={selectedElement.x}
                        onChange={(event) =>
                          updateElement(selectedElement.id, (element) => ({
                            ...element,
                            x: Number(event.target.value || 0),
                          }))
                        }
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs text-muted-foreground">Y</span>
                      <Input
                        type="number"
                        value={selectedElement.y}
                        onChange={(event) =>
                          updateElement(selectedElement.id, (element) => ({
                            ...element,
                            y: Number(event.target.value || 0),
                          }))
                        }
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs text-muted-foreground">Width</span>
                      <Input
                        type="number"
                        value={selectedElement.width}
                        onChange={(event) =>
                          updateElement(selectedElement.id, (element) => ({
                            ...element,
                            width: Number(event.target.value || 1),
                          }))
                        }
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs text-muted-foreground">Height</span>
                      <Input
                        type="number"
                        value={selectedElement.height}
                        onChange={(event) =>
                          updateElement(selectedElement.id, (element) => ({
                            ...element,
                            height: Number(event.target.value || 1),
                          }))
                        }
                      />
                    </label>
                  </div>

                  {(selectedElement.type === "text" || selectedElement.type === "dynamic_text") && (
                    <label className="space-y-1">
                      <span className="text-xs text-muted-foreground">
                        {selectedElement.type === "text" ? "Content" : "Token"}
                      </span>
                      <Input
                        value={
                          selectedElement.type === "text"
                            ? selectedElement.content ?? ""
                            : selectedElement.token ?? ""
                        }
                        onChange={(event) =>
                          updateElement(selectedElement.id, (element) =>
                            element.type === "text"
                              ? { ...element, content: event.target.value }
                              : { ...element, token: event.target.value },
                          )
                        }
                      />
                    </label>
                  )}

                  {selectedElement.type === "qr" && (
                    <label className="space-y-1">
                      <span className="text-xs text-muted-foreground">QR token field</span>
                      <Input
                        value={selectedElement.token ?? ""}
                        onChange={(event) =>
                          updateElement(selectedElement.id, (element) => ({
                            ...element,
                            token: event.target.value,
                          }))
                        }
                      />
                    </label>
                  )}

                  {selectedElement.type === "image" && (
                    <label className="space-y-1">
                      <span className="text-xs text-muted-foreground">Asset key</span>
                      <Input
                        value={selectedElement.assetKey ?? ""}
                        onChange={(event) =>
                          updateElement(selectedElement.id, (element) => ({
                            ...element,
                            assetKey: event.target.value,
                          }))
                        }
                      />
                    </label>
                  )}

                  {selectedElement.type === "signature" && (
                    <label className="space-y-1">
                      <span className="text-xs text-muted-foreground">Signature slot</span>
                      <Select
                        value={selectedElement.signatureSlotKey ?? ""}
                        onValueChange={(value) =>
                          updateElement(selectedElement.id, (element) => ({
                            ...element,
                            signatureSlotKey: value,
                          }))
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select slot" />
                        </SelectTrigger>
                        <SelectContent>
                          {editorLayout.signatureSlots.map((slot) => (
                            <SelectItem key={slot.key} value={slot.key}>
                              {slot.label} ({slot.key})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>
                  )}

                  {selectedElementSupportsTypography && (
                    <div className="space-y-2 rounded-md border border-dashed p-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Typography
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="space-y-1">
                          <span className="text-xs text-muted-foreground">Font size</span>
                          <Input
                            type="number"
                            value={getStyleNumber(selectedElement.style, "fontSize", 32)}
                            onChange={(event) =>
                              updateElement(selectedElement.id, (element) => ({
                                ...element,
                                style: {
                                  ...(element.style ?? {}),
                                  fontSize: Number(event.target.value || 0),
                                },
                              }))
                            }
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-xs text-muted-foreground">Font weight</span>
                          <Input
                            type="number"
                            value={getStyleNumber(selectedElement.style, "fontWeight", 500)}
                            onChange={(event) =>
                              updateElement(selectedElement.id, (element) => ({
                                ...element,
                                style: {
                                  ...(element.style ?? {}),
                                  fontWeight: Number(event.target.value || 0),
                                },
                              }))
                            }
                          />
                        </label>
                      </div>
                      <label className="space-y-1">
                        <span className="text-xs text-muted-foreground">Text color</span>
                        <Input
                          type="color"
                          value={getStyleString(selectedElement.style, "color", "#0f172a")}
                          onChange={(event) =>
                            updateElement(selectedElement.id, (element) => ({
                              ...element,
                              style: {
                                ...(element.style ?? {}),
                                color: event.target.value,
                              },
                            }))
                          }
                        />
                      </label>
                    </div>
                  )}
                </div>
              )}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="background" className="rounded-md border px-3 last:border">
            <AccordionTrigger className="py-3 hover:no-underline">
              <span className="text-sm">Background</span>
            </AccordionTrigger>
            <AccordionContent className="space-y-2 pb-3">
              <div className="flex items-center justify-between">
                <Label>Canvas background</Label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setEditorLayout((previous) => ({
                      ...previous,
                      canvas: { ...previous.canvas, backgroundAssetKey: "" },
                    }))
                  }
                >
                  Clear
                </Button>
              </div>
              <Input
                value={editorLayout.canvas.backgroundAssetKey ?? ""}
                onChange={(event) =>
                  setEditorLayout((previous) => ({
                    ...previous,
                    canvas: {
                      ...previous.canvas,
                      backgroundAssetKey: event.target.value,
                    },
                  }))
                }
                placeholder="Storage key"
              />
              <Input
                type="color"
                value={editorLayout.canvas.backgroundColor ?? "#ffffff"}
                onChange={(event) =>
                  setEditorLayout((previous) => ({
                    ...previous,
                    canvas: {
                      ...previous.canvas,
                      backgroundColor: event.target.value,
                    },
                  }))
                }
              />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="signatures" className="rounded-md border px-3 last:border">
            <AccordionTrigger className="py-3 hover:no-underline">
              <div className="flex items-center gap-2">
                <span className="text-sm">Signature Slots</span>
                <Badge variant="outline" className="text-[10px]">
                  {editorLayout.signatureSlots.length}
                </Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="space-y-2 pb-3">
              <div className="flex items-center justify-between">
                <Label>Slot configuration</Label>
                <Button size="sm" variant="outline" onClick={addSignatureSlot}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Slot
                </Button>
              </div>
              <ScrollArea className="h-[min(28svh,260px)] rounded-md border p-2">
                <div className="space-y-3 pr-1">
                  {editorLayout.signatureSlots.map((slot) => (
                    <div key={slot.key} className="space-y-1 rounded border p-2">
                      <Input
                        value={slot.label}
                        onChange={(event) =>
                          updateSignatureSlot(slot.key, (current) => ({
                            ...current,
                            label: event.target.value,
                          }))
                        }
                        placeholder="Label"
                        className="h-8"
                      />
                      <Input
                        value={slot.signerName ?? ""}
                        onChange={(event) =>
                          updateSignatureSlot(slot.key, (current) => ({
                            ...current,
                            signerName: event.target.value,
                          }))
                        }
                        placeholder="Signer name"
                        className="h-8"
                      />
                      <Input
                        value={slot.signerTitle ?? ""}
                        onChange={(event) =>
                          updateSignatureSlot(slot.key, (current) => ({
                            ...current,
                            signerTitle: event.target.value,
                          }))
                        }
                        placeholder="Signer title"
                        className="h-8"
                      />
                      <Input
                        value={slot.assetKey ?? ""}
                        onChange={(event) =>
                          updateSignatureSlot(slot.key, (current) => ({
                            ...current,
                            assetKey: event.target.value,
                          }))
                        }
                        placeholder="Signature asset key"
                        className="h-8"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => {
                          setDrawingSlotKey(slot.key);
                          setShowDrawSignatureDialog(true);
                        }}
                      >
                        Draw for slot
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Certificates"
        description="Manage certificate templates, assets, manual issuance, and render queues."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={refreshJobsAndHistory} disabled={isRefreshingJobs}>
            {isRefreshingJobs ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-4 w-4" />
            )}
            Refresh status
          </Button>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            New template
          </Button>
        </div>
      </PageHeader>

      {isLoading ? (
        <Card>
          <CardContent className="py-14 text-center text-muted-foreground">
            <Loader2 className="mx-auto h-6 w-6 animate-spin" />
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="studio" className="space-y-4">
          <TabsList>
            <TabsTrigger value="studio">Studio</TabsTrigger>
            <TabsTrigger value="assets">Assets</TabsTrigger>
            <TabsTrigger value="issuance">Issuance</TabsTrigger>
          </TabsList>

          <TabsContent value="studio" className="space-y-4">
            <div className="flex flex-wrap gap-2 xl:hidden">
              <Button variant="outline" onClick={() => setShowTemplateLibrarySheet(true)}>
                <PanelLeft className="mr-1.5 h-4 w-4" />
                Template Library
              </Button>
              <Button variant="outline" onClick={() => setShowInspectorSheet(true)}>
                <SlidersHorizontal className="mr-1.5 h-4 w-4" />
                Inspector
              </Button>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-md border bg-muted/20 p-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Templates
                </p>
                <p className="text-sm font-semibold">{templates.length}</p>
              </div>
              <div className="rounded-md border bg-muted/20 p-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Versions
                </p>
                <p className="text-sm font-semibold">{versions.length}</p>
              </div>
              <div className="rounded-md border bg-muted/20 p-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Canvas Elements
                </p>
                <p className="text-sm font-semibold">{editorLayout.elements.length}</p>
              </div>
              <div className="rounded-md border bg-muted/20 p-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Signature Slots
                </p>
                <p className="text-sm font-semibold">{editorLayout.signatureSlots.length}</p>
              </div>
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(280px,340px)_minmax(0,1fr)] 2xl:grid-cols-[minmax(300px,360px)_minmax(0,1fr)_minmax(320px,380px)]">
              <div className="hidden xl:block">{renderTemplateLibraryPanel()}</div>

              <Card className="min-h-0">
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-base">Canvas Editor</CardTitle>
                    <div className="flex flex-wrap items-center gap-1.5 xl:justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-2.5"
                        onClick={() => addElement("text")}
                      >
                        <FilePlus2 className="mr-1.5 h-3.5 w-3.5" />
                        Text
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-2.5"
                        onClick={() => addElement("dynamic_text")}
                      >
                        <SquarePen className="mr-1.5 h-3.5 w-3.5" />
                        Token
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-2.5"
                        onClick={() => addElement("image")}
                      >
                        <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
                        Image
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-2.5"
                        onClick={() => addElement("signature")}
                      >
                        <Signature className="mr-1.5 h-3.5 w-3.5" />
                        Signature
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-2.5"
                        onClick={() => addElement("qr")}
                      >
                        <QrCode className="mr-1.5 h-3.5 w-3.5" />
                        QR
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div
                    ref={canvasWrapperRef}
                    className="relative h-[clamp(360px,66svh,840px)] overflow-auto rounded-md border bg-muted/20"
                  >
                    <div
                      className="origin-top-left p-5"
                      style={{
                        width: editorLayout.canvas.width * canvasScale + 40,
                        height: editorLayout.canvas.height * canvasScale + 40,
                      }}
                    >
                      <div
                        className="relative overflow-hidden rounded-md border bg-white shadow-sm"
                        style={{
                          width: editorLayout.canvas.width,
                          height: editorLayout.canvas.height,
                          transform: `scale(${canvasScale})`,
                          transformOrigin: "top left",
                          backgroundColor: editorLayout.canvas.backgroundColor ?? "#ffffff",
                          backgroundImage: canvasBackgroundImage
                            ? `url(${canvasBackgroundImage})`
                            : undefined,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                        }}
                      >
                        {editorLayout.elements
                          .slice()
                          .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
                          .map((element) => {
                            const style = element.style ?? {};
                            const fontSize = getStyleNumber(style, "fontSize", 32);
                            const color = getStyleString(style, "color", "#0f172a");
                            const fontWeight = getStyleNumber(style, "fontWeight", 500);
                            const textAlign = getStyleString(style, "textAlign", "left");
                            let content = "";
                            if (element.type === "text") content = element.content ?? "";
                            if (element.type === "dynamic_text") {
                              content =
                                previewData[(element.token ?? "").trim()] ??
                                `{{${element.token ?? "token"}}}`;
                            }
                            if (element.type === "qr") {
                              content =
                                previewData[(element.token ?? "").trim()] ?? "QR verification URL";
                            }
                            if (element.type === "signature") {
                              const slot =
                                editorLayout.signatureSlots.find(
                                  (item) => item.key === element.signatureSlotKey,
                                ) ?? null;
                              content = slot?.signerName ?? slot?.label ?? "Signature";
                            }
                            const imageUrl =
                              element.type === "image"
                                ? resolveAssetUrl(element.assetKey)
                                : element.type === "signature"
                                  ? resolveAssetUrl(
                                      editorLayout.signatureSlots.find(
                                        (slot) => slot.key === element.signatureSlotKey,
                                      )?.assetKey,
                                    )
                                  : "";

                            return (
                              <button
                                key={element.id}
                                type="button"
                                className={`absolute overflow-hidden rounded-sm border-2 text-left ${
                                  selectedElementId === element.id
                                    ? "border-primary"
                                    : "border-transparent hover:border-primary/40"
                                }`}
                                style={{
                                  left: element.x,
                                  top: element.y,
                                  width: element.width,
                                  height: element.height,
                                  zIndex: element.zIndex ?? 0,
                                }}
                                onPointerDown={(event) => {
                                  const rect = (
                                    event.currentTarget as HTMLButtonElement
                                  ).getBoundingClientRect();
                                  dragStateRef.current = {
                                    elementId: element.id,
                                    pointerOffsetX: (event.clientX - rect.left) / canvasScale,
                                    pointerOffsetY: (event.clientY - rect.top) / canvasScale,
                                  };
                                  setSelectedElementId(element.id);
                                }}
                              >
                                {element.type === "image" || element.type === "signature" ? (
                                  imageUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={imageUrl}
                                      alt={buildElementLabel(element)}
                                      className="h-full w-full object-contain"
                                    />
                                  ) : (
                                    <div className="flex h-full w-full items-center justify-center bg-muted/60 text-xs text-muted-foreground">
                                      {element.type === "image" ? "Image" : "Signature"}
                                    </div>
                                  )
                                ) : element.type === "qr" ? (
                                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-white p-2">
                                    <QrCode className="h-12 w-12 text-slate-700" />
                                    <span className="line-clamp-2 text-center text-[10px] text-slate-500">
                                      {content}
                                    </span>
                                  </div>
                                ) : (
                                  <div
                                    className="h-full w-full p-1"
                                    style={{
                                      fontSize,
                                      color,
                                      fontWeight,
                                      textAlign: textAlign as "left" | "center" | "right",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent:
                                        textAlign === "center"
                                          ? "center"
                                          : textAlign === "right"
                                            ? "flex-end"
                                            : "flex-start",
                                    }}
                                  >
                                    {content}
                                  </div>
                                )}
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  </div>

                  <Accordion
                    type="multiple"
                    defaultValue={["preview-tokens"]}
                    className="rounded-md border bg-muted/20 px-3"
                  >
                    <AccordionItem value="preview-tokens" className="border-0">
                      <AccordionTrigger className="py-3 hover:no-underline">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Preview Tokens
                          </span>
                          <Badge variant="secondary" className="text-[10px]">
                            {Object.keys(previewData).length}
                          </Badge>
                          {tokenValidation.unknown.length > 0 && (
                            <Badge variant="destructive" className="text-[10px]">
                              {tokenValidation.unknown.length} unknown
                            </Badge>
                          )}
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pb-3">
                        <div className="mb-2 flex justify-end">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => setPreviewData({ ...DEFAULT_PREVIEW_DATA })}
                          >
                            Reset values
                          </Button>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {Object.entries(previewData).map(([key, value]) => (
                            <label key={key} className="space-y-1">
                              <span className="text-[11px] text-muted-foreground">{key}</span>
                              <Input
                                value={value}
                                onChange={(event) =>
                                  setPreviewData((previous) => ({
                                    ...previous,
                                    [key]: event.target.value,
                                  }))
                                }
                                className="h-8 text-xs"
                              />
                            </label>
                          ))}
                        </div>
                        {tokenValidation.unknown.length > 0 && (
                          <Alert className="mt-3 border-amber-300 bg-amber-50 text-amber-900">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>
                              Unknown tokens: {tokenValidation.unknown.join(", ")}
                            </AlertDescription>
                          </Alert>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </CardContent>
              </Card>

              <div className="hidden xl:col-span-2 xl:block 2xl:col-span-1">
                {renderInspectorPanel()}
              </div>
            </div>

            <Sheet open={showTemplateLibrarySheet} onOpenChange={setShowTemplateLibrarySheet}>
              <SheetContent side="left" className="w-[min(100vw,440px)] p-0 sm:max-w-none">
                <SheetHeader>
                  <SheetTitle>Template Library</SheetTitle>
                  <SheetDescription>
                    Pick templates, versions, and defaults without leaving the canvas.
                  </SheetDescription>
                </SheetHeader>
                <div className="flex min-h-0 flex-1 overflow-hidden p-4 pt-0">
                  {renderTemplateLibraryPanel("h-full w-full border-0 shadow-none")}
                </div>
              </SheetContent>
            </Sheet>

            <Sheet open={showInspectorSheet} onOpenChange={setShowInspectorSheet}>
              <SheetContent side="right" className="w-[min(100vw,440px)] p-0 sm:max-w-none">
                <SheetHeader>
                  <SheetTitle>Inspector</SheetTitle>
                  <SheetDescription>
                    Edit selected element properties and signature slots.
                  </SheetDescription>
                </SheetHeader>
                <div className="flex min-h-0 flex-1 overflow-hidden p-4 pt-0">
                  {renderInspectorPanel("h-full w-full border-0 shadow-none")}
                </div>
              </SheetContent>
            </Sheet>
          </TabsContent>

          <TabsContent value="assets" className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base">Backgrounds, Signatures, Logos</CardTitle>
                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                    <Select
                      value={assetKindFilter}
                      onValueChange={(value) => setAssetKindFilter(value as AssetKind)}
                    >
                      <SelectTrigger className="w-full sm:w-[170px]">
                        <SelectValue placeholder="Asset kind" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="background">Backgrounds</SelectItem>
                        <SelectItem value="signature">Signatures</SelectItem>
                        <SelectItem value="logo">Logos</SelectItem>
                        <SelectItem value="image">Images</SelectItem>
                      </SelectContent>
                    </Select>
                    <label className="inline-flex w-full sm:w-auto">
                      <input
                        type="file"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (!file) return;
                          const kind = assetKindFilter === "all" ? "image" : assetKindFilter;
                          void onUploadAsset(file, kind);
                          event.target.value = "";
                        }}
                        disabled={isUploadingAsset}
                      />
                      <Button asChild variant="outline" disabled={isUploadingAsset} className="w-full sm:w-auto">
                        <span>
                          {isUploadingAsset ? (
                            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                          ) : (
                            <Upload className="mr-1.5 h-4 w-4" />
                          )}
                          Upload asset
                        </span>
                      </Button>
                    </label>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {assets.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No assets available.</p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {assets.map((asset) => (
                      <div key={asset.id} className="space-y-2 rounded-md border p-3">
                        <div className="aspect-video overflow-hidden rounded bg-muted/40">
                          {asset.mimeType.startsWith("image/") ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={resolveAssetUrl(asset.storageKey)}
                              alt={asset.originalFilename}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                              {asset.mimeType}
                            </div>
                          )}
                        </div>
                        <div className="space-y-1">
                          <p className="truncate text-sm font-medium">{asset.originalFilename}</p>
                          <p className="truncate text-xs text-muted-foreground">{asset.storageKey}</p>
                          <div className="flex items-center justify-between">
                            <Badge variant="outline" className="text-[10px]">
                              {asset.kind}
                            </Badge>
                            <span className="text-[11px] text-muted-foreground">
                              {formatDateTime(asset.createdAt)}
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            onClick={() => applyAssetToSelection(asset)}
                          >
                            Apply
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => void onDeleteAsset(asset)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="issuance" className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base">Manual Issuance</CardTitle>
                  <Button
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={issueSampleApplications}
                    disabled={!selectedTemplateId}
                  >
                    <Download className="mr-1.5 h-4 w-4" />
                    Issue by IDs
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {!selectedTemplate ? (
                  <p className="text-sm text-muted-foreground">
                    Select a template in Studio first.
                  </p>
                ) : (
                  <div className="rounded-md border p-3 text-sm">
                    <p className="font-medium">{selectedTemplate.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Type {selectedTemplate.typeLabel} ({selectedTemplate.typeKey}) - Active
                      version {selectedTemplate.activeVersionNumber ?? "-"}
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Issued Certificates</p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={refreshJobsAndHistory}
                      disabled={isRefreshingJobs}
                    >
                      {isRefreshingJobs ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      Refresh
                    </Button>
                  </div>
                  <ScrollArea className="h-[min(36svh,340px)] rounded-md border">
                    <div className="divide-y">
                      {issuedCertificates.length === 0 ? (
                        <p className="p-3 text-sm text-muted-foreground">
                          No certificates issued yet.
                        </p>
                      ) : (
                        issuedCertificates.map((item) => (
                          <div key={item.id} className="space-y-1 p-3 text-sm">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <Badge variant={item.status === "ISSUED" ? "default" : "secondary"}>
                                  {item.status}
                                </Badge>
                                <span className="font-medium">{item.certificateTypeLabel}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                {item.renderStatus === "DONE" ? (
                                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                ) : item.renderStatus === "FAILED" ? (
                                  <AlertCircle className="h-4 w-4 text-red-600" />
                                ) : (
                                  <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
                                )}
                                <span className="text-xs text-muted-foreground">
                                  {item.renderStatus}
                                </span>
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Application {item.applicationId} - {formatDateTime(item.issuedAt)}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              <Button size="sm" variant="outline" asChild>
                                <a href={item.certificateUrl} target="_blank" rel="noreferrer">
                                  Open certificate
                                </a>
                              </Button>
                              {item.status === "ISSUED" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    void revokeIssuedCertificate(
                                      eventId,
                                      item.id,
                                      "Revoked by organizer",
                                      csrfToken ?? undefined,
                                    ).then(() => refreshJobsAndHistory())
                                  }
                                >
                                  Revoke
                                </Button>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Render Jobs</p>
                  <ScrollArea className="h-[min(36svh,340px)] rounded-md border">
                    <div className="divide-y">
                      {renderJobs.length === 0 ? (
                        <p className="p-3 text-sm text-muted-foreground">No render jobs.</p>
                      ) : (
                        renderJobs.map((job) => (
                          <div key={job.id} className="space-y-1 p-3 text-sm">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium">{job.status}</span>
                              <span className="text-xs text-muted-foreground">
                                Attempts {job.attempts}/{job.maxAttempts}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Next retry: {formatDateTime(job.nextRetryAt)}
                            </p>
                            {job.errorMessage && (
                              <p className="text-xs text-red-600">{job.errorMessage}</p>
                            )}
                            {job.status === "FAILED" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  void retryCertificateRenderJob(
                                    eventId,
                                    job.id,
                                    csrfToken ?? undefined,
                                  ).then(() => refreshJobsAndHistory())
                                }
                              >
                                Retry job
                              </Button>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={showCreateDialog} onOpenChange={handleCreateDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Template</DialogTitle>
            <DialogDescription>
              Create a new certificate type template and start from the default layout.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="space-y-1">
              <span className="text-sm">Template name</span>
              <Input
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
                placeholder="Participation Certificate"
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm">Type label</span>
              <Input
                value={createTypeLabel}
                onChange={(event) => {
                  const value = event.target.value;
                  setCreateTypeLabel(value);
                  if (!createTypeKey.trim()) setCreateTypeKey(slugifyTypeKey(value));
                }}
                placeholder="Participation"
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm">Type key</span>
              <Input
                value={createTypeKey}
                onChange={(event) => setCreateTypeKey(slugifyTypeKey(event.target.value))}
                placeholder="participation"
              />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleCreateDialogOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={() => void createTemplateFromDialog()}>Create template</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDrawSignatureDialog} onOpenChange={handleDrawSignatureDialogOpenChange}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Draw Organizer Signature</DialogTitle>
            <DialogDescription>
              Draw a signature and attach it to a signature slot in this template.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="space-y-1">
              <span className="text-sm">Signature slot</span>
              <Select value={drawingSlotKey} onValueChange={setDrawingSlotKey}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select slot" />
                </SelectTrigger>
                <SelectContent>
                  {editorLayout.signatureSlots.map((slot) => (
                    <SelectItem key={slot.key} value={slot.key}>
                      {slot.label} ({slot.key})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <div className="overflow-hidden rounded-md border">
              <canvas
                ref={drawCanvasRef}
                width={1200}
                height={400}
                className="h-56 w-full touch-none bg-white"
                onPointerDown={drawSignaturePointerStart}
                onPointerMove={drawSignaturePointerMove}
                onPointerUp={drawSignaturePointerEnd}
                onPointerLeave={drawSignaturePointerEnd}
              />
            </div>
            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={clearDrawCanvas}>
                Clear
              </Button>
              <Button onClick={() => void saveDrawnSignature()}>Save signature</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

