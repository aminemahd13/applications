import { z } from 'zod';

// --- Block Schemas ---

const BlockSectionBackgroundSchema = z.object({
    color: z.string().optional(),
    gradient: z.string().optional(),
    imageUrl: z.string().optional(),
    videoUrl: z.string().optional(),
    overlayColor: z.string().optional(),
    overlayOpacity: z.number().optional(),
    position: z.enum(['center', 'top', 'bottom']).optional(),
}).passthrough();

const BlockSectionStyleSchema = z.object({
    anchorId: z.string().optional(),
    backgroundType: z.enum(['default', 'none', 'color', 'gradient', 'image', 'video']).optional(),
    background: BlockSectionBackgroundSchema.optional(),
    paddingY: z.enum(['none', 'sm', 'md', 'lg', 'xl']).optional(),
    paddingX: z.enum(['none', 'sm', 'md', 'lg', 'xl']).optional(),
    width: z.enum(['narrow', 'normal', 'wide', 'full']).optional(),
    align: z.enum(['left', 'center', 'right']).optional(),
    textColor: z.string().optional(),
    className: z.string().optional(),
    hideOnMobile: z.boolean().optional(),
    hideOnDesktop: z.boolean().optional(),
    animation: z.enum(['none', 'fade-up', 'rise', 'zoom']).optional(),
    animationDelayMs: z.number().int().min(0).max(2000).optional(),
}).passthrough();

const CtaLinkSchema = z.object({
    label: z.string().optional(),
    href: z.string().optional(),
}).passthrough();

const withSection = <T extends z.ZodRawShape>(shape: T) =>
    z.object({
        ...shape,
        section: BlockSectionStyleSchema.optional(),
    }).passthrough();

export const HeroBlockSchema = z.object({
    id: z.string(),
    type: z.literal('HERO'),
    data: withSection({
        title: z.string().optional(),
        subtitle: z.string().optional(),
        valueProposition: z.string().optional(),
        deadlineLabel: z.string().optional(),
        eyebrow: z.string().optional(),
        logoAssetKey: z.string().optional(),
        logoUrl: z.string().optional(),
        logoAlt: z.string().optional(),
        heroImage: z.string().optional(),
        layout: z.enum(['centered', 'split']).optional(),
        directorMode: z.boolean().default(true),
        frameIntervalMs: z.number().int().min(1800).max(12000).optional(),
        showFaqButton: z.boolean().optional(),
        cta: CtaLinkSchema.optional(),
        secondaryCta: CtaLinkSchema.optional(),
        facts: z.array(z.object({
            label: z.string().optional(),
            value: z.string().optional(),
            icon: z.string().optional(),
        }).passthrough()).default([]),
        trustLogos: z.array(z.object({
            name: z.string().optional(),
            assetKey: z.string().optional(),
            url: z.string().optional(),
            alt: z.string().optional(),
        }).passthrough()).default([]),
        heroFrames: z.array(z.object({
            name: z.string().optional(),
            assetKey: z.string().optional(),
            url: z.string().optional(),
            alt: z.string().optional(),
            href: z.string().optional(),
            animation: z.enum(['pan-left', 'pan-right', 'zoom-in', 'parallax', 'split-reveal']).optional(),
        }).passthrough()).default([]),
    }),
});

export const AnnouncementBlockSchema = z.object({
    id: z.string(),
    type: z.literal('ANNOUNCEMENT'),
    data: withSection({
        badge: z.string().optional(),
        message: z.string().optional(),
        tone: z.enum(['info', 'success', 'warning', 'urgent']).default('info'),
        cta: CtaLinkSchema.optional(),
        secondaryCta: CtaLinkSchema.optional(),
    }),
});

export const RichTextBlockSchema = z.object({
    id: z.string(),
    type: z.literal('RICH_TEXT'),
    data: withSection({
        content: z.string().optional(), // HTML string (editor output)
        doc: z.union([z.string(), z.record(z.string(), z.any())]).optional(), // Legacy TipTap JSON or HTML
    }),
});

