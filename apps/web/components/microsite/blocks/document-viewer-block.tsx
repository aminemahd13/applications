"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Block } from "@event-platform/shared";
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Download,
  Maximize2,
  Minimize2,
  FileText,
  ExternalLink,
} from "lucide-react";
import { resolveAssetUrl } from "../asset-url";
import { BlockSection } from "./block-section";
import { MarkdownText } from "../markdown-text";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

type DocumentViewerData = Extract<Block, { type: "DOCUMENT_VIEWER" }>["data"] & {
  title?: string;
  url?: string;
  caption?: string;
  height?: number;
  showToolbar?: boolean;
  showPageNav?: boolean;
  showZoom?: boolean;
  showDownload?: boolean;
  showFullscreen?: boolean;
  initialZoom?: string;
};

type ScaleMode = "page-width" | "page-fit" | number;

function parseInitialZoom(value?: string): ScaleMode {
  if (!value || value === "page-width") return "page-width";
  if (value === "page-fit") return "page-fit";
  const num = parseInt(value, 10);
  return Number.isFinite(num) ? num / 100 : "page-width";
}

function DocumentToolbar({
  currentPage,
  numPages,
  onPageChange,
  scale,
  scaleLabel,
  onScaleChange,
  showPageNav,
  showZoom,
  showDownload,
  showFullscreen,
  sourceUrl,
  isFullscreen,
  onFullscreenToggle,
  fullscreenSupported,
}: {
  currentPage: number;
  numPages: number;
  onPageChange: (page: number) => void;
  scale: ScaleMode;
  scaleLabel: string;
  onScaleChange: (scale: ScaleMode) => void;
  showPageNav: boolean;
  showZoom: boolean;
  showDownload: boolean;
  showFullscreen: boolean;
  sourceUrl: string;
  isFullscreen: boolean;
  onFullscreenToggle: () => void;
  fullscreenSupported: boolean;
}) {
  const selectValue =
    typeof scale === "number"
      ? String(Math.round(scale * 100))
      : scale;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--mm-border)] bg-[var(--mm-surface)] px-3 py-2">
      {/* Page navigation */}
      {showPageNav && (
        <div className="flex items-center gap-1">
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--mm-text)] transition-colors hover:bg-[var(--mm-border)] disabled:opacity-30 disabled:pointer-events-none"
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-1 text-sm text-[var(--mm-text)]">
            <input
              type="number"
              min={1}
              max={numPages}
              value={currentPage}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (Number.isFinite(val)) {
                  onPageChange(Math.max(1, Math.min(numPages, val)));
                }
              }}
              className="h-7 w-12 rounded border border-[var(--mm-border)] bg-transparent text-center text-xs text-[var(--mm-text)] outline-none focus:border-[var(--mm-accent)]"
            />
            <span className="text-xs text-[var(--mm-text-muted)]">/ {numPages}</span>
          </div>
          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= numPages}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--mm-text)] transition-colors hover:bg-[var(--mm-border)] disabled:opacity-30 disabled:pointer-events-none"
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Zoom + actions */}
      <div className="flex items-center gap-1">
        {showZoom && (
          <>
            <button
              onClick={() => {
                const current = typeof scale === "number" ? scale : 1;
                onScaleChange(Math.max(0.25, current - 0.15));
              }}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--mm-text)] transition-colors hover:bg-[var(--mm-border)]"
              aria-label="Zoom out"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <select
              value={selectValue}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "page-width" || val === "page-fit") {
                  onScaleChange(val);
                } else {
                  onScaleChange(parseInt(val, 10) / 100);
                }
              }}
              className="h-7 rounded border border-[var(--mm-border)] bg-transparent px-1.5 text-xs text-[var(--mm-text)] outline-none focus:border-[var(--mm-accent)]"
            >
              <option value="page-width">Fit Width</option>
              <option value="page-fit">Fit Page</option>
              <option value="50">50%</option>
              <option value="75">75%</option>
              <option value="100">100%</option>
              <option value="125">125%</option>
              <option value="150">150%</option>
            </select>
            <button
              onClick={() => {
                const current = typeof scale === "number" ? scale : 1;
                onScaleChange(Math.min(3, current + 0.15));
              }}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--mm-text)] transition-colors hover:bg-[var(--mm-border)]"
              aria-label="Zoom in"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
          </>
        )}

        {showDownload && (
          <a
            href={sourceUrl}
            download
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--mm-text)] transition-colors hover:bg-[var(--mm-border)]"
            aria-label="Download document"
          >
            <Download className="h-4 w-4" />
          </a>
        )}

        {showFullscreen && fullscreenSupported && (
          <button
            onClick={onFullscreenToggle}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--mm-text)] transition-colors hover:bg-[var(--mm-border)]"
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            {isFullscreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}

function ErrorFallback({ url }: { url: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-[var(--mm-text-muted)]">
      <FileText className="h-10 w-10" />
      <p className="text-sm">Unable to render PDF inline.</p>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="mm-outline-button inline-flex h-9 items-center gap-1.5 px-3 text-xs font-semibold"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        Open document
      </a>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex items-center justify-center py-20 text-[var(--mm-text-muted)]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--mm-border)] border-t-[var(--mm-accent)]" />
        <p className="text-xs">Loading document&hellip;</p>
      </div>
    </div>
  );
}

