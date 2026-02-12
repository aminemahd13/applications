import { z } from 'zod';

// Flat schema matching what the frontend sends/receives
export const PlatformSettingsSchema = z.object({
    platformName: z.string().optional(),
    platformUrl: z.string().optional(),
    supportEmail: z.string().email().or(z.literal('')).optional(),
    defaultTimezone: z.string().optional(),
    maintenanceMode: z.boolean().optional(),
    registrationEnabled: z.boolean().optional(),
    emailVerificationRequired: z.boolean().optional(),
    maxEventsPerOrganizer: z.coerce.number().int().min(1).optional(),
    maxApplicationsPerUser: z.coerce.number().int().min(1).optional(),
    defaultApplicationDeadlineDays: z.coerce.number().int().min(1).optional(),
    primaryColor: z.string().optional(),
    footerText: z.string().optional(),
    smtpHost: z.string().optional(),
    smtpPort: z.coerce.number().int().optional(),
    smtpSender: z.string().optional(),
});

export type PlatformSettingsDto = z.infer<typeof PlatformSettingsSchema>;

// Categorized schema for internal DB storage
export const UpdateOrgSettingsSchema = z.object({
    branding: z.object({
        platformName: z.string().optional(),
        platformUrl: z.string().optional(),
        primaryColor: z.string().optional(),
        footerText: z.string().optional(),
    }).optional(),
    security: z.object({
        maintenanceMode: z.boolean().optional(),
        registrationEnabled: z.boolean().optional(),
        emailVerificationRequired: z.boolean().optional(),
    }).optional(),
    email: z.object({
        supportEmail: z.string().optional(),
        smtpHost: z.string().optional(),
        smtpPort: z.number().int().optional(),
        smtpSender: z.string().optional(),
    }).optional(),
    storage: z.object({
        maxEventsPerOrganizer: z.number().int().min(1).optional(),
        maxApplicationsPerUser: z.number().int().min(1).optional(),
        defaultApplicationDeadlineDays: z.number().int().min(1).optional(),
    }).optional(),
    retention: z.object({
        defaultTimezone: z.string().optional(),
    }).optional(),
});

export type UpdateOrgSettingsDto = z.infer<typeof UpdateOrgSettingsSchema>;