export const ImageBlockSchema = z.object({
    id: z.string(),
    type: z.literal('IMAGE'),
    data: withSection({
        src: z.string().optional(), // Editor uses src for asset key or URL
        assetKey: z.string().optional(), // Key in public-assets bucket
        url: z.string().optional(), // External URL
        alt: z.string().optional(),
        caption: z.string().optional(),
        // fileObjectId is STRICTLY FORBIDDEN in public output
    }),
});

export const GridBlockSchema = z.object({
    id: z.string(),
    type: z.literal('GRID'),
    data: withSection({
        heading: z.string().optional(),
        columns: z.number().min(1).max(4).default(3),
        items: z.array(z.object({
            title: z.string().optional(),
            text: z.string().optional(),
            icon: z.string().optional(), // Lucide icon name
        }).passthrough()).default([]),
    }),
});

export const CardGridBlockSchema = z.object({
    id: z.string(),
    type: z.literal('CARD_GRID'),
    data: withSection({
        heading: z.string().optional(),
        columns: z.number().min(1).max(4).default(3),
        items: z.array(z.object({
            title: z.string().optional(),
            text: z.string().optional(),
            description: z.string().optional(),
            icon: z.string().optional(),
            image: z.string().optional(), // Asset key or URL
            cta: CtaLinkSchema.optional(),
        }).passthrough()).default([]),
        cards: z.array(z.object({
            title: z.string().optional(),
            text: z.string().optional(),
            description: z.string().optional(),
            icon: z.string().optional(),
            image: z.string().optional(),
            cta: CtaLinkSchema.optional(),
        }).passthrough()).optional(),
    }),
});

export const FaqBlockSchema = z.object({
    id: z.string(),
    type: z.literal('FAQ'),
    data: withSection({
        heading: z.string().optional(),
        items: z.array(z.object({
            q: z.string().optional(),
            a: z.string().optional(),
            question: z.string().optional(),
            answer: z.string().optional(),
        }).passthrough()).default([]),
    }),
});

export const TimelineBlockSchema = z.object({
    id: z.string(),
    type: z.literal('TIMELINE'),
    data: withSection({
        heading: z.string().optional(),
        items: z.array(z.object({
            date: z.string().optional(),
            label: z.string().optional(),
            title: z.string().optional(),
            details: z.string().optional(),
            description: z.string().optional(),
        }).passthrough()).default([]),
    }),
});

const CalendarEventSchema = z.object({
    date: z.string().optional(),
    endDate: z.string().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    location: z.string().optional(),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
    tag: z.string().optional(),
    cta: CtaLinkSchema.optional(),
}).passthrough();

export const CalendarBlockSchema = z.object({
    id: z.string(),
    type: z.literal('CALENDAR'),
    data: withSection({
        heading: z.string().optional(),
        description: z.string().optional(),
        timezoneLabel: z.string().optional(),
        layout: z.enum(['week', 'agenda', 'cards']).default('week'),
        items: z.array(CalendarEventSchema).default([]),
    }),
});

const AgendaSessionSchema = z.object({
    time: z.string().optional(),
    endTime: z.string().optional(),
    title: z.string().optional(),
    speaker: z.string().optional(),
    track: z.string().optional(),
    location: z.string().optional(),
    description: z.string().optional(),
    cta: CtaLinkSchema.optional(),
}).passthrough();

const AgendaDaySchema = z.object({
    label: z.string().optional(),
    date: z.string().optional(),
    title: z.string().optional(),
    sessions: z.array(AgendaSessionSchema).default([]),
}).passthrough();

export const AgendaBlockSchema = z.object({
    id: z.string(),
    type: z.literal('AGENDA'),
    data: withSection({
        heading: z.string().optional(),
        description: z.string().optional(),
        layout: z.enum(['stacked', 'split']).default('stacked'),
        days: z.array(AgendaDaySchema).default([]),
    }),
});

const CountdownMilestoneSchema = z.object({
    label: z.string().optional(),
    value: z.string().optional(),
}).passthrough();

export const CountdownBlockSchema = z.object({
    id: z.string(),
    type: z.literal('COUNTDOWN'),
    data: withSection({
        title: z.string().optional(),
        subtitle: z.string().optional(),
        targetDate: z.string().optional(),
        timezoneLabel: z.string().optional(),
        showSeconds: z.boolean().default(false),
        endedLabel: z.string().optional(),
        cta: CtaLinkSchema.optional(),
        secondaryCta: CtaLinkSchema.optional(),
        milestones: z.array(CountdownMilestoneSchema).default([]),
    }),
});

