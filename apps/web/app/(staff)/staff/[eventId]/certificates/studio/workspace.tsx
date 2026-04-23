"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Monitor } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { useAuth, usePermissions } from "@/lib/auth-context";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_CERTIFICATE_LAYOUT,
  CERTIFICATE_DYNAMIC_TOKENS,
  activateCertificateTemplateVersion,
  createCertificateTemplate,
  deleteCertificateAsset,
  deleteCertificateTemplate,
  deleteCertificateTemplateVersion,
  duplicateCertificateTemplate,
  getCertificateTemplateDraft,
  listCertificateAssets,
  listCertificateTemplateVersions,
  listCertificateTemplates,
  publishCertificateTemplate,
  updateCertificateTemplate,
  updateCertificateTemplateDraft,
  uploadCertificateAsset,
  type CertificateAsset,
  type CertificateLayout,
  type CertificateTemplateElement,
  type CertificateTemplateSummary,
  type CertificateTemplateVersion,
} from "@/lib/certificates";
import {
  addElement,
  addSignatureSlot,
  alignSelection,
  applyElementPatches,
  commitHistory,
  createEditorHistory,
  deleteSelection,
  distributeSelection,
  duplicateSelection,
  nudgeSelection,
  redoHistory,
  removeSignatureSlot,
  reorderSelection,
  undoHistory,
  updateLayoutCanvas,
  updateSignatureSlot,
  type AlignMode,
  type DistributeAxis,
} from "./editor-store";
import { EditorCanvas } from "./editor-canvas";
import { InspectorPanel } from "./inspector-panel";
import { LeftRail } from "./left-rail";
import { TopCommandBar } from "./top-command-bar";
import {
  createElementDraft,
  deepCloneLayout,
  DEFAULT_PREVIEW_DATA,
  isInputLikeTarget,
  slugifyTypeKey,
  type AssetMode,
  type LeftRailView,
  type PreviewData,
} from "./utils";

interface CertificateStudioWorkspaceProps {
  eventId: string;
}

function layoutHash(layout: CertificateLayout): string {
  return JSON.stringify(layout);
}

function deriveFontFamilyFromAsset(asset: CertificateAsset): string {
  const baseName = asset.originalFilename.replace(/\.[a-z0-9]+$/i, "");
  const normalized = baseName.replace(/[_-]+/g, " ").trim();
  return normalized.length > 0 ? normalized : "Uploaded Font";
}

