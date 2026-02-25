import { Block } from "@event-platform/shared";
import { Linkedin, Twitter, Github, Globe } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { resolveAssetUrl } from "../asset-url";
import { BlockSection } from "./block-section";
import { MarkdownText } from "../markdown-text";

type TeamMember = NonNullable<Extract<Block, { type: "TEAM_GRID" }>["data"]>["members"][number];
type TeamMemberRender = TeamMember & {
  imageUrl?: string;
  bio?: string;
  team?: string;
  location?: string;
};
type TeamSocial = NonNullable<TeamMember["socials"]>[number];
type TeamGridData = Extract<Block, { type: "TEAM_GRID" }>["data"] & {
  heading?: string;
  title?: string;
  description?: string;
  maxColumns?: "auto" | "3" | "4" | "5" | "6" | number;
  cardStyle?: "compact" | "comfortable";
  showBio?: boolean;
  showSocials?: boolean;
};

const SOCIAL_ICON_MAP = {
  linkedin: Linkedin,
  twitter: Twitter,
  github: Github,
  website: Globe,
} as const;

const GRID_CLASS_BY_COLUMNS: Record<"3" | "4" | "5" | "6", string> = {
  "3": "sm:grid-cols-2 lg:grid-cols-3",
  "4": "sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4",
  "5": "sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5",
  "6": "sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6",
};

function resolveColumns(value: TeamGridData["maxColumns"], memberCount: number): "3" | "4" | "5" | "6" {
  const normalized = String(value ?? "auto");
  if (normalized === "3" || normalized === "4" || normalized === "5" || normalized === "6") {
    return normalized;
  }
  if (memberCount >= 24) return "6";
  if (memberCount >= 14) return "5";
  if (memberCount >= 8) return "4";
  return "3";
}

export function TeamGridBlock({ block }: { block: Extract<Block, { type: "TEAM_GRID" }> }) {
  const data = (block.data || {}) as TeamGridData;
  const { title, members = [] } = data;
  const heading = data.heading ?? title;
  const renderMembers = members as TeamMemberRender[];

  if (renderMembers.length === 0) return null;

  const columns = resolveColumns(data.maxColumns, renderMembers.length);
  const isComfortable = data.cardStyle === "comfortable";
  const showBio = data.showBio ?? isComfortable;
  const showSocials = data.showSocials ?? true;

  return (
    <BlockSection
      block={block}
      defaults={{
        paddingY: "xl",
        paddingX: "lg",
        width: "wide",
        align: "center",
        backgroundClass: "bg-transparent",
      }}
    >
      {(heading || data.description) && (
        <div className="mx-auto mb-10 max-w-3xl text-center">
          {heading && (
            <MarkdownText
              content={heading}
              mode="inline"
              as="h2"
              className={cn("microsite-display font-semibold text-[var(--mm-text)]", isComfortable ? "text-3xl md:text-5xl" : "text-2xl md:text-4xl")}
            />
          )}
          {data.description && (
            <MarkdownText
              content={data.description}
              className="mt-3 text-sm text-[var(--mm-text-muted)] md:text-base"
            />
          )}
        </div>
      )}

      <div className={cn("grid grid-cols-1", GRID_CLASS_BY_COLUMNS[columns], isComfortable ? "gap-7" : "gap-4 md:gap-5")}>
        {renderMembers.map((member, idx: number) => {
          const memberName = member.name || "Team member";
          const initials = memberName
            .split(" ")
            .map((token) => token.trim()[0] ?? "")
            .join("")
            .slice(0, 2)
            .toUpperCase();
          return (
            <article
              key={idx}
              className={cn(
                "group flex flex-col items-center rounded-[1.1rem] border border-[var(--mm-border)] bg-[var(--mm-surface)] text-center transition-colors",
                isComfortable
                  ? "p-6 shadow-[0_18px_45px_rgba(15,23,42,0.08)]"
                  : "p-4 shadow-[0_10px_24px_rgba(15,23,42,0.06)] hover:border-[var(--mm-accent)]/35",
              )}
            >
              <div className={cn("overflow-hidden rounded-full border-2 border-transparent bg-[var(--mm-soft)] transition-all group-hover:border-[var(--mm-accent)]", isComfortable ? "mb-5 h-32 w-32" : "mb-3 h-20 w-20")}>
                {(member.imageUrl || member.assetKey) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={resolveAssetUrl(member.imageUrl || member.assetKey)}
                    alt={memberName}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[var(--mm-text-muted)]">
                    <span className={cn("font-semibold", isComfortable ? "text-2xl" : "text-lg")}>{initials || "?"}</span>
                  </div>
                )}
              </div>

              <h3 className={cn("microsite-display font-semibold text-[var(--mm-text)]", isComfortable ? "text-2xl" : "text-lg md:text-xl")}>
                <MarkdownText content={memberName} mode="inline" as="span" />
              </h3>

              {(member.role || member.team) && (
                <p className={cn("mt-1 font-semibold uppercase tracking-[0.16em] text-[var(--mm-accent)]", isComfortable ? "text-sm" : "text-[11px]")}>
                  <MarkdownText content={[member.role, member.team].filter(Boolean).join(" - ")} mode="inline" as="span" />
                </p>
              )}

              {member.location && (
                <p className="mt-1 text-xs text-[var(--mm-text-muted)]">
                  <MarkdownText content={member.location} mode="inline" as="span" />
                </p>
              )}

              {showBio && member.bio && (
                <MarkdownText
                  content={member.bio}
                  className={cn("mt-2 leading-relaxed text-[var(--mm-text-muted)]", isComfortable ? "text-sm" : "text-xs")}
                />
              )}

              {showSocials && member.socials && member.socials.length > 0 && (
                <div className={cn("mt-3 flex flex-wrap justify-center gap-2 opacity-80 transition-opacity group-hover:opacity-100", isComfortable ? "md:mt-4" : "")}>
                  {member.socials.map((social: TeamSocial, sIdx: number) => {
                    const Icon = SOCIAL_ICON_MAP[social.platform as keyof typeof SOCIAL_ICON_MAP];
                    return (
                      <Link
                        key={sIdx}
                        href={social.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                          "rounded-full border border-[var(--mm-border)] bg-[var(--mm-soft)] transition-colors hover:border-[var(--mm-accent)]",
                          isComfortable ? "p-2" : "p-1.5",
                        )}
                      >
                        {Icon && <Icon className={cn("text-[var(--mm-text-muted)]", isComfortable ? "h-4 w-4" : "h-3.5 w-3.5")} />}
                      </Link>
                    );
                  })}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </BlockSection>
  );
}