export const CtaBlockSchema = z.object({
    id: z.string(),
    type: z.literal('CTA'),
    data: withSection({
        heading: z.string().optional(),
        description: z.string().optional(),
        label: z.string().optional(),
        variant: z.enum(['primary', 'secondary', 'outline']).default('primary'),
        action: z.enum(['APPLY', 'OPEN_PORTAL', 'LINK']).optional(),
        href: z.string().optional(),
        primaryButton: CtaLinkSchema.optional(),
    }),
});

export const LogoCloudBlockSchema = z.object({
    id: z.string(),
    type: z.literal('LOGO_CLOUD'),
    data: withSection({
        heading: z.string().optional(),
        title: z.string().optional(),
        logos: z.array(z.object({
            name: z.string().optional(),
            assetKey: z.string().optional(),
            url: z.string().optional(),
            imageUrl: z.string().optional(),
            href: z.string().optional(),
            alt: z.string().optional(),
        }).passthrough()).default([]),
    }),
});

export const StatsBlockSchema = z.object({
    id: z.string(),
    type: z.literal('STATS'),
    data: withSection({
        heading: z.string().optional(),
        items: z.array(z.object({
            label: z.string().optional(),
            value: z.string().optional(),
            suffix: z.string().optional(),
        }).passthrough()).default([]),
    }),
});

export const StepsBlockSchema = z.object({
    id: z.string(),
    type: z.literal('STEPS'),
    data: withSection({
        heading: z.string().optional(),
        title: z.string().optional(),
        steps: z.array(z.object({
            title: z.string().optional(),
            description: z.string().optional(),
        }).passthrough()).default([]),
    }),
});

export const ParticipationStepsBlockSchema = z.object({
    id: z.string(),
    type: z.literal('PARTICIPATION_STEPS'),
    data: withSection({
        heading: z.string().optional(),
        items: z.array(z.object({
            number: z.union([z.string(), z.number()]).optional(),
            title: z.string().optional(),
            description: z.string().optional(),
            ctaLabel: z.string().optional(),
            ctaHref: z.string().optional(),
            ctaIcon: z.string().optional(),
            ctaVariant: z.enum(['pill', 'outline', 'ghost']).optional(),
        }).passthrough()).default([]),
    }),
});

const PastProblemItemSchema = z.object({
    title: z.string().optional(),
    year: z.string().optional(),
    difficulty: z.enum(['intro', 'intermediate', 'advanced', 'olympiad']).optional(),
    tags: z.array(z.string()).optional(),
    sheetHref: z.string().optional(),
    solutionHref: z.string().optional(),
}).passthrough();

export const PastProblemsBlockSchema = z.object({
    id: z.string(),
    type: z.literal('PAST_PROBLEMS'),
    data: withSection({
        heading: z.string().optional(),
        description: z.string().optional(),
        problems: z.array(PastProblemItemSchema).default([]),
    }),
});

export const RegistrationChecklistBlockSchema = z.object({
    id: z.string(),
    type: z.literal('REGISTRATION_CHECKLIST'),
    data: withSection({
        heading: z.string().optional(),
        description: z.string().optional(),
        note: z.string().optional(),
        cta: CtaLinkSchema.optional(),
        secondaryCta: CtaLinkSchema.optional(),
        items: z.array(z.object({
            title: z.string().optional(),
            details: z.string().optional(),
            required: z.boolean().optional(),
        }).passthrough()).default([]),
    }),
});

export const TracksOverviewBlockSchema = z.object({
    id: z.string(),
    type: z.literal('TRACKS_OVERVIEW'),
    data: withSection({
        heading: z.string().optional(),
        description: z.string().optional(),
        columns: z.number().int().min(1).max(3).default(3),
        highlightFree: z.boolean().default(true),
        tracks: z.array(z.object({
            title: z.string().optional(),
            audience: z.string().optional(),
            focus: z.string().optional(),
            seats: z.string().optional(),
            cta: CtaLinkSchema.optional(),
        }).passthrough()).default([]),
    }),
});

