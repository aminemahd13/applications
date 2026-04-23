"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  Monitor,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { useAuth, usePermissions } from "@/lib/auth-context";
import { PageHeader } from "@/components/shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_CERTIFICATE_LAYOUT,
  CERTIFICATE_DYNAMIC_TOKENS,
  activateCertificateTemplateVersion,
  createCertificatePdfExportJob,
  createCertificateTemplate,
  deleteCertificateAsset,
  deleteCertificateTemplate,
  deleteCertificateTemplateVersion,
  duplicateCertificateTemplate,
  getCertificatePdfExportJobDownloadUrl,
  getCertificateTemplateDraft,
  issueCertificatesByTags,
  issueCertificatesBulk,
  listCertificateIssuanceTags,
  searchCertificateIssuanceCandidates,
  listCertificateAssets,
  listCertificateRenderJobs,
  listCertificateTemplateVersions,
  listCertificateTemplates,
  listIssuedCertificates,
  pollCertificatePdfExportJobUntilTerminal,
  publishCertificateTemplate,
  releaseIssuedCertificate,
  revokeIssuedCertificate,
  retryCertificateRenderJob,
  updateCertificateTemplate,
  updateCertificateTemplateDraft,
  uploadCertificateAsset,
  type CertificateAsset,
  type CertificateLayout,
  type CertificateTemplateElement,
  type CertificateTemplateSummary,
  type CertificateTemplateVersion,
  type IssuedCertificateSummary,
  type CertificateRenderJobSummary,
  type CertificateIssuanceCandidate,
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
  parseApplicationIdsInput,
  slugifyTypeKey,
  type AssetMode,
  type LeftRailView,
  type PreviewData,
} from "./utils";

function layoutHash(layout: CertificateLayout): string {
  return JSON.stringify(layout);
}