export function CertificateStudioWorkspace(props: CertificateStudioWorkspaceProps) {
  const { eventId } = props;
  const { csrfToken } = useAuth();
  const { hasPermission } = usePermissions(eventId);
  const canManage = hasPermission("event.update");

  const [templates, setTemplates] = useState<CertificateTemplateSummary[]>([]);
  const [versions, setVersions] = useState<CertificateTemplateVersion[]>([]);
  const [assets, setAssets] = useState<CertificateAsset[]>([]);

  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);

  const [history, setHistory] = useState(() => createEditorHistory(deepCloneLayout(DEFAULT_CERTIFICATE_LAYOUT)));
  const layout = history.present;

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [previewData, setPreviewData] = useState<PreviewData>(DEFAULT_PREVIEW_DATA);

  const [view, setView] = useState<LeftRailView>("templates");
  const [assetMode, setAssetMode] = useState<AssetMode>("background");
  const [assetKindFilter, setAssetKindFilter] = useState<"all" | "background" | "signature" | "logo" | "image" | "font">("all");
  const [assetSearch, setAssetSearch] = useState("");

  const [templateNameDraft, setTemplateNameDraft] = useState("Participation Certificate");
  const [typeLabelDraft, setTypeLabelDraft] = useState("Participation");
  const [typeKeyDraft, setTypeKeyDraft] = useState("participation");

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);
  const [isBusyTemplateAction, setIsBusyTemplateAction] = useState(false);
  const [isBusyVersionAction, setIsBusyVersionAction] = useState(false);
  const [isUploadingAsset, setIsUploadingAsset] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  const [isDraftReady, setIsDraftReady] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [draftRevision, setDraftRevision] = useState(0);
  const [hasConflict, setHasConflict] = useState(false);
  const [savedHash, setSavedHash] = useState(() => layoutHash(DEFAULT_CERTIFICATE_LAYOUT));

  const [zoomPercent, setZoomPercent] = useState(100);
  const [fitRequestId, setFitRequestId] = useState(0);
  const [isLeftRailCollapsed, setIsLeftRailCollapsed] = useState(false);
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState(false);

  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? null,
    [templates, selectedTemplateId],
  );

  const selectedElement = useMemo(() => {
    if (selectedIds.length === 0) return null;
    const id = selectedIds[0];
    return layout.elements.find((element) => element.id === id) ?? null;
  }, [layout.elements, selectedIds]);

  const activeVersionNumber = selectedTemplate?.activeVersionNumber ?? null;
  const dirty = useMemo(() => layoutHash(layout) !== savedHash, [layout, savedHash]);
  const workspaceGridClass = useMemo(() => {
    if (isLeftRailCollapsed && isInspectorCollapsed) {
      return "grid gap-4";
    }
    if (isLeftRailCollapsed) {
      return "grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]";
    }
    if (isInspectorCollapsed) {
      return "grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]";
    }
    return "grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)_360px]";
  }, [isInspectorCollapsed, isLeftRailCollapsed]);

  const resetEditorState = useCallback(() => {
    setVersions([]);
    setSelectedVersionId(null);
    setSelectedIds([]);
    setHistory(createEditorHistory(deepCloneLayout(DEFAULT_CERTIFICATE_LAYOUT)));
    setIsDraftReady(false);
    setSavedHash(layoutHash(DEFAULT_CERTIFICATE_LAYOUT));
    setDraftRevision(0);
    setHasConflict(false);
  }, []);

  const loadTemplateEditorState = useCallback(
    async (templateId: string, activeVersionId?: string | null) => {
      const [versionRows, draft] = await Promise.all([
        listCertificateTemplateVersions(eventId, templateId),
        getCertificateTemplateDraft(eventId, templateId),
      ]);

      setVersions(versionRows);

      const preferredVersion =
        versionRows.find((version) => version.id === activeVersionId) ?? versionRows[0] ?? null;
      setSelectedVersionId(preferredVersion?.id ?? null);

      const nextLayout = deepCloneLayout(draft.layout ?? DEFAULT_CERTIFICATE_LAYOUT);
      setHistory(createEditorHistory(nextLayout));
      setSelectedIds([]);
      setDraftRevision(draft.revision);
      setSavedHash(layoutHash(nextLayout));
      setHasConflict(false);
      setIsDraftReady(true);

      const savedZoom = window.localStorage.getItem(`cert-studio-zoom:${templateId}`);
      const parsedZoom = Number(savedZoom ?? 100);
      if (Number.isFinite(parsedZoom) && parsedZoom >= 25 && parsedZoom <= 200) {
        setZoomPercent(Math.round(parsedZoom));
      } else {
        setZoomPercent(100);
      }
    },
    [eventId],
  );

  const refreshWorkspace = useCallback(async () => {
    const [templateRows, assetRows] = await Promise.all([
      listCertificateTemplates(eventId),
      listCertificateAssets(eventId, "all"),
    ]);

    setTemplates(templateRows);
    setAssets(assetRows);

    let nextSelectedTemplateId: string | null = null;
    setSelectedTemplateId((current) => {
      const preferred =
        templateRows.find((template) => template.isDefault && template.isActive) ?? templateRows[0] ?? null;
      nextSelectedTemplateId =
        current && templateRows.some((template) => template.id === current)
          ? current
          : preferred?.id ?? null;
      return nextSelectedTemplateId;
    });
    return { templateRows, nextSelectedTemplateId };
  }, [eventId]);

  useEffect(() => {
    if (!canManage) return;
    let cancelled = false;

    Promise.resolve()
      .then(async () => {
        const { templateRows } = await refreshWorkspace();
        if (cancelled) return;
        if (templateRows.length === 0) {
          resetEditorState();
        }
      })
      .catch(() => {
        if (!cancelled) {
          toast.error("Failed to load certificate workspace.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [canManage, refreshWorkspace, resetEditorState]);

  useEffect(() => {
    if (!selectedTemplateId) {
      resetEditorState();
      return;
    }

    let cancelled = false;
    setIsDraftReady(false);

    loadTemplateEditorState(selectedTemplateId, selectedTemplate?.activeVersionId)
      .catch(() => {
        if (cancelled) return;
        toast.error("Failed to load template draft.");
        resetEditorState();
      });

    return () => {
      cancelled = true;
    };
  }, [loadTemplateEditorState, resetEditorState, selectedTemplate?.activeVersionId, selectedTemplateId]);

  useEffect(() => {
    if (!selectedTemplateId) return;
    window.localStorage.setItem(`cert-studio-zoom:${selectedTemplateId}`, String(zoomPercent));
  }, [selectedTemplateId, zoomPercent]);

  useEffect(() => {
    if (!canManage || !selectedTemplateId || !isDraftReady) return;

    const currentHash = layoutHash(layout);
    if (currentHash === savedHash) {
      return;
    }

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = setTimeout(() => {
      if (hasConflict) return;

      setIsSavingDraft(true);
      updateCertificateTemplateDraft(
        eventId,
        selectedTemplateId,
        {
          revision: draftRevision,
          layout,
        },
        csrfToken ?? undefined,
      )
        .then((saved) => {
          setDraftRevision(saved.revision);
          setSavedHash(layoutHash(saved.layout));
          setHasConflict(false);
          setTemplates((previous) =>
            previous.map((template) => {
              if (template.id !== selectedTemplateId) return template;
              return {
                ...template,
                draftRevision: saved.revision,
                draftUpdatedAt: saved.updatedAt,
              };
            }),
          );
        })
        .catch((error: unknown) => {
          if (error instanceof ApiError && error.status === 409) {
            setHasConflict(true);
            toast.error("Draft conflict detected. Reload draft to continue editing.");
            return;
          }
          toast.error("Failed to autosave draft.");
        })
        .finally(() => {
          setIsSavingDraft(false);
        });
    }, 800);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [
    canManage,
    csrfToken,
    draftRevision,
    eventId,
    hasConflict,
    isDraftReady,
    layout,
    savedHash,
    selectedTemplateId,
  ]);

  const commitLayout = useCallback((nextLayout: CertificateLayout) => {
    setHistory((previous) => commitHistory(previous, nextLayout));
  }, []);

  const handleCommitPatches = useCallback(
    (patches: Array<{ id: string; patch: Partial<CertificateTemplateElement> }>) => {
      const nextLayout = applyElementPatches(layout, patches);
      commitLayout(nextLayout);
    },
    [commitLayout, layout],
  );

  const patchSelection = useCallback(
    (patch: Partial<CertificateTemplateElement>) => {
      if (selectedIds.length === 0) return;
      handleCommitPatches(selectedIds.map((id) => ({ id, patch })));
    },
    [handleCommitPatches, selectedIds],
  );

  const patchSelectionStyle = useCallback(
    (patch: Record<string, unknown>) => {
      if (selectedIds.length === 0) return;
      const patches = selectedIds.map((id) => {
        const element = layout.elements.find((item) => item.id === id);
        const style = {
          ...((element?.style ?? {}) as Record<string, unknown>),
          ...patch,
        };
        return {
          id,
          patch: { style } as Partial<CertificateTemplateElement>,
        };
      });
      handleCommitPatches(patches);
    },
    [handleCommitPatches, layout.elements, selectedIds],
  );

  const handleUpdateTextContent = useCallback(
    (value: string) => {
      const primary = selectedElement;
      if (!primary || primary.type !== "text") return;
      handleCommitPatches([{ id: primary.id, patch: { content: value } }]);
    },
    [handleCommitPatches, selectedElement],
  );

  const handleUpdatePrimaryToken = useCallback(
    (value: string) => {
      const primary = selectedElement;
      if (!primary) return;
      if (primary.type !== "dynamic_text" && primary.type !== "qr") return;
      handleCommitPatches([{ id: primary.id, patch: { token: value } }]);
    },
    [handleCommitPatches, selectedElement],
  );

  const handleUpdateCanvas = useCallback(
    (patch: Partial<CertificateLayout["canvas"]>) => {
      const nextLayout = updateLayoutCanvas(layout, patch);
      commitLayout(nextLayout);
    },
    [commitLayout, layout],
  );

  const handleAddElement = useCallback(
    (type: CertificateTemplateElement["type"]) => {
      const draft = createElementDraft(type, layout);
      const nextLayout = addElement(layout, draft);
      commitLayout(nextLayout);
      setSelectedIds([draft.id]);
      if (type === "image") setAssetMode("image");
      if (type === "signature") setAssetMode("signature");
      if (view === "templates") setView("layers");
    },
    [commitLayout, layout, view],
  );

  const handleDeleteSelection = useCallback(() => {
    if (selectedIds.length === 0) return;
    const nextLayout = deleteSelection(layout, selectedIds);
    commitLayout(nextLayout);
    setSelectedIds([]);
  }, [commitLayout, layout, selectedIds]);

  const handleDuplicateSelection = useCallback(() => {
    const duplicated = duplicateSelection(layout, selectedIds);
    commitLayout(duplicated.layout);
    setSelectedIds(duplicated.newSelection);
  }, [commitLayout, layout, selectedIds]);

  const handleAlignSelection = useCallback(
    (mode: AlignMode) => {
      const nextLayout = alignSelection(layout, selectedIds, mode);
      commitLayout(nextLayout);
    },
    [commitLayout, layout, selectedIds],
  );

  const handleDistributeSelection = useCallback(
    (axis: DistributeAxis) => {
      const nextLayout = distributeSelection(layout, selectedIds, axis);
      commitLayout(nextLayout);
    },
    [commitLayout, layout, selectedIds],
  );

  const handleReorderSelection = useCallback(
    (mode: "forward" | "backward" | "front" | "back") => {
      const nextLayout = reorderSelection(layout, selectedIds, mode);
      commitLayout(nextLayout);
    },
    [commitLayout, layout, selectedIds],
  );

  const handleUndo = useCallback(() => {
    setHistory((previous) => undoHistory(previous));
  }, []);

  const handleRedo = useCallback(() => {
    setHistory((previous) => redoHistory(previous));
  }, []);

  const handleAddSignatureSlot = useCallback(() => {
    const key = `slot_${layout.signatureSlots.length + 1}`;
    const nextLayout = addSignatureSlot(layout, {
      key,
      label: `Signer ${layout.signatureSlots.length + 1}`,
    });
    commitLayout(nextLayout);
  }, [commitLayout, layout]);

  const handleUpdateSignatureSlot = useCallback(
    (
      slotKey: string,
      updater: (slot: CertificateLayout["signatureSlots"][number]) => CertificateLayout["signatureSlots"][number],
    ) => {
      const nextLayout = updateSignatureSlot(layout, slotKey, updater);
      commitLayout(nextLayout);
    },
    [commitLayout, layout],
  );

  const handleRemoveSignatureSlot = useCallback(
    (slotKey: string) => {
      const nextLayout = removeSignatureSlot(layout, slotKey);
      commitLayout(nextLayout);
    },
    [commitLayout, layout],
  );

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    refreshWorkspace()
      .then(async ({ templateRows, nextSelectedTemplateId }) => {
        if (nextSelectedTemplateId) {
          await loadTemplateEditorState(
            nextSelectedTemplateId,
            templateRows.find((template) => template.id === nextSelectedTemplateId)?.activeVersionId,
          );
        } else {
          resetEditorState();
        }
      })
      .catch(() => toast.error("Failed to refresh certificate studio."))
      .finally(() => setIsRefreshing(false));
  }, [loadTemplateEditorState, refreshWorkspace, resetEditorState]);

  const handleCreateTemplate = useCallback(() => {
    const name = templateNameDraft.trim();
    const typeLabel = typeLabelDraft.trim();
    const typeKey = slugifyTypeKey(typeKeyDraft || typeLabelDraft);

    if (!name || !typeLabel || !typeKey) {
      toast.error("Template name, type label and type key are required.");
      return;
    }

    setIsCreatingTemplate(true);
    createCertificateTemplate(
      eventId,
      {
        name,
        typeLabel,
        typeKey,
        layout: deepCloneLayout(DEFAULT_CERTIFICATE_LAYOUT),
      },
      csrfToken ?? undefined,
    )
      .then((created) => {
        toast.success("Template created.");
        setTemplates((previous) => [created, ...previous]);
        setSelectedTemplateId(created.id);
      })
      .catch(() => toast.error("Failed to create template."))
      .finally(() => setIsCreatingTemplate(false));
  }, [csrfToken, eventId, templateNameDraft, typeKeyDraft, typeLabelDraft]);

  const handleDuplicateTemplate = useCallback(() => {
    if (!selectedTemplateId) return;
    setIsBusyTemplateAction(true);
    duplicateCertificateTemplate(eventId, selectedTemplateId, {}, csrfToken ?? undefined)
      .then((created) => {
        toast.success("Template duplicated.");
        setTemplates((previous) => [created, ...previous]);
        setSelectedTemplateId(created.id);
      })
      .catch(() => toast.error("Failed to duplicate template."))
      .finally(() => setIsBusyTemplateAction(false));
  }, [csrfToken, eventId, selectedTemplateId]);

  const handleArchiveTemplate = useCallback(() => {
    if (!selectedTemplateId) return;
    setIsBusyTemplateAction(true);
    updateCertificateTemplate(
      eventId,
      selectedTemplateId,
      { isActive: false },
      csrfToken ?? undefined,
    )
      .then((updated) => {
        toast.success("Template archived.");
        setTemplates((previous) => previous.map((template) => (template.id === updated.id ? updated : template)));
      })
      .catch(() => toast.error("Failed to archive template."))
      .finally(() => setIsBusyTemplateAction(false));
  }, [csrfToken, eventId, selectedTemplateId]);

  const handleDeleteTemplate = useCallback(() => {
    if (!selectedTemplateId) return;
    const confirmed = window.confirm("Delete this template permanently? Issued certificates remain available.");
    if (!confirmed) return;

    setIsBusyTemplateAction(true);
    deleteCertificateTemplate(eventId, selectedTemplateId, csrfToken ?? undefined)
      .then(() => {
        toast.success("Template deleted.");
        setTemplates((previous) => previous.filter((template) => template.id !== selectedTemplateId));
        setSelectedTemplateId(null);
      })
      .catch(() => toast.error("Failed to delete template."))
      .finally(() => setIsBusyTemplateAction(false));
  }, [csrfToken, eventId, selectedTemplateId]);

  const handlePublish = useCallback(
    (activate: boolean) => {
      if (!selectedTemplateId) {
        toast.error("Select a template first.");
        return;
      }

      setIsPublishing(true);
      publishCertificateTemplate(
        eventId,
        selectedTemplateId,
        { activate },
        csrfToken ?? undefined,
      )
        .then(({ template, version }) => {
          toast.success(
            activate
              ? `Published and activated version ${version.versionNumber}.`
              : `Published version ${version.versionNumber}.`,
          );
          setTemplates((previous) => previous.map((item) => (item.id === template.id ? template : item)));
          setVersions((previous) => {
            const deduped = previous.filter((item) => item.id !== version.id);
            return [version, ...deduped].sort((a, b) => b.versionNumber - a.versionNumber);
          });
          setSelectedVersionId(version.id);
          setHasConflict(false);
          setSavedHash(layoutHash(layout));
        })
        .catch(() => toast.error("Failed to publish template version."))
        .finally(() => setIsPublishing(false));
    },
    [csrfToken, eventId, layout, selectedTemplateId],
  );

  const handleApplyAsset = useCallback(
    (asset: CertificateAsset) => {
      if (assetMode === "font") {
        if (asset.kind !== "font") {
          toast.error("Select a font asset.");
          return;
        }

        if (selectedElement?.type !== "text" && selectedElement?.type !== "dynamic_text") {
          toast.error("Select a text element to apply a font.");
          return;
        }

        const currentStyle = (selectedElement.style ?? {}) as Record<string, unknown>;
        const currentFamily = String(currentStyle.fontFamily ?? "").trim();
        const nextFontFamily = currentFamily || deriveFontFamilyFromAsset(asset);
        const nextStyle = {
          ...currentStyle,
          fontAssetKey: asset.storageKey,
          fontFamily: nextFontFamily,
        };

        handleCommitPatches([
          {
            id: selectedElement.id,
            patch: {
              style: nextStyle,
            } as Partial<CertificateTemplateElement>,
          },
        ]);
        return;
      }

      if (assetMode === "background") {
        handleUpdateCanvas({ backgroundAssetKey: asset.storageKey });
        return;
      }

      if (assetMode === "image") {
        const selectedImage = selectedElement?.type === "image" ? selectedElement : null;
        if (selectedImage) {
          handleCommitPatches([{ id: selectedImage.id, patch: { assetKey: asset.storageKey } }]);
          return;
        }

        const draft = createElementDraft("image", layout);
        if (draft.type === "image") {
          draft.assetKey = asset.storageKey;
        }
        const nextLayout = addElement(layout, draft);
        commitLayout(nextLayout);
        setSelectedIds([draft.id]);
        setView("layers");
        return;
      }

      const selectedSignature = selectedElement?.type === "signature" ? selectedElement : null;
      const slotKey = selectedSignature?.signatureSlotKey ?? layout.signatureSlots[0]?.key;
      if (!slotKey) {
        toast.error("Create a signature slot first.");
        return;
      }

      const nextLayout = updateSignatureSlot(layout, slotKey, (slot) => ({
        ...slot,
        assetKey: asset.storageKey,
      }));
      commitLayout(nextLayout);
    },
    [assetMode, commitLayout, handleCommitPatches, handleUpdateCanvas, layout, selectedElement],
  );

  const handleUploadAsset = useCallback(
    (file: File, kind: "background" | "signature" | "logo" | "image" | "font") => {
      setIsUploadingAsset(true);
      uploadCertificateAsset(eventId, file, kind, csrfToken ?? undefined)
        .then((asset) => {
          toast.success("Asset uploaded.");
          setAssets((previous) => [asset, ...previous]);
          handleApplyAsset(asset);
        })
        .catch(() => toast.error("Failed to upload asset."))
        .finally(() => setIsUploadingAsset(false));
    },
    [csrfToken, eventId, handleApplyAsset],
  );

  const handleDeleteAsset = useCallback(
    (asset: CertificateAsset) => {
      deleteCertificateAsset(eventId, asset.id, csrfToken ?? undefined)
        .then(() => {
          toast.success("Asset deleted.");
          setAssets((previous) => previous.filter((item) => item.id !== asset.id));
        })
        .catch(() => toast.error("Failed to delete asset."));
    },
    [csrfToken, eventId],
  );

  const handleActivateVersion = useCallback(() => {
    if (!selectedTemplateId || !selectedVersionId) {
      toast.error("Select a published version first.");
      return;
    }

    setIsBusyVersionAction(true);
    activateCertificateTemplateVersion(
      eventId,
      selectedTemplateId,
      selectedVersionId,
      csrfToken ?? undefined,
    )
      .then((updated) => {
        toast.success(`Activated version ${updated.activeVersionNumber ?? ""}.`);
        setTemplates((previous) => previous.map((template) => (template.id === updated.id ? updated : template)));
      })
      .catch(() => toast.error("Failed to activate selected version."))
      .finally(() => setIsBusyVersionAction(false));
  }, [csrfToken, eventId, selectedTemplateId, selectedVersionId]);

  const handleDeleteSelectedVersion = useCallback(() => {
    if (!selectedTemplateId || !selectedVersionId) {
      toast.error("Select a published version first.");
      return;
    }

    const selectedVersion =
      versions.find((version) => version.id === selectedVersionId) ?? null;
    const versionNumberLabel =
      selectedVersion?.versionNumber != null
        ? `version ${selectedVersion.versionNumber}`
        : "selected version";

    const confirmed = window.confirm(
      `Delete ${versionNumberLabel}? This cannot be undone.`,
    );
    if (!confirmed) return;

    setIsBusyVersionAction(true);
    deleteCertificateTemplateVersion(
      eventId,
      selectedTemplateId,
      selectedVersionId,
      csrfToken ?? undefined,
    )
      .then(() => {
        toast.success("Version deleted.");
        const remaining = versions.filter(
          (version) => version.id !== selectedVersionId,
        );
        setVersions(remaining);
        setSelectedVersionId((current) => {
          if (current && remaining.some((version) => version.id === current)) {
            return current;
          }
          return remaining[0]?.id ?? null;
        });
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError) {
          toast.error(error.message);
          return;
        }
        toast.error("Failed to delete selected version.");
      })
      .finally(() => setIsBusyVersionAction(false));
  }, [csrfToken, eventId, selectedTemplateId, selectedVersionId, versions]);

  const handleReloadDraft = useCallback(() => {
    if (!selectedTemplateId) return;
    loadTemplateEditorState(selectedTemplateId, selectedTemplate?.activeVersionId)
      .catch(() => toast.error("Failed to reload draft."));
  }, [loadTemplateEditorState, selectedTemplate?.activeVersionId, selectedTemplateId]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!canManage) return;
      if (isInputLikeTarget(event.target)) return;

      const isMac = navigator.platform.toUpperCase().includes("MAC");
      const meta = isMac ? event.metaKey : event.ctrlKey;

      if (meta && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }

      if (meta && event.key.toLowerCase() === "y") {
        event.preventDefault();
        handleRedo();
        return;
      }

      if (meta && event.key.toLowerCase() === "d") {
        event.preventDefault();
        handleDuplicateSelection();
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedIds.length > 0) {
          event.preventDefault();
          handleDeleteSelection();
        }
        return;
      }

      const step = event.shiftKey ? 10 : 1;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        commitLayout(nudgeSelection(layout, selectedIds, -step, 0));
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        commitLayout(nudgeSelection(layout, selectedIds, step, 0));
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        commitLayout(nudgeSelection(layout, selectedIds, 0, -step));
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        commitLayout(nudgeSelection(layout, selectedIds, 0, step));
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    canManage,
    commitLayout,
    handleDeleteSelection,
    handleDuplicateSelection,
    handleRedo,
    handleUndo,
    layout,
    selectedIds,
  ]);

  const tokenValidation = useMemo(() => {
    const allowed = new Set<string>(CERTIFICATE_DYNAMIC_TOKENS);
    const usedTokens = layout.elements
      .filter((element) => element.type === "dynamic_text" || element.type === "qr")
      .map((element) => (element.token ?? "").trim())
      .filter((token) => token.length > 0);
    const uniqueUsedTokens = Array.from(new Set(usedTokens));
    const unknown = uniqueUsedTokens.filter((token) => !allowed.has(token));
    return { used: uniqueUsedTokens, unknown };
  }, [layout.elements]);

  if (!canManage) {
    return (
      <Alert>
        <AlertDescription>
          You do not have permission to manage certificates for this event.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="lg:hidden">
        <Alert>
          <Monitor className="h-4 w-4" />
          <AlertDescription>
            Advanced template editing is desktop-first. On smaller screens you can still review templates and assets.
          </AlertDescription>
        </Alert>
      </div>

      {isLoading ? (
        <div className="rounded-xl border p-10 text-center text-muted-foreground">Loading studio...</div>
      ) : (
        <>
          {hasConflict && (
            <Alert className="border-amber-300 bg-amber-50 text-amber-900">
              <AlertDescription className="flex items-center justify-between gap-3">
                <span>
                  Draft revision conflict detected. Another save replaced your local revision.
                </span>
                <Button size="sm" variant="outline" onClick={handleReloadDraft}>
                  Reload draft
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {tokenValidation.unknown.length > 0 && (
            <Alert className="border-amber-300 bg-amber-50 text-amber-900">
              <AlertDescription>
                Unknown tokens in draft: {tokenValidation.unknown.join(", ")}.
              </AlertDescription>
            </Alert>
          )}

          <TopCommandBar
            canManage={canManage}
            selectedCount={selectedIds.length}
            canUndo={history.past.length > 0}
            canRedo={history.future.length > 0}
            snapEnabled={layout.canvas.snapEnabled ?? true}
            zoomPercent={zoomPercent}
            isRefreshing={isRefreshing}
            isPublishing={isPublishing}
            isSavingDraft={isSavingDraft}
            hasConflict={hasConflict}
            dirty={dirty}
            activeVersionNumber={activeVersionNumber}
            isLeftRailCollapsed={isLeftRailCollapsed}
            isInspectorCollapsed={isInspectorCollapsed}
            onToggleLeftRail={() => setIsLeftRailCollapsed((previous) => !previous)}
            onToggleInspector={() => setIsInspectorCollapsed((previous) => !previous)}
            onRefresh={handleRefresh}
            onAddElement={handleAddElement}
            onDeleteSelection={handleDeleteSelection}
            onDuplicateSelection={handleDuplicateSelection}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onAlign={handleAlignSelection}
            onDistribute={handleDistributeSelection}
            onReorder={handleReorderSelection}
            onSetSnapEnabled={(next) => handleUpdateCanvas({ snapEnabled: next })}
            onZoomChange={setZoomPercent}
            onFitToScreen={() => setFitRequestId((value) => value + 1)}
            onPublish={handlePublish}
          />

          <div className={workspaceGridClass}>
            {!isLeftRailCollapsed && (
              <LeftRail
                canManage={canManage}
                view={view}
                onViewChange={setView}
                templates={templates}
                selectedTemplateId={selectedTemplateId}
                versions={versions}
                selectedVersionId={selectedVersionId}
                onSelectTemplate={setSelectedTemplateId}
                onSelectVersion={setSelectedVersionId}
                onActivateSelectedVersion={handleActivateVersion}
                onDeleteSelectedVersion={handleDeleteSelectedVersion}
                onCreateTemplate={handleCreateTemplate}
                onDuplicateTemplate={handleDuplicateTemplate}
                onDeleteTemplate={handleDeleteTemplate}
                onArchiveTemplate={handleArchiveTemplate}
                templateNameDraft={templateNameDraft}
                typeLabelDraft={typeLabelDraft}
                typeKeyDraft={typeKeyDraft}
                onTemplateNameDraftChange={setTemplateNameDraft}
                onTypeLabelDraftChange={(value) => {
                  setTypeLabelDraft(value);
                  if (!typeKeyDraft.trim()) {
                    setTypeKeyDraft(slugifyTypeKey(value));
                  }
                }}
                onTypeKeyDraftChange={(value) => setTypeKeyDraft(slugifyTypeKey(value))}
                isCreatingTemplate={isCreatingTemplate}
                isBusyTemplateAction={isBusyTemplateAction}
                isBusyVersionAction={isBusyVersionAction}
                layout={layout}
                selectedIds={selectedIds}
                onSelectLayer={setSelectedIds}
                assetMode={assetMode}
                onAssetModeChange={setAssetMode}
                assets={assets}
                assetSearch={assetSearch}
                onAssetSearchChange={setAssetSearch}
                assetKindFilter={assetKindFilter}
                onAssetKindFilterChange={setAssetKindFilter}
                onApplyAsset={handleApplyAsset}
                onUploadAsset={handleUploadAsset}
                onDeleteAsset={handleDeleteAsset}
                isUploadingAsset={isUploadingAsset}
              />
            )}

            <EditorCanvas
              canManage={canManage}
              layout={layout}
              assets={assets}
              previewData={previewData}
              selectedIds={selectedIds}
              zoomPercent={zoomPercent}
              sessionKey={selectedTemplateId}
              fitRequestId={fitRequestId}
              onSelectionChange={setSelectedIds}
              onCommitPatches={handleCommitPatches}
              onFitCalculated={setZoomPercent}
            />

            {!isInspectorCollapsed && (
              <InspectorPanel
                canManage={canManage}
                layout={layout}
                selectedElement={selectedElement}
                selectedCount={selectedIds.length}
                onPatchSelection={patchSelection}
                onPatchSelectionStyle={patchSelectionStyle}
                onUpdatePrimaryTextContent={handleUpdateTextContent}
                onUpdatePrimaryToken={handleUpdatePrimaryToken}
                tokenOptions={Array.from(CERTIFICATE_DYNAMIC_TOKENS)}
                assets={assets}
                previewData={previewData}
                previewTokenKeys={tokenValidation.used}
                onPreviewDataChange={(key, value) =>
                  setPreviewData((previous) => ({
                    ...previous,
                    [key]: value,
                  }))
                }
                onResetPreviewData={() => setPreviewData(DEFAULT_PREVIEW_DATA)}
                onUpdateCanvas={handleUpdateCanvas}
                onSetAssetMode={setAssetMode}
                onDeleteSelection={handleDeleteSelection}
                onAddSignatureSlot={handleAddSignatureSlot}
                onUpdateSignatureSlot={handleUpdateSignatureSlot}
                onRemoveSignatureSlot={handleRemoveSignatureSlot}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
