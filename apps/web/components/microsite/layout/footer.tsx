import Link from "next/link";
import { MicrositeSettings } from "@event-platform/shared";
import { Facebook, Twitter, Instagram, Linkedin, Youtube, Globe } from "lucide-react";
import { resolveMicrositeHref } from "./link-utils";
import { cn } from "@/lib/utils";
import { resolveAssetUrl } from "../asset-url";
import { MarkdownText } from "../markdown-text";

type FooterSettings = MicrositeSettings["footer"];
type BrandingSettings = MicrositeSettings["branding"];

const SOCIAL_ICON_MAP = {
  facebook: Facebook,
  twitter: Twitter,
  instagram: Instagram,
  linkedin: Linkedin,
  youtube: Youtube,
};

export function Footer({
  settings,
  basePath,
  branding,
  logoAssetKey,
}: {
  settings?: FooterSettings;
  basePath?: string;
  branding?: BrandingSettings;
  logoAssetKey?: string;
}) {
  const {
    columns = [],
    socials = [],
    legalText,
    style = "angled",
    showLogo = true,
    showTagline = true,
    showSocials = true,
    showDividers = true,
  } = settings || {};

  const resolvedLogo = logoAssetKey ? resolveAssetUrl(logoAssetKey) : "/microsite/presets/mm-light.png";
  const isMinimal = style === "minimal";
  const showAngledDivider = style === "angled";
  const bandClass = isMinimal
    ? "border-t border-[var(--mm-border)] bg-[var(--mm-surface)] text-[var(--mm-text)]"
    : "mm-dark-band";
  const headingClass = isMinimal ? "text-[var(--mm-text)]" : "text-zinc-200";
  const bodyTextClass = isMinimal ? "text-[var(--mm-text-muted)]" : "text-zinc-300";
  const linkClass = isMinimal
    ? "text-sm text-[var(--mm-text-muted)] transition-colors hover:text-[var(--mm-text)] hover:underline"
    : "text-sm text-zinc-200 transition-colors hover:text-white hover:underline";
  const socialClass = isMinimal
    ? "inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--mm-border)] text-[var(--mm-text-muted)] transition-colors hover:border-[var(--mm-accent)] hover:text-[var(--mm-text)]"
    : "inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-zinc-300 transition-colors hover:border-white hover:text-white";
  const dividerClass = isMinimal ? "bg-[var(--mm-border)]/90" : "bg-zinc-700/80";
  const legalClass = isMinimal ? "text-[var(--mm-text-muted)]" : "text-zinc-500";

  return (
    <footer className={cn(showAngledDivider ? "pt-8" : "pt-0")}>
      {showAngledDivider && (
        <div className="relative -mt-11 flex h-11 w-full justify-between">
          <div className="h-11 flex-auto bg-[var(--mm-dark)]" />
          <div className="microsite-shell flex justify-between">
            <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
              <polygon points="0,100 0,0 100,100" fill="var(--mm-dark)" />
              <polygon points="100,0 0,0 100,100" fill="var(--mm-bg)" />
            </svg>
            <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
              <polygon points="0,0 100,0 0,100" fill="var(--mm-bg)" />
              <polygon points="100,100 100,0 0,100" fill="var(--mm-dark)" />
            </svg>
          </div>
          <div className="h-11 flex-auto bg-[var(--mm-dark)]" />
        </div>
      )}
      <div className={cn("py-12", bandClass)}>
        <div className="microsite-shell">
          <div className="flex flex-col space-y-8 md:flex-row md:justify-between md:space-y-0">
            <div>
              {showLogo && (
                <div className="mb-3 flex items-center space-x-4">
                  <Link className="flex h-9 items-center" href={resolveMicrositeHref("/", basePath)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={resolvedLogo}
                      alt={`${branding?.siteName || "Microsite"} logo`}
                      className={cn(
                        "h-full w-auto transition-all",
                        isMinimal
                          ? "rounded-sm"
                          : "filter brightness-100 contrast-125 hover:brightness-110 hover:contrast-110",
                      )}
                    />
                  </Link>
                </div>
              )}
              {showTagline && (
                <MarkdownText
                  content={branding?.tagline || "Unlocking the scientific potential of Moroccan youth."}
                  className={cn("max-w-[15rem] text-sm leading-relaxed", bodyTextClass)}
                />
              )}

              {showSocials && socials.length > 0 && (
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  {socials.map((social, idx) => {
                    const Icon = SOCIAL_ICON_MAP[social.platform as keyof typeof SOCIAL_ICON_MAP] || Globe;
                    return (
                      <Link
                        key={idx}
                        href={social.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={socialClass}
                      >
                        <Icon className="h-4 w-4" />
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-8 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {columns.map((col, idx) => (
                <div key={idx}>
                  <h3 className={cn("mb-3 font-bold", headingClass)}>
                    <MarkdownText content={col.title} mode="inline" as="span" />
                  </h3>
                  <ul className="space-y-2">
                    {(col.links || []).map((link, lIdx) => (
                      <li key={lIdx}>
                        <Link
                          href={resolveMicrositeHref(link.href, basePath)}
                          className={linkClass}
                        >
                          <MarkdownText content={link.label} mode="inline" as="span" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {showDividers && <div className={cn("my-6 h-px w-full", dividerClass)} />}
          <MarkdownText
            content={legalText || `Math&Maroc (c) ${new Date().getFullYear()}. All rights reserved.`}
            className={cn("text-sm", legalClass)}
          />
        </div>
      </div>
    </footer>
  );
}
