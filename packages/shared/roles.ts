
import { Permission } from './permissions';

export enum EventRole {
    ORGANIZER = 'organizer',
    REVIEWER = 'reviewer',
    CHECKIN_STAFF = 'checkin_staff',
    CONTENT_EDITOR = 'content_editor', // optional
}

export const ROLE_PERMISSIONS: Record<EventRole, Permission[]> = {
    [EventRole.ORGANIZER]: [
        Permission.EVENT_UPDATE,
        Permission.EVENT_WORKFLOW_MANAGE,
        Permission.EVENT_FORMS_MANAGE_DRAFT,
        Permission.EVENT_FORMS_PUBLISH,
        Permission.EVENT_MICROSITE_MANAGE,
        Permission.EVENT_MICROSITE_MANAGE_SETTINGS,
        Permission.EVENT_MICROSITE_PAGES_MANAGE,
        Permission.EVENT_MICROSITE_PUBLISH,
        Permission.EVENT_MICROSITE_ROLLBACK,
        Permission.EVENT_APPLICATION_LIST,
        Permission.EVENT_APPLICATION_READ_BASIC,
        Permission.EVENT_APPLICATION_READ_FULL,
        Permission.EVENT_APPLICATION_READ_SENSITIVE,
        Permission.EVENT_APPLICATION_EXPORT,
        Permission.EVENT_APPLICATION_DELETE,
        Permission.EVENT_FILES_READ_NORMAL,
        Permission.EVENT_FILES_READ_SENSITIVE,
        Permission.EVENT_APPLICATION_TAGS_MANAGE,
        Permission.EVENT_APPLICATION_NOTES_MANAGE,
        Permission.EVENT_STEP_REVIEW,
        Permission.EVENT_STEP_PATCH,
        Permission.EVENT_STEP_OVERRIDE_UNLOCK,
        Permission.EVENT_DECISION_DRAFT,
        Permission.EVENT_DECISION_PUBLISH,
        Permission.EVENT_MESSAGES_SEND,
        Permission.EVENT_MESSAGES_READ,
        Permission.EVENT_MESSAGES_READ_STATS,
        Permission.EVENT_CHECKIN_SCAN,
        Permission.EVENT_CHECKIN_MANUAL_LOOKUP,
        Permission.EVENT_CHECKIN_UNDO,
        Permission.EVENT_CHECKIN_DASHBOARD_VIEW,
    ],
    [EventRole.REVIEWER]: [
        Permission.EVENT_APPLICATION_LIST,
        Permission.EVENT_APPLICATION_READ_BASIC,
        Permission.EVENT_APPLICATION_READ_FULL,
        Permission.EVENT_APPLICATION_READ_SENSITIVE, // configurable? defaulting to allow for now
        Permission.EVENT_FILES_READ_NORMAL,
        Permission.EVENT_FILES_READ_SENSITIVE,
        Permission.EVENT_APPLICATION_TAGS_MANAGE,
        Permission.EVENT_APPLICATION_NOTES_MANAGE, // internal only
        Permission.EVENT_STEP_REVIEW,
        Permission.EVENT_STEP_PATCH,
        Permission.EVENT_MESSAGES_SEND,
        Permission.EVENT_MESSAGES_READ, // can view sent messages
        Permission.EVENT_CHECKIN_SCAN,  // if allowed
        Permission.EVENT_CHECKIN_MANUAL_LOOKUP,
        Permission.EVENT_CHECKIN_DASHBOARD_VIEW,
    ],
    [EventRole.CHECKIN_STAFF]: [
        Permission.EVENT_CHECKIN_SCAN,
        Permission.EVENT_CHECKIN_MANUAL_LOOKUP,
        Permission.EVENT_CHECKIN_DASHBOARD_VIEW,
        Permission.EVENT_APPLICATION_READ_BASIC, // minimal data for verification
        // STRICTLY NO SENSITIVE DATA
    ],
    [EventRole.CONTENT_EDITOR]: [
        Permission.EVENT_MICROSITE_MANAGE_SETTINGS,
        Permission.EVENT_MICROSITE_PAGES_MANAGE,
        Permission.EVENT_MICROSITE_PUBLISH,
    ],
};

// Global Admin permissions are implicit/hardcoded in the Guard usually,
// but we can define a set for reference.
export const GLOBAL_ADMIN_PERMISSIONS: Permission[] = [
    ...Object.values(Permission) // Admins can conceptually do everything, though scope checks apply
];
