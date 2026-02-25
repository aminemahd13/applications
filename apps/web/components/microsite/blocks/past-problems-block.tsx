import type { Block } from "@event-platform/shared";
import Link from "next/link";
import { Download, Eye } from "lucide-react";
import { BlockSection } from "./block-section";
import { resolveAssetUrl } from "../asset-url";
import { MarkdownText } from "../markdown-text";

type ProblemItem = NonNullable<
  Extract<Block, { type: "PAST_PROBLEMS" }>["data"]
>["problems"][number];

type PastProblemsData = Extract<Block, { type: "PAST_PROBLEMS" }>["data"] & {
  heading?: string;
  description?: string;
  problems?: ProblemItem[];
};

const DIFFICULTY_CLASS: Record<string, string> = {
  intro: "border-emerald-400/45 bg-emerald-500/15 text-emerald-300",
  intermediate: "border-sky-400/45 bg-sky-500/15 text-sky-300",
  advanced: "border-amber-400/45 bg-amber-500/15 text-amber-300",
  olympiad: "border-violet-400/45 bg-violet-500/15 text-violet-300",
};

function isExternalHref(href: string): boolean {
  return href.startsWith("http://") || href.startsWith("https://");
}

function normalizeDifficulty(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "intro" || normalized === "intermediate" || normalized === "advanced" || normalized === "olympiad") {
    return normalized;
  }
  return "intermediate";
}

export function PastProblemsBlock({
  block,
}: {
  block: Extract<Block, { type: "PAST_PROBLEMS" }>;
}) {
  const data = (block.data || {}) as PastProblemsData;
  const problems = (data.problems ?? [])
    .map((problem) => {
      const sheetHref = resolveAssetUrl(String(problem.sheetHref ?? "").trim());
      const solutionHref = resolveAssetUrl(String(problem.solutionHref ?? "").trim());
      const tagsRaw = Array.isArray(problem.tags)
        ? problem.tags
        : String((problem as { tags?: unknown }).tags ?? "")
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);
      return {
        title: String(problem.title ?? "").trim(),
        year: String(problem.year ?? "").trim(),
        difficulty: normalizeDifficulty(String(problem.difficulty ?? "intermediate")),
        tags: tagsRaw,
        sheetHref,
        solutionHref,
      };
    })
    .filter((problem) => Boolean(problem.title || problem.sheetHref || problem.solutionHref));

  if (!data.heading && !data.description && problems.length === 0) return null;

  return (
    <BlockSection
      block={block}
      defaults={{
        paddingY: "xl",
        paddingX: "lg",
        width: "wide",
        align: "left",
        backgroundClass: "bg-transparent",
      }}
      containerClassName="space-y-7"
    >
      {(data.heading || data.description) && (
        <div className="space-y-3 text-center">
          {data.heading && (
            <MarkdownText
              content={data.heading}
              mode="inline"
              as="h2"
              className="microsite-display text-3xl font-semibold text-[var(--mm-text)] md:text-5xl"
            />
          )}
          {data.description && (
            <MarkdownText
              content={data.description}
              className="mx-auto max-w-3xl text-base text-[var(--mm-text-muted)] md:text-lg"
            />
          )}
        </div>
      )}

      {problems.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {problems.map((problem, index) => (
            <article
              key={`${problem.title || "problem"}-${index}`}
              className="microsite-card flex h-full flex-col p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <MarkdownText
                    content={problem.title || "Past Problem"}
                    mode="inline"
                    as="h3"
                    className="microsite-display text-2xl font-semibold text-[var(--mm-text)]"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    {problem.year && (
                      <span className="rounded-full border border-[var(--mm-border)] bg-[var(--mm-soft)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--mm-text-muted)]">
                        <MarkdownText content={problem.year} mode="inline" as="span" />
                      </span>
                    )}
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${DIFFICULTY_CLASS[problem.difficulty]}`}>
                      <MarkdownText content={problem.difficulty} mode="inline" as="span" />
                    </span>
                  </div>
                </div>
              </div>

              {problem.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {problem.tags.map((tag, tagIndex) => (
                    <span
                      key={`${tag}-${tagIndex}`}
                      className="rounded-md border border-[var(--mm-border)] bg-[var(--mm-soft)]/45 px-2 py-0.5 text-xs text-[var(--mm-text-muted)]"
                    >
                      <MarkdownText content={tag} mode="inline" as="span" />
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                {problem.sheetHref && (
                  <Link
                    href={problem.sheetHref}
                    target={isExternalHref(problem.sheetHref) ? "_blank" : undefined}
                    rel={isExternalHref(problem.sheetHref) ? "noopener noreferrer" : undefined}
                    className="mm-primary-button inline-flex h-9 items-center gap-1.5 px-3 text-xs font-semibold"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <MarkdownText content="Download sheet" mode="inline" as="span" />
                  </Link>
                )}
                {problem.solutionHref && (
                  <Link
                    href={problem.solutionHref}
                    target={isExternalHref(problem.solutionHref) ? "_blank" : undefined}
                    rel={isExternalHref(problem.solutionHref) ? "noopener noreferrer" : undefined}
                    className="mm-outline-button inline-flex h-9 items-center gap-1.5 px-3 text-xs font-semibold"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    <MarkdownText content="View solution" mode="inline" as="span" />
                  </Link>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </BlockSection>
  );
}