export const ImageGalleryBlockSchema = z.object({
    id: z.string(),
    type: z.literal('IMAGE_GALLERY'),
    data: withSection({
        heading: z.string().optional(),
        title: z.string().optional(),
        layout: z.enum(['carousel', 'grid', 'masonry']).default('grid'),
        items: z.array(z.object({
            assetKey: z.string().optional(),
            url: z.string().optional(),
            alt: z.string().optional(),
            caption: z.string().optional(),
        }).passthrough()).default([]),
        images: z.array(z.object({
            assetKey: z.string().optional(),
            url: z.string().optional(),
            alt: z.string().optional(),
            caption: z.string().optional(),
        }).passthrough()).optional(),
    }),
});

export const ImageStackBlockSchema = z.object({
    id: z.string(),
    type: z.literal('IMAGE_STACK'),
    data: withSection({
        heading: z.string().optional(),
        caption: z.string().optional(),
        autoplay: z.boolean().default(true),
        intervalMs: z.number().int().min(1000).max(10000).optional(),
        images: z.array(z.object({
            name: z.string().optional(),
            assetKey: z.string().optional(),
            url: z.string().optional(),
            href: z.string().optional(),
            alt: z.string().optional(),
        }).passthrough()).default([]),
    }),
});

export const PartnerStripBlockSchema = z.object({
    id: z.string(),
    type: z.literal('PARTNER_STRIP'),
    data: withSection({
        heading: z.string().optional(),
        items: z.array(z.object({
            label: z.string().optional(),
            logo: z.string().optional(),
            assetKey: z.string().optional(),
            url: z.string().optional(),
            href: z.string().optional(),
            size: z.enum(['sm', 'md', 'lg']).optional(),
            alt: z.string().optional(),
        }).passthrough()).default([]),
    }),
});

export const TeamGridBlockSchema = z.object({
    id: z.string(),
    type: z.literal('TEAM_GRID'),
    data: withSection({
        heading: z.string().optional(),
        title: z.string().optional(),
        description: z.string().optional(),
        maxColumns: z.enum(['auto', '3', '4', '5', '6']).optional(),
        cardStyle: z.enum(['compact', 'comfortable']).optional(),
        showBio: z.boolean().optional(),
        showSocials: z.boolean().optional(),
        members: z.array(z.object({
            name: z.string().optional(),
            role: z.string().optional(),
            team: z.string().optional(),
            location: z.string().optional(),
            assetKey: z.string().optional(), // Avatar
            imageUrl: z.string().optional(),
            bio: z.string().optional(),
            socials: z.array(z.object({
                platform: z.enum(['linkedin', 'twitter', 'github', 'website']),
                url: z.string(),
            }).passthrough()).optional(),
        }).passthrough()).default([]),
    }),
});

const VenueDetailSchema = z.object({
    label: z.string().optional(),
    value: z.string().optional(),
    icon: z.string().optional(),
}).passthrough();

export const VenueBlockSchema = z.object({
    id: z.string(),
    type: z.literal('VENUE'),
    data: withSection({
        heading: z.string().optional(),
        venueName: z.string().optional(),
        address: z.string().optional(),
        mapEmbedUrl: z.string().optional(),
        mapLink: z.string().optional(),
        notes: z.string().optional(),
        details: z.array(VenueDetailSchema).default([]),
        highlights: z.array(z.string()).default([]),
        cta: CtaLinkSchema.optional(),
    }),
});

export const TeamTooltipBlockSchema = z.object({
    id: z.string(),
    type: z.literal('TEAM_TOOLTIP'),
    data: withSection({
        heading: z.string().optional(),
        description: z.string().optional(),
        ctaLabel: z.string().optional(),
        ctaHref: z.string().optional(),
        items: z.array(z.object({
            name: z.string().optional(),
            designation: z.string().optional(),
            assetKey: z.string().optional(),
            url: z.string().optional(),
            imageUrl: z.string().optional(),
        }).passthrough()).default([]),
    }),
});

const SpeakerSpotlightSpeakerSchema = z.object({
    name: z.string().optional(),
    role: z.string().optional(),
    organization: z.string().optional(),
    assetKey: z.string().optional(),
    imageUrl: z.string().optional(),
    bio: z.string().optional(),
    sessionTitle: z.string().optional(),
    sessionHref: z.string().optional(),
}).passthrough();

