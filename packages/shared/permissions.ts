
export enum Permission {
    // Global / Admin
    ADMIN_EVENTS_MANAGE = 'admin.events.manage',
    ADMIN_ROLES_MANAGE = 'admin.roles.manage',
    ADMIN_SETTINGS_UPDATE = 'admin.settings.update',
    ADMIN_AUDIT_VIEW = 'admin.audit.view',
    ADMIN_SEARCH_GLOBAL = 'admin.search.global',
    ADMIN_IMPERSONATE_READONLY = 'admin.impersonate.readonly',

    // Event Configuration
    EVENT_UPDATE = 'event.update', // settings
    EVENT_WORKFLOW_MANAGE = 'event.workflow.manage',
    EVENT_FORMS_MANAGE_DRAFT = 'event.forms.manage_draft',
    EVENT_FORMS_PUBLISH = 'event.forms.publish',
    EVENT_MICROSITE_MANAGE = 'event.microsite.manage',
    EVENT_MICROSITE_MANAGE_SETTINGS = 'event.microsite.manage_settings',
    EVENT_MICROSITE_PAGES_MANAGE = 'event.microsite.pages.manage',
    EVENT_MICROSITE_PUBLISH = 'event.microsite.publish',
    EVENT_MICROSITE_ROLLBACK = 'event.microsite.rollback',

    // Applications (Read)
    EVENT_APPLICATION_LIST = 'event.application.list',
    EVENT_APPLICATION_READ_BASIC = 'event.application.read_basic',
    EVENT_APPLICATION_READ_FULL = 'event.application.read_full', // normal fields
    EVENT_APPLICATION_READ_SENSITIVE = 'event.application.read_sensitive', // sensitive fields
    EVENT_APPLICATION_EXPORT = 'event.application.export',

    // Files
    EVENT_FILES_READ_NORMAL = 'event.files.read_normal',
    EVENT_FILES_READ_SENSITIVE = 'event.files.read_sensitive',

    // Application Actions (Write)
    EVENT_APPLICATION_DELETE = 'event.application.delete',
    EVENT_APPLICATION_TAGS_MANAGE = 'event.application.tags.manage',
    EVENT_APPLICATION_NOTES_MANAGE = 'event.application.notes.manage',
    EVENT_STEP_REVIEW = 'event.step.review', // approve/reject/request-info
    EVENT_STEP_PATCH = 'event.step.patch',   // create admin patch
    EVENT_STEP_OVERRIDE_UNLOCK = 'event.step.override.unlock', // manual unlock

    // Decisions
    EVENT_DECISION_DRAFT = 'event.decision.draft',
    EVENT_DECISION_PUBLISH = 'event.decision.publish',

    // Communications
    EVENT_MESSAGES_SEND = 'event.messages.send',
    EVENT_MESSAGES_READ = 'event.messages.read',
    EVENT_MESSAGES_READ_STATS = 'event.messages.read_stats',

    // Check-in
    EVENT_CHECKIN_SCAN = 'event.checkin.scan',
    EVENT_CHECKIN_MANUAL_LOOKUP = 'event.checkin.manual_lookup',
    EVENT_CHECKIN_UNDO = 'event.checkin.undo',
    EVENT_CHECKIN_DASHBOARD_VIEW = 'event.checkin.dashboard.view',

    // Applicant (Self) - mostly implicit, but defined for completeness/testing
    SELF_PROFILE_UPDATE = 'self.profile.update',
    SELF_APPLICATION_CREATE = 'self.application.create',
    SELF_APPLICATION_READ = 'self.application.read',
    SELF_SUBMIT_STEP = 'self.submit.step',
    SELF_INBOX_READ = 'self.inbox.read',
}

export const APPLICANT_PERMISSIONS = [
    Permission.SELF_PROFILE_UPDATE,
    Permission.SELF_APPLICATION_CREATE,
    Permission.SELF_APPLICATION_READ,
    Permission.SELF_SUBMIT_STEP,
    Permission.SELF_INBOX_READ,
];
