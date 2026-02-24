"use client";

import { useEffect, useState, useCallback, useMemo, useRef, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, Reorder, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Save,
  Loader2,
  Plus,
  Trash2,
  GripVertical,
  Type,
  Image,
  LayoutGrid,
  Sparkles,
  BarChart3,
  ListOrdered,
  HelpCircle,
  Clock,
  CalendarDays,
  MousePointer,
  ImageIcon,
  Users,
  Columns,
  Megaphone,
  Timer,
  MapPin,
  ChevronDown,
  ChevronRight,
  Undo2,
  Redo2,
  Monitor,
  Tablet,
  Smartphone,
  PanelLeft,
  PanelRight,
  Copy,
  Code2,
  Video,
  FileText,
  MessageSquareQuote,
  Minus,
  Search,
  Settings2,
  CheckCircle2,
  AlertCircle,
  Trophy,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { ScrollArea } from "@/components/ui/scroll-area";
import { BlockRenderer } from "@/components/microsite/block-renderer";
import { MediaLibraryDialog } from "@/components/microsite/media-library-dialog";


import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { uploadMicrositeAsset } from "@/lib/microsite-media";
import {
  readMicrositeAutoPublishPreference,
  writeMicrositeAutoPublishPreference,
} from "@/lib/microsite-auto-publish";
import { cn } from "@/lib/utils";
import {
  getMicrositeStyleVariables,
  MICROSITE_RUNTIME_CSS,
  normalizeMicrositeSettings,
  resolveMicrositeBodyClass,
  resolveMicrositeHeadingClass,
  resolveMicrositeMotionClass,
  resolveMicrositeThemeClass,
} from "@/components/microsite/theme/runtime";
import { toast } from "sonner";
import {
  UpdateMicrositePageSchema,
  type Block as SharedBlock,
  type MicrositeSettings as SharedMicrositeSettings,
} from "@event-platform/shared";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type BlockType =
  | "HERO"
  | "ANNOUNCEMENT"
  | "COUNTDOWN"
  | "RICH_TEXT"
  | "IMAGE"
  | "GRID"
  | "CARD_GRID"
  | "FAQ"
  | "TIMELINE"
  | "CALENDAR"
  | "AGENDA"
  | "CTA"
  | "LOGO_CLOUD"
  | "STATS"
  | "STEPS"
  | "IMAGE_GALLERY"
  | "IMAGE_STACK"
  | "PARTNER_STRIP"
  | "TEAM_GRID"
  | "VENUE"
  | "TEAM_TOOLTIP"
  | "SPEAKER_SPOTLIGHT"
  | "RESOURCES"
  | "STICKY_ALERT_BAR"
  | "TABS"
  | "VIDEO_EMBED"
  | "EMBED_DOC"
  | "SEPARATOR"
  | "TEXT_IMAGE_LEFT"
  | "TEXT_IMAGE_RIGHT"
  | "TESTIMONIALS"
  | "CUSTOM_CODE"
  | "RANKS";

interface BlockData {
  [key: string]: unknown;
}

interface Block {
  id: string;
  type: BlockType;
  data: BlockData;
}

interface MicrositePage {
  id: string;
  slug: string;
  title: string;
  blocks: Block[];
  visibility: "PUBLIC" | "HIDDEN";
  seo?: Record<string, unknown>;
}

interface PageCustomCode {
  htmlTop?: string;
  htmlBottom?: string;
  css?: string;
}

const BLOCK_CATALOG: {
  type: BlockType;
  label: string;
  description: string;
  icon: typeof Type;
  category: string;
}[] = [
  { type: "HERO", label: "Hero", description: "Large heading with CTA", icon: Sparkles, category: "Layout" },
  { type: "ANNOUNCEMENT", label: "Announcement", description: "Urgent updates, badges, and quick actions", icon: Megaphone, category: "Conversion" },
  { type: "COUNTDOWN", label: "Countdown", description: "Live countdown to launch, opening, or deadline", icon: Timer, category: "Conversion" },
  { type: "RICH_TEXT", label: "Rich Text", description: "Formatted text content", icon: Type, category: "Content" },
  { type: "IMAGE", label: "Image", description: "Single image with caption", icon: Image, category: "Content" },
  { type: "GRID", label: "Info Grid", description: "Simple grid of text tiles", icon: LayoutGrid, category: "Layout" },
  { type: "CARD_GRID", label: "Card Grid", description: "Grid of info cards", icon: LayoutGrid, category: "Layout" },
  { type: "FAQ", label: "FAQ", description: "Expandable questions", icon: HelpCircle, category: "Content" },
  { type: "TIMELINE", label: "Timeline", description: "Chronological events", icon: Clock, category: "Content" },
  { type: "CALENDAR", label: "Calendar", description: "Date-based schedule with sessions and links", icon: CalendarDays, category: "Program" },
  { type: "AGENDA", label: "Agenda", description: "Multi-day program with sessions and speakers", icon: CalendarDays, category: "Program" },
  { type: "CTA", label: "Call to Action", description: "Action prompt section", icon: MousePointer, category: "Layout" },
  { type: "LOGO_CLOUD", label: "Logo Cloud", description: "Partner logos", icon: ImageIcon, category: "Layout" },
  { type: "STATS", label: "Stats", description: "Statistics counter", icon: BarChart3, category: "Content" },
  { type: "STEPS", label: "Steps", description: "Numbered process steps", icon: ListOrdered, category: "Content" },
  { type: "IMAGE_GALLERY", label: "Gallery", description: "Photo gallery grid", icon: Columns, category: "Layout" },
  { type: "IMAGE_STACK", label: "Image Stack", description: "Animated stacked photo carousel", icon: ImageIcon, category: "Media" },
  { type: "PARTNER_STRIP", label: "Partner Strip", description: "Organized/trusted/hosted logos row", icon: ImageIcon, category: "Layout" },
  { type: "TEAM_GRID", label: "Team Directory", description: "Scalable grid for large event teams", icon: Users, category: "Layout" },
  { type: "VENUE", label: "Venue", description: "Map, address, travel info, and logistics", icon: MapPin, category: "Logistics" },
  { type: "TEAM_TOOLTIP", label: "Team Tooltip", description: "Overlapping avatars with hover card", icon: Users, category: "Social Proof" },
  { type: "SPEAKER_SPOTLIGHT", label: "Speaker Spotlight", description: "Featured speaker cards with quick bio modal", icon: Users, category: "Program" },
  { type: "RESOURCES", label: "Resources", description: "Download center for brochures, maps, and decks", icon: FileText, category: "Content" },
  { type: "STICKY_ALERT_BAR", label: "Sticky Alert Bar", description: "Persistent top banner for urgent updates", icon: AlertCircle, category: "Conversion" },
  { type: "TABS", label: "Tabs", description: "Tabbed content", icon: Columns, category: "Content" },
  { type: "VIDEO_EMBED", label: "Video", description: "Embed YouTube or Vimeo", icon: Video, category: "Media" },
  { type: "EMBED_DOC", label: "Embed Doc", description: "Inline PDF/DOC viewer for brochures and handbooks", icon: FileText, category: "Content" },
  { type: "SEPARATOR", label: "Separator", description: "Visual divider with line, dash, dots, or gradient", icon: Minus, category: "Layout" },
  { type: "TEXT_IMAGE_LEFT", label: "Image Left + Text", description: "Two-column section with image on the left", icon: PanelLeft, category: "Layout" },
  { type: "TEXT_IMAGE_RIGHT", label: "Text + Image Right", description: "Two-column text section with image on the right", icon: PanelRight, category: "Layout" },
  { type: "TESTIMONIALS", label: "Testimonials", description: "Applicant or partner quotes", icon: MessageSquareQuote, category: "Social Proof" },
  { type: "CUSTOM_CODE", label: "Custom Code", description: "Custom HTML and CSS", icon: Code2, category: "Advanced" },
  { type: "RANKS", label: "Ranks / Results", description: "Competition results table with CSV import", icon: Trophy, category: "Content" },
];

const PAGE_TEMPLATES: Array<{
  id: string;
  label: string;
  description: string;
  blocks: BlockType[];
}> = [
  {
    id: "launch",
    label: "Launch Page",
    description: "Deadline-focused page with urgency, proof, and conversion.",
    blocks: ["HERO", "ANNOUNCEMENT", "COUNTDOWN", "STATS", "TESTIMONIALS", "FAQ", "CTA"],
  },
  {
    id: "program",
    label: "Program Overview",
    description: "Show structure, tracks, schedule, and speakers.",
    blocks: ["HERO", "STICKY_ALERT_BAR", "AGENDA", "CALENDAR", "SPEAKER_SPOTLIGHT", "TEAM_GRID", "CTA"],
  },
  {
    id: "gallery",
    label: "Media Story",
    description: "Visual-first layout for recap or promotion pages.",
    blocks: ["HERO", "IMAGE_STACK", "IMAGE_GALLERY", "VIDEO_EMBED", "TESTIMONIALS", "CTA"],
  },
  {
    id: "partners",
    label: "Partnership Pitch",
    description: "Value proposition, logos, metrics, and contact action.",
    blocks: ["HERO", "CARD_GRID", "PARTNER_STRIP", "LOGO_CLOUD", "STATS", "CTA"],
  },
  {
    id: "ticketing",
    label: "Ticketing Funnel",
    description: "Promote urgency, credibility, and clear next action.",
    blocks: ["HERO", "ANNOUNCEMENT", "COUNTDOWN", "STATS", "FAQ", "CTA"],
  },
  {
    id: "onsite",
    label: "On-site Logistics",
    description: "Help attendees navigate location, schedule, and readiness.",
    blocks: ["HERO", "STICKY_ALERT_BAR", "CALENDAR", "VENUE", "RESOURCES", "FAQ", "CTA"],
  },
];

const CATEGORIES = Array.from(new Set(BLOCK_CATALOG.map((b) => b.category)));
const DEFAULT_MICROSITE_SETTINGS: SharedMicrositeSettings = normalizeMicrositeSettings({});

const MICROSITE_PREVIEW_RUNTIME_CSS = MICROSITE_RUNTIME_CSS;

function createId() {
  return `blk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function parseOptionalNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseOptionalBoundedInt(
  value: string,
  min: number,
  max: number,
): number | undefined {
  const parsed = parseOptionalNumber(value);
  if (parsed === undefined) return undefined;
  const rounded = Math.round(parsed);
  return Math.min(max, Math.max(min, rounded));
}

function getDefaultData(type: BlockType): BlockData {
  switch (type) {
    case "HERO":
      return {
        title: "Welcome",
        subtitle: "Your event description here",
        eyebrow: "Applications are open",
        layout: "centered",
        cta: { label: "Apply Now", href: "#" },
        secondaryCta: { label: "See Program", href: "#program" },
        showFaqButton: true,
        facts: [],
      };
    case "ANNOUNCEMENT":
      return {
        badge: "Applications Open",
        message: "Early applications close soon. Submit now to lock in your interview slot.",
        tone: "info",
        cta: { label: "Apply now", href: "#" },
        secondaryCta: { label: "Read FAQ", href: "#faq" },
      };
    case "COUNTDOWN":
      return {
        title: "Submission deadline",
        subtitle: "Get your application in before the next review batch.",
        targetDate: "2026-09-15T23:59:00Z",
        timezoneLabel: "UTC",
        showSeconds: false,
        endedLabel: "Deadline closed. Join the waitlist for updates.",
        milestones: [
          { label: "Review batch", value: "Weekly" },
          { label: "Decision email", value: "Within 5 days" },
        ],
        cta: { label: "Start application", href: "#" },
        secondaryCta: { label: "Download program brief", href: "#" },
      };
    case "RICH_TEXT":
      return { content: "<p>Start writing your content here...</p>" };
    case "IMAGE":
      return { src: "", alt: "", caption: "" };
    case "GRID":
      return { heading: "Highlights", columns: 3, items: [{ title: "Item 1", text: "Description" }] };
    case "CARD_GRID":
      return { heading: "Features", cards: [{ title: "Card 1", description: "Description", icon: "star" }] };
    case "FAQ":
      return { heading: "Frequently Asked Questions", items: [{ question: "What is this?", answer: "An event platform." }] };
    case "TIMELINE":
      return { heading: "Timeline", items: [{ date: "2025-01-01", title: "Event starts", description: "" }] };
    case "CALENDAR":
      return {
        heading: "Event Calendar",
        description: "Track sessions, activities, and deadlines across the event timeline.",
        timezoneLabel: "UTC",
        layout: "week",
        items: [
          {
            date: "2026-10-14",
            title: "Opening Ceremony",
            startTime: "09:00",
            endTime: "10:00",
            location: "Main Hall",
            description: "Welcome keynote and program kickoff.",
            tag: "Main Stage",
            cta: { label: "View details", href: "#" },
          },
          {
            date: "2026-10-14",
            title: "Mentor Office Hours",
            startTime: "14:00",
            endTime: "16:00",
            location: "Mentor Lounge",
            description: "Book one-on-one coaching with mentors.",
            tag: "Mentoring",
            cta: { label: "Book slot", href: "#" },
          },
        ],
      };
    case "AGENDA":
      return {
        heading: "Program Agenda",
        description: "A day-by-day breakdown of sessions, workshops, and networking moments.",
        layout: "stacked",
        days: [
          {
            label: "Day 1",
            date: "2026-10-14",
            title: "Kickoff & Foundations",
            sessions: [
              {
                time: "09:00",
                endTime: "10:00",
                title: "Opening keynote",
                speaker: "Program Director",
                track: "Main Stage",
                location: "Hall A",
                description: "Vision, goals, and experience map for this year.",
              },
              {
                time: "10:30",
                endTime: "12:00",
                title: "Team formation",
                speaker: "Mentor Panel",
                track: "Workshop",
                location: "Studio 2",
                description: "Match ideas, skills, and execution plans.",
              },
            ],
          },
        ],
      };
    case "CTA":
      return { heading: "Ready to join?", description: "Apply now and secure your spot.", primaryButton: { label: "Apply", href: "#" }, variant: "primary", action: "LINK" };
    case "LOGO_CLOUD":
      return { heading: "Partners", logos: [] };
    case "STATS":
      return { heading: "By the Numbers", items: [{ label: "Participants", value: "500+" }] };
    case "STEPS":
      return { heading: "How it works", steps: [{ title: "Step 1", description: "Description" }] };
    case "IMAGE_GALLERY":
      return { heading: "Gallery", layout: "grid", items: [] };
    case "IMAGE_STACK":
      return {
        heading: "Photo Highlights",
        caption: "A quick visual look at the event atmosphere.",
        autoplay: true,
        intervalMs: 3500,
        images: [{ name: "Photo 1", url: "" }],
      };
    case "PARTNER_STRIP":
      return {
        heading: "Partners",
        items: [
          { label: "Organized by", logo: "", href: "", size: "md" },
          { label: "Trusted by", logo: "", href: "", size: "md" },
        ],
      };
    case "TEAM_GRID":
      return {
        heading: "Meet the Team",
        description: "The people behind this event and community.",
        maxColumns: "auto",
        cardStyle: "compact",
        showBio: false,
        showSocials: true,
        members: [{ name: "Name", role: "Role", team: "Operations" }],
      };
    case "VENUE":
      return {
        heading: "Venue & Logistics",
        venueName: "Innovation Center",
        address: "123 Main Street, San Francisco, CA",
        mapEmbedUrl: "",
        mapLink: "https://maps.google.com",
        notes: "Doors open at 8:30 AM. Security check is required at entry.",
        details: [
          { label: "Check-in", value: "8:30 AM - 9:00 AM", icon: "clock" },
          { label: "Nearest transit", value: "Downtown Station (7 min walk)", icon: "train" },
          { label: "Parking", value: "Garage C (discount code: EVENT25)", icon: "car" },
        ],
        highlights: ["Wheelchair accessible", "Prayer room available"],
        cta: { label: "View travel guide", href: "#" },
      };
    case "TEAM_TOOLTIP":
      return {
        heading: "Who are we?",
        description: "A dedicated team behind this initiative.",
        ctaLabel: "Discover the organizing team",
        ctaHref: "/organizing-team",
        items: [{ name: "Member", designation: "Role", url: "" }],
      };
    case "SPEAKER_SPOTLIGHT":
      return {
        heading: "Featured Speakers",
        description: "Meet key speakers and jump directly to their sessions.",
        speakers: [
          {
            name: "Dr. Aya Benali",
            role: "AI Research Lead",
            organization: "Atlas Labs",
            imageUrl: "",
            bio: "Researcher focused on practical AI systems, model evaluation, and responsible deployment.",
            sessionTitle: "Applied AI in Education",
            sessionHref: "#",
          },
          {
            name: "Samuel Haddad",
            role: "Product Director",
            organization: "Northstar Ventures",
            imageUrl: "",
            bio: "Builds product strategy for early-stage startups and mentor-driven accelerator programs.",
            sessionTitle: "From Prototype to Product",
            sessionHref: "#",
          },
        ],
      };
    case "RESOURCES":
      return {
        heading: "Download Center",
        description: "Grab event brochures, venue maps, policies, and slide decks in one place.",
        columns: 2,
        resources: [
          {
            title: "Attendee Brochure",
            description: "Program overview, tracks, and key dates.",
            href: "#",
            kind: "brochure",
            fileType: "PDF",
            sizeLabel: "2.4 MB",
          },
          {
            title: "Venue Map",
            description: "Room layout, check-in desks, and emergency exits.",
            href: "#",
            kind: "map",
            fileType: "PDF",
            sizeLabel: "1.1 MB",
          },
          {
            title: "Event Policy Pack",
            description: "Code of conduct, privacy policy, and participation rules.",
            href: "#",
            kind: "policy",
            fileType: "PDF",
            sizeLabel: "820 KB",
          },
        ],
      };
    case "STICKY_ALERT_BAR":
      return {
        badge: "Urgent update",
        message: "Room change: Keynote moved to Hall B. Registration closes today at 18:00.",
        tone: "urgent",
        showIcon: true,
        cta: { label: "View update", href: "#" },
      };
    case "TABS":
      return { tabs: [{ label: "Tab 1", content: "Content here" }] };
    case "VIDEO_EMBED":
      return { title: "Event Highlights", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", caption: "" };
    case "EMBED_DOC":
      return {
        title: "Program Handbook",
        url: "",
        caption: "Upload a brochure, rulebook, or handbook to preview it inline.",
        height: 720,
      };
    case "SEPARATOR":
      return {
        label: "",
        variant: "line",
        thickness: 1,
        width: "full",
      };
    case "TEXT_IMAGE_LEFT":
      return {
        heading: "Build Trust With Visual Context",
        text: "Place a supporting image first, then explain the key message.\nThis layout works well for mentorship, outcomes, or location highlights.",
        imageUrl: "",
        alt: "",
        caption: "",
        cta: { label: "Explore details", href: "#" },
      };
    case "TEXT_IMAGE_RIGHT":
      return {
        heading: "About This Program",
        text: "Use this section for narrative content.\nKeep your message on the left and pair it with a supporting visual on the right.",
        imageUrl: "",
        alt: "",
        caption: "",
        cta: { label: "Learn more", href: "#" },
      };
    case "TESTIMONIALS":
      return { title: "What Applicants Say", items: [{ quote: "Amazing experience.", author: "Applicant", role: "Participant", rating: 5 }] };
    case "CUSTOM_CODE":
      return { title: "Custom Section", html: "<div class='p-8 text-center'>Custom section content</div>", css: "" };
    case "RANKS":
      return {
        heading: "Results 2025",
        description: "",
        columns: ["Ranking", "Full Name", "School/University", "Education Level", "P1", "P2", "P3", "P4", "Total", "Prize"],
        rows: [
          ["2", "Doe Jane", "MIT", "Bac +2", "9", "7", "8", "6", "30", "Second Prize"],
        ],
        highlightPrizes: true,
      };
    default:
      return {};
  }
}

function sanitizeBlocksForSave(inputBlocks: Block[]): Block[] {
  function sanitizeJson(value: unknown): unknown {
    if (value === null || value === undefined) return undefined;
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : undefined;
    }
    if (Array.isArray(value)) {
      return value
        .map((item) => sanitizeJson(item))
        .filter((item) => item !== undefined);
    }
    if (typeof value === "object") {
      const result: Record<string, unknown> = {};
      for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
        const sanitized = sanitizeJson(nestedValue);
        if (sanitized !== undefined) {
          result[key] = sanitized;
        }
      }
      return result;
    }
    return value;
  }

  return inputBlocks.map((block) => {
    const data = (sanitizeJson(block.data ?? {}) ?? {}) as Record<string, unknown>;
    if ("js" in data) delete data.js;
    return { ...block, data };
  });
}

function sanitizeSeoForSave(inputSeo: Record<string, unknown> | undefined): Record<string, unknown> {
  const safeSeo = { ...(inputSeo ?? {}) } as Record<string, unknown>;
  for (const [key, value] of Object.entries(safeSeo)) {
    if (value === null || value === undefined) {
      delete safeSeo[key];
      continue;
    }
    if (typeof value === "number" && !Number.isFinite(value)) {
      delete safeSeo[key];
    }
  }
  if (safeSeo.customCode && typeof safeSeo.customCode === "object" && !Array.isArray(safeSeo.customCode)) {
    const customCode = { ...(safeSeo.customCode as Record<string, unknown>) };
    for (const [key, value] of Object.entries(customCode)) {
      if (value === null || value === undefined) {
        delete customCode[key];
      }
    }
    if ("js" in customCode) delete customCode.js;
    safeSeo.customCode = customCode;
  }
  return safeSeo;
}

function buildSavePayload(inputBlocks: Block[], inputPage: MicrositePage | null) {
  const payload: Record<string, unknown> = {
    blocks: sanitizeBlocksForSave(inputBlocks),
    seo: sanitizeSeoForSave((inputPage?.seo ?? {}) as Record<string, unknown>),
    title: String(inputPage?.title ?? "").trim(),
    slug: String(inputPage?.slug ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, ""),
    visibility: inputPage?.visibility === "PUBLIC" ? "PUBLIC" : "HIDDEN",
  };
  return payload;
}

function getBlockSearchText(block: Block): string {
  const data = (block.data ?? {}) as Record<string, unknown>;
  const candidates = [
    data.title,
    data.heading,
    data.label,
    data.subtitle,
    data.message,
    data.description,
    data.text,
    data.venueName,
    data.caption,
    (data.cta as { label?: string } | undefined)?.label,
    (data.primaryButton as { label?: string } | undefined)?.label,
  ];

  return candidates
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .trim();
}

function formatSavedTime(value: string | null): string {
  if (!value) return "";
  return new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function unwrapApiObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") {
    const maybeData = (value as Record<string, unknown>).data;
    if (maybeData && typeof maybeData === "object" && !Array.isArray(maybeData)) {
      return maybeData as Record<string, unknown>;
    }
    return value as Record<string, unknown>;
  }
  return {};
}

function MicrositePreviewBackground({
  patternStyle,
}: {
  patternStyle?: NonNullable<SharedMicrositeSettings["design"]>["patternStyle"];
}) {
  const safePattern = patternStyle ?? "circuits";

  return (
    <>
      <div className="pointer-events-none absolute inset-0 -z-30 bg-[var(--mm-bg)]" />
      {safePattern === "circuits" && (
        <div
          className="pointer-events-none absolute inset-0 -z-20 overflow-hidden"
          style={{ opacity: "var(--mm-pattern-opacity)" }}
        >
          <div className="absolute -top-6 left-1/2 h-[44rem] w-[32rem] -translate-x-full">
            <div
              className="absolute inset-0 bg-contain bg-no-repeat bg-right-top"
              style={{ backgroundImage: "url(/microsite/presets/mdm/circuit-lines.png)" }}
            />
            <div
              className="absolute inset-0 bg-contain bg-no-repeat bg-right-top"
              style={{ backgroundImage: "url(/microsite/presets/mdm/circuit-components.webp)" }}
            />
          </div>
          <div className="absolute -top-6 right-1/2 h-[44rem] w-[32rem] translate-x-full">
            <div
              className="absolute inset-0 -scale-x-100 bg-contain bg-no-repeat bg-left-top"
              style={{ backgroundImage: "url(/microsite/presets/mdm/circuit-lines.png)" }}
            />
            <div
              className="absolute inset-0 -scale-x-100 bg-contain bg-no-repeat bg-left-top"
              style={{ backgroundImage: "url(/microsite/presets/mdm/circuit-components.webp)" }}
            />
          </div>
        </div>
      )}
      {safePattern === "dots" && (
        <div
          className="pointer-events-none absolute inset-0 -z-20"
          style={{
            opacity: "var(--mm-pattern-opacity)",
            backgroundImage: "radial-gradient(circle at 1px 1px, color-mix(in oklab, var(--mm-accent) 38%, transparent) 1px, transparent 0)",
            backgroundSize: "22px 22px",
          }}
        />
      )}
      {safePattern === "grid" && (
        <div
          className="pointer-events-none absolute inset-0 -z-20"
          style={{
            opacity: "var(--mm-pattern-opacity)",
            backgroundImage:
              "linear-gradient(color-mix(in oklab, var(--mm-accent) 16%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in oklab, var(--mm-accent) 16%, transparent) 1px, transparent 1px)",
            backgroundSize: "42px 42px",
          }}
        />
      )}
      {safePattern !== "none" && (
        <div className="pointer-events-none absolute inset-0 -z-10 mm-bg-overlay" />
      )}
      {safePattern === "none" && (
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(40rem 20rem at 10% -10%, color-mix(in oklab, var(--mm-accent) 18%, transparent), transparent 70%), radial-gradient(32rem 16rem at 100% 0%, color-mix(in oklab, var(--mm-accent-2) 18%, transparent), transparent 72%)",
          }}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Array Items Editor (reusable for FAQ, Timeline, Stats, etc.)        */
/* ------------------------------------------------------------------ */

interface FieldDef {
  key: string;
  label: string;
  multiline?: boolean;
  type?: "text" | "textarea" | "image" | "number";
  placeholder?: string;
  accept?: string;
}

function ArrayItemsEditor<T extends Record<string, unknown>>({
  heading,
  onHeadingChange,
  items,
  onItemsChange,
  fields,
  newItem,
  uploadAsset,
  openMediaLibrary,
  scrollable = true,
  reorderable = false,
}: {
  heading?: string;
  onHeadingChange?: (v: string) => void;
  items: T[];
  onItemsChange: (items: T[]) => void;
  fields: FieldDef[];
  newItem: T;
  uploadAsset?: UploadAssetFn;
  openMediaLibrary?: OpenMediaLibrary;
  scrollable?: boolean;
  reorderable?: boolean;
}) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const reorderItems = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= items.length ||
        toIndex >= items.length
      ) {
        return;
      }

      const reordered = [...items];
      const [moved] = reordered.splice(fromIndex, 1);
      if (!moved) return;
      reordered.splice(toIndex, 0, moved);
      onItemsChange(reordered);

      setOpenIdx((current) => {
        if (current === null) return null;
        if (current === fromIndex) return toIndex;
        if (fromIndex < current && current <= toIndex) return current - 1;
        if (toIndex <= current && current < fromIndex) return current + 1;
        return current;
      });
    },
    [items, onItemsChange],
  );

  return (
    <div className="space-y-4">
      {onHeadingChange && heading !== undefined && (
        <div className="space-y-2">
          <Label>Section heading</Label>
          <Input value={heading} onChange={(e) => onHeadingChange(e.target.value)} />
        </div>
      )}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Items ({items.length})
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              onItemsChange([...items, { ...newItem }]);
              setOpenIdx(items.length);
            }}
          >
            <Plus className="mr-1 h-3 w-3" />
            Add
          </Button>
        </div>
        <div className={cn("space-y-2 pr-1", scrollable ? "max-h-[48vh] overflow-y-auto" : "")}>
          {items.map((item, idx) => {
            const isOpen = openIdx === idx;
            const primaryField = fields[0];
            return (
              <div
                key={idx}
                className={cn(
                  "rounded-lg border bg-card",
                  reorderable &&
                    draggingIndex !== null &&
                    dropIndex === idx &&
                    draggingIndex !== idx &&
                    "border-primary/60 bg-primary/5",
                )}
                onDragOver={(event) => {
                  if (!reorderable || draggingIndex === null) {
                    return;
                  }
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDropIndex(idx);
                }}
                onDrop={(event) => {
                  if (!reorderable || draggingIndex === null) {
                    return;
                  }
                  event.preventDefault();
                  reorderItems(draggingIndex, idx);
                  setDraggingIndex(null);
                  setDropIndex(null);
                }}
              >
                <div
                  role="button"
                  tabIndex={0}
                  draggable={reorderable}
                  className={cn(
                    "w-full flex items-center gap-2 p-3 text-left text-sm hover:bg-muted/50 transition-colors",
                    reorderable ? "cursor-grab active:cursor-grabbing" : "",
                  )}
                  onClick={() => setOpenIdx(isOpen ? null : idx)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setOpenIdx(isOpen ? null : idx);
                    }
                  }}
                  onDragStart={(event) => {
                    if (!reorderable) {
                      return;
                    }
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", String(idx));
                    setDraggingIndex(idx);
                    setDropIndex(idx);
                  }}
                  onDragEnd={() => {
                    if (!reorderable) {
                      return;
                    }
                    setDraggingIndex(null);
                    setDropIndex(null);
                  }}
                >
                  {reorderable ? (
                    <button
                      type="button"
                      aria-label={`Reorder item ${idx + 1}`}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-md border bg-muted/30 text-muted-foreground transition-colors hover:bg-muted cursor-grab active:cursor-grabbing shrink-0"
                      onClick={(event) => event.stopPropagation()}
                      onMouseDown={(event) => event.stopPropagation()}
                    >
                      <GripVertical className="h-3 w-3" />
                    </button>
                  ) : null}
                  {isOpen ? (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  )}
                  <span className="flex-1 truncate font-medium">
                    {(item[primaryField.key] as string) || `Item ${idx + 1}`}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive hover:text-destructive shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      onItemsChange(items.filter((_, i) => i !== idx));
                      setOpenIdx((current) => {
                        if (current === null) return null;
                        if (current === idx) return null;
                        return current > idx ? current - 1 : current;
                      });
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-3 pb-3 space-y-3.5">
                        {fields.map((field) => {
                          const value = (item[field.key] as string) ?? "";
                          const updateValue = (val: string) => {
                            const updated = [...items];
                            updated[idx] = { ...updated[idx], [field.key]: val };
                            onItemsChange(updated);
                          };

                          if (field.type === "image") {
                            return (
                              <div key={field.key} className="space-y-1">
                                <Label className="text-xs">{field.label}</Label>
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="file"
                                    accept={field.accept ?? "image/*"}
                                    onChange={async (e) => {
                                      const input = e.currentTarget;
                                      const file = input.files?.[0];
                                      if (!file) return;
                                      try {
                                        const src = uploadAsset
                                          ? await uploadAsset(file)
                                          : await fileToDataUrl(file);
                                        updateValue(src);
                                      } catch {
                                        toast.error("Image upload failed");
                                      } finally {
                                        input.value = "";
                                      }
                                    }}
                                  />
                                  {openMediaLibrary && (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      onClick={() =>
                                        openMediaLibrary("image", (assetKey) => updateValue(assetKey))
                                      }
                                    >
                                      Library
                                    </Button>
                                  )}
                                </div>
                                <Input
                                  value={value}
                                  placeholder={field.placeholder ?? "https://..."}
                                  onChange={(e) => updateValue(e.target.value)}
                                  className="text-xs"
                                />
                              </div>
                            );
                          }

                          if (field.type === "number") {
                            return (
                              <div key={field.key} className="space-y-1">
                                <Label className="text-xs">{field.label}</Label>
                                <Input
                                  type="number"
                                  value={value}
                                  placeholder={field.placeholder}
                                  onChange={(e) => updateValue(e.target.value)}
                                  className="text-xs"
                                />
                              </div>
                            );
                          }

                          if (field.multiline || field.type === "textarea") {
                            return (
                              <div key={field.key} className="space-y-1">
                                <Label className="text-xs">{field.label}</Label>
                                <Textarea
                                  value={value}
                                  onChange={(e) => updateValue(e.target.value)}
                                  rows={3}
                                  className="text-xs"
                                />
                              </div>
                            );
                          }

                          return (
                            <div key={field.key} className="space-y-1">
                              <Label className="text-xs">{field.label}</Label>
                              <Input
                                value={value}
                                placeholder={field.placeholder}
                                onChange={(e) => updateValue(e.target.value)}
                                className="text-xs"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface GalleryEditorProps {
  heading: string;
  layout: string;
  items: Record<string, unknown>[];
  onChange: (next: { heading: string; layout: string; items: Record<string, unknown>[] }) => void;
  uploadAsset?: UploadAssetFn;
  openMediaLibrary?: OpenMediaLibrary;
}

function GalleryItemsEditor({ heading, layout, items, onChange, uploadAsset, openMediaLibrary }: GalleryEditorProps) {
  const [isUploading, setIsUploading] = useState(false);
  const normalizedItems = items.map((item) => ({
    url: String(item.url ?? item.assetKey ?? ""),
    alt: String(item.alt ?? ""),
    caption: String(item.caption ?? ""),
  }));

  const updateItems = (nextItems: { url: string; alt: string; caption: string }[]) => {
    onChange({
      heading,
      layout,
      items: nextItems.map((item) => ({
        url: item.url,
        assetKey: item.url,
        alt: item.alt,
        caption: item.caption,
      })),
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Section heading</Label>
        <Input value={heading} onChange={(e) => onChange({ heading: e.target.value, layout, items })} />
      </div>

      <div className="space-y-2">
        <Label>Layout</Label>
        <div className="grid grid-cols-3 gap-2">
          {(["grid", "masonry", "carousel"] as const).map((option) => (
            <Button
              key={option}
              variant={layout === option ? "default" : "outline"}
              size="sm"
              onClick={() => onChange({ heading, layout: option, items })}
              className="capitalize"
            >
              {option}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Upload Photos</Label>
        <Input
          type="file"
          accept="image/*"
          multiple
          onChange={async (e) => {
            const input = e.currentTarget;
            const files = Array.from(input.files ?? []);
            if (files.length === 0) return;
            setIsUploading(true);
            try {
              const uploaded = await Promise.all(
                files.map(async (file) => ({
                  url: uploadAsset ? await uploadAsset(file) : await fileToDataUrl(file),
                  alt: file.name.replace(/\.[a-zA-Z0-9]+$/, ""),
                  caption: "",
                })),
              );
              updateItems([...normalizedItems, ...uploaded]);
            } catch {
              toast.error("Photo upload failed");
            } finally {
              setIsUploading(false);
              input.value = "";
            }
          }}
        />
        <p className="text-[11px] text-muted-foreground">
          Supports multiple images. Files are embedded in-page for immediate publishing.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Gallery Items</Label>
          <div className="flex items-center gap-2">
            {openMediaLibrary && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  openMediaLibrary("image", (assetKey) =>
                    updateItems([...normalizedItems, { url: assetKey, alt: "", caption: "" }]),
                  )
                }
              >
                Library
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => updateItems([...normalizedItems, { url: "", alt: "", caption: "" }])}
            >
              <Plus className="mr-1 h-3 w-3" />
              Add URL Item
            </Button>
          </div>
        </div>

        <div className="space-y-2 max-h-[340px] overflow-auto pr-1">
          {normalizedItems.length === 0 ? (
            <div className="rounded-md border border-dashed p-4 text-xs text-muted-foreground text-center">
              No images yet. Upload photos or add an image URL item.
            </div>
          ) : (
            normalizedItems.map((item, idx) => (
              <div key={idx} className="rounded-lg border bg-card p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-[10px]">
                    Image {idx + 1}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => updateItems(normalizedItems.filter((_, i) => i !== idx))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <Input
                  value={item.url}
                  onChange={(e) => {
                    const next = [...normalizedItems];
                    next[idx] = { ...next[idx], url: e.target.value };
                    updateItems(next);
                  }}
                  placeholder="https://... or data:image/..."
                />
                <Input
                  value={item.alt}
                  onChange={(e) => {
                    const next = [...normalizedItems];
                    next[idx] = { ...next[idx], alt: e.target.value };
                    updateItems(next);
                  }}
                  placeholder="Alt text"
                />
                <Input
                  value={item.caption}
                  onChange={(e) => {
                    const next = [...normalizedItems];
                    next[idx] = { ...next[idx], caption: e.target.value };
                    updateItems(next);
                  }}
                  placeholder="Caption"
                />
              </div>
            ))
          )}
        </div>
      </div>

      {isUploading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Processing uploaded images...
        </div>
      )}
    </div>
  );
}

type SectionStyle = {
  anchorId?: string;
  backgroundType?: "default" | "none" | "color" | "gradient" | "image" | "video";
  background?: {
    color?: string;
    gradient?: string;
    imageUrl?: string;
    videoUrl?: string;
    overlayColor?: string;
    overlayOpacity?: number;
    position?: "center" | "top" | "bottom";
  };
  paddingY?: "none" | "sm" | "md" | "lg" | "xl";
  paddingX?: "none" | "sm" | "md" | "lg" | "xl";
  width?: "narrow" | "normal" | "wide" | "full";
  align?: "left" | "center" | "right";
  textColor?: string;
  className?: string;
  hideOnMobile?: boolean;
  hideOnDesktop?: boolean;
  animation?: "none" | "fade-up" | "rise" | "zoom";
  animationDelayMs?: number;
};

type UploadAssetFn = (file: File) => Promise<string>;
type OpenMediaLibrary = (kind: "image" | "video" | "all", onSelect: (assetKey: string) => void) => void;

function SectionSettings({
  section,
  onChange,
  uploadAsset,
  openMediaLibrary,
}: {
  section: SectionStyle;
  onChange: (next: SectionStyle) => void;
  uploadAsset?: UploadAssetFn;
  openMediaLibrary?: OpenMediaLibrary;
}) {
  const background = section.background ?? {};
  const derivedType =
    section.backgroundType ??
    (background.videoUrl
      ? "video"
      : background.imageUrl
        ? "image"
        : background.gradient
          ? "gradient"
          : background.color
            ? "color"
            : "default");

  const setSection = (patch: Partial<SectionStyle>) => {
    onChange({ ...section, ...patch });
  };

  const setBackground = (patch: Partial<SectionStyle["background"]>) => {
    setSection({ background: { ...background, ...patch } });
  };

  return (
    <div className="space-y-4 border-t pt-4">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Section Style</p>

      <div className="space-y-2">
        <Label>Anchor ID</Label>
        <Input
          value={section.anchorId ?? ""}
          onChange={(e) => setSection({ anchorId: e.target.value })}
          placeholder="hero-section"
        />
      </div>

      <div className="space-y-2">
        <Label>Background</Label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { value: "default", label: "Theme" },
            { value: "none", label: "None" },
            { value: "color", label: "Color" },
            { value: "gradient", label: "Gradient" },
            { value: "image", label: "Image" },
            { value: "video", label: "Video" },
          ].map((option) => (
            <Button
              key={option.value}
              variant={derivedType === option.value ? "default" : "outline"}
              size="sm"
              onClick={() => setSection({ backgroundType: option.value as SectionStyle["backgroundType"] })}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      {derivedType === "color" && (
        <div className="space-y-2">
          <Label>Background Color</Label>
          <Input
            value={background.color ?? ""}
            onChange={(e) => setBackground({ color: e.target.value })}
            placeholder="#0f172a"
          />
        </div>
      )}

      {derivedType === "gradient" && (
        <div className="space-y-2">
          <Label>Background Gradient</Label>
          <Input
            value={background.gradient ?? ""}
            onChange={(e) => setBackground({ gradient: e.target.value })}
            placeholder="linear-gradient(120deg, #2563eb, #9333ea)"
          />
        </div>
      )}

      {derivedType === "image" && (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Upload Background Image</Label>
            <div className="flex items-center gap-2">
              <Input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const input = e.currentTarget;
                  const file = input.files?.[0];
                  if (!file) return;
                  try {
                    const src = uploadAsset ? await uploadAsset(file) : await fileToDataUrl(file);
                    setBackground({ imageUrl: src });
                  } catch {
                    toast.error("Image upload failed");
                  } finally {
                    input.value = "";
                  }
                }}
              />
              {openMediaLibrary && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => openMediaLibrary("image", (assetKey) => setBackground({ imageUrl: assetKey }))}
                >
                  Library
                </Button>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Background Image URL</Label>
            <Input
              value={background.imageUrl ?? ""}
              onChange={(e) => setBackground({ imageUrl: e.target.value })}
              placeholder="https://..."
            />
          </div>
          <div className="space-y-2">
            <Label>Image Position</Label>
            <div className="grid grid-cols-3 gap-2">
              {["center", "top", "bottom"].map((pos) => (
                <Button
                  key={pos}
                  variant={(background.position ?? "center") === pos ? "default" : "outline"}
                  size="sm"
                  onClick={() => setBackground({ position: pos as "center" | "top" | "bottom" })}
                >
                  {pos}
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}

      {derivedType === "video" && (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Upload Background Video</Label>
            <div className="flex items-center gap-2">
              <Input
                type="file"
                accept="video/*"
                onChange={async (e) => {
                  const input = e.currentTarget;
                  const file = input.files?.[0];
                  if (!file) return;
                  try {
                    const src = uploadAsset ? await uploadAsset(file) : await fileToDataUrl(file);
                    setBackground({ videoUrl: src });
                  } catch {
                    toast.error("Video upload failed");
                  } finally {
                    input.value = "";
                  }
                }}
              />
              {openMediaLibrary && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => openMediaLibrary("video", (assetKey) => setBackground({ videoUrl: assetKey }))}
                >
                  Library
                </Button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Large videos can slow down pages. For best performance, use hosted videos.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Background Video URL</Label>
            <Input
              value={background.videoUrl ?? ""}
              onChange={(e) => setBackground({ videoUrl: e.target.value })}
              placeholder="https://..."
            />
          </div>
        </div>
      )}

      {derivedType !== "default" && derivedType !== "none" && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Overlay Color</Label>
            <Input
              value={background.overlayColor ?? ""}
              onChange={(e) => setBackground({ overlayColor: e.target.value })}
              placeholder="rgba(0,0,0,0.4)"
            />
          </div>
          <div className="space-y-2">
            <Label>Overlay Opacity (0-100)</Label>
            <Input
              type="number"
              value={background.overlayOpacity ?? ""}
              onChange={(e) =>
                setBackground({ overlayOpacity: parseOptionalBoundedInt(e.target.value, 0, 100) })
              }
              placeholder="40"
            />
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Padding Y</Label>
          <div className="grid grid-cols-5 gap-2">
            {["none", "sm", "md", "lg", "xl"].map((pad) => (
              <Button
                key={pad}
                variant={(section.paddingY ?? "xl") === pad ? "default" : "outline"}
                size="sm"
                onClick={() => setSection({ paddingY: pad as SectionStyle["paddingY"] })}
              >
                {pad}
              </Button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Label>Padding X</Label>
          <div className="grid grid-cols-5 gap-2">
            {["none", "sm", "md", "lg", "xl"].map((pad) => (
              <Button
                key={pad}
                variant={(section.paddingX ?? "xl") === pad ? "default" : "outline"}
                size="sm"
                onClick={() => setSection({ paddingX: pad as SectionStyle["paddingX"] })}
              >
                {pad}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Content Width</Label>
          <div className="grid grid-cols-4 gap-2">
            {["narrow", "normal", "wide", "full"].map((size) => (
              <Button
                key={size}
                variant={(section.width ?? "wide") === size ? "default" : "outline"}
                size="sm"
                onClick={() => setSection({ width: size as SectionStyle["width"] })}
              >
                {size}
              </Button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Label>Text Align</Label>
          <div className="grid grid-cols-3 gap-2">
            {["left", "center", "right"].map((align) => (
              <Button
                key={align}
                variant={(section.align ?? "left") === align ? "default" : "outline"}
                size="sm"
                onClick={() => setSection({ align: align as SectionStyle["align"] })}
              >
                {align}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Text Color</Label>
          <Input
            value={section.textColor ?? ""}
            onChange={(e) => setSection({ textColor: e.target.value })}
            placeholder="#111827"
          />
        </div>
        <div className="space-y-2">
          <Label>Custom Class</Label>
          <Input
            value={section.className ?? ""}
            onChange={(e) => setSection({ className: e.target.value })}
            placeholder="my-section-class"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Entrance Animation</Label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: "none", label: "None" },
              { id: "fade-up", label: "Fade Up" },
              { id: "rise", label: "Rise" },
              { id: "zoom", label: "Zoom" },
            ].map((item) => (
              <Button
                key={item.id}
                variant={(section.animation ?? "none") === item.id ? "default" : "outline"}
                size="sm"
                onClick={() => setSection({ animation: item.id as SectionStyle["animation"] })}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Label>Animation Delay (ms)</Label>
          <Input
            type="number"
            value={section.animationDelayMs ?? ""}
            onChange={(e) => setSection({ animationDelayMs: parseOptionalBoundedInt(e.target.value, 0, 2000) })}
            min={0}
            max={2000}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Visibility</Label>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant={section.hideOnMobile ? "default" : "outline"}
            size="sm"
            onClick={() => setSection({ hideOnMobile: !section.hideOnMobile })}
          >
            Hide on Mobile
          </Button>
          <Button
            variant={section.hideOnDesktop ? "default" : "outline"}
            size="sm"
            onClick={() => setSection({ hideOnDesktop: !section.hideOnDesktop })}
          >
            Hide on Desktop
          </Button>
        </div>
      </div>
    </div>
  );
}

function BlockInspector({
  block,
  onChange,
  uploadAsset,
  openMediaLibrary,
}: {
  block: Block;
  onChange: (data: BlockData) => void;
  uploadAsset?: UploadAssetFn;
  openMediaLibrary?: OpenMediaLibrary;
}) {
  const data = block.data ?? {};
  const section = (data.section as SectionStyle) ?? {};

  const updateField = (key: string, value: unknown) => {
    onChange({ ...data, [key]: value });
  };
  const updateFields = (patch: Record<string, unknown>) => {
    onChange({ ...data, ...patch });
  };

  let content: ReactNode;

  switch (block.type) {
    case "HERO":
      content = (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input value={(data.title as string) ?? ""} onChange={(e) => updateField("title", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Subtitle</Label>
            <Textarea value={(data.subtitle as string) ?? ""} onChange={(e) => updateField("subtitle", e.target.value)} rows={3} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Layout</Label>
              <div className="grid grid-cols-2 gap-2">
                {(["centered", "split"] as const).map((value) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={(data.layout as string) === value || ((data.layout as string) === undefined && value === "centered") ? "default" : "outline"}
                    onClick={() => updateField("layout", value)}
                    className="capitalize"
                  >
                    {value}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Eyebrow Label (Optional)</Label>
              <Input
                value={(data.eyebrow as string) ?? ""}
                placeholder="Applications open now"
                onChange={(e) => updateField("eyebrow", e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Hero Logo (Optional Override)</Label>
            <div className="flex items-center gap-2">
              <Input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const input = e.currentTarget;
                  const file = input.files?.[0];
                  if (!file) return;
                  try {
                    const src = uploadAsset ? await uploadAsset(file) : await fileToDataUrl(file);
                    updateFields({ logoAssetKey: src, logoUrl: "" });
                  } catch {
                    toast.error("Logo upload failed");
                  } finally {
                    input.value = "";
                  }
                }}
              />
              {openMediaLibrary && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    openMediaLibrary("image", (assetKey) => {
                      updateFields({ logoAssetKey: assetKey, logoUrl: "" });
                    })
                  }
                >
                  Library
                </Button>
              )}
            </div>
            <Input
              value={(data.logoAssetKey as string) ?? (data.logoUrl as string) ?? ""}
              placeholder="Asset key or https://..."
              onChange={(e) => {
                updateFields({ logoAssetKey: e.target.value, logoUrl: e.target.value });
              }}
            />
            <Input
              value={(data.logoAlt as string) ?? ""}
              placeholder="Logo alt text"
              onChange={(e) => updateField("logoAlt", e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Leave empty to use the microsite-level logo from settings.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Hero Image (Split Layout)</Label>
            <div className="flex items-center gap-2">
              <Input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const input = e.currentTarget;
                  const file = input.files?.[0];
                  if (!file) return;
                  try {
                    const src = uploadAsset ? await uploadAsset(file) : await fileToDataUrl(file);
                    updateField("heroImage", src);
                  } catch {
                    toast.error("Hero image upload failed");
                  } finally {
                    input.value = "";
                  }
                }}
              />
              {openMediaLibrary && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => openMediaLibrary("image", (assetKey) => updateField("heroImage", assetKey))}
                >
                  Library
                </Button>
              )}
            </div>
            <Input
              value={(data.heroImage as string) ?? ""}
              placeholder="Asset key or image URL"
              onChange={(e) => updateField("heroImage", e.target.value)}
            />
          </div>
          <Separator />
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Call to Action</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Label</Label>
              <Input
                value={(data.cta as { label?: string })?.label ?? ""}
                onChange={(e) => updateField("cta", { ...(data.cta as object ?? {}), label: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Link</Label>
              <Input
                value={(data.cta as { href?: string })?.href ?? ""}
                onChange={(e) => updateField("cta", { ...(data.cta as object ?? {}), href: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Secondary Label</Label>
              <Input
                value={(data.secondaryCta as { label?: string })?.label ?? ""}
                onChange={(e) => updateField("secondaryCta", { ...(data.secondaryCta as object ?? {}), label: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Secondary Link</Label>
              <Input
                value={(data.secondaryCta as { href?: string })?.href ?? ""}
                onChange={(e) => updateField("secondaryCta", { ...(data.secondaryCta as object ?? {}), href: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>FAQ Button</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                variant={(data.showFaqButton as boolean | undefined) !== false ? "default" : "outline"}
                onClick={() => updateField("showFaqButton", true)}
              >
                Show
              </Button>
              <Button
                size="sm"
                variant={(data.showFaqButton as boolean | undefined) === false ? "default" : "outline"}
                onClick={() => updateField("showFaqButton", false)}
              >
                Hide
              </Button>
            </div>
          </div>
          <Separator />
          <ArrayItemsEditor
            items={(data.facts as { label: string; value: string; icon?: string }[]) ?? []}
            onItemsChange={(items) => updateField("facts", items)}
            fields={[
              { key: "label", label: "Label" },
              { key: "value", label: "Value" },
              { key: "icon", label: "Icon (optional)" },
            ]}
            newItem={{ label: "Label", value: "Value" }}
          />
        </div>
      );
      break;

    case "ANNOUNCEMENT":
      content = (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Badge (optional)</Label>
            <Input
              value={(data.badge as string) ?? ""}
              placeholder="Important update"
              onChange={(e) => updateField("badge", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Message</Label>
            <Textarea
              value={(data.message as string) ?? ""}
              placeholder="Share deadlines, updates, or high-priority notices."
              rows={3}
              onChange={(e) => updateField("message", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Tone</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["info", "success", "warning", "urgent"] as const).map((tone) => (
                <Button
                  key={tone}
                  size="sm"
                  variant={(data.tone as string) === tone || ((data.tone as string) === undefined && tone === "info") ? "default" : "outline"}
                  onClick={() => updateField("tone", tone)}
                  className="capitalize"
                >
                  {tone}
                </Button>
              ))}
            </div>
          </div>
          <Separator />
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Primary Action</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Label</Label>
              <Input
                value={(data.cta as { label?: string })?.label ?? ""}
                onChange={(e) => updateField("cta", { ...(data.cta as object ?? {}), label: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Link</Label>
              <Input
                value={(data.cta as { href?: string })?.href ?? ""}
                onChange={(e) => updateField("cta", { ...(data.cta as object ?? {}), href: e.target.value })}
              />
            </div>
          </div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Secondary Action</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Label</Label>
              <Input
                value={(data.secondaryCta as { label?: string })?.label ?? ""}
                onChange={(e) => updateField("secondaryCta", { ...(data.secondaryCta as object ?? {}), label: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Link</Label>
              <Input
                value={(data.secondaryCta as { href?: string })?.href ?? ""}
                onChange={(e) => updateField("secondaryCta", { ...(data.secondaryCta as object ?? {}), href: e.target.value })}
              />
            </div>
          </div>
        </div>
      );
      break;

    case "COUNTDOWN":
      content = (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input
              value={(data.title as string) ?? ""}
              onChange={(e) => updateField("title", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Subtitle</Label>
            <Textarea
              value={(data.subtitle as string) ?? ""}
              onChange={(e) => updateField("subtitle", e.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label>Target Date (ISO)</Label>
            <Input
              value={(data.targetDate as string) ?? ""}
              placeholder="2026-09-15T23:59:00Z"
              onChange={(e) => updateField("targetDate", e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label>Timezone Label</Label>
              <Input
                value={(data.timezoneLabel as string) ?? ""}
                placeholder="UTC"
                onChange={(e) => updateField("timezoneLabel", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Show Seconds</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  variant={Boolean(data.showSeconds) ? "default" : "outline"}
                  onClick={() => updateField("showSeconds", true)}
                >
                  On
                </Button>
                <Button
                  size="sm"
                  variant={!Boolean(data.showSeconds) ? "default" : "outline"}
                  onClick={() => updateField("showSeconds", false)}
                >
                  Off
                </Button>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Ended Label</Label>
            <Input
              value={(data.endedLabel as string) ?? ""}
              placeholder="The event is live."
              onChange={(e) => updateField("endedLabel", e.target.value)}
            />
          </div>
          <Separator />
          <ArrayItemsEditor
            heading=""
            items={(data.milestones as { label: string; value?: string }[]) ?? []}
            onItemsChange={(items) => updateField("milestones", items)}
            fields={[
              { key: "label", label: "Milestone" },
              { key: "value", label: "Value" },
            ]}
            newItem={{ label: "Milestone", value: "Details" }}
          />
          <Separator />
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Primary Action</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Label</Label>
              <Input
                value={(data.cta as { label?: string })?.label ?? ""}
                onChange={(e) => updateField("cta", { ...(data.cta as object ?? {}), label: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Link</Label>
              <Input
                value={(data.cta as { href?: string })?.href ?? ""}
                onChange={(e) => updateField("cta", { ...(data.cta as object ?? {}), href: e.target.value })}
              />
            </div>
          </div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Secondary Action</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Label</Label>
              <Input
                value={(data.secondaryCta as { label?: string })?.label ?? ""}
                onChange={(e) => updateField("secondaryCta", { ...(data.secondaryCta as object ?? {}), label: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Link</Label>
              <Input
                value={(data.secondaryCta as { href?: string })?.href ?? ""}
                onChange={(e) => updateField("secondaryCta", { ...(data.secondaryCta as object ?? {}), href: e.target.value })}
              />
            </div>
          </div>
        </div>
      );
      break;

    case "RICH_TEXT":
      content = (
        <div className="space-y-2">
          <Label>Content (HTML/Markdown)</Label>
          <Textarea
            value={(data.content as string) ?? ""}
            onChange={(e) => updateField("content", e.target.value)}
            rows={12}
            className="font-mono text-xs"
          />
        </div>
      );
      break;

    case "IMAGE":
      content = (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Upload Photo</Label>
            <div className="flex items-center gap-2">
              <Input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const input = e.currentTarget;
                  const file = input.files?.[0];
                  if (!file) return;
                  try {
                    const src = uploadAsset ? await uploadAsset(file) : await fileToDataUrl(file);
                    const patch: Record<string, unknown> = { assetKey: src, src: "", url: "" };
                    if (!(data.alt as string)) patch.alt = file.name.replace(/\.[a-zA-Z0-9]+$/, "");
                    updateFields(patch);
                  } catch {
                    toast.error("Image upload failed");
                  } finally {
                    input.value = "";
                  }
                }}
              />
              {openMediaLibrary && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    openMediaLibrary("image", (assetKey) => {
                      updateFields({ assetKey, src: "", url: "" });
                    })
                  }
                >
                  Library
                </Button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Uploaded images are stored in the media library.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Image URL</Label>
            <Input
              value={(data.assetKey as string) ?? (data.src as string) ?? (data.url as string) ?? ""}
              onChange={(e) => {
                updateFields({ assetKey: e.target.value, src: e.target.value, url: e.target.value });
              }}
              placeholder="https://..."
            />
          </div>
          <div className="space-y-2">
            <Label>Alt text</Label>
            <Input value={(data.alt as string) ?? ""} onChange={(e) => updateField("alt", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Caption</Label>
            <Input value={(data.caption as string) ?? ""} onChange={(e) => updateField("caption", e.target.value)} />
          </div>
        </div>
      );
      break;

    case "GRID": {
      const columns = Number(data.columns ?? 3);
      content = (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Heading</Label>
            <Input value={(data.heading as string) ?? ""} onChange={(e) => updateField("heading", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Columns</Label>
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 4].map((count) => (
                <Button
                  key={count}
                  variant={columns === count ? "default" : "outline"}
                  size="sm"
                  onClick={() => updateField("columns", count)}
                >
                  {count}
                </Button>
              ))}
            </div>
          </div>
          <ArrayItemsEditor
            items={(data.items as { title: string; text?: string }[]) ?? []}
            onItemsChange={(items) => updateField("items", items)}
            fields={[
              { key: "title", label: "Title" },
              { key: "text", label: "Text", multiline: true },
            ]}
            newItem={{ title: "Item", text: "" }}
          />
        </div>
      );
      break;
    }

    case "CTA":
      content = (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Heading</Label>
            <Input value={(data.heading as string) ?? ""} onChange={(e) => updateField("heading", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={(data.description as string) ?? ""} onChange={(e) => updateField("description", e.target.value)} rows={3} />
          </div>
          <Separator />
          <div className="space-y-2">
            <Label>Variant</Label>
            <div className="grid grid-cols-3 gap-2">
              {["primary", "secondary", "outline"].map((variant) => (
                <Button
                  key={variant}
                  variant={(data.variant as string) === variant ? "default" : "outline"}
                  size="sm"
                  onClick={() => updateField("variant", variant)}
                >
                  {variant}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Action</Label>
            <div className="grid grid-cols-3 gap-2">
              {["APPLY", "OPEN_PORTAL", "LINK"].map((action) => (
                <Button
                  key={action}
                  variant={(data.action as string) === action ? "default" : "outline"}
                  size="sm"
                  onClick={() => updateField("action", action)}
                >
                  {action}
                </Button>
              ))}
            </div>
          </div>
          <Separator />
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Primary Button</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Label</Label>
              <Input
                value={(data.primaryButton as { label?: string })?.label ?? ""}
                onChange={(e) =>
                  updateField("primaryButton", { ...(data.primaryButton as object ?? {}), label: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Link</Label>
              <Input
                value={(data.primaryButton as { href?: string })?.href ?? ""}
                onChange={(e) =>
                  updateField("primaryButton", { ...(data.primaryButton as object ?? {}), href: e.target.value })
                }
              />
            </div>
          </div>
        </div>
      );
      break;

    case "FAQ":
      content = (
        <ArrayItemsEditor
          heading={(data.heading as string) ?? ""}
          onHeadingChange={(v) => updateField("heading", v)}
          items={(data.items as { question: string; answer: string }[]) ?? []}
          onItemsChange={(items) => updateField("items", items)}
          fields={[
            { key: "question", label: "Question" },
            { key: "answer", label: "Answer", multiline: true },
          ]}
          newItem={{ question: "New question", answer: "Answer here" }}
        />
      );
      break;

    case "TIMELINE":
      content = (
        <ArrayItemsEditor
          heading={(data.heading as string) ?? ""}
          onHeadingChange={(v) => updateField("heading", v)}
          items={(data.items as { date: string; title: string; description: string }[]) ?? []}
          onItemsChange={(items) => updateField("items", items)}
          fields={[
            { key: "date", label: "Date" },
            { key: "title", label: "Title" },
            { key: "description", label: "Description", multiline: true },
          ]}
          newItem={{ date: "", title: "New event", description: "" }}
        />
      );
      break;

    case "CALENDAR": {
      const calendarItems = ((data.items as Record<string, unknown>[]) ?? []).map((item) => ({
        date: String(item.date ?? ""),
        endDate: String(item.endDate ?? ""),
        title: String(item.title ?? ""),
        startTime: String(item.startTime ?? ""),
        endTime: String(item.endTime ?? ""),
        location: String(item.location ?? ""),
        tag: String(item.tag ?? ""),
        description: String(item.description ?? ""),
        ctaLabel: String((item.cta as { label?: string } | undefined)?.label ?? ""),
        ctaHref: String((item.cta as { href?: string } | undefined)?.href ?? ""),
      }));

      const persistCalendarItems = (nextItems: typeof calendarItems) => {
        updateField(
          "items",
          nextItems.map((item) => ({
            date: item.date,
            endDate: item.endDate,
            title: item.title,
            startTime: item.startTime,
            endTime: item.endTime,
            location: item.location,
            tag: item.tag,
            description: item.description,
            cta: {
              label: item.ctaLabel,
              href: item.ctaHref,
            },
          })),
        );
      };

      content = (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Heading</Label>
            <Input value={(data.heading as string) ?? ""} onChange={(e) => updateField("heading", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={(data.description as string) ?? ""} onChange={(e) => updateField("description", e.target.value)} rows={3} />
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Timezone Label</Label>
              <Input
                value={(data.timezoneLabel as string) ?? ""}
                placeholder="UTC"
                onChange={(e) => updateField("timezoneLabel", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Layout</Label>
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                Weekly grid (days as columns, time as rows)
              </div>
            </div>
          </div>
          <ArrayItemsEditor
            heading=""
            items={calendarItems}
            onItemsChange={persistCalendarItems}
            scrollable={false}
            fields={[
              { key: "title", label: "Event title" },
              { key: "date", label: "Start date (YYYY-MM-DD)" },
              { key: "endDate", label: "End date (optional)" },
              { key: "startTime", label: "Start time" },
              { key: "endTime", label: "End time" },
              { key: "location", label: "Location" },
              { key: "tag", label: "Tag (optional)" },
              { key: "description", label: "Description", multiline: true },
              { key: "ctaLabel", label: "CTA label (optional)" },
              { key: "ctaHref", label: "CTA link" },
            ]}
            newItem={{
              title: "New event",
              date: "",
              endDate: "",
              startTime: "",
              endTime: "",
              location: "",
              tag: "",
              description: "",
              ctaLabel: "",
              ctaHref: "",
            }}
          />
        </div>
      );
      break;
    }

    case "AGENDA": {
      const days = ((data.days as Record<string, unknown>[]) ?? []).map((day) => ({
        label: String(day.label ?? ""),
        date: String(day.date ?? ""),
        title: String(day.title ?? ""),
        sessions: ((day.sessions as Record<string, unknown>[]) ?? []).map((session) => ({
          time: String(session.time ?? ""),
          endTime: String(session.endTime ?? ""),
          title: String(session.title ?? ""),
          speaker: String(session.speaker ?? ""),
          track: String(session.track ?? ""),
          location: String(session.location ?? ""),
          description: String(session.description ?? ""),
          ctaLabel: String((session.cta as { label?: string } | undefined)?.label ?? ""),
          ctaHref: String((session.cta as { href?: string } | undefined)?.href ?? ""),
        })),
      }));

      const updateDay = (dayIndex: number, patch: Record<string, unknown>) => {
        const next = [...days];
        next[dayIndex] = { ...next[dayIndex], ...patch };
        updateField(
          "days",
          next.map((day) => ({
            label: day.label,
            date: day.date,
            title: day.title,
            sessions: day.sessions.map((session) => ({
              time: session.time,
              endTime: session.endTime,
              title: session.title,
              speaker: session.speaker,
              track: session.track,
              location: session.location,
              description: session.description,
              cta: {
                label: session.ctaLabel,
                href: session.ctaHref,
              },
            })),
          })),
        );
      };

      content = (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Heading</Label>
            <Input value={(data.heading as string) ?? ""} onChange={(e) => updateField("heading", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={(data.description as string) ?? ""} onChange={(e) => updateField("description", e.target.value)} rows={3} />
          </div>
          <div className="space-y-2">
            <Label>Layout</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["stacked", "split"] as const).map((layout) => (
                <Button
                  key={layout}
                  size="sm"
                  variant={(data.layout as string) === layout || ((data.layout as string) === undefined && layout === "stacked") ? "default" : "outline"}
                  onClick={() => updateField("layout", layout)}
                  className="capitalize"
                >
                  {layout}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Days ({days.length})</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  updateField("days", [
                    ...days,
                    {
                      label: `Day ${days.length + 1}`,
                      date: "",
                      title: "",
                      sessions: [{ time: "", endTime: "", title: "", speaker: "", track: "", location: "", description: "", ctaLabel: "", ctaHref: "" }],
                    },
                  ].map((day) => ({
                    label: day.label,
                    date: day.date,
                    title: day.title,
                    sessions: day.sessions.map((session) => ({
                      time: session.time,
                      endTime: session.endTime,
                      title: session.title,
                      speaker: session.speaker,
                      track: session.track,
                      location: session.location,
                      description: session.description,
                      cta: { label: session.ctaLabel, href: session.ctaHref },
                    })),
                  })))
                }
              >
                <Plus className="mr-1 h-3 w-3" />
                Add Day
              </Button>
            </div>
            <div className="space-y-3">
              {days.map((day, dayIndex) => (
                <div key={dayIndex} className="rounded-lg border bg-card p-3 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{day.label || `Day ${dayIndex + 1}`}</p>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() =>
                        updateField(
                          "days",
                          days
                            .filter((_, idx) => idx !== dayIndex)
                            .map((dayItem) => ({
                              label: dayItem.label,
                              date: dayItem.date,
                              title: dayItem.title,
                              sessions: dayItem.sessions.map((session) => ({
                                time: session.time,
                                endTime: session.endTime,
                                title: session.title,
                                speaker: session.speaker,
                                track: session.track,
                                location: session.location,
                                description: session.description,
                                cta: { label: session.ctaLabel, href: session.ctaHref },
                              })),
                            })),
                        )
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="grid gap-2 md:grid-cols-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Label</Label>
                      <Input value={day.label} onChange={(e) => updateDay(dayIndex, { label: e.target.value })} className="text-xs" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Date</Label>
                      <Input value={day.date} onChange={(e) => updateDay(dayIndex, { date: e.target.value })} className="text-xs" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Title</Label>
                      <Input value={day.title} onChange={(e) => updateDay(dayIndex, { title: e.target.value })} className="text-xs" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Sessions ({day.sessions.length})
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          updateDay(dayIndex, {
                            sessions: [
                              ...day.sessions,
                              { time: "", endTime: "", title: "New session", speaker: "", track: "", location: "", description: "", ctaLabel: "", ctaHref: "" },
                            ],
                          })
                        }
                      >
                        <Plus className="mr-1 h-3 w-3" />
                        Add Session
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {day.sessions.map((session, sessionIndex) => (
                        <div key={sessionIndex} className="rounded-md border bg-muted/30 p-2.5 space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-medium">{session.title || `Session ${sessionIndex + 1}`}</p>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 text-destructive hover:text-destructive"
                              onClick={() => {
                                const nextSessions = day.sessions.filter((_, idx) => idx !== sessionIndex);
                                updateDay(dayIndex, { sessions: nextSessions });
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                          <div className="grid gap-2 md:grid-cols-2">
                            <Input
                              className="text-xs"
                              value={session.time}
                              placeholder="Start time"
                              onChange={(e) => {
                                const nextSessions = [...day.sessions];
                                nextSessions[sessionIndex] = { ...nextSessions[sessionIndex], time: e.target.value };
                                updateDay(dayIndex, { sessions: nextSessions });
                              }}
                            />
                            <Input
                              className="text-xs"
                              value={session.endTime}
                              placeholder="End time"
                              onChange={(e) => {
                                const nextSessions = [...day.sessions];
                                nextSessions[sessionIndex] = { ...nextSessions[sessionIndex], endTime: e.target.value };
                                updateDay(dayIndex, { sessions: nextSessions });
                              }}
                            />
                          </div>
                          <Input
                            className="text-xs"
                            value={session.title}
                            placeholder="Session title"
                            onChange={(e) => {
                              const nextSessions = [...day.sessions];
                              nextSessions[sessionIndex] = { ...nextSessions[sessionIndex], title: e.target.value };
                              updateDay(dayIndex, { sessions: nextSessions });
                            }}
                          />
                          <div className="grid gap-2 md:grid-cols-3">
                            <Input
                              className="text-xs"
                              value={session.speaker}
                              placeholder="Speaker"
                              onChange={(e) => {
                                const nextSessions = [...day.sessions];
                                nextSessions[sessionIndex] = { ...nextSessions[sessionIndex], speaker: e.target.value };
                                updateDay(dayIndex, { sessions: nextSessions });
                              }}
                            />
                            <Input
                              className="text-xs"
                              value={session.track}
                              placeholder="Track"
                              onChange={(e) => {
                                const nextSessions = [...day.sessions];
                                nextSessions[sessionIndex] = { ...nextSessions[sessionIndex], track: e.target.value };
                                updateDay(dayIndex, { sessions: nextSessions });
                              }}
                            />
                            <Input
                              className="text-xs"
                              value={session.location}
                              placeholder="Location"
                              onChange={(e) => {
                                const nextSessions = [...day.sessions];
                                nextSessions[sessionIndex] = { ...nextSessions[sessionIndex], location: e.target.value };
                                updateDay(dayIndex, { sessions: nextSessions });
                              }}
                            />
                          </div>
                          <Textarea
                            className="text-xs"
                            rows={2}
                            value={session.description}
                            placeholder="Session description"
                            onChange={(e) => {
                              const nextSessions = [...day.sessions];
                              nextSessions[sessionIndex] = { ...nextSessions[sessionIndex], description: e.target.value };
                              updateDay(dayIndex, { sessions: nextSessions });
                            }}
                          />
                          <div className="grid gap-2 md:grid-cols-2">
                            <Input
                              className="text-xs"
                              value={session.ctaLabel}
                              placeholder="CTA label (optional)"
                              onChange={(e) => {
                                const nextSessions = [...day.sessions];
                                nextSessions[sessionIndex] = { ...nextSessions[sessionIndex], ctaLabel: e.target.value };
                                updateDay(dayIndex, { sessions: nextSessions });
                              }}
                            />
                            <Input
                              className="text-xs"
                              value={session.ctaHref}
                              placeholder="CTA link"
                              onChange={(e) => {
                                const nextSessions = [...day.sessions];
                                nextSessions[sessionIndex] = { ...nextSessions[sessionIndex], ctaHref: e.target.value };
                                updateDay(dayIndex, { sessions: nextSessions });
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
      break;
    }

    case "STATS":
      content = (
        <ArrayItemsEditor
          heading={(data.heading as string) ?? ""}
          onHeadingChange={(v) => updateField("heading", v)}
          items={(data.items as { label: string; value: string }[]) ?? []}
          onItemsChange={(items) => updateField("items", items)}
          fields={[
            { key: "label", label: "Label" },
            { key: "value", label: "Value" },
          ]}
          newItem={{ label: "Stat", value: "0" }}
        />
      );
      break;

    case "STEPS":
      content = (
        <ArrayItemsEditor
          heading={(data.heading as string) ?? (data.title as string) ?? ""}
          onHeadingChange={(v) => updateField("heading", v)}
          items={(data.steps as { title: string; description: string }[]) ?? []}
          onItemsChange={(items) => updateField("steps", items)}
          fields={[
            { key: "title", label: "Title" },
            { key: "description", label: "Description", multiline: true },
          ]}
          newItem={{ title: "New step", description: "" }}
        />
      );
      break;

    case "CARD_GRID":
      content = (
        <ArrayItemsEditor
          heading={(data.heading as string) ?? ""}
          onHeadingChange={(v) => updateField("heading", v)}
          items={(data.cards as { title: string; description: string; icon?: string }[]) ?? []}
          onItemsChange={(items) => updateField("cards", items)}
          fields={[
            { key: "title", label: "Title" },
            { key: "description", label: "Description", multiline: true },
            { key: "icon", label: "Icon name" },
          ]}
          newItem={{ title: "Card", description: "Description", icon: "star" }}
        />
      );
      break;

    case "LOGO_CLOUD": {
      const logos = ((data.logos as { name?: string; url?: string; assetKey?: string }[]) ?? []).map((logo) => ({
        name: String(logo.name ?? ""),
        url: String(logo.url ?? logo.assetKey ?? ""),
      }));
      content = (
        <ArrayItemsEditor
          heading={(data.heading as string) ?? (data.title as string) ?? ""}
          onHeadingChange={(v) => updateField("heading", v)}
          items={logos}
          onItemsChange={(items) =>
            updateField(
              "logos",
              items.map((item) => ({ ...item, assetKey: item.url })),
            )
          }
          fields={[
            { key: "name", label: "Logo name" },
            { key: "url", label: "Logo image", type: "image", placeholder: "https://..." },
          ]}
          newItem={{ name: "Partner", url: "" }}
          uploadAsset={uploadAsset}
          openMediaLibrary={openMediaLibrary}
          reorderable
        />
      );
      break;
    }

    case "PARTNER_STRIP":
      content = (
        <ArrayItemsEditor
          heading={(data.heading as string) ?? ""}
          onHeadingChange={(v) => updateField("heading", v)}
          items={(data.items as { label: string; logo: string; href?: string; size?: string; alt?: string }[]) ?? []}
          onItemsChange={(items) => updateField("items", items)}
          fields={[
            { key: "label", label: "Group Label (e.g. Organized by)" },
            { key: "logo", label: "Logo", type: "image", placeholder: "https://..." },
            { key: "href", label: "Link (optional)" },
            { key: "size", label: "Size (sm|md|lg)" },
            { key: "alt", label: "Alt text" },
          ]}
          newItem={{ label: "Trusted by", logo: "", href: "", size: "md", alt: "" }}
          uploadAsset={uploadAsset}
          openMediaLibrary={openMediaLibrary}
        />
      );
      break;

    case "IMAGE_GALLERY":
      content = (
        <GalleryItemsEditor
          heading={(data.heading as string) ?? (data.title as string) ?? ""}
          layout={(data.layout as string) ?? "grid"}
          items={((data.items as Record<string, unknown>[]) ?? (data.images as Record<string, unknown>[]) ?? [])}
          uploadAsset={uploadAsset}
          openMediaLibrary={openMediaLibrary}
          onChange={(next) =>
            onChange({
              ...data,
              heading: next.heading,
              layout: next.layout,
              items: next.items,
              images: next.items,
            })
          }
        />
      );
      break;

    case "IMAGE_STACK": {
      const images = ((data.images as Record<string, unknown>[]) ?? []).map((item) => ({
        name: String(item.name ?? ""),
        url: String(item.url ?? item.assetKey ?? ""),
        href: String(item.href ?? ""),
      }));
      content = (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Heading</Label>
            <Input value={(data.heading as string) ?? ""} onChange={(e) => updateField("heading", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Caption</Label>
            <Textarea
              value={(data.caption as string) ?? ""}
              onChange={(e) => updateField("caption", e.target.value)}
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant={Boolean(data.autoplay ?? true) ? "default" : "outline"}
              size="sm"
              onClick={() => updateField("autoplay", true)}
            >
              Autoplay On
            </Button>
            <Button
              variant={!Boolean(data.autoplay ?? true) ? "default" : "outline"}
              size="sm"
              onClick={() => updateField("autoplay", false)}
            >
              Autoplay Off
            </Button>
          </div>
          <div className="space-y-2">
            <Label>Interval (ms)</Label>
            <Input
              type="number"
              value={String(data.intervalMs ?? 3500)}
              onChange={(e) =>
                updateField("intervalMs", parseOptionalBoundedInt(e.target.value, 1000, 10000) ?? 3500)
              }
            />
          </div>
          <ArrayItemsEditor
            items={images}
            onItemsChange={(items) =>
              updateField(
                "images",
                items.map((item) => ({ ...item, assetKey: item.url })),
              )
            }
            fields={[
              { key: "name", label: "Image name" },
              { key: "url", label: "Image", type: "image", placeholder: "https://..." },
              { key: "href", label: "Link (optional)" },
            ]}
            newItem={{ name: "Photo", url: "", href: "" }}
            uploadAsset={uploadAsset}
            openMediaLibrary={openMediaLibrary}
          />
        </div>
      );
      break;
    }

    case "TEAM_GRID":
      content = (
        <div className="space-y-4">
          <ArrayItemsEditor
            heading={(data.heading as string) ?? (data.title as string) ?? ""}
            onHeadingChange={(v) => updateField("heading", v)}
            items={(data.members as { name: string; role: string; team?: string; location?: string; imageUrl?: string; bio?: string }[]) ?? []}
            onItemsChange={(items) => updateField("members", items)}
            fields={[
              { key: "name", label: "Name" },
              { key: "role", label: "Role" },
              { key: "team", label: "Team / Department" },
              { key: "location", label: "Location" },
              { key: "imageUrl", label: "Avatar", type: "image", placeholder: "https://..." },
              { key: "bio", label: "Bio", multiline: true },
            ]}
            newItem={{ name: "Name", role: "Role", team: "Team", location: "" }}
            uploadAsset={uploadAsset}
            openMediaLibrary={openMediaLibrary}
          />

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={(data.description as string) ?? ""}
              onChange={(e) => updateField("description", e.target.value)}
              rows={3}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Columns</Label>
              <div className="grid grid-cols-5 gap-2">
                {(["auto", "3", "4", "5", "6"] as const).map((maxColumns) => (
                  <Button
                    key={maxColumns}
                    size="sm"
                    variant={(String(data.maxColumns ?? "auto") === maxColumns) ? "default" : "outline"}
                    onClick={() => updateField("maxColumns", maxColumns)}
                  >
                    {maxColumns}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Card Density</Label>
              <div className="grid grid-cols-2 gap-2">
                {(["compact", "comfortable"] as const).map((cardStyle) => (
                  <Button
                    key={cardStyle}
                    size="sm"
                    variant={((data.cardStyle as string) ?? "compact") === cardStyle ? "default" : "outline"}
                    onClick={() => updateField("cardStyle", cardStyle)}
                  >
                    {cardStyle}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              size="sm"
              variant={Boolean(data.showBio ?? false) ? "default" : "outline"}
              onClick={() => updateField("showBio", true)}
            >
              Bios On
            </Button>
            <Button
              size="sm"
              variant={!Boolean(data.showBio ?? false) ? "default" : "outline"}
              onClick={() => updateField("showBio", false)}
            >
              Bios Off
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              size="sm"
              variant={Boolean(data.showSocials ?? true) ? "default" : "outline"}
              onClick={() => updateField("showSocials", true)}
            >
              Socials On
            </Button>
            <Button
              size="sm"
              variant={!Boolean(data.showSocials ?? true) ? "default" : "outline"}
              onClick={() => updateField("showSocials", false)}
            >
              Socials Off
            </Button>
          </div>
        </div>
      );
      break;

    case "VENUE":
      content = (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Heading</Label>
            <Input value={(data.heading as string) ?? ""} onChange={(e) => updateField("heading", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Venue Name</Label>
            <Input value={(data.venueName as string) ?? ""} onChange={(e) => updateField("venueName", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Address</Label>
            <Textarea value={(data.address as string) ?? ""} onChange={(e) => updateField("address", e.target.value)} rows={3} />
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Map Embed URL</Label>
              <Input
                value={(data.mapEmbedUrl as string) ?? ""}
                placeholder="https://www.google.com/maps/embed?..."
                onChange={(e) => updateField("mapEmbedUrl", e.target.value)}
                className="text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Map Link</Label>
              <Input
                value={(data.mapLink as string) ?? ""}
                placeholder="https://maps.google.com/..."
                onChange={(e) => updateField("mapLink", e.target.value)}
                className="text-xs"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={(data.notes as string) ?? ""} onChange={(e) => updateField("notes", e.target.value)} rows={3} />
          </div>
          <ArrayItemsEditor
            heading=""
            items={(data.details as { label: string; value: string; icon?: string }[]) ?? []}
            onItemsChange={(items) => updateField("details", items)}
            fields={[
              { key: "label", label: "Label" },
              { key: "value", label: "Value" },
              { key: "icon", label: "Icon key (map|clock|car|train|bus|plane|hotel|ticket|wallet)" },
            ]}
            newItem={{ label: "Detail", value: "Value", icon: "map" }}
          />
          <div className="space-y-1">
            <Label className="text-xs">Highlights (one per line)</Label>
            <Textarea
              className="text-xs"
              rows={4}
              value={Array.isArray(data.highlights) ? (data.highlights as string[]).join("\n") : ""}
              onChange={(e) =>
                updateField(
                  "highlights",
                  e.target.value
                    .split("\n")
                    .map((item) => item.trim())
                    .filter(Boolean),
                )
              }
            />
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <Input
              className="text-xs"
              value={(data.cta as { label?: string })?.label ?? ""}
              placeholder="CTA label"
              onChange={(e) => updateField("cta", { ...(data.cta as object ?? {}), label: e.target.value })}
            />
            <Input
              className="text-xs"
              value={(data.cta as { href?: string })?.href ?? ""}
              placeholder="CTA link"
              onChange={(e) => updateField("cta", { ...(data.cta as object ?? {}), href: e.target.value })}
            />
          </div>
        </div>
      );
      break;

    case "TEAM_TOOLTIP":
      content = (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Heading</Label>
            <Input value={(data.heading as string) ?? ""} onChange={(e) => updateField("heading", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={(data.description as string) ?? ""}
              onChange={(e) => updateField("description", e.target.value)}
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">CTA Label</Label>
              <Input value={(data.ctaLabel as string) ?? ""} onChange={(e) => updateField("ctaLabel", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">CTA Link</Label>
              <Input value={(data.ctaHref as string) ?? ""} onChange={(e) => updateField("ctaHref", e.target.value)} />
            </div>
          </div>
          <ArrayItemsEditor
            items={(data.items as { name: string; designation?: string; url?: string }[]) ?? []}
            onItemsChange={(items) => updateField("items", items)}
            fields={[
              { key: "name", label: "Name" },
              { key: "designation", label: "Designation" },
              { key: "url", label: "Avatar", type: "image", placeholder: "https://..." },
            ]}
            newItem={{ name: "Name", designation: "Role", url: "" }}
            uploadAsset={uploadAsset}
            openMediaLibrary={openMediaLibrary}
          />
        </div>
      );
      break;

    case "SPEAKER_SPOTLIGHT":
      content = (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Heading</Label>
            <Input value={(data.heading as string) ?? ""} onChange={(e) => updateField("heading", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={(data.description as string) ?? ""}
              onChange={(e) => updateField("description", e.target.value)}
              rows={3}
            />
          </div>
          <ArrayItemsEditor
            heading=""
            items={(data.speakers as {
              name: string;
              role?: string;
              organization?: string;
              imageUrl?: string;
              sessionTitle?: string;
              sessionHref?: string;
              bio?: string;
            }[]) ?? []}
            onItemsChange={(items) => updateField("speakers", items)}
            fields={[
              { key: "name", label: "Name" },
              { key: "role", label: "Role / Title" },
              { key: "organization", label: "Organization" },
              { key: "sessionTitle", label: "Session title" },
              { key: "sessionHref", label: "Session link" },
              { key: "imageUrl", label: "Avatar", type: "image", placeholder: "https://..." },
              { key: "bio", label: "Bio", multiline: true },
            ]}
            newItem={{
              name: "Speaker name",
              role: "Role",
              organization: "",
              sessionTitle: "",
              sessionHref: "",
              imageUrl: "",
              bio: "",
            }}
            uploadAsset={uploadAsset}
            openMediaLibrary={openMediaLibrary}
          />
        </div>
      );
      break;

    case "RESOURCES": {
      const columns = Number(data.columns ?? 2);
      content = (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Heading</Label>
            <Input value={(data.heading as string) ?? ""} onChange={(e) => updateField("heading", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={(data.description as string) ?? ""}
              onChange={(e) => updateField("description", e.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label>Columns</Label>
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3].map((count) => (
                <Button
                  key={count}
                  size="sm"
                  variant={columns === count ? "default" : "outline"}
                  onClick={() => updateField("columns", count)}
                >
                  {count}
                </Button>
              ))}
            </div>
          </div>
          <ArrayItemsEditor
            heading=""
            items={(data.resources as {
              title: string;
              description?: string;
              href?: string;
              kind?: string;
              fileType?: string;
              sizeLabel?: string;
            }[]) ?? []}
            onItemsChange={(items) => updateField("resources", items)}
            fields={[
              { key: "title", label: "Title" },
              { key: "description", label: "Description", multiline: true },
              { key: "href", label: "Download link / asset key" },
              { key: "kind", label: "Kind (brochure|map|policy|deck|document|other)" },
              { key: "fileType", label: "File type (PDF, PPTX...)" },
              { key: "sizeLabel", label: "Size label (e.g. 2.4 MB)" },
            ]}
            newItem={{
              title: "Resource title",
              description: "",
              href: "",
              kind: "document",
              fileType: "PDF",
              sizeLabel: "",
            }}
          />
        </div>
      );
      break;
    }

    case "STICKY_ALERT_BAR":
      content = (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Badge (optional)</Label>
            <Input
              value={(data.badge as string) ?? ""}
              placeholder="Urgent update"
              onChange={(e) => updateField("badge", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Message</Label>
            <Textarea
              value={(data.message as string) ?? ""}
              placeholder="Room change or registration deadline notice."
              rows={3}
              onChange={(e) => updateField("message", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Tone</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["info", "success", "warning", "urgent"] as const).map((tone) => (
                <Button
                  key={tone}
                  size="sm"
                  variant={(data.tone as string) === tone || ((data.tone as string) === undefined && tone === "urgent") ? "default" : "outline"}
                  onClick={() => updateField("tone", tone)}
                  className="capitalize"
                >
                  {tone}
                </Button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">CTA label</Label>
              <Input
                value={(data.cta as { label?: string })?.label ?? ""}
                onChange={(e) => updateField("cta", { ...(data.cta as object ?? {}), label: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">CTA link</Label>
              <Input
                value={(data.cta as { href?: string })?.href ?? ""}
                onChange={(e) => updateField("cta", { ...(data.cta as object ?? {}), href: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Show Icon</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                variant={(data.showIcon as boolean | undefined) !== false ? "default" : "outline"}
                onClick={() => updateField("showIcon", true)}
              >
                On
              </Button>
              <Button
                size="sm"
                variant={(data.showIcon as boolean | undefined) === false ? "default" : "outline"}
                onClick={() => updateField("showIcon", false)}
              >
                Off
              </Button>
            </div>
          </div>
        </div>
      );
      break;

    case "TABS":
      content = (
        <ArrayItemsEditor
          heading=""
          items={(data.tabs as { label: string; content: string }[]) ?? []}
          onItemsChange={(items) => updateField("tabs", items)}
          fields={[
            { key: "label", label: "Tab label" },
            { key: "content", label: "Content", multiline: true },
          ]}
          newItem={{ label: "New Tab", content: "" }}
        />
      );
      break;

    case "VIDEO_EMBED":
      content = (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Section title</Label>
            <Input value={(data.title as string) ?? ""} onChange={(e) => updateField("title", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Video URL</Label>
            <Input
              value={(data.url as string) ?? ""}
              onChange={(e) => updateField("url", e.target.value)}
              placeholder="YouTube, Vimeo, or direct video URL"
            />
          </div>
          <div className="space-y-2">
            <Label>Upload Video</Label>
            <div className="flex items-center gap-2">
              <Input
                type="file"
                accept="video/*"
                onChange={async (e) => {
                  const input = e.currentTarget;
                  const file = input.files?.[0];
                  if (!file) return;
                  try {
                    const src = uploadAsset ? await uploadAsset(file) : await fileToDataUrl(file);
                    updateField("url", src);
                  } catch {
                    toast.error("Video upload failed");
                  } finally {
                    input.value = "";
                  }
                }}
              />
              {openMediaLibrary && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => openMediaLibrary("video", (assetKey) => updateField("url", assetKey))}
                >
                  Library
                </Button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Large videos can increase page size. Use external hosting for best performance.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Autoplay</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={data.autoplay ? "default" : "outline"}
                size="sm"
                onClick={() => updateField("autoplay", true)}
              >
                On
              </Button>
              <Button
                variant={!data.autoplay ? "default" : "outline"}
                size="sm"
                onClick={() => updateField("autoplay", false)}
              >
                Off
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Caption</Label>
            <Input value={(data.caption as string) ?? ""} onChange={(e) => updateField("caption", e.target.value)} />
          </div>
        </div>
      );
      break;

    case "EMBED_DOC":
      content = (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Section title</Label>
            <Input
              value={(data.title as string) ?? ""}
              onChange={(e) => updateField("title", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Document URL / Asset key</Label>
            <Input
              value={(data.url as string) ?? ""}
              onChange={(e) => updateField("url", e.target.value)}
              placeholder="https://... or events/{eventId}/microsite/file.pdf"
            />
          </div>
          <div className="space-y-2">
            <Label>Upload Document</Label>
            <Input
              type="file"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={async (e) => {
                const input = e.currentTarget;
                const file = input.files?.[0];
                if (!file) return;
                try {
                  const src = uploadAsset ? await uploadAsset(file) : await fileToDataUrl(file);
                  const inferredTitle = file.name.replace(/\.[a-zA-Z0-9]+$/, "");
                  updateFields({
                    url: src,
                    title: (data.title as string) || inferredTitle,
                  });
                } catch {
                  toast.error("Document upload failed");
                } finally {
                  input.value = "";
                }
              }}
            />
            <p className="text-[11px] text-muted-foreground">
              Supports PDF, DOC, and DOCX.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Viewer Height (px)</Label>
            <Input
              type="number"
              min={320}
              max={1400}
              value={String(data.height ?? 720)}
              onChange={(e) => updateField("height", Number(e.target.value || 720))}
            />
          </div>
          <div className="space-y-2">
            <Label>Caption</Label>
            <Textarea
              value={(data.caption as string) ?? ""}
              onChange={(e) => updateField("caption", e.target.value)}
              rows={2}
            />
          </div>
        </div>
      );
      break;

    case "SEPARATOR":
      content = (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Label (optional)</Label>
            <Input
              value={(data.label as string) ?? ""}
              onChange={(e) => updateField("label", e.target.value)}
              placeholder="Section break"
            />
          </div>
          <div className="space-y-2">
            <Label>Line Style</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["line", "dashed", "dots", "gradient"] as const).map((variant) => (
                <Button
                  key={variant}
                  size="sm"
                  variant={(data.variant as string) === variant || ((data.variant as string) === undefined && variant === "line") ? "default" : "outline"}
                  onClick={() => updateField("variant", variant)}
                  className="capitalize"
                >
                  {variant}
                </Button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label>Thickness (1-8 px)</Label>
              <Input
                type="number"
                min={1}
                max={8}
                value={String(data.thickness ?? 1)}
                onChange={(e) => updateField("thickness", Number(e.target.value || 1))}
              />
            </div>
            <div className="space-y-2">
              <Label>Line Width</Label>
              <div className="grid grid-cols-2 gap-2">
                {(["sm", "md", "lg", "full"] as const).map((width) => (
                  <Button
                    key={width}
                    size="sm"
                    variant={(data.width as string) === width || ((data.width as string) === undefined && width === "full") ? "default" : "outline"}
                    onClick={() => updateField("width", width)}
                    className="uppercase"
                  >
                    {width}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </div>
      );
      break;

    case "TEXT_IMAGE_LEFT":
    case "TEXT_IMAGE_RIGHT": {
      const imageSideLabel = block.type === "TEXT_IMAGE_LEFT" ? "Image (left column)" : "Image (right column)";
      content = (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Heading</Label>
            <Input
              value={(data.heading as string) ?? ""}
              onChange={(e) => updateField("heading", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Text</Label>
            <Textarea
              value={(data.text as string) ?? ""}
              onChange={(e) => updateField("text", e.target.value)}
              rows={5}
            />
          </div>
          <div className="space-y-2">
            <Label>{imageSideLabel}</Label>
            <div className="flex items-center gap-2">
              <Input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const input = e.currentTarget;
                  const file = input.files?.[0];
                  if (!file) return;
                  try {
                    const src = uploadAsset ? await uploadAsset(file) : await fileToDataUrl(file);
                    updateField("imageUrl", src);
                  } catch {
                    toast.error("Image upload failed");
                  } finally {
                    input.value = "";
                  }
                }}
              />
              {openMediaLibrary && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => openMediaLibrary("image", (assetKey) => updateField("imageUrl", assetKey))}
                >
                  Library
                </Button>
              )}
            </div>
            <Input
              value={(data.imageUrl as string) ?? (data.assetKey as string) ?? ""}
              onChange={(e) => updateField("imageUrl", e.target.value)}
              placeholder="Image URL or asset key"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label>Alt text</Label>
              <Input
                value={(data.alt as string) ?? ""}
                onChange={(e) => updateField("alt", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Caption</Label>
              <Input
                value={(data.caption as string) ?? ""}
                onChange={(e) => updateField("caption", e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label>CTA label</Label>
              <Input
                value={(data.cta as { label?: string })?.label ?? ""}
                onChange={(e) => updateField("cta", { ...(data.cta as object ?? {}), label: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>CTA link</Label>
              <Input
                value={(data.cta as { href?: string })?.href ?? ""}
                onChange={(e) => updateField("cta", { ...(data.cta as object ?? {}), href: e.target.value })}
              />
            </div>
          </div>
        </div>
      );
      break;
    }

    case "TESTIMONIALS":
      content = (
        <ArrayItemsEditor
          heading={(data.title as string) ?? ""}
          onHeadingChange={(v) => updateField("title", v)}
          items={(data.items as { quote: string; author: string; role?: string; rating?: string; avatarUrl?: string }[]) ?? []}
          onItemsChange={(items) => updateField("items", items)}
          fields={[
            { key: "quote", label: "Quote", multiline: true },
            { key: "author", label: "Author" },
            { key: "role", label: "Role" },
            { key: "rating", label: "Rating (1-5)", type: "number" },
            { key: "avatarUrl", label: "Avatar", type: "image", placeholder: "https://..." },
          ]}
          newItem={{ quote: "Great experience.", author: "Applicant", role: "Participant", rating: "5" }}
          uploadAsset={uploadAsset}
          openMediaLibrary={openMediaLibrary}
        />
      );
      break;

    case "CUSTOM_CODE":
      content = (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Section title</Label>
            <Input value={(data.title as string) ?? ""} onChange={(e) => updateField("title", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>HTML</Label>
            <Textarea
              value={(data.html as string) ?? ""}
              onChange={(e) => updateField("html", e.target.value)}
              rows={6}
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-2">
            <Label>CSS</Label>
            <Textarea
              value={(data.css as string) ?? ""}
              onChange={(e) => updateField("css", e.target.value)}
              rows={5}
              className="font-mono text-xs"
            />
          </div>
        </div>
      );
      break;

    case "RANKS": {
      const ranksColumns = (data.columns as string[]) ?? [];
      const ranksRows = (data.rows as string[][]) ?? [];

      const parseCSV = (text: string) => {
        const lines = text.split(/\r?\n/).filter((l) => l.trim());
        if (lines.length === 0) return;
        const parseLine = (line: string) => {
          const result: string[] = [];
          let current = "";
          let inQuotes = false;
          for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') { inQuotes = !inQuotes; continue; }
            if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ""; continue; }
            current += ch;
          }
          result.push(current.trim());
          return result;
        };
        const cols = parseLine(lines[0]);
        const rows = lines.slice(1).map((l) => parseLine(l));
        updateFields({ columns: cols, rows });
      };

      content = (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Heading</Label>
            <Input
              value={(data.heading as string) ?? ""}
              onChange={(e) => updateField("heading", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Input
              value={(data.description as string) ?? ""}
              onChange={(e) => updateField("description", e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={(data.highlightPrizes as boolean) !== false}
              onCheckedChange={(v) => updateField("highlightPrizes", v)}
            />
            <Label className="text-xs">Highlight prize badges</Label>
          </div>
          <Separator />
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Upload className="h-3.5 w-3.5" />
              Import CSV
            </Label>
            <Input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                  if (typeof reader.result === "string") parseCSV(reader.result);
                };
                reader.readAsText(file);
                e.currentTarget.value = "";
              }}
            />
            <p className="text-[11px] text-muted-foreground">
              First row = column headers. Remaining rows = data.
            </p>
          </div>
          <Separator />
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Columns ({ranksColumns.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {ranksColumns.map((col, ci) => (
                <Input
                  key={ci}
                  className="w-24 h-7 text-xs"
                  value={col}
                  onChange={(e) => {
                    const next = [...ranksColumns];
                    next[ci] = e.target.value;
                    updateField("columns", next);
                  }}
                />
              ))}
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => updateField("columns", [...ranksColumns, `Col ${ranksColumns.length + 1}`])}
              >
                <Plus className="mr-1 h-3 w-3" /> Column
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Rows ({ranksRows.length})
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => updateField("rows", [...ranksRows, ranksColumns.map(() => "")])}
              >
                <Plus className="mr-1 h-3 w-3" /> Row
              </Button>
            </div>
            <div className="max-h-[40vh] overflow-y-auto space-y-2 pr-1">
              {ranksRows.map((row, ri) => (
                <div key={ri} className="rounded-lg border bg-card p-2">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-medium text-muted-foreground">Row {ri + 1}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 text-destructive hover:text-destructive"
                      onClick={() => updateField("rows", ranksRows.filter((_, i) => i !== ri))}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {ranksColumns.map((colName, ci) => (
                      <div key={ci}>
                        <label className="text-[10px] text-muted-foreground">{colName}</label>
                        <Input
                          className="h-7 text-xs"
                          value={row[ci] ?? ""}
                          onChange={(e) => {
                            const nextRows = ranksRows.map((r) => [...r]);
                            nextRows[ri][ci] = e.target.value;
                            updateField("rows", nextRows);
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
      break;
    }

    default:
      content = (
        <div className="space-y-2">
          <Label>Block data (JSON)</Label>
          <Textarea
            value={JSON.stringify(data, null, 2)}
            onChange={(e) => {
              try {
                onChange(JSON.parse(e.target.value));
              } catch { /* ignore parse errors while typing */ }
            }}
            rows={10}
            className="font-mono text-xs"
          />
        </div>
      );
  }

  return (
    <div className="space-y-4 pb-6">
      <Accordion type="multiple" defaultValue={["content"]} className="w-full space-y-3">
        <AccordionItem value="content" className="rounded-xl border bg-card px-3">
          <AccordionTrigger className="text-sm font-semibold">Content</AccordionTrigger>
          <AccordionContent className="pt-2">
            {content}
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="section" className="rounded-xl border bg-card px-3">
          <AccordionTrigger className="text-sm font-semibold">Section Design</AccordionTrigger>
          <AccordionContent className="pt-2">
            <SectionSettings
              section={section}
              onChange={(next) => updateField("section", next)}
              uploadAsset={uploadAsset}
              openMediaLibrary={openMediaLibrary}
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main Editor Page                                                    */
/* ------------------------------------------------------------------ */

export default function MicrositePageEditor() {
  const params = useParams();
  const router = useRouter();
  const { csrfToken } = useAuth();
  const eventId = params.eventId as string;
  const pageId = params.pageId as string;

  const [page, setPage] = useState<MicrositePage | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [siteSettings, setSiteSettings] = useState<SharedMicrositeSettings>(DEFAULT_MICROSITE_SETTINGS);
  const [eventSlug, setEventSlug] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCatalog, setShowCatalog] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [showPageSettings, setShowPageSettings] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogCategory, setCatalogCategory] = useState("all");
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [previewMode, setPreviewMode] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [mediaPicker, setMediaPicker] = useState<{
    kind: "image" | "video" | "all";
    onSelect: (assetKey: string) => void;
  } | null>(null);
  const [blockListQuery, setBlockListQuery] = useState("");
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const [autoPublishEnabled, setAutoPublishEnabled] = useState(false);
  const [isMicrositePublished, setIsMicrositePublished] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [showChecklist, setShowChecklist] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const leftPanelRef = useRef<HTMLElement | null>(null);
  const rightPanelRef = useRef<HTMLElement | null>(null);
  const saveValidationRef = useRef<string | null>(null);

  // Undo/redo stack
  const [history, setHistory] = useState<Block[][]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);

  const selectedBlock = blocks.find((b) => b.id === selectedId) ?? null;
  const canUndo = historyIdx > 0;
  const canRedo = historyIdx < history.length - 1;

  const pageSeo = (page?.seo ?? {}) as Record<string, unknown>;
  const pageCustomCode: PageCustomCode = (pageSeo.customCode ?? {}) as PageCustomCode;
  const savePayload = useMemo(() => buildSavePayload(blocks, page), [blocks, page]);
  const currentSnapshot = useMemo(() => JSON.stringify(savePayload), [savePayload]);
  const isDirty = savedSnapshot !== "" && currentSnapshot !== savedSnapshot;

  const filteredBlocks = useMemo(() => {
    const q = blockListQuery.trim().toLowerCase();
    if (!q) return blocks;
    return blocks.filter((block) => {
      const meta = BLOCK_CATALOG.find((item) => item.type === block.type);
      const searchable = `${meta?.label ?? block.type} ${block.type} ${getBlockSearchText(block)}`.toLowerCase();
      return searchable.includes(q);
    });
  }, [blocks, blockListQuery]);
  const isFilteringBlockList = blockListQuery.trim().length > 0;

  const checklistItems = useMemo(() => {
    const seoTitle = String(pageSeo.title ?? "").trim();
    const seoDescription = String(pageSeo.description ?? "").trim();
    const hasHero = blocks.some((block) => block.type === "HERO");
    const hasCallToAction = blocks.some((block) => {
      if (block.type === "CTA") return true;
      if (block.type !== "HERO") return false;
      const ctaHref = (block.data as { cta?: { href?: string } })?.cta?.href;
      return typeof ctaHref === "string" && ctaHref.trim() !== "" && ctaHref.trim() !== "#";
    });

    return [
      {
        id: "title",
        label: "Page title is set",
        done: Boolean(page?.title?.trim()),
        hint: "Give each page a descriptive title for navigation and SEO.",
      },
      {
        id: "slug",
        label: "Page slug is set",
        done: Boolean(page?.slug?.trim()),
        hint: "Use short, readable slugs.",
      },
      {
        id: "content",
        label: "Page has content blocks",
        done: blocks.length > 0,
        hint: "Add at least one section block before publishing.",
      },
      {
        id: "hero",
        label: "Hero section included",
        done: hasHero,
        hint: "Hero sections anchor the page and improve first impression.",
      },
      {
        id: "cta",
        label: "Call to action is present",
        done: hasCallToAction,
        hint: "Add a CTA block or hero CTA to guide visitors.",
      },
      {
        id: "seo-title",
        label: "SEO title added",
        done: seoTitle.length >= 20,
        hint: "Aim for at least 20 characters.",
      },
      {
        id: "seo-description",
        label: "SEO description added",
        done: seoDescription.length >= 70,
        hint: "Aim for around 70-160 characters.",
      },
      {
        id: "visibility",
        label: "Page is set to public",
        done: page?.visibility === "PUBLIC",
        hint: "Keep hidden until content is ready.",
      },
    ];
  }, [blocks, page?.title, page?.slug, page?.visibility, pageSeo.description, pageSeo.title]);
  const completedChecklistCount = checklistItems.filter((item) => item.done).length;

  const filteredCatalog = useMemo(() => {
    const q = catalogQuery.trim().toLowerCase();
    return BLOCK_CATALOG.filter((item) => {
      const matchesCategory = catalogCategory === "all" || item.category === catalogCategory;
      const matchesQuery =
        q.length === 0 ||
        `${item.label} ${item.description} ${item.category}`.toLowerCase().includes(q);
      return matchesCategory && matchesQuery;
    });
  }, [catalogCategory, catalogQuery]);
  const catalogFilterOptions = useMemo(
    () => [
      { id: "all", label: "All", count: BLOCK_CATALOG.length },
      ...CATEGORIES.map((category) => ({
        id: category,
        label: category,
        count: BLOCK_CATALOG.filter((item) => item.category === category).length,
      })),
    ],
    [],
  );

  const uploadAsset = useCallback(
    async (file: File) => {
      return uploadMicrositeAsset(eventId, file, csrfToken ?? undefined);
    },
    [eventId, csrfToken],
  );

  const openMediaLibrary = useCallback<OpenMediaLibrary>(
    (kind, onSelect) => {
      setMediaPicker({ kind, onSelect });
    },
    [],
  );

  useEffect(() => {
    setAutoPublishEnabled(readMicrositeAutoPublishPreference(eventId));
  }, [eventId]);

  const handleAutoPublishChange = useCallback(
    (nextEnabled: boolean) => {
      setAutoPublishEnabled(nextEnabled);
      writeMicrositeAutoPublishPreference(eventId, nextEnabled);
    },
    [eventId],
  );

  // Push to history whenever blocks change (debounced)
  const pushHistory = useCallback(
    (newBlocks: Block[]) => {
      setHistory((prev) => {
        const trimmed = prev.slice(0, historyIdx + 1);
        return [...trimmed, newBlocks];
      });
      setHistoryIdx((prev) => prev + 1);
    },
    [historyIdx],
  );

  function undo() {
    if (!canUndo) return;
    const prevIdx = historyIdx - 1;
    setBlocks(history[prevIdx]);
    setHistoryIdx(prevIdx);
  }

  function redo() {
    if (!canRedo) return;
    const nextIdx = historyIdx + 1;
    setBlocks(history[nextIdx]);
    setHistoryIdx(nextIdx);
  }

  useEffect(() => {
    (async () => {
      try {
        const [data, siteResponse] = await Promise.all([
          apiClient<MicrositePage>(`/admin/events/${eventId}/microsite/pages/${pageId}`),
          apiClient<unknown>(`/admin/events/${eventId}/microsite`).catch(() => null),
        ]);
        const initialBlocks = data.blocks ?? [];
        setPage(data);
        setBlocks(initialBlocks);
        setHistory([initialBlocks]);
        setHistoryIdx(0);
        setSavedSnapshot(JSON.stringify(buildSavePayload(initialBlocks, data)));
        setLastSavedAt(new Date().toISOString());

        if (siteResponse) {
          const rawSite = unwrapApiObject(siteResponse);
          setSiteSettings(normalizeMicrositeSettings(rawSite.settings));
          const events = rawSite.events as { slug?: unknown } | undefined;
          const publishedVersion = Number(
            rawSite.publishedVersion ?? rawSite.published_version ?? 0,
          );
          setIsMicrositePublished(publishedVersion > 0);
          setEventSlug(typeof events?.slug === "string" ? events.slug : "");
        } else {
          setSiteSettings(DEFAULT_MICROSITE_SETTINGS);
          setIsMicrositePublished(false);
          setEventSlug("");
        }
      } catch {
        /* handled */
      } finally {
        setIsLoading(false);
      }
    })();
  }, [eventId, pageId]);

  function updateBlocks(newBlocks: Block[]) {
    setBlocks(newBlocks);
    pushHistory(newBlocks);
  }

  function addBlock(type: BlockType) {
    const newBlock: Block = {
      id: createId(),
      type,
      data: getDefaultData(type),
    };
    // Insert after selected, or at end
    const idx = selectedId ? blocks.findIndex((b) => b.id === selectedId) + 1 : blocks.length;
    const updated = [...blocks];
    updated.splice(idx, 0, newBlock);
    updateBlocks(updated);
    setSelectedId(newBlock.id);
    setShowCatalog(false);
  }

  function applyTemplate(templateId: string, mode: "append" | "replace") {
    const template = PAGE_TEMPLATES.find((item) => item.id === templateId);
    if (!template) return;

    const generatedBlocks = template.blocks.map((type) => ({
      id: createId(),
      type,
      data: getDefaultData(type),
    }));

    const nextBlocks = mode === "replace" ? generatedBlocks : [...blocks, ...generatedBlocks];
    updateBlocks(nextBlocks);
    setSelectedId(generatedBlocks[0]?.id ?? null);
    setShowTemplates(false);
    toast.success(
      mode === "replace"
        ? `Applied "${template.label}" template`
        : `Added "${template.label}" blocks`,
    );
  }

  function duplicateBlock(id: string) {
    const idx = blocks.findIndex((b) => b.id === id);
    if (idx < 0) return;
    const clone: Block = {
      ...JSON.parse(JSON.stringify(blocks[idx])),
      id: createId(),
    };
    const updated = [...blocks];
    updated.splice(idx + 1, 0, clone);
    updateBlocks(updated);
    setSelectedId(clone.id);
  }

  function deleteBlock(id: string) {
    updateBlocks(blocks.filter((b) => b.id !== id));
    if (selectedId === id) setSelectedId(null);
    setDeleteTarget(null);
  }

  function updateBlockData(id: string, data: BlockData) {
    updateBlocks(blocks.map((b) => (b.id === id ? { ...b, data } : b)));
  }

  function updatePageField<K extends keyof MicrositePage>(key: K, value: MicrositePage[K]) {
    setPage((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function updateSeoField(key: string, value: string) {
    setPage((prev) => {
      if (!prev) return prev;
      const seo = { ...(prev.seo ?? {}), [key]: value };
      return { ...prev, seo };
    });
  }

  function updatePageCustomCodeField(key: keyof PageCustomCode, value: string) {
    setPage((prev) => {
      if (!prev) return prev;
      const seo = { ...(prev.seo ?? {}) } as Record<string, unknown>;
      const customCode = { ...((seo.customCode as PageCustomCode | undefined) ?? {}), [key]: value };
      seo.customCode = customCode;
      return { ...prev, seo };
    });
  }

  const save = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    const parsedPayload = UpdateMicrositePageSchema.safeParse(savePayload);
    if (!parsedPayload.success) {
      const firstIssue = parsedPayload.error.issues[0];
      const issuePath = firstIssue?.path?.join(".") || "payload";
      const message = `${issuePath}: ${firstIssue?.message ?? "Invalid data"}`;

      if (saveValidationRef.current !== message) {
        toast.error(`Unable to save page. Fix: ${message}`);
        saveValidationRef.current = message;
      }
      if (silent && autoSaveEnabled) {
        setAutoSaveEnabled(false);
        toast.error("Auto-save paused because page data is invalid.");
      }
      return;
    }

    saveValidationRef.current = null;
    setIsSaving(true);
    try {
      await apiClient(`/admin/events/${eventId}/microsite/pages/${pageId}`, {
        method: "PATCH",
        body: parsedPayload.data,
        csrfToken: csrfToken ?? undefined,
      });
      setSavedSnapshot(currentSnapshot);
      setLastSavedAt(new Date().toISOString());

      let didAutoPublish = false;
      let autoPublishFailed = false;
      if (autoPublishEnabled && isMicrositePublished) {
        try {
          await apiClient(`/admin/events/${eventId}/microsite/publish`, {
            method: "POST",
            csrfToken: csrfToken ?? undefined,
          });
          didAutoPublish = true;
        } catch {
          autoPublishFailed = true;
          if (silent && autoPublishEnabled) {
            setAutoPublishEnabled(false);
            writeMicrositeAutoPublishPreference(eventId, false);
            toast.error("Auto-publish paused because publishing failed.");
          }
        }
      }

      if (!silent) {
        if (autoPublishFailed) {
          toast.success("Page saved, but auto-publish failed");
        } else {
          toast.success(didAutoPublish ? "Page saved and published" : "Page saved successfully");
        }
      }
    } catch {
      /* handled */
    } finally {
      setIsSaving(false);
    }
  }, [autoPublishEnabled, autoSaveEnabled, csrfToken, currentSnapshot, eventId, isMicrositePublished, pageId, savePayload]);

  useEffect(() => {
    if (!autoSaveEnabled || !isDirty || isSaving) return;
    const timeoutId = window.setTimeout(() => {
      void save({ silent: true });
    }, 10000);
    return () => window.clearTimeout(timeoutId);
  }, [autoSaveEnabled, currentSnapshot, isDirty, isSaving, save]);

  useEffect(() => {
    if (!isDirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // Keyboard shortcuts
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isTypingTarget = target
        ? ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable
        : false;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setShowCatalog(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.metaKey || e.ctrlKey) && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) {
        e.preventDefault();
        redo();
      }
      if (e.key === "Escape") {
        setSelectedId(null);
      }
      if (!isTypingTarget && e.key === "/" && !showCatalog) {
        e.preventDefault();
        setShowCatalog(true);
      }
      if (!isTypingTarget && blocks.length > 0 && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        e.preventDefault();
        const currentIdx = selectedId ? blocks.findIndex((block) => block.id === selectedId) : -1;
        const nextIdx = e.key === "ArrowDown"
          ? (currentIdx < 0 ? 0 : Math.min(blocks.length - 1, currentIdx + 1))
          : (currentIdx < 0 ? blocks.length - 1 : Math.max(0, currentIdx - 1));
        const nextBlock = blocks[nextIdx];
        if (nextBlock) setSelectedId(nextBlock.id);
      }
      if (!isTypingTarget && e.key === "Delete" && selectedId) {
        setDeleteTarget(selectedId);
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, blocks, historyIdx, save, showCatalog]);

  if (isLoading) {
    return (
      <div className="flex min-h-[55vh] items-center justify-center rounded-2xl border bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const previewWidth =
    previewMode === "desktop" ? "100%" : previewMode === "tablet" ? "768px" : "375px";
  const normalizedSiteSettings = normalizeMicrositeSettings(siteSettings);
  const previewThemeClass = resolveMicrositeThemeClass(normalizedSiteSettings.theme);
  const previewHeadingClass = resolveMicrositeHeadingClass(normalizedSiteSettings);
  const previewBodyClass = resolveMicrositeBodyClass(normalizedSiteSettings);
  const previewMotionClass = resolveMicrositeMotionClass(normalizedSiteSettings);
  const previewStyleVariables = getMicrositeStyleVariables(normalizedSiteSettings);
  const filteredCategories = CATEGORIES.filter((category) =>
    filteredCatalog.some((item) => item.category === category),
  );
  const blockIndexById = new Map<string, number>();
  blocks.forEach((block, index) => blockIndexById.set(block.id, index + 1));
  const selectedBlockMeta = selectedBlock
    ? BLOCK_CATALOG.find((item) => item.type === selectedBlock.type)
    : null;
  const SelectedBlockIcon = selectedBlockMeta?.icon ?? Type;
  const workspaceColumns =
    showLeftPanel && showRightPanel
      ? "xl:grid-cols-[340px_minmax(0,1fr)]"
      : "xl:grid-cols-[minmax(0,1fr)]";

  const renderBlockRow = (block: Block, { draggable }: { draggable: boolean }) => {
    const meta = BLOCK_CATALOG.find((item) => item.type === block.type);
    const Icon = meta?.icon ?? Type;
    const isSelected = selectedId === block.id;

    return (
      <div
        role="button"
        tabIndex={0}
        className={`group flex w-full items-center gap-2 rounded-lg px-2.5 py-2.5 text-left text-sm transition-colors
          ${isSelected ? "bg-primary/10 text-primary ring-1 ring-primary/25" : "hover:bg-muted/70"}`}
        onClick={() => setSelectedId(isSelected ? null : block.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setSelectedId(isSelected ? null : block.id);
          }
        }}
      >
        {draggable ? (
          <GripVertical className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity cursor-grab shrink-0" />
        ) : (
          <div className="h-3.5 w-3.5 shrink-0" />
        )}
        <Icon className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate font-medium">{meta?.label ?? block.type}</span>
        <span className="text-[10px] text-muted-foreground">#{blockIndexById.get(block.id) ?? "-"}</span>
        <div className="flex items-center gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={(e) => {
                  e.stopPropagation();
                  duplicateBlock(block.id);
                }}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Duplicate</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-destructive hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteTarget(block.id);
                }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete</TooltipContent>
          </Tooltip>
        </div>
      </div>
    );
  };

  function handleBackNavigation() {
    if (isDirty && !window.confirm("You have unsaved changes. Leave this page anyway?")) {
      return;
    }
    router.back();
  }

  function jumpToPanel(target: "left" | "right") {
    const panel =
      target === "left"
        ? leftPanelRef.current
        : rightPanelRef.current;
    panel?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="flex min-h-[78vh] flex-col overflow-y-auto rounded-2xl border bg-background shadow-sm lg:min-h-[calc(100svh-6rem)]">
      {/* Top toolbar */}
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 md:gap-3 md:px-5">
          <Button variant="ghost" size="sm" onClick={handleBackNavigation}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back
          </Button>
          <div className="min-w-[220px] flex-1">
            <p className="truncate text-sm font-semibold">{page?.title ?? "Page Editor"}</p>
            <p className="text-[11px] text-muted-foreground">/{page?.slug}</p>
          </div>

          <Badge variant="outline" className="text-xs hidden sm:inline-flex">
            {blocks.length} block{blocks.length !== 1 ? "s" : ""}
          </Badge>
          {selectedBlock && (
            <Badge variant="secondary" className="text-xs hidden lg:inline-flex">
              Editing: {BLOCK_CATALOG.find((item) => item.type === selectedBlock.type)?.label ?? selectedBlock.type}
            </Badge>
          )}
          <Badge variant={isDirty ? "secondary" : "outline"} className="text-xs hidden md:inline-flex">
            {isDirty ? "Unsaved changes" : `Saved ${formatSavedTime(lastSavedAt) || "now"}`}
          </Badge>
          <Badge variant="outline" className="text-xs hidden xl:inline-flex capitalize">
            Theme: {siteSettings.theme}
          </Badge>

          <Button onClick={() => void save()} disabled={isSaving || !isDirty} size="sm" className="ml-auto">
            {isSaving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
            {isDirty ? "Save changes" : "Saved"}
          </Button>
        </div>

        <div className="border-t bg-muted/20">
          <div className="flex items-center gap-2 overflow-x-auto px-4 py-2.5 md:px-5">
            {/* Undo/redo */}
            <div className="flex shrink-0 items-center gap-1 rounded-md border bg-background px-1 py-0.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!canUndo} onClick={undo}>
                    <Undo2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!canRedo} onClick={redo}>
                    <Redo2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Redo (Ctrl+Y)</TooltipContent>
              </Tooltip>
            </div>

            {/* Panel toggles */}
            <div className="flex shrink-0 items-center gap-1 rounded-md border bg-background px-1 py-0.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showLeftPanel ? "secondary" : "ghost"}
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setShowLeftPanel(!showLeftPanel)}
                  >
                    <PanelLeft className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Toggle block list</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showRightPanel ? "secondary" : "ghost"}
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setShowRightPanel(!showRightPanel)}
                  >
                    <PanelRight className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Toggle inspector</TooltipContent>
              </Tooltip>
            </div>

            <Button variant="outline" size="sm" className="shrink-0" onClick={() => setShowPageSettings(true)}>
              <Settings2 className="mr-1.5 h-3.5 w-3.5" />
              Page settings
            </Button>
            <Button variant="outline" size="sm" className="shrink-0" onClick={() => setShowTemplates(true)}>
              <LayoutGrid className="mr-1.5 h-3.5 w-3.5" />
              Templates
            </Button>
            <Button variant="outline" size="sm" className="shrink-0" onClick={() => setShowChecklist(true)}>
              {completedChecklistCount === checklistItems.length ? (
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5 text-success" />
              ) : (
                <AlertCircle className="mr-1.5 h-3.5 w-3.5 text-amber-500" />
              )}
              Checklist
              <span className="ml-1.5 text-[11px] text-muted-foreground">
                {completedChecklistCount}/{checklistItems.length}
              </span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() =>
                openMediaLibrary("all", async (assetKey) => {
                  try {
                    await navigator.clipboard.writeText(assetKey);
                    toast.success("Asset key copied");
                  } catch {
                    toast.success("Asset selected");
                  }
                })
              }
            >
              <ImageIcon className="mr-1.5 h-3.5 w-3.5" />
              Media library
            </Button>
            <Button variant="ghost" size="sm" className="shrink-0" onClick={() => setShowShortcuts(true)}>
              Shortcuts
            </Button>

            <div className="ml-auto flex shrink-0 items-center gap-2 rounded-md border bg-background px-2.5 py-1.5">
              <Label htmlFor="microsite-autosave" className="text-[11px] text-muted-foreground">
                Auto-save
              </Label>
              <Switch
                id="microsite-autosave"
                size="sm"
                checked={autoSaveEnabled}
                onCheckedChange={setAutoSaveEnabled}
              />
            </div>
            <div className="flex shrink-0 items-center gap-2 rounded-md border bg-background px-2.5 py-1.5">
              <Label htmlFor="microsite-auto-publish" className="text-[11px] text-muted-foreground">
                Auto-publish
              </Label>
              <Switch
                id="microsite-auto-publish"
                size="sm"
                checked={autoPublishEnabled}
                onCheckedChange={handleAutoPublishChange}
              />
            </div>
          </div>
        </div>
      </header>

      <div className={cn("grid min-h-0 flex-1 gap-3 bg-muted/20 p-3 md:p-4", workspaceColumns)}>
        <div className="flex items-center gap-2 rounded-xl border bg-background px-3 py-2.5 xl:hidden">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Jump To</p>
          <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => jumpToPanel("left")} disabled={!showLeftPanel}>
            Structure
          </Button>
          <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => jumpToPanel("right")} disabled={!showRightPanel}>
            Inspector
          </Button>
        </div>

        {showLeftPanel && (
          <aside ref={leftPanelRef} className="min-h-[320px] overflow-hidden rounded-xl border bg-background shadow-sm xl:min-h-0">
            <Tabs defaultValue="outline" className="flex h-full min-h-0 flex-col gap-0">
              <div className="space-y-2 border-b bg-muted/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Structure
                </p>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="outline">Outline</TabsTrigger>
                  <TabsTrigger value="insert">Insert</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="outline" className="mt-0 min-h-0 flex-1 data-[state=inactive]:hidden">
                <div className="flex h-full min-h-0 flex-col">
                  <div className="space-y-2 border-b p-3">
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => setShowTemplates(true)}>
                        <LayoutGrid className="mr-1 h-3 w-3" />
                        Template
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => setShowCatalog(true)}>
                        <Plus className="mr-1 h-3 w-3" />
                        Add Block
                      </Button>
                    </div>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        value={blockListQuery}
                        onChange={(e) => setBlockListQuery(e.target.value)}
                        placeholder="Filter blocks"
                        className="h-8 pl-8 text-xs"
                      />
                    </div>
                  </div>

                  <ScrollArea className="min-h-0 flex-1">
                    {blocks.length === 0 ? (
                      <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
                        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                          <Plus className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <p className="text-sm font-medium">No blocks yet</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Add blocks to build your page.
                        </p>
                        <Button size="sm" className="mt-4" onClick={() => setShowCatalog(true)}>
                          Add first block
                        </Button>
                      </div>
                    ) : filteredBlocks.length === 0 ? (
                      <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
                        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                          <Search className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <p className="text-sm font-medium">No matching blocks</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Try a different filter.
                        </p>
                        <Button size="sm" variant="outline" className="mt-4" onClick={() => setBlockListQuery("")}>
                          Clear filter
                        </Button>
                      </div>
                    ) : isFilteringBlockList ? (
                      <div className="space-y-1 p-2">
                        {filteredBlocks.map((block) => (
                          <div key={block.id}>
                            {renderBlockRow(block, { draggable: false })}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <Reorder.Group
                        axis="y"
                        values={blocks}
                        onReorder={(newOrder) => updateBlocks(newOrder)}
                        className="space-y-1 p-2"
                      >
                        {blocks.map((block) => (
                          <Reorder.Item key={block.id} value={block}>
                            {renderBlockRow(block, { draggable: true })}
                          </Reorder.Item>
                        ))}
                      </Reorder.Group>
                    )}
                  </ScrollArea>
                </div>
              </TabsContent>

              <TabsContent value="insert" className="mt-0 min-h-0 flex-1 data-[state=inactive]:hidden">
                <ScrollArea className="h-full">
                  <div className="space-y-4 p-3">
                    <div className="rounded-lg border bg-muted/30 p-3">
                      <p className="text-sm font-medium">Quick start</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Open templates or add blocks by category.
                      </p>
                      <div className="mt-3 flex gap-2">
                        <Button size="sm" variant="outline" className="flex-1" onClick={() => setShowTemplates(true)}>
                          Templates
                        </Button>
                        <Button size="sm" className="flex-1" onClick={() => setShowCatalog(true)}>
                          Catalog
                        </Button>
                      </div>
                    </div>

                    {CATEGORIES.map((category) => {
                      const categoryBlocks = BLOCK_CATALOG.filter((item) => item.category === category);
                      if (categoryBlocks.length === 0) return null;
                      return (
                        <div key={category} className="space-y-2">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {category}
                          </p>
                          <div className="space-y-1.5">
                            {categoryBlocks.map((item) => (
                              <button
                                key={item.type}
                                type="button"
                                className="flex w-full items-start gap-2 rounded-lg border p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-muted/40"
                                onClick={() => addBlock(item.type)}
                              >
                                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                                  <item.icon className="h-3.5 w-3.5" />
                                </span>
                                <span className="min-w-0">
                                  <span className="block truncate text-sm font-medium">{item.label}</span>
                                  <span className="block text-xs text-muted-foreground">{item.description}</span>
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </aside>
        )}
        {/* Center fallback */}
        {!showLeftPanel && !showRightPanel && (
          <section className="flex min-h-[320px] items-center justify-center rounded-xl border bg-background p-6 text-center">
            <div className="space-y-2">
              <p className="text-sm font-semibold">Panels are hidden</p>
              <p className="text-xs text-muted-foreground">
                Re-enable Structure or Inspector from the toolbar to continue editing.
              </p>
            </div>
          </section>
        )}
        {/* Right panel - inspector */}
        {showRightPanel && (
          <aside ref={rightPanelRef} className="min-h-[360px] overflow-hidden rounded-xl border bg-background shadow-sm xl:min-h-0">
            <Tabs defaultValue={selectedBlock ? "block" : "preview"} className="flex h-full min-h-0 flex-col gap-0">
              <div className="space-y-2 border-b bg-muted/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Inspector
                </p>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="block">Block</TabsTrigger>
                  <TabsTrigger value="page">Page</TabsTrigger>
                  <TabsTrigger value="preview">Preview</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="block" className="mt-0 min-h-0 flex-1 data-[state=inactive]:hidden">
                {selectedBlock ? (
                  <div className="flex h-full min-h-0 flex-col">
                    <div className="flex items-center gap-2 border-b p-3">
                      <SelectedBlockIcon className="h-4 w-4 text-primary" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{selectedBlockMeta?.label ?? selectedBlock.type}</p>
                        <p className="text-[10px] text-muted-foreground">{selectedBlock.id}</p>
                      </div>
                      <div className="flex gap-0.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => duplicateBlock(selectedBlock.id)}>
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Duplicate</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => setDeleteTarget(selectedBlock.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Delete</TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                    <ScrollArea className="min-h-0 flex-1">
                      <div className="p-4 md:p-5">
                        <BlockInspector
                          block={selectedBlock}
                          onChange={(newData) => updateBlockData(selectedBlock.id, newData)}
                          uploadAsset={uploadAsset}
                          openMediaLibrary={openMediaLibrary}
                        />
                      </div>
                    </ScrollArea>
                  </div>
                ) : (
                  <div className="flex h-full min-h-0 flex-col items-center justify-center px-6 text-center">
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                      <MousePointer className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium">No block selected</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Select a block from Structure, or use the Preview tab.
                    </p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="preview" className="mt-0 min-h-0 flex-1 data-[state=inactive]:hidden">
                <div className="flex h-full min-h-0 flex-col">
                  <div className="flex flex-wrap items-center gap-2 border-b bg-muted/20 px-3 py-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Microsite Preview
                    </p>
                    <div className="ml-auto flex items-center gap-0.5 rounded-md border bg-background p-0.5">
                      {([
                        { mode: "desktop" as const, icon: Monitor },
                        { mode: "tablet" as const, icon: Tablet },
                        { mode: "mobile" as const, icon: Smartphone },
                      ]).map(({ mode, icon: Icon }) => (
                        <Tooltip key={mode}>
                          <TooltipTrigger asChild>
                            <Button
                              variant={previewMode === mode ? "secondary" : "ghost"}
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => setPreviewMode(mode)}
                            >
                              <Icon className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent className="capitalize">{mode}</TooltipContent>
                        </Tooltip>
                      ))}
                    </div>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowCatalog(true)}>
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      Add block
                    </Button>
                  </div>

                  <ScrollArea className="min-h-0 flex-1 bg-muted/25">
                    <div className="flex min-h-full justify-center p-3">
                      <div
                        className="w-full overflow-hidden rounded-xl border bg-background shadow-sm transition-all duration-300"
                        style={{ maxWidth: previewWidth }}
                      >
                        <div
                          data-microsite-root="true"
                          className={cn(
                            "relative isolate min-h-[420px] overflow-x-hidden",
                            previewThemeClass,
                            previewBodyClass,
                            previewHeadingClass,
                            previewMotionClass,
                          )}
                          style={previewStyleVariables}
                        >
                          <style dangerouslySetInnerHTML={{ __html: MICROSITE_PREVIEW_RUNTIME_CSS }} />
                          <MicrositePreviewBackground patternStyle={normalizedSiteSettings.design?.patternStyle} />
                          <div className="relative z-10">
                            {blocks.length === 0 ? (
                              <div className="flex flex-col items-center justify-center py-24 text-center">
                                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
                                  <Sparkles className="h-6 w-6 text-muted-foreground" />
                                </div>
                                <p className="text-base font-semibold">Start building</p>
                                <p className="mt-1 max-w-[280px] text-xs text-muted-foreground">
                                  Add blocks from the catalog to build your microsite page.
                                </p>
                                <Button size="sm" className="mt-5" onClick={() => setShowCatalog(true)}>
                                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                                  Add first block
                                </Button>
                              </div>
                            ) : (
                              <div className="divide-y">
                                {blocks.map((block, index) => {
                                  const isSelected = selectedId === block.id;
                                  return (
                                    <motion.div
                                      key={block.id}
                                      layout
                                      className={`group relative cursor-pointer transition-all duration-150
                                        ${isSelected ? "ring-2 ring-primary ring-inset bg-primary/5" : "hover:bg-muted/30"}`}
                                      onClick={() => setSelectedId(isSelected ? null : block.id)}
                                    >
                                      <div className="pointer-events-none">
                                        <BlockRenderer
                                          blocks={[block as SharedBlock]}
                                          eventSlug={eventSlug || undefined}
                                          siteLogoAssetKey={normalizedSiteSettings.navigation?.logoAssetKey}
                                          isPreview
                                        />
                                      </div>
                                      <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-1 p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                                        <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                                          {index + 1}. {BLOCK_CATALOG.find((b) => b.type === block.type)?.label ?? block.type}
                                        </Badge>
                                        <div className="flex items-center gap-1">
                                          <Button
                                            type="button"
                                            variant="secondary"
                                            size="icon"
                                            className="h-6 w-6"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              duplicateBlock(block.id);
                                            }}
                                          >
                                            <Copy className="h-3 w-3" />
                                          </Button>
                                          <Button
                                            type="button"
                                            variant="secondary"
                                            size="icon"
                                            className="h-6 w-6 text-destructive hover:text-destructive"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setDeleteTarget(block.id);
                                            }}
                                          >
                                            <Trash2 className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      </div>
                                      <div className="absolute inset-x-0 bottom-0 flex translate-y-1/2 justify-center opacity-0 transition-opacity group-hover:opacity-100">
                                        <Button
                                          type="button"
                                          variant="secondary"
                                          size="sm"
                                          className="h-7 text-xs shadow-sm"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedId(block.id);
                                            setShowCatalog(true);
                                          }}
                                        >
                                          <Plus className="mr-1 h-3 w-3" />
                                          Add after
                                        </Button>
                                      </div>
                                    </motion.div>
                                  );
                                })}
                                <button
                                  type="button"
                                  className="flex w-full items-center justify-center py-4 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                                  onClick={() => {
                                    setSelectedId(null);
                                    setShowCatalog(true);
                                  }}
                                >
                                  <Plus className="mr-1.5 h-4 w-4" />
                                  Add block
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </ScrollArea>
                </div>
              </TabsContent>

              <TabsContent value="page" className="mt-0 min-h-0 flex-1 data-[state=inactive]:hidden">
                <ScrollArea className="h-full">
                  <div className="space-y-4 p-4">
                    <div className="rounded-lg border bg-muted/30 p-3">
                      <p className="text-sm font-semibold">Publishing Readiness</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {completedChecklistCount}/{checklistItems.length} checks complete
                      </p>
                      <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => setShowChecklist(true)}>
                        Open checklist
                      </Button>
                    </div>

                    <div className="rounded-lg border p-3">
                      <p className="text-sm font-semibold">Page Actions</p>
                      <div className="mt-3 space-y-2">
                        <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => setShowPageSettings(true)}>
                          <Settings2 className="mr-2 h-3.5 w-3.5" />
                          Edit page settings
                        </Button>
                        <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => setShowTemplates(true)}>
                          <LayoutGrid className="mr-2 h-3.5 w-3.5" />
                          Apply template
                        </Button>
                        <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => setShowCatalog(true)}>
                          <Plus className="mr-2 h-3.5 w-3.5" />
                          Add new block
                        </Button>
                      </div>
                    </div>

                    <div className="rounded-lg border p-3">
                      <p className="text-sm font-semibold">Checklist Snapshot</p>
                      <div className="mt-3 space-y-2">
                        {checklistItems.map((item) => (
                          <div key={item.id} className="flex items-start gap-2 rounded-md bg-muted/30 px-2.5 py-2">
                            {item.done ? (
                              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                            ) : (
                              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                            )}
                            <div className="min-w-0">
                              <p className="text-xs font-medium">{item.label}</p>
                              <p className="text-[11px] text-muted-foreground">{item.hint}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </aside>
        )}
      </div>

      {/* Block catalog dialog */}
      <Dialog open={showCatalog} onOpenChange={setShowCatalog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add a block</DialogTitle>
            <DialogDescription>Choose a block type to add to your page.</DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={catalogQuery}
              onChange={(e) => setCatalogQuery(e.target.value)}
              placeholder="Search blocks"
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {catalogFilterOptions.map((option) => (
              <Button
                key={option.id}
                type="button"
                size="sm"
                variant={catalogCategory === option.id ? "secondary" : "ghost"}
                className="h-7 rounded-full px-2.5 text-[11px]"
                onClick={() => setCatalogCategory(option.id)}
              >
                {option.label}
                <span className="ml-1 text-[10px] text-muted-foreground">{option.count}</span>
              </Button>
            ))}
          </div>
          <div className="space-y-4 max-h-[50vh] overflow-y-auto">
            {filteredCategories.map((cat) => (
              <div key={cat}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  {cat}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {filteredCatalog.filter((b) => b.category === cat).map((item) => (
                    <button
                      key={item.type}
                      type="button"
                      className="flex items-start gap-3 rounded-lg border p-3 text-left hover:bg-muted/50 hover:border-primary/30 transition-colors"
                      onClick={() => addBlock(item.type)}
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0">
                        <item.icon className="h-4.5 w-4.5" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{item.label}</p>
                        <p className="text-[11px] text-muted-foreground">{item.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {filteredCatalog.length === 0 && (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No blocks match the current search and category filters.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showTemplates} onOpenChange={setShowTemplates}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Page Templates</DialogTitle>
            <DialogDescription>
              Start faster with pre-structured section sets you can edit block-by-block.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            {PAGE_TEMPLATES.map((template) => (
              <div key={template.id} className="rounded-xl border p-4">
                <p className="text-sm font-semibold">{template.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{template.description}</p>
                <div className="mt-3 flex flex-wrap gap-1">
                  {template.blocks.map((blockType, index) => (
                    <Badge key={`${template.id}-${blockType}-${index}`} variant="outline" className="text-[10px]">
                      {BLOCK_CATALOG.find((item) => item.type === blockType)?.label ?? blockType}
                    </Badge>
                  ))}
                </div>
                <div className="mt-4 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => applyTemplate(template.id, "append")}>
                    Add to End
                  </Button>
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => {
                      if (blocks.length > 0 && !window.confirm("Replace all current blocks with this template?")) {
                        return;
                      }
                      applyTemplate(template.id, "replace");
                    }}
                  >
                    Replace Page
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showPageSettings} onOpenChange={setShowPageSettings}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Page Settings</DialogTitle>
            <DialogDescription>
              Edit page metadata, SEO, and custom HTML/CSS/JS for this page.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Page Title</Label>
                <Input
                  value={page?.title ?? ""}
                  onChange={(e) => updatePageField("title", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Slug</Label>
                <Input
                  value={page?.slug ?? ""}
                  onChange={(e) =>
                    updatePageField("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Visibility</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={page?.visibility === "PUBLIC" ? "default" : "outline"}
                  size="sm"
                  onClick={() => updatePageField("visibility", "PUBLIC")}
                >
                  Public
                </Button>
                <Button
                  type="button"
                  variant={page?.visibility === "HIDDEN" ? "default" : "outline"}
                  size="sm"
                  onClick={() => updatePageField("visibility", "HIDDEN")}
                >
                  Hidden
                </Button>
              </div>
            </div>

            <Separator />

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>SEO Title</Label>
                <Input
                  value={String(pageSeo.title ?? "")}
                  onChange={(e) => updateSeoField("title", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>SEO Description</Label>
                <Input
                  value={String(pageSeo.description ?? "")}
                  onChange={(e) => updateSeoField("description", e.target.value)}
                />
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>Top HTML</Label>
              <Textarea
                value={pageCustomCode.htmlTop ?? ""}
                onChange={(e) => updatePageCustomCodeField("htmlTop", e.target.value)}
                rows={5}
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label>Page CSS</Label>
              <Textarea
                value={pageCustomCode.css ?? ""}
                onChange={(e) => updatePageCustomCodeField("css", e.target.value)}
                rows={5}
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label>Bottom HTML</Label>
              <Textarea
                value={pageCustomCode.htmlBottom ?? ""}
                onChange={(e) => updatePageCustomCodeField("htmlBottom", e.target.value)}
                rows={5}
                className="font-mono text-xs"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowPageSettings(false)}>
              Close
            </Button>
            <Button onClick={() => void save()} disabled={isSaving || !isDirty}>
              {isSaving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
              {isDirty ? "Save" : "Saved"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showChecklist} onOpenChange={setShowChecklist}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Page Checklist</DialogTitle>
            <DialogDescription>
              Validate key content and metadata before publishing.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
            {checklistItems.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                <div className="flex items-start gap-2">
                  {item.done ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-success shrink-0" />
                  ) : (
                    <AlertCircle className="mt-0.5 h-4 w-4 text-amber-500 shrink-0" />
                  )}
                  <div>
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-xs text-muted-foreground mt-1">{item.hint}</p>
                  </div>
                </div>
                <Badge variant={item.done ? "outline" : "secondary"} className="text-[10px]">
                  {item.done ? "Done" : "Needs attention"}
                </Badge>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {completedChecklistCount}/{checklistItems.length} checks complete
            </p>
            <Button size="sm" variant="outline" onClick={() => setShowChecklist(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showShortcuts} onOpenChange={setShowShortcuts}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Keyboard Shortcuts</DialogTitle>
            <DialogDescription>
              Use these shortcuts to edit faster.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {[
              { key: "Ctrl/Cmd + S", action: "Save changes" },
              { key: "Ctrl/Cmd + Z", action: "Undo" },
              { key: "Ctrl/Cmd + Y", action: "Redo" },
              { key: "Ctrl/Cmd + K", action: "Open block catalog" },
              { key: "/", action: "Open block catalog" },
              { key: "Arrow Up / Down", action: "Select previous/next block" },
              { key: "Delete", action: "Delete selected block" },
              { key: "Esc", action: "Clear block selection" },
            ].map((shortcut) => (
              <div key={shortcut.key} className="flex items-center justify-between rounded-md border px-3 py-2">
                <span className="text-xs text-muted-foreground">{shortcut.action}</span>
                <Badge variant="outline" className="font-mono text-[10px]">
                  {shortcut.key}
                </Badge>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <MediaLibraryDialog
        eventId={eventId}
        open={!!mediaPicker}
        kind={mediaPicker?.kind ?? "all"}
        csrfToken={csrfToken ?? undefined}
        onOpenChange={(open) => {
          if (!open) setMediaPicker(null);
        }}
        onSelect={(assetKey) => {
          mediaPicker?.onSelect(assetKey);
          setMediaPicker(null);
        }}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title="Delete block?"
        description="This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => deleteTarget && deleteBlock(deleteTarget)}
        variant="destructive"
      />
    </div>
  );
}