export const SpeakerSpotlightBlockSchema = z.object({
    id: z.string(),
    type: z.literal('SPEAKER_SPOTLIGHT'),
    data: withSection({
        heading: z.string().optional(),
        description: z.string().optional(),
        speakers: z.array(SpeakerSpotlightSpeakerSchema).default([]),
    }),
});

const ResourceItemSchema = z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    href: z.string().optional(),
    assetKey: z.string().optional(),
    kind: z.enum(['brochure', 'map', 'policy', 'deck', 'document', 'other']).optional(),
    fileType: z.string().optional(),
    sizeLabel: z.string().optional(),
}).passthrough();

export const ResourcesBlockSchema = z.object({
    id: z.string(),
    type: z.literal('RESOURCES'),
    data: withSection({
        heading: z.string().optional(),
        description: z.string().optional(),
        columns: z.number().int().min(1).max(3).default(2),
        resources: z.array(ResourceItemSchema).default([]),
    }),
});

export const StickyAlertBarBlockSchema = z.object({
    id: z.string(),
    type: z.literal('STICKY_ALERT_BAR'),
    data: withSection({
        badge: z.string().optional(),
        message: z.string().optional(),
        tone: z.enum(['info', 'success', 'warning', 'urgent']).default('urgent'),
        cta: CtaLinkSchema.optional(),
        showIcon: z.boolean().default(true),
    }),
});

// Recursive definition for Tabs content would be ideal, 
// for simplicity now, let's keep tabs content simple or reference BlockSchema later via lazy?
// Zod recursive types are tricky. For now, TABS just have basic info, maybe referencing blocks is hard here without lazy.
// Let's defer TABS complex content or use 'any' for blocks content to avoid circular ref issue for now, 
// OR define BlockSchema first. 
// Actually, let's do TABS simple for now or skip if too complex for this pass. 
// User asked for tabs. Let's make it work.
// We can use z.lazy(() => BlockSchema) inside.

// Simplified Tabs Block (Text Content Only to avoid recursion)
export const TabsBlockSchema = z.object({
    id: z.string(),
    type: z.literal('TABS'),
    data: withSection({
        tabs: z.array(z.object({
            label: z.string().optional(),
            content: z.string().optional(), // Markdown/HTML content
        }).passthrough()).default([]),
    }),
});

export const VideoEmbedBlockSchema = z.object({
    id: z.string(),
    type: z.literal('VIDEO_EMBED'),
    data: withSection({
        title: z.string().optional(),
        url: z.string().optional(),
        caption: z.string().optional(),
        autoplay: z.boolean().optional(),
    }),
});

export const EmbedDocBlockSchema = z.object({
    id: z.string(),
    type: z.literal('EMBED_DOC'),
    data: withSection({
        title: z.string().optional(),
        url: z.string().optional(),
        caption: z.string().optional(),
        height: z.number().int().min(320).max(1400).default(720),
    }),
});

export const TextImageRightBlockSchema = z.object({
    id: z.string(),
    type: z.literal('TEXT_IMAGE_RIGHT'),
    data: withSection({
        heading: z.string().optional(),
        text: z.string().optional(),
        imageUrl: z.string().optional(),
        assetKey: z.string().optional(),
        alt: z.string().optional(),
        caption: z.string().optional(),
        cta: CtaLinkSchema.optional(),
    }),
});

export const TextImageLeftBlockSchema = z.object({
    id: z.string(),
    type: z.literal('TEXT_IMAGE_LEFT'),
    data: withSection({
        heading: z.string().optional(),
        text: z.string().optional(),
        imageUrl: z.string().optional(),
        assetKey: z.string().optional(),
        alt: z.string().optional(),
        caption: z.string().optional(),
        cta: CtaLinkSchema.optional(),
    }),
});

export const SeparatorBlockSchema = z.object({
    id: z.string(),
    type: z.literal('SEPARATOR'),
    data: withSection({
        label: z.string().optional(),
        variant: z.enum(['line', 'dashed', 'dots', 'gradient']).default('line'),
        thickness: z.number().int().min(1).max(8).default(1),
        width: z.enum(['sm', 'md', 'lg', 'full']).default('full'),
    }),
});

