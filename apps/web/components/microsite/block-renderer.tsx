import { Block } from "@event-platform/shared";
import { HeroBlock } from "./blocks/hero-block";
import { AnnouncementBlock } from "./blocks/announcement-block";
import { CountdownBlock } from "./blocks/countdown-block";
import { CalendarBlock } from "./blocks/calendar-block";
import { AgendaBlock } from "./blocks/agenda-block";
import { VenueBlock } from "./blocks/venue-block";
import { CardGridBlock } from "./blocks/card-grid-block";
import { LogoCloudBlock } from "./blocks/logo-cloud-block";
import { StatsBlock } from "./blocks/stats-block";
import { StepsBlock } from "./blocks/steps-block";
import { ImageGalleryBlock } from "./blocks/image-gallery-block";
import { ImageStackBlock } from "./blocks/image-stack-block";
import { TeamGridBlock } from "./blocks/team-grid-block";
import { TeamTooltipBlock } from "./blocks/team-tooltip-block";
import { FaqBlock } from "./blocks/faq-block";
import { TimelineBlock } from "./blocks/timeline-block";
import { CtaBlock } from "./blocks/cta-block";
import { TabsBlock } from "./blocks/tabs-block";
import { RichTextBlock } from "./blocks/rich-text-block";
import { ImageBlock } from "./blocks/image-block";
import { GridBlock } from "./blocks/grid-block";
import { VideoEmbedBlock } from "./blocks/video-embed-block";
import { EmbedDocBlock } from "./blocks/embed-doc-block";
import { SeparatorBlock } from "./blocks/separator-block";
import { TextBlock } from "./blocks/text-block";
import { TextImageLeftBlock } from "./blocks/text-image-left-block";
import { TextImageRightBlock } from "./blocks/text-image-right-block";
import { TestimonialsBlock } from "./blocks/testimonials-block";
import { CustomCodeBlock } from "./blocks/custom-code-block";
import { PartnerStripBlock } from "./blocks/partner-strip-block";
import { SpeakerSpotlightBlock } from "./blocks/speaker-spotlight-block";
import { ResourcesBlock } from "./blocks/resources-block";
import { StickyAlertBarBlock } from "./blocks/sticky-alert-bar-block";
import { RanksBlock } from "./blocks/ranks-block";
import { ParticipationStepsBlock } from "./blocks/participation-steps-block";
import { RegistrationChecklistBlock } from "./blocks/registration-checklist-block";
import { TracksOverviewBlock } from "./blocks/tracks-overview-block";
import { PastProblemsBlock } from "./blocks/past-problems-block";

export function BlockRenderer({
  blocks,
  eventSlug,
  siteLogoAssetKey,
  isPreview = false,
}: {
  blocks: Block[];
  eventSlug?: string;
  siteLogoAssetKey?: string;
  isPreview?: boolean;
}) {
  if (!blocks || blocks.length === 0) return null;

  return (
    <div className="flex flex-col w-full">
      {blocks.map((block) => (
        <SingleBlock
          key={block.id}
          block={block}
          eventSlug={eventSlug}
          siteLogoAssetKey={siteLogoAssetKey}
          isPreview={isPreview}
        />
      ))}
    </div>
  );
}

function SingleBlock({
  block,
  eventSlug,
  siteLogoAssetKey,
  isPreview,
}: {
  block: Block;
  eventSlug?: string;
  siteLogoAssetKey?: string;
  isPreview: boolean;
}) {
  switch (block.type) {
    case "HERO":
      return (
        <HeroBlock
          block={block}
          eventSlug={eventSlug}
          siteLogoAssetKey={siteLogoAssetKey}
        />
      );
    case "ANNOUNCEMENT":
      return <AnnouncementBlock block={block} />;
    case "COUNTDOWN":
      return <CountdownBlock block={block} />;
    case "CALENDAR":
      return <CalendarBlock block={block} />;
    case "AGENDA":
      return <AgendaBlock block={block} />;
    case "CARD_GRID":
      return <CardGridBlock block={block} />;
    case "LOGO_CLOUD":
      return <LogoCloudBlock block={block} />;
    case "STATS":
      return <StatsBlock block={block} />;
    case "STEPS":
      return <StepsBlock block={block} />;
    case "PARTICIPATION_STEPS":
      return <ParticipationStepsBlock block={block as Extract<Block, { type: "PARTICIPATION_STEPS" }>} />;
    case "PAST_PROBLEMS":
      return <PastProblemsBlock block={block as Extract<Block, { type: "PAST_PROBLEMS" }>} />;
    case "REGISTRATION_CHECKLIST":
      return <RegistrationChecklistBlock block={block as Extract<Block, { type: "REGISTRATION_CHECKLIST" }>} />;
    case "TRACKS_OVERVIEW":
      return <TracksOverviewBlock block={block as Extract<Block, { type: "TRACKS_OVERVIEW" }>} />;
    case "IMAGE_GALLERY":
      return <ImageGalleryBlock block={block} />;
    case "IMAGE_STACK":
      return <ImageStackBlock block={block} />;
    case "PARTNER_STRIP":
      return <PartnerStripBlock block={block} />;
    case "TEAM_GRID":
      return <TeamGridBlock block={block} />;
    case "VENUE":
      return <VenueBlock block={block} />;
    case "TEAM_TOOLTIP":
      return <TeamTooltipBlock block={block} />;
    case "SPEAKER_SPOTLIGHT":
      return <SpeakerSpotlightBlock block={block} />;
    case "RESOURCES":
      return <ResourcesBlock block={block} />;
    case "STICKY_ALERT_BAR":
      return <StickyAlertBarBlock block={block} isPreview={isPreview} />;
    case "FAQ":
      return <FaqBlock block={block} />;
    case "TIMELINE":
      return <TimelineBlock block={block} />;
    case "CTA":
      return <CtaBlock block={block} eventSlug={eventSlug} />;
    case "TABS":
      return <TabsBlock block={block} />;
    case "VIDEO_EMBED":
      return <VideoEmbedBlock block={block} />;
    case "EMBED_DOC":
      return <EmbedDocBlock block={block} />;
    case "SEPARATOR":
      return <SeparatorBlock block={block as Extract<Block, { type: "SEPARATOR" }>} />;
    case "TEXT":
      return <TextBlock block={block} />;
    case "TEXT_IMAGE_LEFT":
      return <TextImageLeftBlock block={block as Extract<Block, { type: "TEXT_IMAGE_LEFT" }>} />;
    case "TEXT_IMAGE_RIGHT":
      return <TextImageRightBlock block={block} />;
    case "TESTIMONIALS":
      return <TestimonialsBlock block={block} />;
    case "CUSTOM_CODE":
      return <CustomCodeBlock block={block} />;
    case "RANKS":
      return <RanksBlock block={block as Extract<Block, { type: "RANKS" }>} />;
    
    case "RICH_TEXT":
      return <RichTextBlock block={block} />;
    case "IMAGE":
      return <ImageBlock block={block} />;
    case "GRID":
      return <GridBlock block={block} />;
    
    default:
      return null;
  }
}