export function CertificateStudioWorkspace() {
  const params = useParams();
  const eventId = params.eventId as string;

  const { csrfToken } = useAuth();
  const { hasPermission } = usePermissions(eventId);
  const canManage = hasPermission("event.update");

  const [templates, setTemplates] = useState<CertificateTemplateSummary[]>([]);
  const [versions, setVersions] = useState<CertificateTemplateVersion[]>([]);
  const [assets, setAssets] = useState<CertificateAsset[]>([]);
  const [issuedCertificates, setIssuedCertificates] = useState<IssuedCertificateSummary[]>([]);
  const [renderJobs, setRenderJobs] = useState<CertificateRenderJobSummary[]>([]);

  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);

  const [history, setHistory] = useState(() => createEditorHistory(deepCloneLayout(DEFAULT_CERTIFICATE_LAYOUT)));
  const layout = history.present;

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [previewData, setPreviewData] = useState<PreviewData>(DEFAULT_PREVIEW_DATA);

  const [view, setView] = useState<LeftRailView>("templates");
  const [assetMode, setAssetMode] = useState<AssetMode>("background");
  const [assetKindFilter, setAssetKindFilter] = useState<"all" | "background" | "signature" | "logo" | "image">("all");
  const [assetSearch, setAssetSearch] = useState("");

  const [templateNameDraft, setTemplateNameDraft] = useState("Participation Certificate");
  const [typeLabelDraft, setTypeLabelDraft] = useState("Participation");
  const [typeKeyDraft, setTypeKeyDraft] = useState("participation");

  const [issuanceApplicationIds, setIssuanceApplicationIds] = useState("");
  const [issuanceIssuerName, setIssuanceIssuerName] = useState("");
  const [issuanceReissueIfExists, setIssuanceReissueIfExists] = useState(false);
  const [issuanceSearchInput, setIssuanceSearchInput] = useState("");
  const [issuanceCandidates, setIssuanceCandidates] = useState<CertificateIssuanceCandidate[]>([]);
  const [issuanceSearchAttempted, setIssuanceSearchAttempted] = useState(false);
  const [issuanceTagSearchInput, setIssuanceTagSearchInput] = useState("");
  const [issuanceTags, setIssuanceTags] = useState<string[]>([]);
  const [issuanceSelectedTags, setIssuanceSelectedTags] = useState<string[]>([]);
  const [issuanceDownloadAfterIssue, setIssuanceDownloadAfterIssue] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRefreshingIssuance, setIsRefreshingIssuance] = useState(false);
  const [isSearchingIssuanceCandidates, setIsSearchingIssuanceCandidates] = useState(false);
  const [isLoadingIssuanceTags, setIsLoadingIssuanceTags] = useState(false);
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);
  const [isBusyTemplateAction, setIsBusyTemplateAction] = useState(false);
  const [isBusyVersionAction, setIsBusyVersionAction] = useState(false);
  const [isUploadingAsset, setIsUploadingAsset] = useState(false);
  const [isIssuing, setIsIssuing] = useState(false);
  const [isDownloadingIssuanceZip, setIsDownloadingIssuanceZip] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isRevokingIssuedCertificate, setIsRevokingIssuedCertificate] = useState(false);
  const [releasingIssuedCertificateId, setReleasingIssuedCertificateId] = useState<string | null>(null);
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [revokeReasonDraft, setRevokeReasonDraft] = useState("");
  const [revokeTargetCertificate, setRevokeTargetCertificate] = useState<IssuedCertificateSummary | null>(null);

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

  const refreshIssuance = useCallback(async () => {
    const [issuedRows, jobRows] = await Promise.all([
      listIssuedCertificates(eventId, { limit: 100 }),
      listCertificateRenderJobs(eventId, { limit: 100 }),
    ]);
    setIssuedCertificates(issuedRows);
    setRenderJobs(jobRows);
  }, [eventId]);

  const refreshWorkspace = useCallback(async () => {
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

    setSelectedTemplateId((current) => {
      if (current && templateRows.some((template) => template.id === current)) {
        return current;
      }
      const preferred =
        templateRows.find((template) => template.isDefault && template.isActive) ?? templateRows[0] ?? null;
      return preferred?.id ?? null;
    });
  }, [assetKindFilter, eventId]);

  const refreshIssuanceTags = useCallback(() => {
    setIsLoadingIssuanceTags(true);
    listCertificateIssuanceTags(eventId, {
      search: issuanceTagSearchInput.trim() || undefined,
      limit: 80,
    })
      .then((tags) => setIssuanceTags(tags))
      .catch(() => {
        setIssuanceTags([]);
        toast.error("Failed to load tags.");
      })
      .finally(() => setIsLoadingIssuanceTags(false));
  }, [eventId, issuanceTagSearchInput]);

  useEffect(() => {
    if (!canManage) return;
    let cancelled = false;
    Promise.resolve().then(async () => {
      if (cancelled) return;
      try {
        await refreshWorkspace();
      } catch {
        toast.error("Failed to load certificate workspace.");
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [canManage, refreshWorkspace]);

  useEffect(() => {
    if (!selectedTemplateId) {
      const reset = () => {
        setVersions([]);
        setSelectedVersionId(null);
        setSelectedIds([]);
        setHistory(createEditorHistory(deepCloneLayout(DEFAULT_CERTIFICATE_LAYOUT)));
        setIsDraftReady(false);
        setSavedHash(layoutHash(DEFAULT_CERTIFICATE_LAYOUT));
        setDraftRevision(0);
      };
      queueMicrotask(reset);
      return;
    }

    let cancelled = false;
    queueMicrotask(() => setIsDraftReady(false));

    Promise.all([
      listCertificateTemplateVersions(eventId, selectedTemplateId),
      getCertificateTemplateDraft(eventId, selectedTemplateId),
    ])
      .then(([versionRows, draft]) => {
        if (cancelled) return;
        setVersions(versionRows);

        const template = templates.find((item) => item.id === selectedTemplateId) ?? null;
        const preferredVersion =
          versionRows.find((version) => version.id === template?.activeVersionId) ?? versionRows[0] ?? null;
        setSelectedVersionId(preferredVersion?.id ?? null);

        const nextLayout = deepCloneLayout(draft.layout ?? DEFAULT_CERTIFICATE_LAYOUT);
        setHistory(createEditorHistory(nextLayout));
        setSelectedIds([]);
        setDraftRevision(draft.revision);
        setSavedHash(layoutHash(nextLayout));
        setHasConflict(false);
        setIsDraftReady(true);

        const savedZoom = window.localStorage.getItem(`cert-studio-zoom:${selectedTemplateId}`);
        const parsedZoom = Number(savedZoom ?? 100);
        if (Number.isFinite(parsedZoom) && parsedZoom >= 25 && parsedZoom <= 200) {
          setZoomPercent(Math.round(parsedZoom));
        } else {
          setZoomPercent(100);
        }
      })
      .catch(() => {
        if (cancelled) return;
        toast.error("Failed to load template draft.");
        setVersions([]);
        setSelectedVersionId(null);
        setHistory(createEditorHistory(deepCloneLayout(DEFAULT_CERTIFICATE_LAYOUT)));
        setSelectedIds([]);
        setIsDraftReady(false);
      });

    return () => {
      cancelled = true;
    };
  }, [eventId, selectedTemplateId, templates]);

  useEffect(() => {
    if (!selectedTemplateId) return;
    window.localStorage.setItem(`cert-studio-zoom:${selectedTemplateId}`, String(zoomPercent));
  }, [selectedTemplateId, zoomPercent]);

  useEffect(() => {
    if (!canManage || isLoading) return;
    let cancelled = false;

    listCertificateAssets(eventId, assetKindFilter)
      .then((rows) => {
        if (!cancelled) {
          setAssets(rows);
        }
      })
      .catch(() => {
        if (!cancelled) {
          toast.error("Failed to refresh assets.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [assetKindFilter, canManage, eventId, isLoading]);

  useEffect(() => {
    if (issuanceSearchInput.trim()) return;
    setIssuanceCandidates([]);
    setIssuanceSearchAttempted(false);
  }, [issuanceSearchInput]);

  useEffect(() => {
    if (!canManage || view !== "issuance") return;
    const timer = setTimeout(() => {
      refreshIssuanceTags();
    }, 150);
    return () => clearTimeout(timer);
  }, [canManage, refreshIssuanceTags, view]);

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
    },
    [commitLayout, layout],
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
      .catch(() => toast.error("Failed to refresh workspace."))
      .finally(() => setIsRefreshing(false));
  }, [refreshWorkspace]);

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
    (file: File, kind: "background" | "signature" | "logo" | "image") => {
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

  const handleSearchIssuanceCandidates = useCallback(() => {
    const search = issuanceSearchInput.trim();
    if (!search) {
      setIssuanceCandidates([]);
      setIssuanceSearchAttempted(false);
      return;
    }

    setIsSearchingIssuanceCandidates(true);
    setIssuanceSearchAttempted(true);
    searchCertificateIssuanceCandidates(eventId, { search, limit: 20 })
      .then((rows) => setIssuanceCandidates(rows))
      .catch(() => {
        setIssuanceCandidates([]);
        toast.error("Failed to search applications.");
      })
      .finally(() => setIsSearchingIssuanceCandidates(false));
  }, [eventId, issuanceSearchInput]);

  const downloadIssuanceZipByIssuedIds = useCallback(
    async (issuedCertificateIds: string[]) => {
      const ids = Array.from(
        new Set(
          issuedCertificateIds.filter(
            (issuedCertificateId) =>
              typeof issuedCertificateId === "string" &&
              issuedCertificateId.length > 0,
          ),
        ),
      );
      if (ids.length === 0) return;

      setIsDownloadingIssuanceZip(true);
      try {
        const queuedJob = await createCertificatePdfExportJob(
          eventId,
          { issuedCertificateIds: ids },
          csrfToken ?? undefined,
        );
        const terminalJob = await pollCertificatePdfExportJobUntilTerminal({
          eventId,
          jobId: queuedJob.id,
          intervalMs: 2000,
          timeoutMs: 15 * 60 * 1000,
        });
        if (String(terminalJob.status ?? "").toUpperCase() === "FAILED") {
          throw new Error(
            terminalJob.errorMessage || "Certificate PDF export failed.",
          );
        }
        const download = await getCertificatePdfExportJobDownloadUrl(
          eventId,
          queuedJob.id,
        );
        const a = document.createElement("a");
        a.href = download.url;
        a.download = download.filename || `${eventId}-certificates.zip`;
        a.click();
        toast.success("Certificates ZIP downloaded.");
      } catch (error) {
        if (error instanceof ApiError && error.message.trim().length > 0) {
          toast.error(error.message);
        } else if (error instanceof Error && error.message.trim().length > 0) {
          toast.error(error.message);
        } else {
          toast.error("Could not download certificates ZIP.");
        }
      } finally {
        setIsDownloadingIssuanceZip(false);
      }
    },
    [csrfToken, eventId],
  );

  const handleIssueCertificates = useCallback(() => {
    if (!selectedTemplateId) {
      toast.error("Select a template first.");
      return;
    }

    const ids = parseApplicationIdsInput(issuanceApplicationIds);
    if (ids.length === 0) {
      toast.error("Provide at least one application ID.");
      return;
    }

    setIsIssuing(true);
    issueCertificatesBulk(
      eventId,
      {
        templateId: selectedTemplateId,
        templateVersionId: selectedVersionId ?? undefined,
        applicationIds: ids,
        issuerName: issuanceIssuerName.trim() || undefined,
        reissueIfExists: issuanceReissueIfExists,
      },
      csrfToken ?? undefined,
    )
      .then((result) => {
        toast.success(`Issued ${result.issued} certificate(s).`);
        setIssuanceApplicationIds("");
        return refreshIssuance().then(async () => {
          if (issuanceDownloadAfterIssue) {
            await downloadIssuanceZipByIssuedIds(
              (result.certificates ?? [])
                .map((certificate) => String(certificate.id ?? "").trim())
                .filter((value) => value.length > 0),
            );
          }
        });
      })
      .catch(() => toast.error("Failed to issue certificates."))
      .finally(() => setIsIssuing(false));
  }, [
    csrfToken,
    downloadIssuanceZipByIssuedIds,
    eventId,
    issuanceApplicationIds,
    issuanceDownloadAfterIssue,
    issuanceIssuerName,
    issuanceReissueIfExists,
    refreshIssuance,
    selectedTemplateId,
    selectedVersionId,
  ]);

  const handleIssueSingleCandidate = useCallback(
    (applicationId: string) => {
      if (!selectedTemplateId) {
        toast.error("Select a template first.");
        return;
      }

      setIsIssuing(true);
      issueCertificatesBulk(
        eventId,
        {
          templateId: selectedTemplateId,
          templateVersionId: selectedVersionId ?? undefined,
          applicationIds: [applicationId],
          issuerName: issuanceIssuerName.trim() || undefined,
          reissueIfExists: issuanceReissueIfExists,
        },
        csrfToken ?? undefined,
      )
        .then((result) => {
          if (result.issued > 0) {
            toast.success("Certificate issued.");
          } else if (result.alreadyIssued > 0) {
            toast.info("Certificate already issued.");
          } else if (result.notFound.length > 0) {
            toast.error("Application not found.");
          } else if (result.failed.length > 0) {
            toast.error(result.failed[0]?.reason || "Failed to issue certificate.");
          } else {
            toast.error("Failed to issue certificate.");
          }
          return refreshIssuance().then(async () => {
            if (issuanceDownloadAfterIssue) {
              await downloadIssuanceZipByIssuedIds(
                (result.certificates ?? [])
                  .map((certificate) => String(certificate.id ?? "").trim())
                  .filter((value) => value.length > 0),
              );
            }
          });
        })
        .catch(() => toast.error("Failed to issue certificate."))
        .finally(() => setIsIssuing(false));
    },
    [
      csrfToken,
      downloadIssuanceZipByIssuedIds,
      eventId,
      issuanceDownloadAfterIssue,
      issuanceIssuerName,
      issuanceReissueIfExists,
      refreshIssuance,
      selectedTemplateId,
      selectedVersionId,
    ],
  );

  const handleIssueCertificatesByTags = useCallback(() => {
    if (!selectedTemplateId) {
      toast.error("Select a template first.");
      return;
    }
    if (issuanceSelectedTags.length === 0) {
      toast.error("Select at least one tag.");
      return;
    }

    setIsIssuing(true);
    issueCertificatesByTags(
      eventId,
      {
        templateId: selectedTemplateId,
        templateVersionId: selectedVersionId ?? undefined,
        tags: issuanceSelectedTags,
        issuerName: issuanceIssuerName.trim() || undefined,
        reissueIfExists: issuanceReissueIfExists,
      },
      csrfToken ?? undefined,
    )
      .then((result) => {
        toast.success(`Issued ${result.issued} certificate(s).`);
        return refreshIssuance().then(async () => {
          if (issuanceDownloadAfterIssue) {
            await downloadIssuanceZipByIssuedIds(
              (result.certificates ?? [])
                .map((certificate) => String(certificate.id ?? "").trim())
                .filter((value) => value.length > 0),
            );
          }
        });
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError) {
          toast.error(error.message);
          return;
        }
        toast.error("Failed to issue certificates by tags.");
      })
      .finally(() => setIsIssuing(false));
  }, [
    csrfToken,
    downloadIssuanceZipByIssuedIds,
    eventId,
    issuanceDownloadAfterIssue,
    issuanceIssuerName,
    issuanceReissueIfExists,
    issuanceSelectedTags,
    refreshIssuance,
    selectedTemplateId,
    selectedVersionId,
  ]);

  const handleReleaseIssuedCertificate = useCallback(
    (certificate: IssuedCertificateSummary) => {
      setReleasingIssuedCertificateId(certificate.id);
      releaseIssuedCertificate(eventId, certificate.id, csrfToken ?? undefined)
        .then(() => {
          toast.success("Certificate released.");
          return refreshIssuance();
        })
        .catch((error: unknown) => {
          if (error instanceof ApiError) {
            toast.error(error.message);
            return;
          }
          toast.error("Failed to release certificate.");
        })
        .finally(() => setReleasingIssuedCertificateId(null));
    },
    [csrfToken, eventId, refreshIssuance],
  );

  const handleRetryRenderJob = useCallback(
    (jobId: string) => {
      retryCertificateRenderJob(eventId, jobId, csrfToken ?? undefined)
        .then(() => {
          toast.success("Render job queued for retry.");
          return refreshIssuance();
        })
        .catch(() => toast.error("Failed to retry render job."));
    },
    [csrfToken, eventId, refreshIssuance],
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

  const handleRequestRevokeIssuedCertificate = useCallback(
    (certificate: IssuedCertificateSummary) => {
      setRevokeTargetCertificate(certificate);
      setRevokeReasonDraft("");
      setRevokeDialogOpen(true);
    },
    [],
  );

  const handleConfirmRevokeIssuedCertificate = useCallback(() => {
    if (!revokeTargetCertificate) return;

    setIsRevokingIssuedCertificate(true);
    revokeIssuedCertificate(
      eventId,
      revokeTargetCertificate.id,
      revokeReasonDraft.trim() || undefined,
      csrfToken ?? undefined,
    )
      .then((updated) => {
        toast.success("Certificate revoked.");
        setIssuedCertificates((previous) =>
          previous.map((item) => (item.id === updated.id ? updated : item)),
        );
        setRevokeDialogOpen(false);
        setRevokeTargetCertificate(null);
        return refreshIssuance();
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError) {
          toast.error(error.message);
          return;
        }
        toast.error("Failed to revoke certificate.");
      })
      .finally(() => setIsRevokingIssuedCertificate(false));
  }, [
    csrfToken,
    eventId,
    refreshIssuance,
    revokeReasonDraft,
    revokeTargetCertificate,
  ]);

  const handleReloadDraft = useCallback(() => {
    if (!selectedTemplateId) return;
    getCertificateTemplateDraft(eventId, selectedTemplateId)
      .then((draft) => {
        setHistory(createEditorHistory(deepCloneLayout(draft.layout)));
        setSelectedIds([]);
        setDraftRevision(draft.revision);
        setSavedHash(layoutHash(draft.layout));
        setHasConflict(false);
      })
      .catch(() => toast.error("Failed to reload draft."));
  }, [eventId, selectedTemplateId]);

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
    const unknown = Array.from(new Set(usedTokens.filter((token) => !allowed.has(token))));
    return { used: Array.from(new Set(usedTokens)), unknown };
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
      <PageHeader
        title="Certificate Studio"
        description="Templates, assets, publishing, and issuance in one place."
      >
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setIsLeftRailCollapsed((previous) => !previous)}>
            {isLeftRailCollapsed ? (
              <PanelLeftOpen className="mr-1.5 h-4 w-4" />
            ) : (
              <PanelLeftClose className="mr-1.5 h-4 w-4" />
            )}
            {isLeftRailCollapsed ? "Show left panel" : "Hide left panel"}
          </Button>
          <Button variant="outline" onClick={() => setIsInspectorCollapsed((previous) => !previous)}>
            {isInspectorCollapsed ? (
              <PanelRightOpen className="mr-1.5 h-4 w-4" />
            ) : (
              <PanelRightClose className="mr-1.5 h-4 w-4" />
            )}
            {isInspectorCollapsed ? "Show inspector" : "Hide inspector"}
          </Button>
          <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw className={`mr-1.5 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh status
          </Button>
        </div>
      </PageHeader>

      <div className="lg:hidden">
        <Alert>
          <Monitor className="h-4 w-4" />
          <AlertDescription>
            Advanced editing is desktop-first. On mobile you can review templates and issuance status.
          </AlertDescription>
        </Alert>
      </div>

      {isLoading ? (
        <div className="rounded-xl border p-10 text-center text-muted-foreground">Loading workspace...</div>
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
              <div>
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
                  issuanceApplicationIds={issuanceApplicationIds}
                  onIssuanceApplicationIdsChange={setIssuanceApplicationIds}
                  issuanceSearchInput={issuanceSearchInput}
                  onIssuanceSearchInputChange={setIssuanceSearchInput}
                  onSearchIssuanceCandidates={handleSearchIssuanceCandidates}
                  issuanceCandidates={issuanceCandidates}
                  issuanceSearchAttempted={issuanceSearchAttempted}
                  isSearchingIssuanceCandidates={isSearchingIssuanceCandidates}
                  issuanceTagSearchInput={issuanceTagSearchInput}
                  onIssuanceTagSearchInputChange={setIssuanceTagSearchInput}
                  onRefreshIssuanceTags={refreshIssuanceTags}
                  issuanceTags={issuanceTags}
                  issuanceSelectedTags={issuanceSelectedTags}
                  onToggleIssuanceTag={(tag) => {
                    setIssuanceSelectedTags((previous) =>
                      previous.includes(tag)
                        ? previous.filter((item) => item !== tag)
                        : [...previous, tag],
                    );
                  }}
                  onIssueCertificatesByTags={handleIssueCertificatesByTags}
                  issuanceIssuerName={issuanceIssuerName}
                  onIssuanceIssuerNameChange={setIssuanceIssuerName}
                  issuanceReissueIfExists={issuanceReissueIfExists}
                  onIssuanceReissueIfExistsChange={setIssuanceReissueIfExists}
                  issuanceDownloadAfterIssue={issuanceDownloadAfterIssue}
                  onIssuanceDownloadAfterIssueChange={setIssuanceDownloadAfterIssue}
                  onIssueCertificates={handleIssueCertificates}
                  onIssueCandidate={handleIssueSingleCandidate}
                  isIssuing={isIssuing}
                  isLoadingIssuanceTags={isLoadingIssuanceTags}
                  isDownloadingIssuanceZip={isDownloadingIssuanceZip}
                  issuedCertificates={issuedCertificates}
                  renderJobs={renderJobs}
                  onRequestRevokeIssuedCertificate={handleRequestRevokeIssuedCertificate}
                  onReleaseIssuedCertificate={handleReleaseIssuedCertificate}
                  revokingIssuedCertificateId={
                    isRevokingIssuedCertificate ? revokeTargetCertificate?.id ?? null : null
                  }
                  releasingIssuedCertificateId={releasingIssuedCertificateId}
                  onDownloadIssuedCertificates={(issuedCertificateIds) => {
                    void downloadIssuanceZipByIssuedIds(issuedCertificateIds);
                  }}
                  onRetryRenderJob={handleRetryRenderJob}
                  onRefreshIssuance={() => {
                    setIsRefreshingIssuance(true);
                    refreshIssuance()
                      .catch(() => toast.error("Failed to refresh issuance status."))
                      .finally(() => setIsRefreshingIssuance(false));
                  }}
                  isRefreshingIssuance={isRefreshingIssuance}
                />
              </div>
            )}

            <EditorCanvas
              canManage={canManage}
              layout={layout}
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
                onUpdateCanvas={handleUpdateCanvas}
                onSetAssetMode={setAssetMode}
                onDeleteSelection={handleDeleteSelection}
                onAddSignatureSlot={handleAddSignatureSlot}
                onUpdateSignatureSlot={handleUpdateSignatureSlot}
                onRemoveSignatureSlot={handleRemoveSignatureSlot}
              />
            )}
          </div>

          <div className="rounded-xl border p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold">Preview Tokens</p>
              <Button size="sm" variant="ghost" onClick={() => setPreviewData(DEFAULT_PREVIEW_DATA)}>
                Reset values
              </Button>
            </div>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              {Object.entries(previewData).map(([key, value]) => (
                <label key={key} className="space-y-1">
                  <span className="text-[11px] text-muted-foreground">{key}</span>
                  <input
                    value={value}
                    onChange={(event) =>
                      setPreviewData((previous) => ({
                        ...previous,
                        [key]: event.target.value,
                      }))
                    }
                    className="h-8 w-full rounded-md border bg-background px-2 text-sm"
                  />
                </label>
              ))}
            </div>
          </div>

          <Dialog
            open={revokeDialogOpen}
            onOpenChange={(open) => {
              if (isRevokingIssuedCertificate) return;
              setRevokeDialogOpen(open);
              if (!open) {
                setRevokeTargetCertificate(null);
                setRevokeReasonDraft("");
              }
            }}
          >
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Revoke certificate</DialogTitle>
                <DialogDescription>
                  {revokeTargetCertificate
                    ? `Certificate ${revokeTargetCertificate.certificateId} will be marked as revoked.`
                    : "This certificate will be marked as revoked."}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Reason (optional)</p>
                <Textarea
                  value={revokeReasonDraft}
                  onChange={(event) => setRevokeReasonDraft(event.target.value)}
                  placeholder="Add a reason for revocation"
                  disabled={isRevokingIssuedCertificate}
                  className="min-h-24"
                />
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setRevokeDialogOpen(false)}
                  disabled={isRevokingIssuedCertificate}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleConfirmRevokeIssuedCertificate}
                  disabled={!revokeTargetCertificate || isRevokingIssuedCertificate}
                >
                  {isRevokingIssuedCertificate ? (
                    <>
                      <RefreshCw className="mr-1.5 h-4 w-4 animate-spin" />
                      Revoking...
                    </>
                  ) : (
                    "Confirm revoke"
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