export const TestimonialsBlockSchema = z.object({
    id: z.string(),
    type: z.literal('TESTIMONIALS'),
    data: withSection({
        title: z.string().optional(),
        items: z.array(z.object({
            quote: z.string().optional(),
            author: z.string().optional(),
            role: z.string().optional(),
            avatarUrl: z.string().optional(),
            assetKey: z.string().optional(),
            rating: z.union([z.number().min(1).max(5), z.string()]).optional(),
        }).passthrough()).default([]),
    }),
});

export const CustomCodeBlockSchema = z.object({
    id: z.string(),
    type: z.literal('CUSTOM_CODE'),
    data: withSection({
        title: z.string().optional(),
        html: z.string().optional(),
        css: z.string().optional(),
        wrapperClass: z.string().optional(),
        fullWidth: z.boolean().optional(),
    }),
});

export const RanksBlockSchema = z.object({
    id: z.string(),
    type: z.literal('RANKS'),
    data: withSection({
        heading: z.string().optional(),
        description: z.string().optional(),
        columns: z.array(z.string()).default([]),
        rows: z.array(z.array(z.string())).default([]),
        highlightPrizes: z.boolean().default(true),
    }),
});

// Updating BlockSchema Union
export const BlockSchema = z.discriminatedUnion('type', [
    HeroBlockSchema,
    AnnouncementBlockSchema,
    RichTextBlockSchema,
    ImageBlockSchema,
    GridBlockSchema,
    CardGridBlockSchema,
    FaqBlockSchema,
    TimelineBlockSchema,
    CalendarBlockSchema,
    AgendaBlockSchema,
    CountdownBlockSchema,
    CtaBlockSchema,
    LogoCloudBlockSchema,
    StatsBlockSchema,
    StepsBlockSchema,
    ParticipationStepsBlockSchema,
    PastProblemsBlockSchema,
    RegistrationChecklistBlockSchema,
    TracksOverviewBlockSchema,
    ImageGalleryBlockSchema,
    ImageStackBlockSchema,
    PartnerStripBlockSchema,
    TeamGridBlockSchema,
    VenueBlockSchema,
    TeamTooltipBlockSchema,
    SpeakerSpotlightBlockSchema,
    ResourcesBlockSchema,
    StickyAlertBarBlockSchema,
    TabsBlockSchema,
    VideoEmbedBlockSchema,
    EmbedDocBlockSchema,
    SeparatorBlockSchema,
    TextImageLeftBlockSchema,
    TextImageRightBlockSchema,
    TestimonialsBlockSchema,
    CustomCodeBlockSchema,
    RanksBlockSchema,
]);

export const FullBlockSchema = BlockSchema; // Alias for backward compat if needed

export type Block = z.infer<typeof BlockSchema>;

// --- Page & Microsite Schemas ---

const MicrositeDesignSchema = z.object({
    headingFont: z.enum(['sf', 'pally', 'neco']).default('sf'),
    bodyFont: z.enum(['inter', 'poppins', 'neco']).default('inter'),
    containerWidth: z.enum(['normal', 'wide', 'ultra']).default('wide'),
    accentSecondary: z.string().optional(),
    ringStart: z.string().optional(),
    ringMiddle: z.string().optional(),
    darkSurface: z.string().optional(),
    pageBackground: z.string().optional(),
    surfaceBackground: z.string().optional(),
    surfaceMuted: z.string().optional(),
    textColor: z.string().optional(),
    mutedTextColor: z.string().optional(),
    borderColor: z.string().optional(),
    patternStyle: z.enum(['circuits', 'dots', 'grid', 'none']).default('circuits'),
    patternOpacity: z.number().min(0).max(100).default(20),
    radiusScale: z.enum(['compact', 'comfortable', 'rounded']).default('comfortable'),
    shadowStrength: z.enum(['soft', 'medium', 'bold']).default('medium'),
    cardStyle: z.enum(['elevated', 'outlined', 'flat']).default('elevated'),
    animation: z.enum(['full', 'reduced', 'none']).default('full'),
}).default({
    headingFont: 'sf',
    bodyFont: 'inter',
    containerWidth: 'wide',
    patternStyle: 'circuits',
    patternOpacity: 20,
    radiusScale: 'comfortable',
    shadowStrength: 'medium',
    cardStyle: 'elevated',
    animation: 'full',
});

