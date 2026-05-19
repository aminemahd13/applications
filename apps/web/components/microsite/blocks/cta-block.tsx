import { Block } from "@event-platform/shared";
import { MessageCircleIcon, Scroll } from "lucide-react";
import { BlockSection } from "./block-section";
import { MarkdownText } from "../markdown-text";
import { FeedbackLink } from "../feedback-link";

type CtaBlockData = Extract<Block, { type: "CTA" }>["data"] & {
  heading?: string;
  description?: string;
  action?: "APPLY" | "OPEN_PORTAL" | "LINK";
  primaryButton?: {
    label?: string;
    href?: string;
  };
};

function resolveCtaHref(
  data: CtaBlockData,
  eventSlug?: string,
): string {
  const rawHref = (data.primaryButton?.href ?? data.href ?? "#").trim();
  const action = data.action;

  if (action === "APPLY" && eventSlug) {
    return `/applications/event/${eventSlug}`;
  }

  if (action === "OPEN_PORTAL") {
    return "/dashboard";
  }

  if (eventSlug) {
    const isApplyShortcut =
      rawHref === "#" ||
      rawHref.toLowerCase() === "apply" ||
      rawHref.toLowerCase() === "/apply" ||
      rawHref.toLowerCase() === "/applications/me" ||
      rawHref.toLowerCase() === "event-apply";

    if (isApplyShortcut) {
      return `/applications/event/${eventSlug}`;
    }
  }

  return rawHref || "#";
}

export function CtaBlock({
  block,
  eventSlug,
}: {
  block: Extract<Block, { type: "CTA" }>;
  eventSlug?: string;
}) {
  const data = (block.data || {}) as CtaBlockData;

  // Support both editor format (heading/description/primaryButton) and legacy (label/variant/href)
  const heading = data.heading;
  const description = data.description;
  const buttonLabel = String(data.primaryButton?.label ?? data.label ?? "")
    .replace(/\s+/g, " ")
    .trim();
  const buttonHref = resolveCtaHref(data, eventSlug);
  const faqHref = eventSlug ? `/events/${eventSlug}/faq` : "/faq";
  const isExternal = buttonHref?.startsWith('http');

  return (
    <BlockSection
      block={block}
      defaults={{
        paddingY: "lg",
        paddingX: "lg",
        width: "normal",
        align: "center",
        backgroundClass: "bg-transparent",
      }}
      containerClassName="mm-pattern-cta custom-shadow w-full p-10 md:p-14 md:w-1/2 flex flex-col items-center gap-7 text-center text-white"
    >
      {heading && (
        <MarkdownText
          content={heading}
          mode="inline"
          as="h2"
          className="microsite-display text-display-md md:text-display-lg"
        />
      )}
      {description && (
        <MarkdownText
          content={description}
          className="max-w-2xl text-base leading-relaxed text-white/85 md:text-lg md:leading-[1.7]"
        />
      )}
      <div className="flex flex-wrap items-center justify-center gap-4 pt-1">
        {buttonLabel && (
          <FeedbackLink
            href={buttonHref}
            target={isExternal ? "_blank" : undefined}
            rel={isExternal ? "noopener noreferrer" : undefined}
            className="mm-ring-button"
          >
            <span className="mm-ring-button-inner">
              <Scroll className="h-5 w-5" />
              <MarkdownText content={buttonLabel} mode="inline" as="span" />
              <span aria-hidden="true" className="-mr-1 transition-transform group-hover:translate-x-0.5">→</span>
            </span>
          </FeedbackLink>
        )}
        <FeedbackLink href={faqHref} className="mm-faq-button px-4 py-2">
          <MessageCircleIcon className="h-5 w-5" />
          <span className="hidden sm:inline-block">FAQ</span>
        </FeedbackLink>
      </div>
    </BlockSection>
  );
}