export function DocumentViewerBlock({
  block,
}: {
  block: Extract<Block, { type: "DOCUMENT_VIEWER" }>;
}) {
  const data = (block.data || {}) as DocumentViewerData;
  const sourceUrl = resolveAssetUrl(String(data.url ?? "").trim());

  if (!sourceUrl) return null;
  if (/^javascript:/i.test(sourceUrl)) return null;

  const heightRaw = Number(data.height ?? 720);
  const height = Number.isFinite(heightRaw)
    ? Math.max(400, Math.min(1400, Math.round(heightRaw)))
    : 720;

  const showToolbar = data.showToolbar !== false;
  const showPageNav = data.showPageNav !== false;
  const showZoom = data.showZoom !== false;
  const showDownload = data.showDownload === true;
  const showFullscreen = data.showFullscreen !== false;

  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState<ScaleMode>(() => parseInitialZoom(data.initialZoom));
  const [computedScale, setComputedScale] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [pageOriginalWidth, setPageOriginalWidth] = useState(0);
  const [pageOriginalHeight, setPageOriginalHeight] = useState(0);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fullscreenSupported =
    typeof document !== "undefined" && !!document.fullscreenEnabled;

  // Compute actual scale from scale mode
  useEffect(() => {
    if (typeof scale === "number") {
      setComputedScale(scale);
      return;
    }

    if (!pageOriginalWidth || !scrollRef.current) return;

    const container = scrollRef.current;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const containerWidth = entry.contentRect.width - 48; // 24px padding each side
      const containerHeight = entry.contentRect.height;

      if (scale === "page-width") {
        setComputedScale(containerWidth / pageOriginalWidth);
      } else if (scale === "page-fit" && pageOriginalHeight) {
        setComputedScale(
          Math.min(
            containerWidth / pageOriginalWidth,
            containerHeight / pageOriginalHeight
          )
        );
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [scale, pageOriginalWidth, pageOriginalHeight]);

  // Fullscreen change listener
  useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!wrapperRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      wrapperRef.current.requestFullscreen();
    }
  }, []);

  const handlePageChange = useCallback(
    (page: number) => {
      setCurrentPage(Math.max(1, Math.min(numPages, page)));
    },
    [numPages]
  );

  const scaleLabel =
    typeof scale === "number"
      ? `${Math.round(scale * 100)}%`
      : scale === "page-width"
        ? "Fit Width"
        : "Fit Page";

  if (hasError) {
    return (
      <BlockSection
        block={block}
        defaults={{ paddingY: "lg", paddingX: "lg", width: "wide", align: "left", backgroundClass: "bg-transparent" }}
      >
        <ErrorFallback url={sourceUrl} />
      </BlockSection>
    );
  }

  return (
    <BlockSection
      block={block}
      defaults={{
        paddingY: "lg",
        paddingX: "lg",
        width: "wide",
        align: "left",
        backgroundClass: "bg-transparent",
      }}
    >
      {(data.title || data.caption) && (
        <div className="mb-6 max-w-3xl">
          {data.title && (
            <MarkdownText
              content={data.title}
              mode="inline"
              as="h2"
              className="microsite-display text-3xl font-semibold text-[var(--mm-text)] md:text-5xl"
            />
          )}
          {data.caption && (
            <MarkdownText
              content={data.caption}
              className="mt-3 text-sm leading-relaxed text-[var(--mm-text-muted)] md:text-base"
            />
          )}
        </div>
      )}

      <div
        ref={wrapperRef}
        className="overflow-hidden rounded-[1.4rem] border border-[var(--mm-border)] bg-[var(--mm-surface)] shadow-[0_16px_48px_rgba(15,23,42,0.12)]"
      >
        {showToolbar && numPages > 0 && (
          <DocumentToolbar
            currentPage={currentPage}
            numPages={numPages}
            onPageChange={handlePageChange}
            scale={scale}
            scaleLabel={scaleLabel}
            onScaleChange={setScale}
            showPageNav={showPageNav}
            showZoom={showZoom}
            showDownload={showDownload}
            showFullscreen={showFullscreen}
            sourceUrl={sourceUrl}
            isFullscreen={isFullscreen}
            onFullscreenToggle={toggleFullscreen}
            fullscreenSupported={fullscreenSupported}
          />
        )}

        <div
          ref={scrollRef}
          className="overflow-auto bg-neutral-100 dark:bg-neutral-900"
          style={{ height: isFullscreen ? "calc(100vh - 48px)" : `${height}px` }}
        >
          <div className="flex justify-center p-6">
            <Document
              file={sourceUrl}
              onLoadSuccess={({ numPages: n }) => setNumPages(n)}
              onLoadError={() => setHasError(true)}
              loading={<LoadingSkeleton />}
              error={<ErrorFallback url={sourceUrl} />}
            >
              <Page
                pageNumber={currentPage}
                scale={computedScale}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                onLoadSuccess={(page) => {
                  setPageOriginalWidth(page.originalWidth);
                  setPageOriginalHeight(page.originalHeight);
                }}
                loading={<LoadingSkeleton />}
              />
            </Document>
          </div>
        </div>
      </div>
    </BlockSection>
  );
}