export const MicrositeSettingsSchema = z.object({
    theme: z.enum(['light', 'dark', 'system']).default('system'),
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    design: MicrositeDesignSchema,
    branding: z.object({
        siteName: z.string().optional(),
        tagline: z.string().optional(),
        heroImageUrl: z.string().optional(), // Deprecated, retained for backward compatibility.
    }).default({}),
    navigation: z.object({
        links: z.array(z.object({
            label: z.string(),
            href: z.string(),
            children: z.array(z.object({
                label: z.string(),
                href: z.string(),
            })).optional(),
        })).default([]),
        cta: z.object({
            label: z.string(),
            href: z.string(),
            variant: z.enum(['primary', 'secondary', 'outline']).default('primary'),
        }).optional(),
        logoAssetKey: z.string().optional(),
        showLogin: z.boolean().default(true),
        loginLabel: z.string().optional(),
        loginHref: z.string().optional(),
        style: z.enum(['glass', 'solid', 'minimal']).default('glass'),
        sticky: z.boolean().default(true),
        showTagline: z.boolean().default(true),
    }).default({ links: [], showLogin: true, style: 'glass', sticky: true, showTagline: true }),
    footer: z.object({
        columns: z.array(z.object({
            title: z.string(),
            links: z.array(z.object({
                label: z.string(),
                href: z.string(),
            })),
        })).default([]),
        socials: z.array(z.object({
            platform: z.enum(['facebook', 'twitter', 'instagram', 'linkedin', 'youtube']),
            url: z.string().url(),
        })).default([]),
        legalText: z.string().optional(),
        style: z.enum(['angled', 'simple', 'minimal']).default('angled'),
        showLogo: z.boolean().default(true),
        showTagline: z.boolean().default(true),
        showSocials: z.boolean().default(true),
        showDividers: z.boolean().default(true),
    }).default({
        columns: [],
        socials: [],
        style: 'angled',
        showLogo: true,
        showTagline: true,
        showSocials: true,
        showDividers: true,
    }),
    customCode: z.object({
        headHtml: z.string().optional(),
        css: z.string().optional(),
        bodyStartHtml: z.string().optional(),
        bodyEndHtml: z.string().optional(),
    }).default({}),
    footerText: z.string().optional(), // Deprecated in favor of footer object? Keep for compat
});

export type MicrositeSettings = z.infer<typeof MicrositeSettingsSchema>;


export const CreateMicrositePageSchema = z.object({
    // Empty slug is allowed for homepage/root page.
    slug: z.string().regex(/^[a-z0-9-]*$/).max(60),
    title: z.string().min(1),
    position: z.number().int().default(0),
    blocks: z.array(BlockSchema).default([]),
    customCode: z.object({
        htmlTop: z.string().optional(),
        htmlBottom: z.string().optional(),
        css: z.string().optional(),
    }).default({}),
    seo: z.record(z.string(), z.any()).default({}), // Refine later
    visibility: z.enum(['PUBLIC', 'HIDDEN']).default('PUBLIC'),
});

export const UpdateMicrositePageSchema = CreateMicrositePageSchema.partial();

export const UpdateMicrositeSettingsSchema = MicrositeSettingsSchema.partial();

// API Responses
export interface MicrositePublicResponse {
    settings: z.infer<typeof MicrositeSettingsSchema>;
    nav: Array<{ label: string; href: string }>; // Computed nav (pages + manual)
    publishedVersion: number;
}

export interface MicrositePagePublicResponse {
    slug: string;
    title: string;
    blocks: Block[];
    seo: any;
}

export interface MicrositeAdminResponse {
    id: string;
    eventId: string;
    settings: z.infer<typeof MicrositeSettingsSchema>;
    publishedVersion: number;
    draftPages: Array<{ id: string; slug: string; title: string; position: number; visibility: string }>; // Summary
}

export interface MicrositeVersionSummary {
    version: number;
    createdAt: string;
    createdBy: string | null;
    settings: any;
}
