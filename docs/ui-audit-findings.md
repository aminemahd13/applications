# UI/UX + Logic Audit — Full Findings Catalogue

> Generated from the platform-wide 14-agent audit. Do not edit by hand — regenerate from the audit output if needed.

**Total findings:** 191  ·  **Reports:** 13

## Severity summary

| Severity | Count |
|---|---|
| critical | 3 |
| high | 44 |
| medium | 87 |
| low | 57 |

## Category summary

| Category | Count |
|---|---|
| responsive | 58 |
| horizontal-scroll | 38 |
| logic-bug | 20 |
| accessibility | 19 |
| consistency | 16 |
| workflow | 14 |
| forms | 9 |
| loading-empty-state | 7 |
| touch-target | 6 |
| performance | 2 |
| improvement | 1 |
| validation | 1 |

---

## Global shell & responsive root causes (horizontal scroll on mobile)

### 1. TabsList doesn't collapse/scroll on mobile, causing horizontal overflow

- **Severity:** high  ·  **Category:** horizontal-scroll
- **File:** `apps/web/components/ui/tabs.tsx` (line 43-57)
- **Problem:** TabsList uses `inline-flex w-fit` on all breakpoints. When a page has multiple tab triggers, they remain on a single line and exceed the viewport width on mobile (375px). The component lacks a responsive variant or scroll container.
- **Fix:** Add a scroll wrapper for mobile: wrap TabsList in a conditional horizontal ScrollArea on screens < 640px, or add `flex-wrap` and apply sm:flex-nowrap. Alternatively, create a `mobile-scroll` variant that sets `overflow-x-auto` on the TabsList container.

### 2. StaffLayout wrapper missing min-w-0 on child flex columns

- **Severity:** high  ·  **Category:** horizontal-scroll
- **File:** `apps/web/app/(staff)/staff/[eventId]/layout.tsx` (line 200-211)
- **Problem:** StaffLayout renders `<div className="space-y-4 min-h-0">` around children. While it has min-h-0, it lacks `w-full` and `min-w-0` on the flex col, and the AppShell's main child is a div, not a flex container with these constraints. This allows Cards and DataTables inside to size based on their content rather than the viewport.
- **Fix:** Change the wrapper div to: `<div className="flex flex-col w-full min-w-0 gap-4 min-h-0">`. This forces the flex child to respect the SidebarInset's width constraint and prevents descendant overflow.

### 3. Table wrapper and cell content don't prevent text overflow on mobile

- **Severity:** high  ·  **Category:** horizontal-scroll
- **File:** `apps/web/components/ui/table.tsx` (line 7-19)
- **Problem:** Table component correctly wraps content in `overflow-x-auto`, but TableHead and TableCell use `whitespace-nowrap` unconditionally. On mobile, long email addresses, user names, or status labels don't wrap and push the table wider than the scroll container's viewport.
- **Fix:** Change TableHead to: `className={cn("text-foreground h-10 px-2 text-left align-middle font-medium sm:whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]", className)}` and TableCell to: `className={cn("p-2 align-middle sm:whitespace-nowrap break-words [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]", className)}`. Allow wrapping on mobile; use sm: breakpoint to restore nowrap on desktop.

### 4. Breadcrumb uses constant gap-2.5 without responsive scaling on mobile

- **Severity:** medium  ·  **Category:** responsive
- **File:** `apps/web/components/ui/breadcrumb.tsx` (line 11-21)
- **Problem:** BreadcrumbList applies `gap-1.5 sm:gap-2.5`, which is good, but the flex-wrap may still push content beyond 375px viewport when breadcrumb paths are long (e.g., '/admin/events/[eventId]/applications'). No max-width or truncation fallback.
- **Fix:** Add `max-w-full` to BreadcrumbList and apply `truncate` to BreadcrumbPage/BreadcrumbLink at mobile. Or reduce gap-1.5 to gap-1 on mobile and test at 375px. Consider adding a BreadcrumbEllipsis for long paths on mobile.

### 5. Card and CardContent grids lack min-w-0 on mobile-stacking columns

- **Severity:** medium  ·  **Category:** horizontal-scroll
- **File:** `apps/web/app/(admin)/admin/people/page.tsx` (line 501-526)
- **Problem:** Summary cards use `grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5`. On 375px screens, grid-cols-2 is applied, but if CardContent has long numbers or labels, they can overflow within the grid cell. No max-width or truncate fallback on the value text.
- **Fix:** Add `overflow-hidden` to CardContent and `truncate` to the value paragraph (e.g., `<p className="text-2xl font-bold truncate">`). Or wrap CardContent in a `min-w-0` div to allow text-overflow to work.

### 6. SidebarInset doesn't enforce max-width constraint on header/alerts

- **Severity:** medium  ·  **Category:** horizontal-scroll
- **File:** `apps/web/components/layout/app-shell.tsx` (line 308-349)
- **Problem:** The header and alert sections inside SidebarInset use px-4 lg:px-6 but lack explicit width constraints. On 375px with a collapsible sidebar, the header bar (breadcrumbs + language toggle) can accumulate width if tabs or breadcrumbs don't wrap.
- **Fix:** Add `w-full overflow-x-auto` to the header element, and ensure Separator orientation="vertical" doesn't cause stretching. Or wrap the breadcrumb in a `flex-1 min-w-0 overflow-x-auto` container to allow horizontal scrolling within the header only.

### 7. Main content area lacks explicit max-width/overflow containment for viewport

- **Severity:** medium  ·  **Category:** horizontal-scroll
- **File:** `apps/web/components/layout/app-shell.tsx` (line 387)
- **Problem:** The main element uses `flex min-h-0 flex-1 flex-col p-4 lg:p-6`, which is correct for flex layout, but does not set `overflow-x-hidden` or `w-full`. If a child component (e.g., a Card or custom div) is wider than the main's width, horizontal scroll will propagate to the page level.
- **Fix:** Add `w-full overflow-x-hidden` to the main element: `className="flex min-h-0 flex-1 flex-col w-full overflow-x-hidden p-4 lg:p-6 print:p-0"`. This ensures no child can exceed the viewport and creates a hard stop for horizontal overflow within the app shell.

### 8. Dialog content can exceed viewport on mobile without explicit max-width

- **Severity:** medium  ·  **Category:** responsive
- **File:** `apps/web/app/(staff)/staff/[eventId]/applications/[applicationId]/page.tsx` (line N/A)
- **Problem:** Dialogs are frequently used (e.g., export, bulk actions). While some use `w-[calc(100vw-2rem)] max-w-lg`, this is inconsistent. A dialog with a large table or grid can overflow on 375px.
- **Fix:** Create a dialog wrapper utility or component that enforces `max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] overflow-y-auto` and ensures all DialogContent instances inherit these constraints. Use this in all new dialogs.

### 9. Tabs variant='line' uses gap-1 without flex-wrap, causing overflow on mobile

- **Severity:** medium  ·  **Category:** horizontal-scroll
- **File:** `apps/web/components/ui/tabs.tsx` (line 28-41)
- **Problem:** TabsList with variant='line' applies `gap-1 bg-transparent` and `inline-flex w-fit`. Pages like dashboard, events, inbox use this variant for filtering. On mobile, tabs wrap text but the container remains w-fit, pushing the entire tab bar beyond the viewport.
- **Fix:** Add a mobile-specific variant or update the default: `flex w-full flex-wrap sm:flex-nowrap` for line variant, or conditionally render a ScrollArea wrapper on screens < 640px.

### 10. PageHeader actions row doesn't shrink on very narrow screens (< 375px)

- **Severity:** low  ·  **Category:** responsive
- **File:** `apps/web/components/shared/page-header.tsx` (line 49-67)
- **Problem:** PageHeader's actions use `flex-wrap items-center gap-2 sm:flex-nowrap sm:shrink-0`. On ultra-narrow screens (e.g., 320px), buttons may still overflow if their labels are long. No fallback to stacked buttons or icon-only mode.
- **Fix:** Add responsive button sizing: apply `size="xs"` at mobile via a conditional, or stack buttons vertically on mobile with `flex flex-col sm:flex-row gap-2`.

### 11. Long text in sidebar menu labels can overflow when sidebar is collapsed to icon mode

- **Severity:** low  ·  **Category:** horizontal-scroll
- **File:** `apps/web/components/ui/sidebar.tsx` (line 485-505)
- **Problem:** SidebarMenuButton uses `[&>span:last-child]:truncate`, which is correct. However, if a menu item's label is not in a span (custom content), it can overflow. On mobile with the sidebar as a Sheet overlay, this is less critical but still a source of visual glitches.
- **Fix:** Ensure all SidebarMenuButton content is wrapped in a span or add `overflow-hidden` to the button itself via `className="overflow-hidden"` in the CVA.


## Admin Console (Non Event-Scoped) Pages

### 12. Critical: Unicode encoding corruption in audit log page - mojibake in two placeholder/label strings

- **Severity:** critical  ·  **Category:** consistency
- **File:** `apps/web/app/(admin)/admin/audit/page.tsx` (line 187, 384)
- **Problem:** Line 187: placeholder="Search actions or usersâ€¦" (should be …). Line 384: "Showing {page1}â€"{...}" uses a corrupted en-dash (should be –). UTF-8 encoding error resulted in mojibake, breaking accessibility and UX.
- **Fix:** Replace all corrupted Unicode characters: line 187 change 'usersâ€¦' to 'users…' (U+2026 ellipsis). Line 384 change 'â€"' to '–' (U+2013 en-dash). Verify entire file encoding is UTF-8 without BOM. Use a linter (ESLint) or find-replace to catch all mojibake.

### 13. Critical: Horizontal scroll on mobile - data-dense Tables without responsive collapse

- **Severity:** high  ·  **Category:** horizontal-scroll
- **File:** `apps/web/components/ui/table.tsx` (line 9-18)
- **Problem:** The table wrapper container has overflow-x-auto (line 11) but no mechanism to collapse or reflow multi-column tables on small screens. Tables in /admin/people, /admin/roles, and /admin/events will scroll horizontally on mobile (<640px) when displaying 6+ columns. The TableCell default class has whitespace-nowrap (line 86), forcing table cells to never wrap.
- **Fix:** Implement responsive table stacking: at sm breakpoint (640px), display tables as stacked cards using CSS display:block on rows, or use responsive table library. Alternatively, hide less-critical columns on mobile (use hidden sm:table-cell utilities). Remove or conditionally apply whitespace-nowrap. Example: wrap large tables in <div className="overflow-x-auto sm:overflow-visible"> and use CSS grid fallback for mobile.

### 14. High: People page User column has tight flex without min-w-0, causing content to overflow and push table wider

- **Severity:** high  ·  **Category:** horizontal-scroll
- **File:** `apps/web/app/(admin)/admin/people/page.tsx` (line 765-791)
- **Problem:** Line 771 has a flex container with min-w-0 on the wrapper div, but the nested avatar + text block (lines 765-791) does not truncate properly when the cell shrinks. Long names/emails in the 'User' cell (first column) can force the entire table wider than viewport on mobile.
- **Fix:** Ensure the avatar and text block are tightly constrained. Change line 771 <div className="flex items-center gap-3"> to include className="min-w-0 flex-1" and wrap text in a container with min-w-0 as well. Verify all descendant text has truncate or break-words applied.

### 15. High: Roles page assignment tags in table cell overflow on mobile due to missing wrapping and container constraints

- **Severity:** high  ·  **Category:** horizontal-scroll
- **File:** `apps/web/app/(admin)/admin/roles/page.tsx` (line 650-685)
- **Problem:** Line 637 nested div inside TableCell ("Assignments" column) uses flex flex-wrap with many inline-flex badges and button elements. On mobile, this flex-wrap cell can still exceed viewport width if not properly constrained. The outer flex row (line 604) has no flex-col fallback for mobile.
- **Fix:** Add flex-col to line 604 TableRow for mobile, and constrain the assignments cell with max-w or explicit grid. Use grid-cols-1 lg:grid-cols-2 to stack assignments vertically on mobile. Ensure button and badge elements in line 695+ stack or shrink using flex-wrap and gap utilities.

### 16. High: Audit log expanded details metadata JSON may exceed viewport width due to unset max-width and missing overflow

- **Severity:** high  ·  **Category:** horizontal-scroll
- **File:** `apps/web/app/(admin)/admin/audit/page.tsx` (line 366-369)
- **Problem:** Line 366 uses <pre> with overflow-x-auto (correctly), but the parent CardContent (line 247) does not have a max-width constraint. The expanded detail section (lines 331-375) uses 'pl-[4.25rem]' left padding without considering mobile space. On mobile, the expanded metadata pre-block will push content off-screen.
- **Fix:** Add max-w-full and overflow-x-auto to the parent container. Change line 331 from pl-[4.25rem] to max-sm:pl-2 sm:pl-[4.25rem]. Wrap the entire expanded section in a constrained div: <div className="w-full max-w-full overflow-x-auto">.

### 17. High: People page Profile column with Progress bar and badges lacks proper cell width constraint on mobile

- **Severity:** high  ·  **Category:** responsive
- **File:** `apps/web/app/(admin)/admin/people/page.tsx` (line 826-857)
- **Problem:** Line 827 has min-w-[170px] forcing a minimum width. On mobile (<640px), this cell will force table horizontal scroll. The flex flex-wrap of badges inside can also exceed the constrained width.
- **Fix:** Change min-w-[170px] to max-sm:min-w-[140px] sm:min-w-[170px] or remove the min-w entirely and use flex-shrink-0 on critical elements only. Test the Profile column on 320px width.

### 18. Medium: Announcements page - multiple wide inline badges and buttons without wrapping on mobile

- **Severity:** medium  ·  **Category:** responsive
- **File:** `apps/web/app/(admin)/admin/announcements/page.tsx` (line 505-538)
- **Problem:** Line 493 uses flex items-start justify-between with a flex flex-wrap on line 505. On mobile, the right-side badges + buttons (line 505-537) can wrap to multiple lines but the parent container does not reserve vertical space, causing layout shifts. Announcement list cards lack responsive column layout.
- **Fix:** Change line 493 from flex items-start justify-between to flex flex-col sm:items-start sm:justify-between gap-3, and add flex-wrap to the badge/button container or use grid grid-cols-auto-fit. Test at 375px width to ensure no horizontal scroll.

### 19. Medium: Roles page - sticky action buttons in assignment row lack mobile affordance and may overlap content on small screens

- **Severity:** medium  ·  **Category:** responsive
- **File:** `apps/web/app/(admin)/admin/roles/page.tsx` (line 695-745)
- **Problem:** Line 695 has ml-auto on the action button group to push them right. On mobile, these buttons (Access, Resend invite, Open, timestamp, Delete) will stack into multiple rows and take horizontal space. No flex-wrap or mobile stacking applied to this group.
- **Fix:** Wrap the action group (lines 695-745) in a responsive container: <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:ml-auto">. Use size="sm" buttons and reduce gap on mobile. Consider collapsing to icon-only buttons on mobile with aria-labels.

### 20. High: Settings page - long form labels and inputs on sm/mobile lack proper label-to-input spacing and stacking

- **Severity:** medium  ·  **Category:** responsive
- **File:** `apps/web/app/(admin)/admin/settings/page.tsx` (line 194-233, 247-318)
- **Problem:** Grid grid-cols-2 (line 194) and sm:grid-cols-2 (line 247) stacks inputs into 2 columns on mobile, but labels (e.g., 'SMTP from name', 'Implicit TLS') are short and inline labels may cause vertical alignment issues. No explicit mobile column=1 fallback.
- **Fix:** Use grid-cols-1 sm:grid-cols-2 explicitly to ensure single column on mobile. Review line 291 sm:col-span-2 and similar to ensure labels and inputs are properly paired. Test SMTP section at 320px width.

### 21. Medium: Table header row on Events page - column headers not responsive, no text truncation on narrow viewports

- **Severity:** medium  ·  **Category:** responsive
- **File:** `apps/web/app/(admin)/admin/events/page.tsx` (line 508-523)
- **Problem:** TableHead cells (line 512-521) contain buttons with text like 'Applications', 'Created' but no responsive hiding or truncation. On mobile, header text may wrap into two lines or overflow.
- **Fix:** Apply hidden sm:table-cell to less-critical column headers, or use abbreviated text on mobile (e.g., 'App' → 'Applications'). Wrap long header text in <span className="hidden lg:inline">...</span> patterns.

### 22. High: Pagination controls lack responsive layout - 'Page X' text + buttons row will overflow on very small mobile screens

- **Severity:** medium  ·  **Category:** responsive
- **File:** `apps/web/app/(admin)/admin/people/page.tsx` (line 893-921)
- **Problem:** Lines 893-921 show pagination with flex items-center justify-between containing text 'Page {userPage}' and two buttons. On 320px screens, this row will wrap awkwardly or overflow.
- **Fix:** Use flex-col sm:flex-row and reduce button size on mobile (size="icon" with just chevrons, no text). Move page text to its own line on mobile or hide it entirely.

### 23. Medium: Icons in lists and tables may not have aria-label on hover-only titles

- **Severity:** medium  ·  **Category:** accessibility
- **File:** `apps/web/app/(admin)/admin/events/page.tsx` (line 393, 401, 409, 419, 433, 444)
- **Problem:** Icon-only buttons (Eye, BriefcaseBusiness, Settings, Archive, Delete) have title attributes but no aria-label. Keyboard and screen reader users may not understand button intent.
- **Fix:** Add aria-label to every icon-only button. Example line 393: add aria-label="View event details" to Button. Also add title for tooltip: title="View event details".

### 24. Medium: Role editing dialog lacks clear visual focus states and missing confirmation on destructive role assignment scopes

- **Severity:** medium  ·  **Category:** workflow
- **File:** `apps/web/app/(admin)/admin/roles/page.tsx` (line 904-912)
- **Problem:** Line 904-912 shows a destructive Alert for Global Admin assignment but does not prompt user before confirming. Dialog footer (line 918) has a single Assign button without intermediate step. Users could accidentally grant global admin to a user without a secondary confirmation.
- **Fix:** Add a ConfirmDialog trigger before calling assignRoleFn(). Check if assignEventId === "_global_" && assignRole === "global_admin" and show a separate confirmation dialog with explicit warning text.

### 25. Medium: Audit log filter dropdown not semantic - SelectTrigger contains icon but no explicit label

- **Severity:** medium  ·  **Category:** accessibility
- **File:** `apps/web/app/(admin)/admin/audit/page.tsx` (line 197-217)
- **Problem:** Line 204-206 has SelectTrigger with Filter icon but no aria-label. Screen reader users won't know what the dropdown filters for.
- **Fix:** Add aria-label="Filter audit log by category" to the SelectTrigger element on line 204.

### 26. Medium: Loading skeletons don't match actual content height, causing cumulative layout shift when data loads

- **Severity:** medium  ·  **Category:** loading-empty-state
- **File:** `apps/web/app/(admin)/admin/settings/page.tsx` (line 145-155)
- **Problem:** Skeleton placeholder CardContent uses h-32 (line 149), but actual Card sections have variable heights. When skeleton is replaced with real content, the page will reflow.
- **Fix:** Ensure skeleton height matches expected content height. Use data attributes or CSS Grid with auto-sizing to match skeleton to loaded content, or use a fixed-height container during load.

### 27. High: People export dialog checkbox grid may overflow on mobile - max-h-80 overflow-y-auto with sm:grid-cols-2

- **Severity:** medium  ·  **Category:** responsive
- **File:** `apps/web/app/(admin)/admin/people/page.tsx` (line 476-486)
- **Problem:** Line 476 uses grid-cols-2 on mobile which wastes horizontal space. On 375px viewport, two columns of checkboxes will be cramped.
- **Fix:** Change grid-cols-2 to grid-cols-1 sm:grid-cols-2 to ensure single-column layout on mobile. Test the export dialog at 375px.

### 28. Medium: Announcements page - compose dialog with collapsible sections may have poor mobile UX due to nested small fonts and small tap targets

- **Severity:** medium  ·  **Category:** touch-target
- **File:** `apps/web/app/(admin)/admin/announcements/page.tsx` (line 136-163)
- **Problem:** CollapsibleSection buttons (line 150) have no explicit height. On mobile, the button text with small chevron icon may result in a tap target < 44px.
- **Fix:** Set explicit min-h-10 or similar on the collapsible button (line 150) to ensure 44px+ tap target on mobile.

### 29. Medium: Password input fields in user detail page lack show/hide toggle for accessibility and UX

- **Severity:** medium  ·  **Category:** forms
- **File:** `apps/web/app/(admin)/admin/people/[userId]/page.tsx` (line 767-781)
- **Problem:** Password inputs on lines 767-781 are type="password" with no reveal toggle button. Users on mobile or with cognitive disabilities may struggle to verify input.
- **Fix:** Add an eye/eye-off icon toggle button next to password fields to allow users to show/hide password. Ensure toggle button has aria-label="Toggle password visibility".

### 30. Medium: Roles page - role counts in summary cards don't reflect active filter, causing confusion

- **Severity:** medium  ·  **Category:** consistency
- **File:** `apps/web/app/(admin)/admin/roles/page.tsx` (line 473-514)
- **Problem:** Summary cards (lines 473-514) show totals for 'Organizers', 'Reviewers', 'Check-in Staff' based on all staff (line 269-275 uses roleCounts from unfiltered staff). When user filters by role, these totals don't update, confusing the user.
- **Fix:** Recalculate roleCounts based on filtered staff after applying roleFilter, or move summary cards inside a conditional and hide them when filters are active.

### 31. Medium: Announcement deletion lacks explicit action confirmation and toast doesn't clarify scope (system-wide deletion)

- **Severity:** medium  ·  **Category:** workflow
- **File:** `apps/web/app/(admin)/admin/announcements/page.tsx` (line 430-444)
- **Problem:** Line 446-448 calls deleteAnnouncement which shows a ConfirmDialog. The dialog title/description (lines 842-845) is generic 'Delete this announcement?' without emphasizing system-wide impact or inability to undo.
- **Fix:** Update ConfirmDialog description to explicitly state 'This announcement was sent to X users and cannot be recovered.' Include the announcement title in the confirmation.

### 32. Low: Event form slug auto-generation is naive - does not handle special characters or accents in event title

- **Severity:** low  ·  **Category:** logic-bug
- **File:** `apps/web/app/(admin)/admin/events/page.tsx` (line 216-217)
- **Problem:** Line 216-217 uses newTitle.toLowerCase().replace(/\s+/g, "-") to generate slug. Does not normalize accents (é → e) or handle non-ASCII characters. Slugs with accents or special chars may break URLs or look ugly.
- **Fix:** Use a slug library like `slugify` or implement accent normalization: newTitle.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').

### 33. Low: Role access window time validation uses client-side only - no server-side validation feedback if dates are in the past

- **Severity:** low  ·  **Category:** forms
- **File:** `apps/web/app/(admin)/admin/roles/page.tsx` (line 306-311, 393-401)
- **Problem:** Lines 308-310 check if startAtIso > endAtIso but do not check if dates are in the past. A user could set an end date in the past, creating an inactive access window silently.
- **Fix:** Add client-side validation: if endAtIso && new Date(endAtIso) < new Date() then warn 'Access end date is in the past.' Also verify server-side and return an error if invalid.

### 34. Medium: Empty states for Roles, Audit, and Announcements pages are correct but lack context-aware messaging on first load vs. after filtering

- **Severity:** low  ·  **Category:** loading-empty-state
- **File:** `apps/web/app/(admin)/admin/roles/page.tsx` (line 573-583)
- **Problem:** EmptyState on line 573 shows 'Try different filters' when search || roleFilter !== 'all', but on first load with no data, the message should differ. Users may not understand if it's a filter issue or if roles simply don't exist.
- **Fix:** Track 'hasEverLoaded' or check if search/filter are empty. Show 'Assign roles to get started' on initial empty state, and 'Try different filters' only when filters are active and no results found.

### 35. Low: Settings page color input lacks validation - hex input can accept invalid values (e.g., 'not-a-color')

- **Severity:** low  ·  **Category:** forms
- **File:** `apps/web/app/(admin)/admin/settings/page.tsx` (line 389-400)
- **Problem:** Line 389 uses <input type="color"> for visual picker, but line 396 Input allows any text value. User could type a non-hex string and it would be saved.
- **Fix:** Add onChange validation to reject non-hex values: /^#[0-9a-f]{6}$/i.test(value). Show error toast if invalid.

### 36. Medium: People page export dialog with 'Select all' / 'Clear' buttons don't disable appropriately

- **Severity:** low  ·  **Category:** forms
- **File:** `apps/web/app/(admin)/admin/people/page.tsx` (line 457-472)
- **Problem:** Line 457-472 buttons can be clicked even if exportColumns is already empty or full, with no visual feedback.
- **Fix:** Disable 'Clear' button when exportColumns.length === 0, and 'Select all' button when exportColumns.length === ADMIN_USERS_EXPORT_COLUMNS.length.


## Admin event-scoped pages (applications, reviews, check-in, messages, forms, workflow, metrics, reviewer-assignment, certificates, settings, microsite, and other sub-pages)

### 37. Horizontal scroll on mobile: Check-in attendees list missing min-w-0

- **Severity:** high  ·  **Category:** horizontal-scroll
- **File:** `apps/web/app/(staff)/staff/[eventId]/checkin/page.tsx` (line 975-998)
- **Problem:** The attendees list inside ScrollArea has a flex container (div with min-w-0 flex-1 space-y-1) but individual attendee rows (div with flex flex-wrap items-center justify-between gap-3) do not have min-w-0. When applicant names or emails are long, the text breaks into the next line but the button (Check in) forces the row wider than the viewport. Line 975 has min-w-0 flex-1 space-y-1, but line 972 (the parent div.flex-wrap) lacks min-w-0 and wrapping flex children on narrow screens will still push beyond viewport.
- **Fix:** Change line 972 class from 'flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm' to 'flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm min-w-0'. Alternatively, wrap the text/button sections in flex containers with min-w-0 shrink-0 on the button: change the button on line 1000 to have className='...shrink-0'. Best: add min-w-0 to the outer flex and ensure the button has shrink-0.

### 38. Horizontal scroll on mobile: Reviewer workload display missing min-w-0

- **Severity:** high  ·  **Category:** horizontal-scroll
- **File:** `apps/web/app/(staff)/staff/[eventId]/reviewer-assignment/page.tsx` (line 325)
- **Problem:** The reviewer workload cards (line 325: 'rounded border p-2 text-sm flex flex-wrap items-center gap-2') have many Badge elements and no min-w-0 on flex children. On narrow screens (375px), the reviewer name + multiple badges (Assigned, Pending, Overdue, Completed, Delta) will push the row off-screen because flex defaults to min-width: auto and the badges refuse to shrink.
- **Fix:** Add min-w-0 to the parent div on line 325. Also truncate the reviewer name: wrap 'reviewerLabel(reviewer)' in a span with className='truncate min-w-0'. Optionally use flex-wrap to allow badges to wrap on small screens or reduce badge count on mobile.

### 39. Responsive breakage: 3-column grid does not collapse on mobile

- **Severity:** high  ·  **Category:** responsive
- **File:** `apps/web/app/(staff)/staff/[eventId]/checkin/page.tsx` (line 664)
- **Problem:** Stats grid on line 664: 'grid grid-cols-3 gap-4' has no mobile breakpoint. At 375px width (mobile), three columns side-by-side with text/icons will be severely cramped. Text will wrap and break layout. No md: or sm: variant to revert to 1-2 columns on small screens.
- **Fix:** Change 'grid grid-cols-3 gap-4' to 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4' so mobile defaults to 1 column, tablets get 2, and desktop gets 3.

### 40. Responsive breakage: Check-in layout grid doesn't adapt to mobile

- **Severity:** high  ·  **Category:** responsive
- **File:** `apps/web/app/(staff)/staff/[eventId]/checkin/page.tsx` (line 859)
- **Problem:** The grid on line 859: 'grid gap-2 md:grid-cols-[220px_minmax(0,1fr)_auto]' assumes md (768px+) to apply grid columns. On mobile (<768px), the grid has only gap-2 with no column spec, so it defaults to single-column, which then means the status select, search input, and reset button stack vertically but the total width is unconstrained. The minmax(0,1fr) search input on md breakpoint is correct, but on small screens the layout should be 'flex flex-col' or a 2-row layout.
- **Fix:** Change line 859 to 'grid gap-2 grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)_auto]' to explicitly set 1 column on mobile, or use 'flex flex-col md:grid md:grid-cols-[220px_minmax(0,1fr)_auto]' for a more explicit layout shift.

### 41. Missing min-w-0 on applications table page: Filter panel wrapping

- **Severity:** high  ·  **Category:** horizontal-scroll
- **File:** `apps/web/app/(staff)/staff/[eventId]/applications/page.tsx` (line 3431-3476)
- **Problem:** The advanced filter grid (line 3434: 'grid gap-2 rounded-md border border-border/60 p-3 sm:grid-cols-2') and other filter grids lack min-w-0 on flex/grid children. When filter condition selects (e.g., 'Decision status' select triggers) are displayed alongside remove buttons and negate switches, the line can exceed viewport on mobile without min-w-0 constraints on the flex children inside the condition rows.
- **Fix:** Add min-w-0 flex-1 to Select/Input wrappers inside filter condition rows. Example: around line 1451 (SelectTrigger), wrap it or its parent in a div className='min-w-0 flex-1' so the select shrinks to fit.

### 42. Missing aria-label on icon-only buttons throughout pages

- **Severity:** medium  ·  **Category:** accessibility
- **File:** `apps/web/app/(staff)/staff/[eventId]/checkin/page.tsx` (line 889-898)
- **Problem:** Line 889-898: The search button (Button size='sm' variant='outline' with only Search icon, no text) lacks aria-label. Many icon-only buttons in the codebase (undo button line 1107, collapse/expand buttons, etc.) are missing aria-label, making them inaccessible to screen readers. Users won't know what the button does.
- **Fix:** Add aria-label='Search attendees' to the search button on line 889. Audit all icon-only buttons and add descriptive aria-label attributes. Example: <Button aria-label='Search attendees' onClick={...}><Search className='h-4 w-4' /></Button>

### 43. Horizontal scroll in metrics page: Complex filter grid layout

- **Severity:** medium  ·  **Category:** horizontal-scroll
- **File:** `apps/web/app/(staff)/staff/[eventId]/metrics/page.tsx` (line 360)
- **Problem:** The metrics page shows 'grid gap-3 md:grid-cols-4' for metric cards. On mobile, this defaults to 1 column but the filter UI (not shown in snippet but likely similar to other pages) may have a similar issue with select/input grids not collapsing. The page's filter-building UI is complex and prone to mobile overflow.
- **Fix:** Ensure all filter-building grids use 'grid-cols-1 sm:grid-cols-2 md:grid-cols-...' and wrap input/select pairs in containers with min-w-0 flex-1.

### 44. Loading state: No skeleton for large tables, will show instant empty state flicker

- **Severity:** medium  ·  **Category:** loading-empty-state
- **File:** `apps/web/app/(staff)/staff/[eventId]/applications/page.tsx` (line 2290-3250+ (table rendering))
- **Problem:** The applications table renders isLoading state with TableSkeleton, but the actual skeleton coverage is partial. While TableSkeleton is used, the page's filter panel, sort controls, and pagination info all render immediately without skeleton animation, creating a 'pop-in' effect where the UI layout jumps once data arrives.
- **Fix:** Extend skeleton loading to the entire filter/control panel when isLoading=true. Add a page-level LoadingOverlay or animate the entire table container with opacity/skeleton backgrounds during the loading phase.

### 45. Logic bug: Bulk action state not reset if user navigates away

- **Severity:** medium  ·  **Category:** logic-bug
- **File:** `apps/web/app/(staff)/staff/[eventId]/applications/page.tsx` (line 450-510)
- **Problem:** The applications page has numerous bulk action dialogs (showBulkTags, showBulkMessage, showBulkDecision, etc.) and associated state. If a user opens a bulk action dialog, starts filling it out, then navigates to a different page, the state is lost but the dialog state isn't cleared. When they return, the dialog may still be open with stale data. Additionally, if a bulk action is in-flight (isApplyingBulk=true) and the user navigates away, there's no cleanup of the request or cancellation token.
- **Fix:** Add a useEffect cleanup that clears all bulk action dialogs when the page unmounts: useEffect(() => { return () => { setShowBulkTags(false); setShowBulkMessage(false); ... }; }, []). Also implement request cancellation via AbortController for in-flight bulk operations.

### 46. Logic bug: Filter state can become stale when switching between quick/advanced modes

- **Severity:** medium  ·  **Category:** logic-bug
- **File:** `apps/web/app/(staff)/staff/[eventId]/applications/page.tsx` (line 1254-1263)
- **Problem:** When switching filterMode from 'quick' to 'advanced' (line 1259: switchToAdvancedMode), the code calls quickFiltersToAdvancedTree(quickFilters) to populate the advanced tree. However, the advanced tree UI allows arbitrary complex queries (40 condition limit, nested groups). If a user builds a complex advanced tree, saves it as a view, then switches back to quick mode, the view is lost and the quick filter state doesn't reflect the original advanced query. Switching back to that view may fail to restore the exact filters.
- **Fix:** Implement a view-restore mapping: when switching modes, only allow mode switch if no changes have been made, or warn the user that the complex filters will be simplified. Add a 'restore from view' button to recover lost complexity.

### 47. Workflow logic: No validation that workflow steps are in valid order before save

- **Severity:** medium  ·  **Category:** workflow
- **File:** `apps/web/app/(staff)/staff/[eventId]/workflow/page.tsx` (line 195-214, saveForm())
- **Problem:** The workflow builder allows users to reorder steps via drag-and-drop (Reorder.Group) and saves the order to stepIndex. However, there's no validation that ensures each step has a unique stepIndex or that stepIndex matches 0, 1, 2, ... in order. If the API returns an error on save due to invalid ordering, the error isn't caught and displayed; the save silently fails or the page shows a generic error.
- **Fix:** Add validation before save: ensure stepIndex values are contiguous (0 to steps.length-1) with no gaps or duplicates. If invalid, show a specific error message. Also wrap the API save in try-catch and display the error to the user.

### 48. Review queue: Auto-advance toggle stored in localStorage but can diverge from server state

- **Severity:** medium  ·  **Category:** logic-bug
- **File:** `apps/web/app/(staff)/staff/[eventId]/reviews/page.tsx` (line 374-400)
- **Problem:** The autoAdvance preference is stored in localStorage (line 391-394: window.localStorage.setItem). If the user has auto-advance enabled, navigates away, the server queue state updates (more reviews submitted, current item reviewed), and the user returns, the localStorage preference persists but the queue state may have changed. The auto-advance logic (line 493+: submitReview) doesn't check if the current queue item is still valid or if the queue has been updated server-side before auto-advancing to the next item.
- **Fix:** Add a freshness check: before auto-advancing, validate that the current queue item is still in the queue and hasn't been claimed by another reviewer. If the server queue has changed, reload the queue before auto-advancing.

### 49. Forms editor: Very long page (~1900 lines) with no save indicator or unsaved changes warning

- **Severity:** medium  ·  **Category:** workflow
- **File:** `apps/web/app/(staff)/staff/[eventId]/forms/page.tsx` (line 872-1846 (editor mode))
- **Problem:** The form editor allows users to build complex forms with sections and fields. When editing, the only save buttons are 'Save draft' and 'Publish' (lines 901, 909). There's no indication of unsaved changes (e.g., no dirty flag, no '*' on the title, no warning when navigating away). If a user edits fields, scrolls down, and accidentally navigates away, all changes are lost without warning.
- **Fix:** Implement a dirty flag: track changes with useRef or useState. Set dirty=true on any field edit. Add a warning dialog on page exit if dirty=true. Add a visual indicator (e.g., '* Unsaved changes') to the title or a banner at the top.

### 50. Applications page: Large form field edit modal lacks proper error handling for conflicting edits

- **Severity:** medium  ·  **Category:** workflow
- **File:** `apps/web/app/(staff)/staff/[eventId]/applications/[applicationId]/page.tsx` (line 2999-3160)
- **Problem:** The field edit dialog (renderFieldEditDialog, line 2999+) allows staff to manually edit individual field answers. If two staff members edit the same field simultaneously, the last save wins without conflict detection. The API also doesn't implement optimistic locking or version checks, so concurrent edits can lose data.
- **Fix:** Implement optimistic locking: add a version/etag to field responses and validate it before patching. If conflict detected, show a modal with 'Reload' (fetch fresh data) vs 'Overwrite' (force save). Also add a field-level edit timestamp so users can see when/by-whom a field was last modified.

### 51. Check-in page: Export dialog uses overflow-y-auto with fixed height but grid inside may not scroll properly on mobile

- **Severity:** low  ·  **Category:** responsive
- **File:** `apps/web/app/(staff)/staff/[eventId]/checkin/page.tsx` (line 1179)
- **Problem:** The export columns checkbox grid (line 1179: 'grid max-h-80 gap-2 overflow-y-auto rounded-md border border-border/60 p-3 sm:grid-cols-2') uses fixed max-h-80 and overflow-y-auto. On mobile screens, if there are many columns (e.g., 20+), the grid inside the scrollable div might have improper spacing or the scroll won't work smoothly due to touch-action conflicts.
- **Fix:** Test on actual mobile device to ensure the scrollable grid works smoothly. Consider using 'max-h-[50vh]' instead of 'max-h-80' to be more responsive. Also add 'touch-pan-y' or review if Tailwind's overflow-y-auto handles mobile scroll gestures correctly.

### 52. Forms page: Field reordering via Reorder.Group but no indication of reorder completion or errors

- **Severity:** low  ·  **Category:** workflow
- **File:** `apps/web/app/(staff)/staff/[eventId]/forms/page.tsx` (line 1031-1038, 1086-1098)
- **Problem:** The form editor uses Reorder.Group (from framer-motion) to allow drag-and-drop reordering of sections and fields. When the user drops a section/field, the onReorder callback updates state. However, there's no animation feedback or toast message confirming the reorder was successful. If the save fails, the UI state is out of sync with the server.
- **Fix:** Add a toast.success('Section/field reordered') after onReorder completes. Also consider adding a visual animation (e.g., brief highlight) to the reordered item. Test that saving after reorder works and handles errors gracefully.

### 53. Reviewer assignment page: Dialog for applying preview doesn't prevent double-submission

- **Severity:** low  ·  **Category:** workflow
- **File:** `apps/web/app/(staff)/staff/[eventId]/reviewer-assignment/page.tsx` (line 241-264)
- **Problem:** The applyPreview function (line 241) sets isApplying=true but the apply button is only disabled during the request. If a user double-clicks the button before isApplying state updates, two requests may be sent. While idempotencyKey is used (line 250), relying on it alone is not robust.
- **Fix:** Add a ref or additional guard to prevent re-entry: useRef<boolean>(false) and check before making the API call. Alternatively, ensure the button's disabled state is set immediately before the async call.


## Staff Route Group (app/(staff)/staff/) - Dashboards & Management UI

### 54. CRITICAL: Table cells with whitespace-nowrap force horizontal scroll on mobile

- **Severity:** critical  ·  **Category:** horizontal-scroll
- **File:** `apps/web/components/ui/table.tsx` (line 73, 86)
- **Problem:** TableHead (line 73) and TableCell (line 86) both have hardcoded `whitespace-nowrap` in their default className. This prevents text wrapping and forces content wider than the viewport, causing horizontal scroll on mobile. The Table wrapper does have `overflow-x-auto` (line 11) but the nowrap classes defeat responsive text flow. On applications/page.tsx, 4000+ tables with long email addresses, applicant names like 'Very Long Name With Many Words', and decision statuses all wrap to single lines, pushing tables wider than 375px.
- **Fix:** Remove `whitespace-nowrap` from TableHead and TableCell default classes. Add `break-words` or `word-break: break-word` to allow text wrapping. For critical columns (email, name), add `line-clamp-1` or `truncate` *with* a tooltip if full text matters. Alternatively, use responsive column visibility (hide low-priority columns on mobile via md: breakpoints). Test at 375px width.

### 55. Applications table: CardContent p-0 doesn't constrain flex children properly on mobile

- **Severity:** high  ·  **Category:** horizontal-scroll
- **File:** `apps/web/app/(staff)/staff/[eventId]/applications/page.tsx` (line 4131)
- **Problem:** The Table is wrapped in `<CardContent className="p-0">`. The CardContent itself is a div inside the Card, but the table wrapper `<div className="relative w-full overflow-x-auto">` is defined as `w-full` which respects the container width. However, with `whitespace-nowrap` on cells, the table grows beyond w-full and the overflow-x-auto scrolls the whole viewport in some cases because the parent card isn't explicitly constraining. Additionally, the top-level return div uses `className="space-y-6"` which doesn't have `min-h-0` for flex containment, so if the table grows tall, it doesn't shrink other content properly.
- **Fix:** 1. CardContent: ensure the card itself has `overflow-hidden` or `min-w-0` on the CardContent. 2. Top-level div: change `<div className="space-y-6">` to `<div className="space-y-6 min-h-0 flex flex-col">` to allow flex containment. 3. Add `min-w-0` to any flex child that contains scrollable/overflowing content. 4. Test the table at 375px with 50 rows.

### 56. Check-in page: Attendees list card missing overflow containment for scrollable section

- **Severity:** high  ·  **Category:** horizontal-scroll
- **File:** `apps/web/app/(staff)/staff/[eventId]/checkin/page.tsx` (line 858-1018)
- **Problem:** CardContent on line 858 uses `className="flex max-h-[70vh] min-h-0 flex-col gap-4 overflow-hidden"` which is good for height constraint. However, the grid on line 859 `className="grid gap-2 md:grid-cols-[220px_minmax(0,1fr)_auto]"` has a 220px fixed-width Select that may not shrink below 220px on mobile (< 768px). The grid switches to single column due to `md:` prefix, but each row's content (attendee name/email lines 976-980) uses `break-words` (good) but the parent flex on line 975 uses `min-w-0 flex-1` (correct). However, the Select dropdown can still overflow; test at 375px.
- **Fix:** 1. On line 859, change `md:grid-cols-[220px_minmax(0,1fr)_auto]` to `md:grid-cols-[minmax(0,220px)_minmax(0,1fr)_auto]` to allow the select to shrink below 220px on very small screens. 2. Test the full attendees section at 375px width with multiple attendees and tags. 3. Verify Select component doesn't overflow its container.

### 57. Applications page: Filter toolbar and search inputs do not wrap or shrink properly on mobile

- **Severity:** high  ·  **Category:** responsive
- **File:** `apps/web/app/(staff)/staff/[eventId]/applications/page.tsx` (line 3313-3450)
- **Problem:** The search/filter section uses `<div className="space-y-3">` with multiple buttons and selects (lines 3331-3393). Line 3365 has `<SelectTrigger className="w-[240px]">` which is a fixed 240px width. On a 375px viewport, this takes 64% of the width, pushing other content off-screen or forcing wrapping that looks broken. The filter mode buttons and the 'Save view' button are in `flex flex-wrap` but the Select with fixed width doesn't shrink. At 768px (tablet), the layout is OK, but at 375px (mobile), the filter bar is cramped.
- **Fix:** 1. Change `w-[240px]` Select to `w-full md:w-[240px]` to make it responsive. 2. Wrap filter controls in a `<div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center flex-wrap">` to stack on mobile. 3. Make buttons full-width on mobile: add `w-full sm:w-auto` to individual buttons. 4. Test at 375px with all filter options visible.

### 58. Reviews page: Verdict workspace right sidebar too narrow on mobile, form inputs cramped

- **Severity:** high  ·  **Category:** responsive
- **File:** `apps/web/app/(staff)/staff/[eventId]/reviews/page.tsx` (line 862, 1021-1037)
- **Problem:** Line 862 uses `className="grid gap-6 lg:grid-cols-5"` with lg breakpoint only. Below 1024px (tablet), the grid is 1 column, but the right sidebar (VerdictWorkspace) is intended to show verdict options and only works well on large screens. On iPad (768px) or mobile, the sidebar is still narrow relative to the left content, and the verdict form inputs (buttons, textareas) inside it may be too small or hard to use. The left content is `lg:col-span-3` so it takes 3/5 space on large screens, but on tablet/mobile it becomes full width then the sidebar is hidden or stacked below, making the workflow awkward.
- **Fix:** 1. Consider a `md:grid-cols-[1fr_300px]` breakpoint for tablets to show sidebar beside content at 768px. 2. Use `lg:col-span-3` and `lg:col-span-2` to adjust proportions. 3. Alternatively, use a modal/drawer pattern for the verdict workspace on mobile. 4. Ensure all form inputs in VerdictWorkspace are full-width and have `min-h-[44px]` for touch targets. Test at 768px and 1024px.

### 59. Reviewer assignment page: Reviewer list and manual overrides section not optimized for mobile

- **Severity:** medium  ·  **Category:** responsive
- **File:** `apps/web/app/(staff)/staff/[eventId]/reviewer-assignment/page.tsx` (line 324-336, 437-459)
- **Problem:** The workload visibility card (line 322-336) renders reviewer workload as a flex row with badges (`className="flex flex-wrap items-center gap-2"` line 325). With 5-6 badges per reviewer, this can wrap awkwardly on mobile. The manual overrides section (line 430-460) uses a flex row for each item (line 438 `className="flex flex-wrap items-center gap-2"`) with a Select and buttons. On mobile, the Select (reviewerId dropdown) is `w-full sm:w-96` which expands to full width on mobile (line 451), making it hard to see the current assignment below it.
- **Fix:** 1. Reviewer list: Stack badges vertically on mobile (`flex-col sm:flex-row`). 2. Manual overrides: Change layout to a card per item with a vertical flow on mobile: use `<div className="flex flex-col gap-2">` for the select/button row. 3. Test at 375px with 3-4 reviewers and 5-6 queue items.

### 60. Metrics page: Response filter grid columns not responsive enough for mobile

- **Severity:** medium  ·  **Category:** responsive
- **File:** `apps/web/app/(staff)/staff/[eventId]/metrics/page.tsx` (line 360)
- **Problem:** Line 360 uses `className="grid gap-3 md:grid-cols-4"` for the filter editor grid (Step, Field, Operator, Value). Below 768px, this becomes 1 column, but each Select is full-width and may have very long option text (e.g., 'Step 5. Very Long Step Title Here'). On mobile, readability suffers. Also, the Value input (line 458-491 with nested grids for RANGE operator) may be cramped.
- **Fix:** 1. Adjust responsive grid: use `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` for a two-column mobile view. 2. For RANGE operator (line 460), use `grid-cols-1` instead of `grid-cols-2` on mobile. 3. Add `truncate` to Select labels to prevent overflow. Test at 375px with long field names.

### 61. Applications page: Touch targets on bulk action buttons below 44px on mobile

- **Severity:** medium  ·  **Category:** touch-target
- **File:** `apps/web/app/(staff)/staff/[eventId]/applications/page.tsx` (line 4000-4115)
- **Problem:** The bulk action buttons (Issue Credentials, Send Message, Tag Applications, etc., lines 4000-4115) use `size="sm"` which renders as `h-8` (32px) in shadcn Button. On mobile, 32px is below the recommended 44px touch target. Users with large fingers or accessibility needs will struggle to tap the exact button. Additionally, the buttons are wrapped in `flex flex-wrap gap-2` which causes them to wrap on narrow screens, but each button is still only 32px tall.
- **Fix:** 1. Change bulk action buttons from `size="sm"` to `size="md"` (44px height). 2. On mobile, make buttons full-width or wider: add responsive classes like `w-full sm:w-auto`. 3. Test touch accuracy at 375px with a stylus or finger. 4. Consider grouping actions in a dropdown menu on mobile to save space.

### 62. Reviews page: Long answer text in review cards not breaking or scrolling properly on mobile

- **Severity:** medium  ·  **Category:** responsive
- **File:** `apps/web/app/(staff)/staff/[eventId]/reviews/page.tsx` (line 952-987)
- **Problem:** The answer rendering section (line 952-987) uses `className="max-h-[60vh] overflow-y-auto overflow-x-hidden pr-2"` for the container (line 953), which is good for vertical scroll. However, individual answer values (line 969) use `className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]"` which should wrap long URLs, emails, or code blocks. But if a long unbroken string (e.g., base64-encoded file data, very long URLs) is in the answers, the `[overflow-wrap:anywhere]` may not be enough and could cause horizontal scroll. Additionally, the card itself has `min-w-0` (line 872) but the answer section doesn't explicitly constrain width.
- **Fix:** 1. Add `word-break: break-all` or `overflow-x-auto` to the answer rendering section to catch edge cases. 2. Add explicit `max-w-full` to answer value div. 3. For long answer fields, consider truncating and showing a 'Show more' link on mobile. 4. Test with very long URLs and base64 data.

### 63. Check-in page: QR scanner component may not resize responsively

- **Severity:** medium  ·  **Category:** responsive
- **File:** `apps/web/app/(staff)/staff/[eventId]/checkin/page.tsx` (line 718-726)
- **Problem:** The QrScanner component (line 718-726) has `width={320} height={320}` hardcoded props and `className="w-full"` on the component. The hardcoded pixel dimensions may not respect mobile viewport widths < 375px. On very narrow screens, the scanner might be clamped at 320px, leaving blank space on the sides or forcing horizontal scroll. The card containing it is responsive, but the scanner component itself may not scale down properly.
- **Fix:** 1. Make QrScanner dimensions responsive: compute size based on viewport or use CSS to scale. Change to `width={Math.min(320, window.innerWidth - 40)}` if available in the QrScanner component. 2. Ensure the parent card has `overflow-hidden` so the oversized scanner doesn't escape. 3. Test at 360px, 375px, and 400px widths.

### 64. Applications page: Pagination buttons at bottom not accessible on mobile (below fold)

- **Severity:** medium  ·  **Category:** accessibility
- **File:** `apps/web/app/(staff)/staff/[eventId]/applications/page.tsx` (line 4188-4215)
- **Problem:** The pagination section (lines 4188-4215) is at the bottom of a long page. On mobile, after scrolling through a large table, users must scroll to the very bottom to access Next/Previous buttons. This is poor UX for pagination; many mobile patterns sticky-fix pagination to the top or provide infinite scroll.
- **Fix:** 1. Add sticky pagination to the top of the table section (use `position: sticky; top: 0; z-index: 10;`). 2. Or implement infinite scroll instead of pagination for mobile (load more automatically on scroll). 3. Keep bottom pagination for desktop but add a sticky top bar on mobile. 4. Test with 100+ rows on mobile.

### 65. Staff page: Event cards don't show role badges clearly on mobile due to wrapping

- **Severity:** low  ·  **Category:** responsive
- **File:** `apps/web/app/(staff)/staff/page.tsx` (line 261-321)
- **Problem:** Event cards (lines 268-321) render role badges in a `flex flex-wrap gap-2` (line 283). On mobile, with 3-4 roles per event, badges wrap to multiple lines, making the card taller and the layout less dense. The role label padding is tight (px-2.5 py-0.5, line 287), which is fine, but the number of roles shown is unbounded, causing layout shift.
- **Fix:** 1. Limit roles shown to 2-3 per card, add a '+N more' badge for overflow. 2. Or stack role badges vertically on mobile with `flex-col sm:flex-row`. 3. Add `line-clamp-2` to the title (line 270) which already exists and is good. Test at 375px with many roles.

### 66. Reviewer assignment page: Step inclusion/exclusion checkboxes misaligned on mobile

- **Severity:** low  ·  **Category:** responsive
- **File:** `apps/web/app/(staff)/staff/[eventId]/reviewer-assignment/page.tsx` (line 360-370)
- **Problem:** The step inclusion/exclusion section (line 360-370) renders each step as a flex row with two checkboxes at the end (line 366-368). On mobile, the step title takes space and the checkboxes are pushed to the right, making the label text harder to read. The checkboxes are not grouped clearly.
- **Fix:** 1. Stack checkboxes vertically on mobile: `<div className="flex flex-col gap-1 sm:gap-3 sm:flex-row">`. 2. Add clearer visual grouping with lighter background or border. 3. Test at 375px with long step titles.

### 67. Check-in page: Loading and empty states weak, no inline guidance for users

- **Severity:** low  ·  **Category:** loading-empty-state
- **File:** `apps/web/app/(staff)/staff/[eventId]/checkin/page.tsx` (line 951-959)
- **Problem:** Lines 951-959 show loading and empty states for the attendees list. The loading message is just `<p>Loading attendees...</p>` and the empty message is just `<p>No attendees match the current filters.</p>`. These are minimal and don't guide users on what to do next or why the list is empty.
- **Fix:** 1. Enhance loading state: add a spinner or skeleton cards. 2. Enhance empty state: suggest resetting filters or checking the status filters (show a hint like 'Try changing the status filter from "Not checked in" to "All attendees"'). 3. Use the EmptyState component if available (it's imported but not used here).

### 68. Reviews page: Auto-advance toggle not saved persistently if localStorage fails

- **Severity:** low  ·  **Category:** logic-bug
- **File:** `apps/web/app/(staff)/staff/[eventId]/reviews/page.tsx` (line 373-400)
- **Problem:** Lines 373-400 attempt to persist the auto-advance preference to localStorage with a try/catch silently failing. If localStorage is blocked (private browsing, some browsers), the preference resets to OFF on every page reload. Users who enable auto-advance will see it disabled the next time they visit, which is confusing.
- **Fix:** 1. Fall back to a query param or URL state if localStorage fails. 2. Or use a server-side user preference endpoint to save auto-advance globally. 3. Show a subtle toast or warning if localStorage is unavailable: 'Auto-advance preference not saved (localStorage blocked)'. 4. Test in private browsing mode.

### 69. Applications page: Bulk operations on slow networks may leave UI in inconsistent state

- **Severity:** low  ·  **Category:** logic-bug
- **File:** `apps/web/app/(staff)/staff/[eventId]/applications/page.tsx` (line 2690-2790)
- **Problem:** Bulk operations like `applyBulkTags()` (lines 2690-2743) refresh the full applications list after the action completes. If the network is slow or the refresh fails silently, the UI shows the old data but the action was applied on the server. Users may attempt to re-do the action or assume it failed. Additionally, if a user starts a bulk action then immediately navigates away, the action may partially complete.
- **Fix:** 1. Show a more prominent loading indicator during bulk operations. 2. Add a confirmation toast showing the exact count of items affected. 3. Implement optimistic updates: immediately reflect the change in the UI, then reconcile if the server response differs. 4. Add a 'Undo' button for 5 seconds if the action fails.

### 70. Check-in page: Lookup results may overflow if applicant name or email is very long

- **Severity:** low  ·  **Category:** horizontal-scroll
- **File:** `apps/web/app/(staff)/staff/[eventId]/checkin/page.tsx` (line 792-833)
- **Problem:** The lookup results section (lines 792-833) renders each result in a flex container (line 805) with `gap-2 rounded-lg border p-2 text-sm`. The applicant name (line 810) and email (line 811-813) use `font-medium` and `text-xs text-muted-foreground` without `truncate` or `break-words`. On mobile, a very long email like 'verylongemailaddresswithoutbreaks@example.com' could overflow the card width.
- **Fix:** 1. Add `truncate` to the email paragraph or wrap it: `<p className="break-all text-xs text-muted-foreground">`. 2. Test with a 100-character email address on mobile.


## Applicant portal app/(portal)/ – Multi-step application wizard, dashboards, inbox, profile

### 71. Profile page two-column grid lacks mobile breakpoint

- **Severity:** high  ·  **Category:** responsive
- **File:** `apps/web/app/(portal)/profile/page.tsx` (line 278)
- **Problem:** First name / last name fields are in a `grid grid-cols-2 gap-4` container with no `sm:` or smaller breakpoint. On 375–480px viewports, columns remain 2-wide and each input becomes critically narrow (75–120px), inducing horizontal scroll or layout distortion. The grid does not collapse to 1 column on mobile.
- **Fix:** Add responsive breakpoint: change `grid grid-cols-2 gap-4` to `grid grid-cols-1 sm:grid-cols-2 gap-4`. This ensures single-column layout on phones ≤480px and 2-column on tablets+.

### 72. Step form sticky action bar squeezes content on mobile without wrapping

- **Severity:** high  ·  **Category:** horizontal-scroll
- **File:** `apps/web/app/(portal)/applications/[applicationId]/steps/[stepId]/page.tsx` (line 1686)
- **Problem:** The sticky action bar at the bottom (`flex items-center justify-between sticky bottom-4 bg-background/95...`) places status text (left) and two buttons (right) inline. On mobile, the left-side text ('Saving draft…', 'Saved 12:30:45', issues count, deadline warnings) can exceed 200px. The buttons ('Save draft' + 'Submit') are each 80–100px. Together they exceed viewport width at 375px. The container uses `justify-between` which forces horizontal layout, causing either content truncation or overflow.
- **Fix:** Switch to vertical stack on mobile: wrap the action bar in `flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`. Alternatively, abbreviate status text to '✓ Saved' and use icon-only buttons on mobile (with aria-label), then full labels on sm+. Also ensure the container respects `max-w-5xl` parent and does not exceed viewport after accounting for the sidebar inset padding.

### 73. Multi-step form submit button not disabled during API submission, giving false feedback

- **Severity:** high  ·  **Category:** workflow
- **File:** `apps/web/app/(portal)/applications/[applicationId]/steps/[stepId]/page.tsx` (line 1724–1731)
- **Problem:** Submit button is disabled only when `!canSubmit`, which checks `!isSubmitting`. However, the button is not explicitly visually disabled (opacity, cursor, color) during submission. If the button disabling logic fails or user double-clicks, there is no spinner/feedback in the button itself. The global status text shows 'Saving draft…' but after submission is initiated, the user sees a confirmation dialog then waits for redirect. If the submit hangs or the dialog doesn't close, there's no in-button loader (like the Save draft button logic).
- **Fix:** Add spinner to submit button: change the button render to show `{isSubmitting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}` (similar to profile page's save button). Ensure `disabled={!canSubmit}` is paired with `aria-busy={isSubmitting}` for accessibility.

### 74. Dashboard and Events tab lists do not wrap or scroll on constrained mobile viewports

- **Severity:** medium  ·  **Category:** horizontal-scroll
- **File:** `apps/web/app/(portal)/dashboard/page.tsx` (line 359–366)
- **Problem:** The filter tabs at line 359–366 render a `TabsList` with 5 triggers ('All', 'In Progress', 'Accepted', 'Waitlisted', 'Rejected'). On 375px, these tabs plus their padding/gaps (~40–50px total) exceed available width. The TabsList does not overflow-x-auto or use a scroll-snap carousel; instead, the tabs likely cause the flex container to overflow or squish text. The Select dropdown (w-[160px]) is also fixed-width and may not have room on mobile.
- **Fix:** Wrap the filter/sort controls in `overflow-x-auto` scroll container, or restructure to hide some filter tabs behind a dropdown menu on mobile (show 'Filters' button that opens a side drawer on <640px). Ensure TabsList has `whitespace-nowrap` and scrollable area. Alternatively, stack tabs vertically on sm: with `flex flex-col sm:flex-row gap-2 sm:gap-3`.

### 75. Select dropdown with fixed width w-[160px] may cause overflow on narrow mobile

- **Severity:** medium  ·  **Category:** responsive
- **File:** `apps/web/app/(portal)/dashboard/page.tsx` (line 369–376)
- **Problem:** The sort Select has `className="w-[160px]"`, a fixed width with no responsive breakpoint. On 375px viewports (after sidebar padding, margins, gaps), 160px may be unachievable and the dropdown may overflow the right edge or force a horizontal scroll. Similarly, the Events page sort dropdown at events/page.tsx:376 has the same issue.
- **Fix:** Change to responsive: `className="w-full sm:w-[160px]"` to take full width on mobile, then fixed width on tablets+. Or use flex-1 on mobile with max-w-xs constraint.

### 76. Inbox message detail modal dialog max-width is not mobile-constrained

- **Severity:** medium  ·  **Category:** responsive
- **File:** `apps/web/app/(portal)/inbox/page.tsx` (line 479)
- **Problem:** DialogContent has `className="max-w-2xl max-h-[90vh] overflow-y-auto"`. On 375px, a `max-w-2xl` (42rem = 672px) dialog would overflow the viewport by 297px, creating scroll/overlay that hides content. The dialog padding (default ~24px each side) plus margin further constrains the usable area to ~327px, leaving almost no room for message body, buttons, and scroll area.
- **Fix:** Add mobile-responsive max-width: `className="max-w-2xl sm:max-w-lg max-h-[90vh] overflow-y-auto"` or use `w-[calc(100vw-2rem)]` on mobile. Ensure DialogContent respects viewport bounds natively via Radix-UI constraints if not already applied.

### 77. Step form field sections lack responsive card padding on mobile

- **Severity:** medium  ·  **Category:** responsive
- **File:** `apps/web/app/(portal)/applications/[applicationId]/steps/[stepId]/page.tsx` (line 1412–1681)
- **Problem:** Form sections (CardContent) use uniform `className="space-y-5"` with `CardHeader` and `CardContent` defaulting to `p-6`. On 375px viewports with sidebar inset padding (p-4 lg:p-6), a full-width Card at p-6 leaves only ~327px for content, and multi-field sections (e.g., 2-column on desktop) may stack awkwardly. No responsive padding reduction is applied.
- **Fix:** Add responsive padding to CardContent: audit Card padding; consider `p-4 lg:p-6` on Card, and ensure nested grid/flex layouts collapse to single column on mobile. Test at 375px with real form fields (text, textarea, file uploads) to verify no truncation.

### 78. Inbox message list items have small touch targets; icon-only mark-read interaction unclear

- **Severity:** medium  ·  **Category:** touch-target
- **File:** `apps/web/app/(portal)/inbox/page.tsx` (line 392–461)
- **Problem:** Each message Card has a `View full message` button, which is clear. However, the unread mail icon (left side, ~16x16px) and the left border (border-l-4) are visual indicators but not interactive. Mobile users expect a swipe or tap on the row to mark as read. The current implementation only marks as read when opening the dialog. Secondary interaction (mark read without opening) is not readily available. Additionally, the button inside the Card is small (size='sm') with modest padding.
- **Fix:** Add an explicit 'Mark as read' action to the message row: either a small button/checkbox in the CardContent that doesn't open the dialog, or a tap-to-mark on the mail icon with a tooltip 'Mark as read'. Ensure the button or icon has at least 44x44px touch area (WCAG Level AAA).

### 79. Application detail page layout lacks responsive column fallback for narrow viewports

- **Severity:** medium  ·  **Category:** responsive
- **File:** `apps/web/app/(portal)/applications/[applicationId]/page.tsx` (line 546)
- **Problem:** The layout uses `grid gap-6 lg:grid-cols-3` with left side (lg:col-span-2 for steps) and right side (status/history sidebar). On 375–768px viewports, this defaults to a single column grid (no md: breakpoint), which is correct. However, the right-side sidebar (space-y-4) may not have responsive padding/spacing reduced on mobile, and the step timeline component may not have responsive text/spacing. No explicit `max-w-` constraint on timeline elements.
- **Fix:** Verify StepTimeline component (apps/web/components/shared/step-timeline.tsx) has responsive padding and text size. Test on 375–480px to ensure step titles, icons, and lines are readable and do not overflow. Add mobile-specific styling if needed (text-xs on mobile, text-sm on lg+).

### 80. Form validation error messages and 'needs info' highlights lack clear mobile hierarchy

- **Severity:** medium  ·  **Category:** forms
- **File:** `apps/web/app/(portal)/applications/[applicationId]/steps/[stepId]/page.tsx` (line 1440–1451)
- **Problem:** When a field has 'needs info' (revision request), it is styled with `border-2 border-warning/50 bg-warning/5 p-3 -m-3` (negative margin wrapping). The -m-3 technique creates a visual 'card' inside the form section. On mobile with tight spacing (p-4), this negative margin may cause the highlighted field to overflow the card or misalign. Error text below fields is `text-xs text-destructive`, which is very small on mobile.
- **Fix:** Test field highlighting and error messaging on 375px with actual revision request scenario. If misalignment occurs, adjust negative margin or padding logic for mobile (e.g., use `gap-3` instead of negative margins). Increase error text size to `text-sm` on mobile for better readability, or use an error icon + tooltip pattern.

### 81. Application list cards lack min-h constraint, risking misaligned grid on short-content cards

- **Severity:** low  ·  **Category:** consistency
- **File:** `apps/web/app/(portal)/dashboard/page.tsx` (line 416–491)
- **Problem:** Application cards in the grid (md:grid-cols-2 lg:grid-cols-3) do not have explicit `h-full` or `min-h-[X]` on the Card component. If one application has a short title and no deadline, the card may be significantly shorter than peers. On a 3-column desktop layout, this creates visual misalignment. Not a functional bug, but breaks visual hierarchy.
- **Fix:** Add `h-full` to each Card in the grid (line 418: `<Card className="group hover:shadow-soft-md transition-shadow duration-200 h-full">`), or ensure CardContent with flex-1 usage always expands to fill available space.

### 82. Ticket QR code page has max-w-md on desktop but no responsive fallback for extreme mobile

- **Severity:** low  ·  **Category:** responsive
- **File:** `apps/web/app/(portal)/applications/[applicationId]/ticket/page.tsx` (line 174)
- **Problem:** The ticket card is wrapped in `max-w-md mx-auto print:mx-0 print:max-w-none`. On 375px, this respects max-width correctly. However, the internal QR code (size=200) and card padding (p-6) leave ~75px per side on 375px, and the entire card design assumes portrait orientation. Landscape view on mobile may require additional responsive adjustments.
- **Fix:** Test ticket page on 375px landscape and 480px landscape to ensure QR code, attendee info, and buttons remain usable. Consider adding `size={160}` for mobile QR if the viewport is detected as <480px, or use CSS media query to adjust QR size. No immediate action required if landscape is not a priority.


## Auth, public, and home pages

### 83. Login form state hangs on profile API failure

- **Severity:** critical  ·  **Category:** logic-bug
- **File:** `apps/web/app/(auth)/login/page.tsx` (line 100-136)
- **Problem:** In the LoginForm's onSubmit handler, when the profile completion check fails with an error that is not a 401 (e.g., 500, network error), the catch block handles it silently but does not reset setIsLoading(false). The code then calls window.location.assign(targetPath) which may or may not succeed. If the redirect fails, the submit button remains in a loading state indefinitely, trapping the user. The try-catch around the profile API call (line 118-132) lacks a finally clause to guarantee state cleanup.
- **Fix:** Add a finally clause to reset setIsLoading(false) after the profile API call, or ensure the catch block always attempts a redirect or explicitly resets loading state before calling window.location.assign(). Example: wrap lines 118-132 in try-catch-finally with setIsLoading(false) in the finally block.

### 84. Framer-motion animations ignore prefers-reduced-motion

- **Severity:** high  ·  **Category:** accessibility
- **File:** `apps/web/app/(auth)/login/page.tsx` (line 139-142)
- **Problem:** The login form uses framer-motion (motion.div) with animate={{ opacity: 1, y: 0 }} transition but does not check the user's prefers-reduced-motion media query preference. This violates WCAG 2.1 Success Criterion 2.3.3 (Animation from Interactions). The same issue appears in signup, forgot-password, reset-password, and verify-email pages. Users with vestibular disorders or motion sensitivity will experience animations that could cause discomfort.
- **Fix:** Use framer-motion's ReducedMotion feature or implement a custom hook that checks prefers-reduced-motion and either disables animations or reduces their intensity. Alternatively, wrap motion components with a check: const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches; if (prefersReducedMotion) { return <div> instead of <motion.div>; }

### 85. Hard-coded error messages lack i18n

- **Severity:** medium  ·  **Category:** consistency
- **File:** `apps/web/app/(auth)/verify-email/page.tsx` (line 89, 100)
- **Problem:** Lines 89 and 100 contain hard-coded English strings: 'Enter your email address to receive a new verification email.' and 'If that email exists, a verification link will be sent. Check your inbox and spam folder.' These strings are not wrapped with the i18n t() function, unlike other parts of the codebase. This breaks internationalization support for non-English users and is inconsistent with the app's translation setup visible in other auth pages.
- **Fix:** Import useI18n from '@/lib/i18n' and wrap both error/info messages with t(). Example: const { t } = useI18n(); then use t('Enter your email address to receive a new verification link.').

### 86. Landing page navbar lacks mobile menu

- **Severity:** medium  ·  **Category:** responsive
- **File:** `apps/web/app/page.tsx` (line 76-96)
- **Problem:** The navbar on the landing page (app/page.tsx) displays three full-width buttons ('Browse Events', 'Sign in', 'Get started') on mobile without a hamburger menu or responsive collapsing. On viewports <640px, the buttons will either wrap awkwardly or cause horizontal scroll, degrading UX. The microsite navbar (components/microsite/layout/navbar.tsx) demonstrates a proper mobile menu pattern that should be replicated here.
- **Fix:** Add a mobile hamburger menu that toggles visibility of the button group on screens smaller than sm (640px). Use hidden md:flex on the button group and add a Menu button that shows on mobile with a dropdown. Reference the microsite navbar for the implementation pattern.

### 87. Touch target sizes below WCAG AAA minimum

- **Severity:** medium  ·  **Category:** touch-target
- **File:** `apps/web/components/ui/button.tsx` (line 24-26)
- **Problem:** Button size default is h-9 (36px) and size sm is h-8 (32px). WCAG AAA recommends 44x44px for touch targets. While the full-width submit buttons meet the 44px minimum in height when considering vertical padding, many buttons in the UI (header buttons, dismiss buttons, icon buttons) do not meet this guideline, potentially causing mobile users to misclick.
- **Fix:** Increase default button heights to h-11 (44px) for improved mobile touch targets. For icon-only buttons (size icon), increase from size-9 to size-11. Update the button size variants to prioritize 44x44px guideline compliance, especially on mobile. Use explicit lg: breakpoint scaling if desktop space is constrained.

### 88. Auth layout form container may have excessive padding on narrow mobile

- **Severity:** low  ·  **Category:** responsive
- **File:** `apps/web/app/(auth)/layout.tsx` (line 64)
- **Problem:** The auth layout applies p-6 (24px padding) on both left and right to the form container even on narrow viewports (375px). Combined with the max-w-[400px] form wrapper, this leaves minimal padding budget on phones, and the form itself approaches the screen edge. At 375px width minus 48px padding equals 327px available, which is tight for typical form content and error messages.
- **Fix:** Make the form padding responsive: use p-4 on mobile (sm:p-6) to preserve more horizontal space on narrow devices. Alternatively, adjust the max-w-[400px] to max-w-sm (24rem) and rely on the padding to center it naturally.

### 89. Login redirect logic could be clearer with explicit timeout handling

- **Severity:** low  ·  **Category:** logic-bug
- **File:** `apps/web/app/(auth)/login/page.tsx` (line 117-133)
- **Problem:** The login flow makes a profile API call to check profile completion, but there is no timeout or retry logic if the API is slow or hangs. The user sees a loading spinner indefinitely. Additionally, the code silently catches all non-401 errors in the profile check and proceeds to window.location.assign(targetPath), which could redirect to the dashboard even if the profile fetch failed for a transient reason (e.g., 503 Service Unavailable).
- **Fix:** Add a timeout to the profile API call (e.g., 5 seconds) and show a fallback error toast if it times out, allowing the user to retry or skip the profile check. Alternatively, log the error or differentiate between 4xx (user error) and 5xx (server error) when deciding whether to proceed with the redirect.

### 90. No password visibility toggle on auth forms

- **Severity:** low  ·  **Category:** improvement
- **File:** `apps/web/app/(auth)/login/page.tsx` (line 194-200)
- **Problem:** The password input fields (login, signup, reset-password) do not include a show/hide password toggle button. Users must rely on browser password manager hints or risk making typos they cannot verify. This is a usability improvement seen in many modern auth flows.
- **Fix:** Add an Eye/EyeOff icon button next to password inputs that toggles the input type between 'password' and 'text'. This is a low-effort accessibility and UX win. Example: use a state variable showPassword and conditionally render the icon button with an onClick handler.

### 91. Form error messages lack aria-live announcement

- **Severity:** low  ·  **Category:** accessibility
- **File:** `apps/web/app/(auth)/login/page.tsx` (line 152-206)
- **Problem:** When form validation fails on submit, the FormMessage component displays error text below each field. However, there is no aria-live region to announce these errors to screen reader users, so they may not be immediately aware that validation failed.
- **Fix:** Wrap the FormMessage component with aria-live='polite' aria-atomic='true', or add a summary message at the top of the form with aria-live='assertive' that announces validation failures. Ensure focus is moved to the first error field after validation failure.

### 92. Certificate viewer overlay controls may be hard to click on mobile

- **Severity:** low  ·  **Category:** responsive
- **File:** `apps/web/app/credentials/certificate/[certificateId]/page.tsx` (line 181-201)
- **Problem:** The sticky toolbar at the top of the certificate viewer has buttons that become flex-1 (full width) on mobile to accommodate responsive layout. However, on narrow screens, the 'Verify' and 'Open PDF' buttons may be difficult to target precisely due to their narrowness in a flexbox layout.
- **Fix:** Ensure buttons on mobile have adequate padding and consider stacking them vertically (flex-col) on very narrow viewports (<400px) to improve touch target usability. Or use size='sm' variant specifically on mobile buttons but ensure they meet 44px minimum height guidance.


## Microsite renderer & blocks (public-facing pages)

### 93. Markdown tables and code blocks break horizontal scroll without overflow wrapping

- **Severity:** high  ·  **Category:** horizontal-scroll
- **File:** `apps/web/components/microsite/markdown-text.tsx` (line 21-26)
- **Problem:** Tables and code blocks rendered from markdown (lines 22 & 24) have overflow-x-auto, but the containing MarkdownText component has no width constraints or word-break utilities. When a table or code block is rendered inside blocks without explicit overflow handling, the entire page can scroll horizontally. Example: '[&_pre]:overflow-x-auto' exists but '[&_pre]' blocks lack 'break-words' or 'word-break: break-word', and '[&_table]:w-full' has no max-width constraint or wrapping for long cells.
- **Fix:** Add 'word-break: break-word' and 'overflow-wrap: break-word' to code blocks and table cells in markdown-text.tsx. Wrap tables in a scrollable container with '-webkit-overflow-scrolling: touch' for momentum scrolling on iOS. Example: '[&_pre]:break-words [&_code]:break-all [&_table]:block [&_table]:overflow-x-auto [&_table]:max-w-full' to ensure tables collapse into single-column on mobile.

### 94. Partner strip block does not stack or scroll on mobile; uses hardcoded flex layout

- **Severity:** high  ·  **Category:** horizontal-scroll
- **File:** `apps/web/components/microsite/blocks/partner-strip-block.tsx` (line 75-118)
- **Problem:** PartnerStripBlock (lines 75–117) renders groups of logos in a 'flex w-full flex-col items-center justify-between space-y-4 md:flex-row' (line 75). On mobile, this becomes a column layout, which is safe, but each group has 'flex items-center space-x-6' with no overflow handling. If a single group has many logos, they will overflow. More critically, the mm-logo-shell items are fixed height ('h-[3.5rem]') with no responsive shrinking.
- **Fix:** Add 'overflow-x-auto' to the group logos container and apply 'flex-wrap' or use 'grid auto-cols-min' instead of flex for logo groups on small screens. Alternatively, make individual logo items 'min-w-0' and apply 'flex-shrink' so they scale down. On mobile, render as a scrollable horizontal carousel or single column.

### 95. Stats block grid collapses to 2 columns at all screen sizes; breaks at 375px and below

- **Severity:** high  ·  **Category:** responsive
- **File:** `apps/web/components/microsite/blocks/stats-block.tsx` (line 36-50)
- **Problem:** StatsBlock renders 'grid grid-cols-2 gap-y-10 gap-x-6 text-center md:grid-cols-4' (line 36). On very narrow screens (375px), 2 columns of stats with 'text-5xl' values and 'gap-x-6' can cause overflow. Additionally, large numbers (e.g., '99%') with gradient text-clip on narrow widths may cause text to wrap or overflow. No responsive breakpoint for mobile < 768px.
- **Fix:** Add 'sm:grid-cols-2' and 'grid-cols-1 sm:grid-cols-2 md:gap-x-3 lg:grid-cols-4' to ensure single column on very small screens. Reduce font size on mobile with 'text-3xl sm:text-4xl md:text-5xl'. Add 'line-clamp-1 break-words' to stat values and labels.

### 96. Timeline block left-side date badge does not wrap on mobile; forces horizontal scroll

- **Severity:** high  ·  **Category:** horizontal-scroll
- **File:** `apps/web/components/microsite/blocks/timeline-block.tsx` (line 39-60)
- **Problem:** TimelineBlock renders a layout: 'flex flex-col gap-3 md:flex-row md:items-baseline md:gap-8' (line 44) where the date badge is 'w-fit rounded-full border ... px-3 py-1 ... md:min-w-[7rem]' (line 45). On mobile, the date badge has no max-width and can overflow if the date is long (e.g., 'December 25, 2025'). The card to the right has no min-w-0, so it doesn't shrink.
- **Fix:** Add 'min-w-0 max-w-[6rem] truncate' to the date badge. On mobile, use 'text-xs' instead of default size. Ensure the right-side card has 'min-w-0' and 'overflow-hidden' to allow it to shrink. Use 'flex-wrap' on the flex container so the card can drop to the next line if needed on very narrow screens.

### 97. Tabs block pill row does not scroll on mobile; tab labels with long text break layout

- **Severity:** high  ·  **Category:** horizontal-scroll
- **File:** `apps/web/components/microsite/blocks/tabs-block.tsx` (line 31-54)
- **Problem:** TabsBlock renders 'inline-flex max-w-full overflow-x-auto' (line 33) for the tab list, but buttons have 'whitespace-nowrap' (line 44) with no min-w-0. If a tab label is long, the button will not shrink, and the pill container will overflow. The 'max-w-full' is CSS that applies, but mobile padding eats space, leaving little room for tabs.
- **Fix:** Ensure each tab button has 'min-w-fit px-4 py-2 text-sm sm:text-xs' on mobile. Add 'flex-shrink' and 'truncate' to long labels. Wrap the pill in 'rounded-full border overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden' with explicit padding on the pill flex container to account for mobile horizontal padding.

### 98. Sticky alert bar is fixed without padding-top on mobile; overlaps content below navbar

- **Severity:** high  ·  **Category:** responsive
- **File:** `apps/web/components/microsite/blocks/sticky-alert-bar-block.tsx` (line 107-113)
- **Problem:** StickyAlertBarBlock (non-preview) renders 'fixed inset-x-0 top-16 z-40 px-3 md:px-4' (line 108). The 'top-16' (4rem) matches navbar height, but the main content has 'pt-16' (line 68 in microsite-layout.tsx). With the alert bar fixed at 'top-16', the next section will be positioned behind it. On mobile, with navbar at 4rem and alert at 4rem, visible space is only ~8rem for any content below the alert, causing UX issues.
- **Fix:** Change 'top-16' to 'top-[calc(4rem+0px)]' and add a CSS variable that tracks navbar height. Alternatively, add 'pt-[4.5rem]' (or variable) to main content when alert is present. Apply 'sm:top-16' with mobile 'top-14' to reduce vertical displacement on small screens.

### 99. Countdown block grid for time units stacks incorrectly at 375px; typography too large

- **Severity:** medium  ·  **Category:** responsive
- **File:** `apps/web/components/microsite/blocks/countdown-block.tsx` (line 136-143)
- **Problem:** CountdownBlock renders 'grid gap-3 grid-cols-3' (no 'sm:' prefix) when showSeconds=false (line 136). At 375px width, 3 columns + gap-3 + padding can exceed the viewport. When showSeconds=true, it renders 'grid-cols-2 sm:grid-cols-4', which is correct, but typography is 'text-3xl md:text-4xl' (line 139) with no mobile override. Large text + narrow width = text wrapping and layout shift.
- **Fix:** Add responsive grid sizing: 'grid grid-cols-2 gap-2 sm:grid-cols-3 md:gap-3 lg:grid-cols-4' and 'text-xl sm:text-2xl md:text-3xl lg:text-4xl'. Reduce padding on mobile to 'px-3 py-6' instead of 'px-6 py-8'.

### 100. Card grid block with 4+ columns does not collapse properly on mobile

- **Severity:** medium  ·  **Category:** responsive
- **File:** `apps/web/components/microsite/blocks/card-grid-block.tsx` (line 27-57)
- **Problem:** CardGridBlock maps columns (1–4) to Tailwind classes (line 27–34). The logic returns 'lg:grid-cols-3' by default, but the base is 'grid grid-cols-1 gap-6 md:grid-cols-2' (line 57). If data.columns=4, it applies 'lg:grid-cols-4', which is safe. However, the gap-6 on mobile with card content can be excessive on 375px devices, causing padding to dominate and text to become unreadable.
- **Fix:** Add 'gap-3 sm:gap-4 md:gap-6' instead of fixed 'gap-6'. Ensure cards have 'min-w-0' and 'overflow-hidden' for text truncation. On cards with icons and long titles, use 'truncate' or 'line-clamp-2' for titles.

### 101. Grid block and team grid block do not apply min-w-0 to flex children; text doesn't shrink

- **Severity:** medium  ·  **Category:** horizontal-scroll
- **File:** `apps/web/components/microsite/blocks/grid-block.tsx` (line 42-62)
- **Problem:** GridBlock (line 42) and TeamGridBlock (line 95) use grid layouts, which are safe from flex overflow, but their MarkdownText children render inline content without min-w-0. If a title or description is very long and grid is 1 column on mobile, the text will overflow horizontally. Additionally, in TeamGridBlock, the role/team text (line 134) uses 'tracking-[0.16em]' (wide letter-spacing) which can push text off-screen on narrow devices.
- **Fix:** Add 'break-words' utility to MarkdownText wrapping in grid blocks. For team member names and roles, reduce 'tracking-[0.16em]' to 'tracking-[0.08em]' on mobile with 'sm:tracking-[0.16em]'. Add 'line-clamp-2' or 'truncate' to bio and location fields.

### 102. Logo cloud block does not constrain logo size on mobile; images can overflow

- **Severity:** medium  ·  **Category:** horizontal-scroll
- **File:** `apps/web/components/microsite/blocks/logo-cloud-block.tsx` (line 140-148)
- **Problem:** LogoCloudBlock renders logos with 'h-8 w-auto max-w-[10rem]' (line 146) and container 'gap-6 md:gap-10' (line 134). On mobile, if logos are wide (e.g., 10rem / 16px = 625px combined for 2 logos) plus gaps, they will exceed 375px width. The 'max-w-[10rem]' is fixed and doesn't scale down on small screens. Additionally, the viewport-relative scroll detection (lines 31–37) works, but the scrolling div itself isn't labeled for accessibility.
- **Fix:** Reduce 'max-w-[10rem]' to 'max-w-[7rem] sm:max-w-[9rem] md:max-w-[10rem]'. Change gap to 'gap-3 md:gap-6 lg:gap-10'. Add 'aria-label="Partners carousel"' to the viewport div. Ensure 'h-8' is 'h-6 sm:h-7 md:h-8' on mobile.

### 103. Partner strip labels and logos flex without responsive break at 375px

- **Severity:** medium  ·  **Category:** responsive
- **File:** `apps/web/components/microsite/blocks/partner-strip-block.tsx` (line 75-115)
- **Problem:** In PartnerStripBlock, the line 75 layout 'flex w-full flex-col items-center justify-between space-y-4 md:flex-row' looks correct, but when it's 'flex-row' on desktop, the individual groups have 'flex items-center space-x-6' with partner names on the left (line 82). On mobile, this still renders as a column, but the label text (line 82) can be quite long, pushing logos down. No truncation on label text.
- **Fix:** Add 'truncate' to the label (line 82) and reduce 'space-x-6' to 'space-x-3 sm:space-x-4 md:space-x-6'. On mobile, render label above logos in a column layout, not beside them.

### 104. Hero block image/frame on split layout does not shrink on mobile; text may not be readable

- **Severity:** medium  ·  **Category:** responsive
- **File:** `apps/web/components/microsite/blocks/hero-block.tsx` (line 243-249)
- **Problem:** HeroBlock split layout (line 246) uses 'lg:grid-cols-[1.08fr_0.92fr]' for text and image. Below 'lg' (768px), it's a single column, which is fine. However, the text has 'space-y-7' (line 251) which is excessive on mobile. The logo (line 271) is 'h-14 w-auto md:h-[4.5rem]' but no mobile override; similarly, main heading (line 281) has 'max-w-[18ch]' but no responsive sizing. On 375px, text will be cramped.
- **Fix:** Add mobile padding: 'px-4 py-6 sm:px-6 sm:py-8 md:px-10'. For text spacing, use 'space-y-4 sm:space-y-5 md:space-y-7'. Reduce heading max-width to 'max-w-[16ch] sm:max-w-[20ch]'. Add 'text-2xl sm:text-3xl md:text-5xl' to heading.

### 105. Agenda block session layout (md:grid-cols-[9rem_minmax(0,1fr)]) breaks at 375px; time badge too wide

- **Severity:** medium  ·  **Category:** responsive
- **File:** `apps/web/components/microsite/blocks/agenda-block.tsx` (line 115-126)
- **Problem:** AgendaBlock renders session time on the left with 'md:grid-cols-[9rem_minmax(0,1fr)]' (line 115). On mobile, this is a stacked column, which is correct. However, the time badge (line 117) has 'px-2.5 py-1' with 'text-xs' but may still be wide on mobile. The session description (line 128) below can be long and have no max-width constraint, pushing past viewport on narrow screens.
- **Fix:** Add 'max-w-full overflow-hidden' to the session description. For time badge, apply 'truncate' and reduce font. On mobile, use 'sm:grid-cols-[auto_minmax(0,1fr)]' to let the time badge size naturally but keep right column flexible.

### 106. Tracks overview and past problems blocks render long text without line-clamping or truncation

- **Severity:** medium  ·  **Category:** consistency
- **File:** `apps/web/components/microsite/blocks/tracks-overview-block.tsx` (line 90-115)
- **Problem:** TracksOverviewBlock renders track titles, focus, and audience with no truncation or line-clamping (lines 90–109). If a title or focus is very long, it will wrap excessively on mobile, pushing down the CTA button. Similarly, PastProblemsBlock (past-problems-block.tsx line 106–135) renders problem titles and tags with no wrapping constraints on mobile.
- **Fix:** Add 'line-clamp-2' to track titles and 'line-clamp-3' to focus/audience text. For past problems, add 'line-clamp-1' to problem titles and apply 'flex-wrap gap-2' to tag containers to prevent overflow.

### 107. Microsite layout navbar has no aria-label for mobile menu; mobile nav items may not be announcenable

- **Severity:** medium  ·  **Category:** accessibility
- **File:** `apps/web/components/microsite/layout/navbar.tsx` (line 448-454, 471-480)
- **Problem:** Navbar mobile menu button (line 450) has 'aria-label' and 'aria-expanded', which is good. However, the mobile menu panel (line 471) is missing a proper role/landmark. The menu button itself is missing focus visibility styles. Additionally, desktop dropdown menus (line 373) have no focus/keyboard navigation for non-mouse users.
- **Fix:** Add 'focus:ring-2 focus:ring-offset-2 focus:ring-[var(--mm-accent)]' to menu buttons. Ensure dropdown menus support arrow key navigation. Add ARIA live region or announce menu state changes.

### 108. Markdown image tag lacks responsive sizing; images can exceed container width

- **Severity:** medium  ·  **Category:** horizontal-scroll
- **File:** `apps/web/lib/markdown.ts` (line 103-109)
- **Problem:** buildImageTag (line 103) renders 'img class="mm-md-image"' with no width/height attributes or responsive classes. Images rendered from markdown in blocks will use their natural width, potentially exceeding the container. The markdown-text.tsx does apply some styling ('[&_img]...') but doesn't constrain width.
- **Fix:** Add 'max-w-full h-auto' class to img tag. In markdown-text.tsx, add '[&_img]:max-w-full [&_img]:h-auto [&_img]:block' to ensure images scale responsively.

### 109. BlockSection containerClassName can introduce infinite scroll due to unconstrained padding or margins

- **Severity:** low  ·  **Category:** consistency
- **File:** `apps/web/components/microsite/blocks/block-section.tsx` (line 75-205)
- **Problem:** BlockSection allows custom containerClassName to be passed (line 78), which could introduce arbitrary padding/margins that exceed viewport (e.g., 'p-20' on mobile). The WIDTH constant 'microsite-shell' applies margin-inline: auto and padding-inline, but if a block passes custom className with fixed padding, it could overflow.
- **Fix:** Add validation or a safelist for custom containerClassName. Document that custom widths/padding should be responsive. Provide utility preset classes (e.g., 'container-padded-mobile') that enforce safe values.

### 110. Text-image blocks do not apply min-w-0; long text or images on split layout break alignment

- **Severity:** low  ·  **Category:** responsive
- **File:** `apps/web/components/microsite/blocks/text-image-left-block.tsx` (line 1-50 (inferred from pattern))
- **Problem:** Text-image left/right blocks (referenced in block-renderer.tsx line 151–152) likely have a grid layout for split text + image. Without min-w-0 on the text column, long text will not shrink, and the grid may not responsive-collapse on mobile.
- **Fix:** Verify text-image blocks apply 'min-w-0' to text container and 'max-w-full' to image. On mobile, render as stacked column with 'grid-cols-1 md:grid-cols-2'.

### 111. Image stack block caption text has no max-width; can overflow container on mobile

- **Severity:** low  ·  **Category:** responsive
- **File:** `apps/web/components/microsite/blocks/image-stack-block.tsx` (line 79-83)
- **Problem:** ImageStackBlock renders caption (line 80) as 'mx-auto max-w-3xl text-center text-[var(--mm-text-muted)]' but the 'max-w-3xl' is 48rem, which far exceeds 375px. The text will wrap, but the container width should be constrained to the microsite-shell width on mobile.
- **Fix:** Change 'max-w-3xl' to 'max-w-[90%] sm:max-w-2xl md:max-w-3xl' or apply 'w-full' with padding constraints. Ensure padding is 'px-4 sm:px-6'.


## Dynamic Forms (FormRenderer, FileUpload, Validation)

### 112. Missing aria-labelledby on multiselect checkbox group

- **Severity:** high  ·  **Category:** accessibility
- **File:** `apps/web/components/forms/FormRenderer.tsx` (line 219-250)
- **Problem:** The multiselect checkbox group (role='group') uses aria-describedby for help text but lacks aria-labelledby to associate the group with the field label. Screen readers won't announce the group's purpose. The Label is rendered separately above the group (line 135-142) but has no connection to the group element.
- **Fix:** Add aria-labelledby={fieldKey} to the group element and link it to the Label's id. Change Label on line 135 to include id={fieldKey}, then add aria-labelledby={fieldKey} to the div with role='group' on line 220.

### 113. File upload remove button lacks accessible label and is too small (touch target)

- **Severity:** high  ·  **Category:** touch-target
- **File:** `apps/web/components/forms/FileUpload.tsx` (line 256-269)
- **Problem:** The 'Remove' button uses className='text-destructive hover:text-destructive/80 text-xs underline underline-offset-2' with no aria-label, no padding, and relies on text alone. Text-only buttons styled as links are unreliable for mobile (< 44px touch target). Screen readers will announce it as a generic button, not 'Remove file'. The small text size (text-xs) makes it hard to tap on mobile.
- **Fix:** Convert to a proper Button with size='icon', add aria-label={`Remove ${file.originalFilename}`}, and increase padding/height. Example: <Button variant='ghost' size='icon' aria-label={`Remove ${file.originalFilename}`} onClick={() => {...}}><Trash2 className='h-4 w-4 text-destructive' /></Button>. This ensures 44px+ height and clear intent.

### 114. File input element has no accessible label or legend

- **Severity:** medium  ·  **Category:** accessibility
- **File:** `apps/web/components/forms/FileUpload.tsx` (line 278-285)
- **Problem:** The file input (<input type='file'>) on line 278 has no associated <label> or aria-label. Screen readers announce it as 'button input file' with no context about what files are expected. The constraints are shown in a paragraph below (text-xs) but not associated with the input.
- **Fix:** Wrap the input in a <label> or add aria-label={`Upload file: ${constraints}`} where constraints is a clear string like 'Max 50 MB, up to 3 files'. Better: add an aria-describedby pointing to a help paragraph with an explicit id.

### 115. Multiselect error message not associated with checkbox group

- **Severity:** medium  ·  **Category:** accessibility
- **File:** `apps/web/components/forms/FormRenderer.tsx` (line 195-252)
- **Problem:** The error is shown on line 378-386 but the multiselect group (line 219) has aria-describedby for help text only, not the error. When validation fails, screen readers and AT won't announce the error in context. The group role='group' + aria-describedby works for help text but error is rendered far below the group.
- **Fix:** Add errorId to describedBy chain: const describedBy = [descId, errorId].filter(Boolean).join(' ') || undefined (already done for other fields). Ensure error <p> is rendered immediately after the group, not after the block.

### 116. Checkbox field description placement broken for inline controls

- **Severity:** medium  ·  **Category:** accessibility
- **File:** `apps/web/components/forms/FormRenderer.tsx` (line 286-296)
- **Problem:** For CHECKBOX fields, the description is rendered inside the label grid (lines 286-296) below the label text. This works visually but the description div has id={descId} which is included in aria-describedby on line 268. However, the description is deeply nested inside a Label component, making the association unclear and fragile if the structure changes.
- **Fix:** Keep the visual placement but ensure the description div is a direct child of the container, not nested in Label. Move it outside: render the checkbox+label grid, then render description separately with aria-describedby.

### 117. File upload error state does not clear after successful upload

- **Severity:** medium  ·  **Category:** forms
- **File:** `apps/web/components/forms/FileUpload.tsx` (line 141-154, 227)
- **Problem:** When validation fails (e.g., file too large), setError() stores the message. On successful retry, line 224-226 only sets error if validationMessages.length > 0, but if the retry succeeds with no leftover messages, the old error persists visually. The error state should always be cleared on successful upload completion.
- **Fix:** Change line 152-154 to: setError(null); if (validationMessages.length > 0) { setError(summarizeMessages(validationMessages)); }. Then remove the conditional reset on line 224-226 and unconditionally clear: setError(null) after onChange() succeeds.

### 118. Validation error for custom pattern missing fallback message

- **Severity:** medium  ·  **Category:** forms
- **File:** `packages/schemas/src/validation.ts` (line 240-252)
- **Problem:** When a TEXT field has a pattern and validation fails, the error is rules.customMessage || 'Invalid format' (line 247). If customMessage is not set, users see generic 'Invalid format' which doesn't explain what pattern is expected. Developers might forget to set customMessage, leaving users confused.
- **Fix:** Change line 247 to include the pattern: rules.customMessage || `Format: ${rules.pattern}`. Or better: rules.customMessage || `Please match the required format`. Document in FormDefinition schema that customMessage should always be set for pattern fields.

### 119. Form values silently truncate non-JSON-serializable objects

- **Severity:** medium  ·  **Category:** logic-bug
- **File:** `apps/web/lib/render-answer-value.tsx` (line 129-132)
- **Problem:** When rendering form answers, if a value is a record that isn't a file reference and isn't a fileLike URL, it's JSON.stringify'd with no error handling (line 131). If the object contains circular refs, functions, or Symbols, JSON.stringify will silently omit them, and users see incomplete data. This can hide bugs in form serialization.
- **Fix:** Wrap in try-catch: try { return <pre>...JSON.stringify(...)</pre> } catch (err) { return <div className='text-destructive'>Error rendering value: {err.message}</div> }. Also log to console so developers see the issue.

### 120. FileAnswerLinks remove button has no aria-label

- **Severity:** medium  ·  **Category:** accessibility
- **File:** `apps/web/components/files/FileAnswerLinks.tsx` (line 124-162)
- **Problem:** The 'View file' and 'Download file' buttons have text content but are styled as links (underline, small text). On mobile and with zoom, they're hard to tap and have no fallback aria-labels. Screen readers will announce them generically.
- **Fix:** Add aria-label to each button: aria-label={`View ${displayName}`} and aria-label={`Download ${displayName}`}. These are view/download actions on a specific file, so context matters.

### 121. FileUpload progress bar hidden but no loading skeleton provided

- **Severity:** low  ·  **Category:** loading-empty-state
- **File:** `apps/web/components/forms/FileUpload.tsx` (line 302)
- **Problem:** When uploading=true, only a text line 'Uploading... {progress}%' is shown (line 302). The file input and remove buttons remain visible but disabled (line 280). On mobile with slow networks, users see disabled UI + small text progress but no clear visual feedback (no progress bar, no animated spinner in the upload area).
- **Fix:** Add a progress bar or skeleton during upload: use <progress> element or <div> with animated background. Example: {uploading && <div className='h-2 bg-muted rounded-full overflow-hidden'><div style={{width: `${progress}%`}} className='h-full bg-primary transition-all' /></div>}. Also show a loading spinner next to the text.

### 122. Form error display does not clear old errors when field value changes

- **Severity:** low  ·  **Category:** forms
- **File:** `apps/web/components/forms/FormRenderer.tsx` (line 71-78)
- **Problem:** The form is created with mode='onChange' when liveValidation=true (line 76). However, react-hook-form's reValidateMode is set to 'onChange' even for onSubmit mode (line 77), meaning errors persist until the field is touched again. This is correct but the error UI shows via 'error && <p>' which relies on the error object, which may not clear immediately if validation is async.
- **Fix:** Confirm behavior by testing live validation with a required field: unset it and re-set it. If errors don't clear in real-time, ensure useWatch() triggers re-render (it does on line 80) and errors object updates synchronously.

### 123. Checkbox validation error placement inconsistent

- **Severity:** low  ·  **Category:** consistency
- **File:** `apps/web/components/forms/FormRenderer.tsx` (line 253-300)
- **Problem:** For CHECKBOX fields, the error is rendered after the grid (inside the key div) but it's located after the label+description block. For other field types, error is consistently placed after the input. For consistency, checkbox error should be placed after the checkbox+label grid, not nested inside the label grid.
- **Fix:** Move the error rendering outside the Controller on line 300, after the checkbox div closes, so error is at the same nesting level as other field types. This improves consistency and makes error association clearer.

### 124. FILE_UPLOAD field does not use aria-label on Controller

- **Severity:** low  ·  **Category:** accessibility
- **File:** `apps/web/components/forms/FormRenderer.tsx` (line 301-364)
- **Problem:** The FILE_UPLOAD field renders a FileUpload component but doesn't pass aria-label or aria-describedby. FileUpload itself has no aria-label on its main container. This means the entire file upload widget has no accessible name or description from the form field's perspective.
- **Fix:** Pass aria-labelledby and aria-describedby to FileUpload, or add an aria-label prop to FileUpload and pass the field label there. Example: <FileUpload ... aria-label={field.label} />


## Certificate Template Studio and Rendering

### 125. Certificate render surface not responsive to viewport width; may cause horizontal scroll on mobile

- **Severity:** high  ·  **Category:** responsive
- **File:** `apps/web/components/certificates/certificate-artboard.tsx` (line 168-186)
- **Problem:** The CertificateArtboard component renders with fixed width and height from layout.canvas properties (typically 800x600px or similar). On mobile viewports (375px-768px), if the certificate is wider than the screen, it will overflow and cause horizontal scroll. The component has no max-width constraint, scaling strategy, or responsive wrapper. The render-surface (certificate-render-surface.tsx line 82) centers it in a p-0 container, leaving no padding buffer for small screens.
- **Fix:** Add max-width: 100vw constraint to the artboard root div, or wrap CertificateArtboard in a responsive container that applies max-width: min(100vw, layout.canvas.width) and scales down via transform-origin: top center on mobile. Consider adding responsive padding via CSS media queries: @media (max-width: 768px) { padding: max(8px, 5vw); } on the main element in certificate-render-surface.tsx.

### 126. Certificate render surface does not scale/fit artboard to mobile viewport; large certificates may require pinch-zoom or horizontal scroll

- **Severity:** high  ·  **Category:** responsive
- **File:** `apps/web/components/certificates/certificate-render-surface.tsx` (line 81-85)
- **Problem:** The render surface (public preview page for issued certificates) centers the CertificateArtboard without any scaling or max-width constraint. If a certificate is 800x600px and the mobile viewport is 375px, the artboard overflows horizontally. The component assumes users will pinch-zoom on mobile, but this is not ideal UX for a certificate preview.
- **Fix:** Wrap CertificateArtboard in a container with responsive scaling: <div className="flex items-center justify-center w-full max-h-screen overflow-auto"><div style={{ maxWidth: '100vw', transform: 'scale(min(1, (100vw - 32px) / artboardWidth))' }}><CertificateArtboard ... /></div></div>. Or use a CSS approach: @media (max-width: 768px) { scale: min(1, calc((100vw - 32px) / 800px)); }. This allows certificates to shrink to fit the viewport while remaining readable.

### 127. Certificate operations workspace uses tables without horizontal scroll container on mobile

- **Severity:** high  ·  **Category:** horizontal-scroll
- **File:** `apps/web/app/(staff)/staff/[eventId]/certificates/operations/workspace.tsx` (line 1-150+ (partial read))
- **Problem:** The operations workspace (certificate issuance and history) uses shadcn Table components (line 33-39). If the table has many columns (e.g., certificate ID, recipient, status, actions), it may overflow horizontally on mobile. The Table component may not have an overflow-x-auto wrapper. Need to verify full implementation of table rendering.
- **Fix:** Wrap <Table> in <div className="overflow-x-auto"> or use a responsive table component that stacks columns on mobile. Ensure all mobile displays have touch-friendly buttons and proper spacing.

### 128. Editor canvas toolbar (TopCommandBar) grid layout stacks poorly on tablets; xl: breakpoint is 1280px

- **Severity:** medium  ·  **Category:** responsive
- **File:** `apps/web/app/(staff)/staff/[eventId]/certificates/studio/top-command-bar.tsx` (line 124)
- **Problem:** The toolbar uses xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.2fr)_minmax(0,1fr)] which only applies at 1280px+. Below 1280px, it stacks into a single column, making long toolbars difficult to use on 768px tablets. The 5-column design (Insert, Selection, Arrange, Canvas, Publish) wraps each group into a ToolbarGroup with flex-wrap items-center, but below xl the entire grid wraps vertically, consuming excessive vertical space and pushing the canvas down.
- **Fix:** Add intermediate breakpoint(s): use md:grid-cols-2 or lg:grid-cols-3 before the xl:grid-cols-5. Alternatively, collapse non-essential groups (like Canvas visibility toggles) into a single dropdown menu on screens < 1024px. Example: 'md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'.

### 129. Editor canvas height uses h-[74vh] without mobile-safe fallback; may cause layout issues on small screens

- **Severity:** medium  ·  **Category:** responsive
- **File:** `apps/web/app/(staff)/staff/[eventId]/certificates/studio/editor-canvas.tsx` (line 570)
- **Problem:** The EditorCanvas container uses className="relative h-[74vh] overflow-auto rounded-xl border bg-muted/20" style={{ minHeight: 420 }}. On devices with small viewport heights (like landscape mobile or short windows), 74vh minus toolbar/rail heights may be insufficient, and the minHeight: 420 may not help if the flex parent doesn't have room. On lg:hidden, the studio alerts users that editing is desktop-first, but it doesn't gracefully degrade the canvas size.
- **Fix:** Add responsive height classes: 'h-[50vh] sm:h-[60vh] lg:h-[74vh]' or use 'min-h-[300px] sm:min-h-[400px]' instead of fixed minHeight. Ensure the canvas container respects parent flex layout (consider adding flex-1 to allow flex siblings to compute height).

### 130. Workspace grid layout uses only xl: breakpoint; no fallback for tablet (md/lg) layouts

- **Severity:** medium  ·  **Category:** responsive
- **File:** `apps/web/app/(staff)/staff/[eventId]/certificates/studio/workspace.tsx` (line 144-155)
- **Problem:** The workspaceGridClass uses 'grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)_360px]' as the default 3-column layout, with no intermediate tablet layouts (md/lg). On tablets (768px-1024px), the sidebar (340px) + canvas (1fr) + inspector (360px) = 700px fixed minimum, forcing either horizontal scroll or stack. Below 1280px, the grid becomes a single-column stack, which is correct but could be improved with 2-column layouts at md/lg breakpoints.
- **Fix:** Add intermediate breakpoints: 'md:grid-cols-2 lg:grid-cols-[340px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)_360px]' (hide inspector below lg, hide sidebar below md). Use conditional collapse state from workspace: apply different grids based on screen size and rail/inspector collapse state.

### 131. Inspector panel uses min-w-[340px] max-w-[360px] which can cause horizontal scroll on narrow tablets

- **Severity:** medium  ·  **Category:** responsive
- **File:** `apps/web/app/(staff)/staff/[eventId]/certificates/studio/inspector-panel.tsx` (line 171)
- **Problem:** The aside has min-w-[340px] max-w-[360px], which means it always occupies at least 340px. On a 768px tablet with the sidebar (340px) + canvas (1fr) + inspector (340px), the total is 680px before gaps/borders. With gap-4 (1rem × 2 = 2rem = 32px), total needed is 712px, leaving only 56px for the canvas on a 768px screen, causing horizontal scroll.
- **Fix:** Make inspector responsive: 'w-full sm:min-w-[280px] md:min-w-[320px] lg:min-w-[340px]' or 'min-w-0 lg:min-w-[340px]'. Allow inspector to shrink below 340px on mobile/tablet by removing/reducing min-w constraint at small breakpoints. Pair with workspace grid change to hide inspector below lg.

### 132. Left rail uses min-w-0 but also uses min-w-[320px] at xl; can cause scroll below xl

- **Severity:** medium  ·  **Category:** responsive
- **File:** `apps/web/app/(staff)/staff/[eventId]/certificates/studio/left-rail.tsx` (line 192)
- **Problem:** The LeftRail aside: 'flex min-h-[72vh] w-full min-w-0 flex-col overflow-hidden rounded-xl border bg-card/60 xl:min-w-[320px] xl:max-w-[360px]'. The min-w-0 allows flex shrinking, but xl:min-w-[320px] forces 320px below xl breakpoint as min-w-0 for the grid. This works with the grid layout, but if the grid is ever used below xl without responsiveness, the sidebar will not shrink.
- **Fix:** Already good (min-w-0 is present), but confirm workspace grid respects this. If sidebar is hidden on sm/md via workspace grid logic, no change needed. Otherwise, consider 'md:min-w-0 lg:min-w-[300px]' to allow more shrinking on tablets.

### 133. QR code token fallback chain may display placeholder if no token configured and no fallback URLs present

- **Severity:** medium  ·  **Category:** logic-bug
- **File:** `apps/web/components/certificates/certificate-artboard.tsx` (line 310-317)
- **Problem:** The QR element resolves tokenKey, then falls back to qrVerificationUrl, verificationUrl, verifiableCredentialUrl, certificateUrl, and finally ' ' (space). If none are set (e.g., template not yet published or token misconfigured), the QR renders with qrValue=' ', generating a QR code for a single space character. This is not an error, but it's not clear to the user that the QR is invalid. In the studio preview (editor-canvas.tsx line 73-76), the QR fallback works the same way.
- **Fix:** Add validation: if qrValue is empty or whitespace-only, display a placeholder text (e.g., 'QR code unavailable') instead of rendering a degenerate QR code. In the artboard, check: const qrValue = ... || ' '; if (!qrValue.trim()) return <div>QR code placeholder</div>;. In the studio preview, add a preview helper showing which token was used.

### 134. Certificate render surface loading/error skeletons use p-8 padding; very tight on mobile

- **Severity:** low  ·  **Category:** responsive
- **File:** `apps/web/components/certificates/certificate-render-surface.tsx` (line 67, 75)
- **Problem:** The loading (line 67) and error (line 75) states render with p-8 (2rem padding), which is appropriate for desktop but leaves only ~100px horizontal space on a 375px mobile screen. The skeleton (h-16 w-16 animate-pulse) and error text (p-8) center fine, but the padding is excessive on narrow viewports.
- **Fix:** Use responsive padding: 'p-4 sm:p-6 md:p-8' or use 'px-4 py-8 sm:px-8' (horizontal padding responsive, vertical fixed). The successful render path (line 82) already uses p-0, so only the loading/error states need adjustment.

### 135. TopCommandBar ToolbarGroup wraps with flex-wrap; on small screens, buttons wrap and create jagged layout

- **Severity:** low  ·  **Category:** responsive
- **File:** `apps/web/app/(staff)/staff/[eventId]/certificates/studio/top-command-bar.tsx` (line 76-87)
- **Problem:** ToolbarGroup uses 'flex flex-wrap items-center gap-1.5' which wraps buttons when they don't fit. On mobile (single column grid), each group stacks full-width and buttons wrap within, creating visual inconsistency and reduced touch target sizes if buttons get squeezed.
- **Fix:** Add responsive button sizes: use size="xs" below md, size="sm" at md+. Or use flex-nowrap and allow horizontal scroll within groups on small screens with 'overflow-x-auto' wrapper, though this is less ideal. Better: pair with grid breakpoint fix (md:grid-cols-2) to reduce vertical stacking.

### 136. Certificate artboard in studio canvas has no touch-friendly interaction hints; Konva touch events may be unclear

- **Severity:** low  ·  **Category:** touch-target
- **File:** `apps/web/app/(staff)/staff/[eventId]/certificates/studio/editor-canvas.tsx` (line 668-673)
- **Problem:** The Group element has onMouseDown for desktop and onTap for touch, which is correct. However, there's no visual indicator (e.g., cursor: pointer, hover highlight) or accessibility label. Touch users on tablets may not know elements are draggable. The Transformer handles resize, but anchors are 8px (small for touch). No aria-labels on canvas elements.
- **Fix:** Add cursor: pointer to draggable groups via style or Konva config. Consider increasing transformer anchorSize to 10-12px on touch devices via media query. Add role="application" aria-label="Certificate template canvas editor, drag elements to move, resize using corners" to the Stage.

### 137. Signature slot deletion disabled when 'availableSlotKeys.length <= 1' but error handling is unclear

- **Severity:** low  ·  **Category:** consistency
- **File:** `apps/web/app/(staff)/staff/[eventId]/certificates/studio/inspector-panel.tsx` (line 730)
- **Problem:** Inspector panel disables slot deletion when only one slot remains (line 730: disabled={!canManage || availableSlotKeys.length <= 1}). However, there's no tooltip or error message explaining why deletion is disabled. If a user has 1 signature slot and tries to delete a signature element, they may not understand why they can't remove the slot.
- **Fix:** Add a Tooltip or <span title="...">(minimum 1 signature slot required)</span> around the delete button. Alternatively, display a helper text below the slots list: 'At least one signature slot is required.' if length <= 1.

### 138. Signature slot without assetKey renders label text; no visual distinction from an empty image placeholder

- **Severity:** low  ·  **Category:** consistency
- **File:** `apps/web/components/certificates/certificate-artboard.tsx` (line 253-306)
- **Problem:** When a signature element has a signatureSlot but no assetKey, the artboard renders slot.label (or 'Signature') in a centered flex div with padding and gray text. This looks reasonable but differs from an image placeholder (gray text 'Image') and may confuse users about whether a signature was actually added. In the studio editor-canvas (line 723-734), signature elements without assetKey render the same label, which is consistent.
- **Fix:** No change needed; behavior is consistent between studio and render. However, consider adding a visual badge or icon (e.g., '✎ [Signer Name]') to distinguish signature placeholders from image placeholders in the render surface.

### 139. Draft autosave conflict resolution reloads draft but doesn't preserve unsaved canvas zoom or scroll position

- **Severity:** low  ·  **Category:** workflow
- **File:** `apps/web/app/(staff)/staff/[eventId]/certificates/studio/workspace.tsx` (line 276-344)
- **Problem:** When a draft conflict occurs (409 status from updateCertificateTemplateDraft), the user must click 'Reload draft' (line 912-914). This resets the layout to the saved version via loadTemplateEditorState (line 796), which restores zoomPercent from localStorage (line 189-195). However, if the user had unsaved zoom changes (changed zoom but hadn't saved), clicking reload loses that zoom. The canvas scroll position is restored via localStorage (editor-canvas.tsx line 357-366), so that's preserved.
- **Fix:** Store zoomPercent in memory before reload and restore it after loadTemplateEditorState completes, so unsaved zoom changes aren't lost. Or add a prompt: 'Draft conflict detected. Keep your unsaved zoom and layout changes, or reload from server?' (similar to how browser unsaved-work detection works).

### 140. Editor canvas drag-and-drop snap guides are orange (#f97316) and may have low contrast on some backgrounds

- **Severity:** low  ·  **Category:** accessibility
- **File:** `apps/web/app/(staff)/staff/[eventId]/certificates/studio/editor-canvas.tsx` (line 784-802)
- **Problem:** The snap guides (when enabled) render with stroke="#f97316" (orange). On a light canvas or when the certificate background is orange, the guides may have low contrast. Additionally, there's no animation or visual feedback (e.g., color change) when a snap is triggered; users may not notice the guides are helping.
- **Fix:** Ensure snap guide color has sufficient contrast with typical backgrounds. Consider using a high-contrast color (e.g., #ff0000 red) or allowing customization in settings. Add a tooltip or status message (e.g., in the top bar) showing 'Snapped: X pixels' when snapping occurs.

### 141. Undo/redo keyboard shortcuts (Cmd/Ctrl+Z) not documented in UI; users may not discover them

- **Severity:** low  ·  **Category:** consistency
- **File:** `apps/web/app/(staff)/staff/[eventId]/certificates/studio/workspace.tsx` (line 800-868)
- **Problem:** The workspace listens for Cmd/Ctrl+Z (undo) and Cmd/Ctrl+Shift+Z or Cmd/Ctrl+Y (redo) at line 808-821, which is good. However, the TopCommandBar undo/redo buttons (line 149-154) don't have tooltips indicating the keyboard shortcut. Users may not discover they can undo without clicking the button.
- **Fix:** Add title or aria-label to undo/redo buttons: <Button title="Undo (Cmd+Z)">. Or use a Tooltip component: <Tooltip content="Undo (Cmd+Z)"><Button>...</Button></Tooltip>.

### 142. Inspector panel sections (Accordion) may expand awkwardly on mobile due to small viewport and many nested inputs

- **Severity:** low  ·  **Category:** responsive
- **File:** `apps/web/app/(staff)/staff/[eventId]/certificates/studio/inspector-panel.tsx` (line 186)
- **Problem:** The inspector uses an Accordion with multiple sections (Selection, Content, Geometry, etc.). On mobile/tablet, expanding a section (e.g., 'Content & typography' with font size, line height, color inputs) may cause the panel to overflow vertically, requiring excessive scrolling. The ScrollArea helps, but narrow widths (below lg) may make inputs cramped.
- **Fix:** Consider collapsing inspector into a modal or drawer on mobile (md:hidden lg:block), then show a floating action button or slide-out panel. Or use responsive input sizes: size="sm" on mobile, size="md" on desktop. No immediate change needed if the ScrollArea is working correctly.


## Shared components & cross-page UI consistency

### 143. AudienceBuilder missing responsive grid breakpoints

- **Severity:** high  ·  **Category:** responsive
- **File:** `apps/web/components/shared/audience-builder.tsx` (line 211, 248, 324)
- **Problem:** The AudienceBuilder component uses 'grid-cols-2' on lines 211, 248, and 324 without responsive breakpoints. On mobile devices (< 375px), these 2-column grids will either cause text truncation or horizontal scroll. Line 211 (Decision status checkboxes), line 248 (Step status checkboxes), and line 324 (Demographics age inputs) all suffer from this issue.
- **Fix:** Add responsive breakpoints: Change 'grid-cols-2' to 'grid-cols-1 sm:grid-cols-2' on all three instances. This ensures single-column layout on mobile (< 640px) and 2-column on larger screens. Line 211 example: className='grid grid-cols-1 sm:grid-cols-2 gap-2'

### 144. QR Scanner camera toggle button lacks aria-label

- **Severity:** medium  ·  **Category:** accessibility
- **File:** `apps/web/components/shared/qr-scanner.tsx` (line 228)
- **Problem:** The camera toggle button (line 223-232) is icon-only (SwitchCamera icon) with only a 'title' attribute for accessibility. Screen readers will not announce the button's purpose. The button has title='Switch between front and back camera' but no aria-label.
- **Fix:** Add aria-label attribute: <Button ... title='Switch between front and back camera' aria-label='Switch camera (front/back)'> to ensure screen reader users understand the button function.

### 145. Select dropdowns with fixed pixel widths may cause horizontal scroll on mobile

- **Severity:** medium  ·  **Category:** responsive
- **File:** `apps/web/app/(staff)/staff/[eventId]/applications/page.tsx` (line 1451, 1752, 3365)
- **Problem:** Three SelectTrigger elements use fixed pixel widths (w-[220px], w-[210px], w-[240px]) in filter dropdowns. On narrow mobile viewports (375px), these fixed widths consume significant screen real estate and may force horizontal scroll depending on parent container constraints and sidebar width.
- **Fix:** Use responsive width utilities: Replace w-[220px] with w-full sm:w-[220px] or similar, allowing full width on mobile. Alternatively, use max-w-[220px] which allows shrinking below that width. Verify the filter UI parent container (likely inside a drawer/sidebar) has proper flex or width constraints on mobile.

### 146. Consistent use of design tokens and semantic colors throughout

- **Severity:** low  ·  **Category:** consistency
- **File:** `apps/web/app/globals.css, apps/web/components/shared/*.tsx, multiple app pages` (line 1-316 (globals.css), throughout usage)
- **Problem:** Positive finding: StatusBadge is consistently used across applications list, decision displays, and step timelines instead of ad-hoc badge styling. Design tokens (--success, --warning, --info, --destructive) are properly applied via semantic color utilities (text-success, bg-success/10, etc.) in icon styling and status displays. No major ad-hoc color/spacing violations detected.
- **Fix:** Continue enforcing StatusBadge usage for all status displays. No action needed - this is correctly implemented.

### 147. Loading and empty states properly implemented across major pages

- **Severity:** low  ·  **Category:** loading-empty-state
- **File:** `apps/web/app/(portal)/inbox/page.tsx, apps/web/app/(portal)/dashboard/page.tsx, apps/web/app/(staff)/staff/[eventId]/checkin/page.tsx, others` (line 369-384 (inbox), 624-635 (checkin), 78-106 (dashboard))
- **Problem:** Positive finding: Pages consistently implement loading skeletons (CardSkeleton, TableSkeleton, PageSkeleton) and EmptyState components. Inbox page shows proper ternary: isLoading ? <CardSkeleton> : filtered.length === 0 ? <EmptyState> : <content>. Check-in page displays loading state before permissions check. Dashboard uses CardSkeleton for async data.
- **Fix:** Continue following this pattern. All data-loading pages should implement this triple-state (loading, empty, content) flow.

### 148. ConfirmDialog properly used for destructive actions

- **Severity:** low  ·  **Category:** workflow
- **File:** `apps/web/app/(admin)/admin/events/page.tsx, apps/web/app/(staff)/staff/[eventId]/applications/page.tsx` (line 680-696 (events), 4596-4620 (applications))
- **Problem:** Positive finding: Destructive operations (delete event, delete/archive events, delete applications, bulk delete) all properly use ConfirmDialog with variant='destructive'. Dialogs include clear descriptions of consequences and use 'Delete' or 'Archive' labels. Events page shows two destructive dialogs properly: archive (line 680) and hard-delete (line 686).
- **Fix:** No action needed. Continue enforcing ConfirmDialog for all destructive operations.

### 149. PageHeader responsive layout has potential button overflow on mobile

- **Severity:** low  ·  **Category:** responsive
- **File:** `apps/web/components/shared/page-header.tsx` (line 50)
- **Problem:** PageHeader actions container (line 50) uses 'flex flex-wrap gap-2 sm:flex-nowrap'. While flex-wrap allows wrapping on mobile, if multiple action buttons are rendered (3+), they may wrap into multiple lines and create awkward layout. The sm:flex-nowrap forces single row on tablets+, which could overflow if sidebar is narrow.
- **Fix:** Consider using 'flex flex-wrap' without the sm:flex-nowrap for more adaptive behavior, OR ensure PageHeader max actions = 2. Test with 3+ buttons at 375px viewport to verify acceptable wrapping behavior.

### 150. EmptyState and ErrorBoundary properly configured

- **Severity:** low  ·  **Category:** consistency
- **File:** `apps/web/components/shared/empty-state.tsx, apps/web/components/shared/error-boundary.tsx` (line 48-100 (empty), 28-50 (error-boundary))
- **Problem:** Positive finding: EmptyState component supports tone variants (empty, error, maintenance) with appropriate icons and colors (FileQuestion/muted for empty, AlertTriangle/destructive for error, Wrench/warning for maintenance). ErrorBoundary uses EmptyState(tone='error') as fallback with RefreshCw recovery button. Both integrate successfully with design token system.
- **Fix:** No action needed. Both components are well-designed.

### 151. Form validation and error display follows accessibility best practices

- **Severity:** low  ·  **Category:** accessibility
- **File:** `apps/web/components/ui/form.tsx` (line 100, 108-122, 138-156)
- **Problem:** Positive finding: Form components properly implement aria-invalid, aria-describedby, and explicit FormMessage components. FormLabel shows error color (text-destructive) when error exists. Input component has aria-invalid styling with ring-destructive.
- **Fix:** No action needed. Form validation UX is correct.

### 152. StatusBadge supports complex multi-step workflow status mapping

- **Severity:** low  ·  **Category:** consistency
- **File:** `apps/web/components/shared/status-badge.tsx` (line 23-138)
- **Problem:** Positive finding: StatusBadge includes comprehensive resolveStatus() function that normalizes complex API status strings (e.g., 'waiting_for_review_step_2' -> 'submitted'/'In Review', 'decision_accepted_draft' -> 'accepted'/'Accepted (Draft)'). Avoids ad-hoc status mapping throughout pages.
- **Fix:** Continue using StatusBadge for all status displays. Ensure all new status enum values are added to variantMap and labelMap.

### 153. Step timeline with proper flex children sizing

- **Severity:** low  ·  **Category:** consistency
- **File:** `apps/web/components/shared/step-timeline.tsx` (line 126, 130)
- **Problem:** Positive finding: StepTimeline properly implements min-w-0 (line 126: 'flex-1 min-w-0 pt-0.5') and [overflow-wrap:anywhere] on step titles to prevent text overflow in flex containers. This prevents horizontal scroll on long step names.
- **Fix:** No action needed. Proper flex sizing implemented.


## Frontend data/logic/workflow correctness

### 154. Bulk message form state not cleared on API error

- **Severity:** high  ·  **Category:** workflow
- **File:** `apps/web/app/(staff)/staff/[eventId]/applications/page.tsx` (line 2797-2828)
- **Problem:** The applyBulkMessage() function clears form state (bulkMessageSubject, bulkMessageBody, bulkMessageSendEmail) only on success (lines 2820-2822), inside the try block. If apiClient throws an error, the catch block (line 2823-2824) is empty with only /* handled */, and form state is never cleared. User retrying the action sees stale message content, potentially sending duplicate or incorrect messages.
- **Fix:** Move the form state clearing (setBulkMessageSubject(""), setBulkMessageBody(""), setBulkMessageSendEmail(false)) to the finally block, or restructure to always close the dialog and clear state on both success and error. Alternatively, only close the dialog on success and keep form state for user to edit, but this contradicts the current pattern of clearing on success.

### 155. Admin users export missing CSRF token protection

- **Severity:** high  ·  **Category:** logic-bug
- **File:** `apps/web/app/(admin)/admin/people/page.tsx` (line 326)
- **Problem:** The handleExportUsersCsv() function calls fetch() directly without CSRF token or even importing useAuth(). The fetch at line 326 only passes { credentials: "include" } but does not set X-CSRF-Token header. This bypasses the CSRF protection enforced by the API. The endpoint /admin/users/export is a POST-like data export that should require CSRF validation but doesn't receive a token.
- **Fix:** Import useAuth hook, extract csrfToken from it, and add the X-CSRF-Token header to the fetch call. Alternatively, use apiClient() from lib/api.ts which handles CSRF automatically. Example: const { csrfToken } = useAuth(); const headers = { 'Content-Type': 'application/json' }; if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

### 156. Potential CSRF validation bypass in staff settings archival job probe

- **Severity:** medium  ·  **Category:** logic-bug
- **File:** `apps/web/app/(staff)/staff/[eventId]/settings/page.tsx` (line 134-137)
- **Problem:** The loadLatestJob() function fetches /api/v1/admin/events/{eventId}/archival-job/latest using a GET request with only credentials, no CSRF token. While GET requests traditionally don't require CSRF, this is a write-sensitive read (checks job status that may be admin-only). More critically, if the API requires CSRF for all authenticated requests, this silently fails CSRF validation.
- **Fix:** Either: (a) verify the API server does not enforce CSRF on GET requests to this endpoint, or (b) add X-CSRF-Token header from useAuth hook even for GET, or (c) use apiClient() which handles this transparently.

### 157. Bulk action catch blocks lack error context and state recovery

- **Severity:** medium  ·  **Category:** workflow
- **File:** `apps/web/app/(staff)/staff/[eventId]/applications/page.tsx` (line 2738-2740, 2790-2792, 2867-2869, 2912-2914, 2959-2961)
- **Problem:** Multiple bulk action functions (applyBulkTags, applyBulkDecisionDraft, bulkDeleteApplications, publishSelectedDecisions, applyBulkStepAction) have catch blocks that only log /* handled */ with no error handling logic. If runBulkActionInChunks throws an unexpected error (not caught by its internal try-catch), the UI spinner remains active and user gets no feedback. The finally block clears isApplyingBulk, but if the operation was partially committed before throwing, state may be inconsistent.
- **Fix:** Add explicit error handling in catch blocks: toast.error('Operation failed: ' + (error instanceof Error ? error.message : 'Unknown error')); This gives users visibility into failures. Consider also checking if any chunks were committed before the error and refreshing applications to ensure UI matches server state.

### 158. Stale closure risk in selectAllMatchingApplications when filter changes

- **Severity:** medium  ·  **Category:** logic-bug
- **File:** `apps/web/app/(staff)/staff/[eventId]/applications/page.tsx` (line 1850-1906)
- **Problem:** The selectAllMatchingApplications function reads from refs (applicationsRef.current, nextCursorRef.current, hasMoreApplicationsRef.current) which can become stale if the filter changes during pagination. The function depends on [fetchApplicationsPage, isSelectingAllMatching, totalMatchingApplications] but not on the current filter state. If user starts 'select all matching', then changes the filter before pagination completes, the loop will continue fetching pages with the OLD filter while the UI has already swapped to the new filter.
- **Fix:** Add the current filter signature (filterSignature) to the dependency array. Inside the function, store the filterSignature at the start of the operation and verify it hasn't changed between each fetch. If it has, throw an error to abort the select-all and show user a message like 'Filters changed during select-all; please retry.'

### 159. Incomplete error recovery when filters become invalid

- **Severity:** medium  ·  **Category:** workflow
- **File:** `apps/web/app/(staff)/staff/[eventId]/applications/page.tsx` (line 730-751)
- **Problem:** When loadApplications catches a 400 error with invalid filters, it resets all filter state (lines 740-750) only once due to hasResetInvalidFilterStateRef guard. However, it does not clear the URL query parameters that contain the invalid filters. The UI resets but the URL still has ?applicationsMode=advanced&applicationsTree=... with the invalid filter tree. If user refreshes, the invalid filter is re-applied from URL, causing another 400 error.
- **Fix:** After resetting filter state, also call router.replace(pathname) without query params to clear the URL. Or better: validate filter trees during deserialization from URL and reject invalid ones before applying them.

### 160. Auth context login/signup callbacks recreated frequently due to state.csrfToken dependency

- **Severity:** low  ·  **Category:** performance
- **File:** `apps/web/lib/auth-context.tsx` (line 174, 205, 241)
- **Problem:** The login, signup, and logout callbacks include state.csrfToken in their dependency arrays (lines 174, 205, 241). Every time csrfToken changes (which happens on app initialization and after auth), all three callbacks are recreated. This causes unnecessary re-renders of child components using these callbacks via the AuthContext value. While functionally correct (the callbacks do need the token), this causes minor performance churn.
- **Fix:** Extract only csrfToken from state instead of referencing state.csrfToken. Create a separate useRef to track the current csrf token value, or use a closure pattern that reads from setState's callback parameter. The current pattern is acceptable but could be optimized by either (a) not including csrfToken in deps if token is always fetched on-demand (line 140, 182), or (b) using useRef with a side effect to keep it synced.

### 161. Missing CSRF token in checkin export uses conditional header assignment

- **Severity:** low  ·  **Category:** consistency
- **File:** `apps/web/app/(staff)/staff/[eventId]/checkin/page.tsx` (line 368-383)
- **Problem:** The exportAttendeesCsv() function correctly checks csrfToken and adds X-CSRF-Token header conditionally (lines 368-370). However, this is inconsistent with lib/api.ts and lib/auth-context.tsx which also conditionally add CSRF headers. While this works, it introduces duplication and increases chance of bugs if CSRF handling changes. The conditional is correct (CSRF token may not exist yet), but pattern is repeated across the codebase.
- **Fix:** Consider creating a utility function in lib/api.ts like getAuthHeaders(csrfToken?: string) that returns the appropriate headers object with CSRF token if provided. Use this across all direct fetch() calls to ensure consistency.

### 162. Direct fetch in staff settings microsite endpoint lacks error differentiation

- **Severity:** low  ·  **Category:** consistency
- **File:** `apps/web/app/(staff)/staff/[eventId]/settings/page.tsx` (line 165-181)
- **Problem:** The loadMicrosite() function uses raw fetch and catches all non-OK responses by setting exists:false. This is intentional per the comment (line 161-162: users without EVENT_MICROSITE_MANAGE_SETTINGS legitimately see 403), but the function treats 403 (permission denied) identically to 404 (not found) or network errors. Users cannot distinguish between 'no microsite' and 'no permission to view microsite'.
- **Fix:** This is acceptable given the comment, but consider logging the actual status code for debugging. Alternatively, parse the 403 case specially to display a different message: 'You do not have permission to view microsite settings' vs 'No microsite published for this event'.


## Backend workflow & logic (apps/api/src)

### 163. Race condition in claimQueueItem without transaction boundary

- **Severity:** high  ·  **Category:** logic-bug
- **File:** `apps/api/src/reviews/reviewer-assignment.service.ts` (line 1225-1410)
- **Problem:** The claimQueueItem method performs multiple non-transactional checks and updates: 1) findFirst checks if queue_mode is 'shared', 2) updateMany attempts to claim, 3) on failure, performs a second read+retry. Between the read (line 1299) and the retry update (line 1323), another reviewer could claim the item, causing both to succeed or leading to incorrect state. The retry logic at line 1320-1336 has the same vulnerability. This permits multiple reviewers to claim the same queue item concurrently.
- **Fix:** Wrap the entire claim logic in a Prisma transaction. The initial read, claim attempt, and all retry branches should execute atomically. Consider using updateMany with an optimistic lock (updated_at comparison) or moving to a single transactional block that handles shared→direct transition with proper WHERE conditions.

### 164. updateMany without WHERE clause guarantee can update wrong applications

- **Severity:** high  ·  **Category:** logic-bug
- **File:** `apps/api/src/applications/step-state.service.ts` (line 137-148)
- **Problem:** The recomputeAllStepStates method updates step states with status in relockableStatuses (line 141). The WHERE clause includes status in relockableStatuses, which should prevent stale data, but the list is built from the in-memory 'states' array and may not match database state if another process updates between the findUnique and the updateMany. If the array is modified in-memory (line 134: state.status = StepStatus.LOCKED) before the updateMany, the updateMany will use the pre-modification status list, potentially re-locking steps that were already updated by another process.
- **Fix:** Perform the relocking in a single transaction using raw SQL or Prisma's transaction block. Do not modify in-memory state before performing database updates. Verify the WHERE clause matches the current database state before each update.

### 165. Email increment counter race condition in processQueuedEmails

- **Severity:** medium  ·  **Category:** logic-bug
- **File:** `apps/api/src/messages/messages.service.ts` (line 1541-1571)
- **Problem:** The method updates sent emails with updateMany and failed emails with individual update() calls using Promise.all (line 1556-1570). The email_attempts field is incremented separately for each recipient. If the scheduler crashes between the sent update batch and the failed update batch, failed recipients may be double-incremented or have stale counts. Additionally, updateMany (line 1542-1552) does not guarantee atomicity with the subsequent Promise.all failure updates, creating a window for state inconsistency.
- **Fix:** Combine the sent and failed updates into a single batch operation or wrap in a transaction. Use updateMany for both cohorts with different WHERE conditions, or use a single transactional block. Ensure email_attempts is incremented exactly once per attempt, regardless of scheduler restarts.

### 166. Missing event context validation in permissions guard for applicant-only routes

- **Severity:** medium  ·  **Category:** workflow
- **File:** `apps/api/src/common/guards/permissions.guard.ts` (line 128-212)
- **Problem:** The guard allows applicant-scoped permissions (SELF_APPLICATION_READ, SELF_PROFILE_UPDATE) without an eventId in the request context (lines 224-225). However, later event-scoped applicant checks (lines 186-192) use eventId, which may be undefined. If an applicant calls a self-permission route with no eventId, the guard skips the event-level email verification check (lines 185-193), allowing unverified users to access routes that might require verification at the event level. This is a validation bypass.
- **Fix:** Clarify whether applicant-scoped permissions require eventId context. If event-level verification is mandatory, validate eventId presence for all applicant routes and ensure event-level verification requirements are checked even for SELF_PERMISSIONS. Alternatively, document that SELF_* permissions intentionally skip event-scoped verification.

### 167. Missing await in reviewer assignment batch processing can swallow errors

- **Severity:** medium  ·  **Category:** logic-bug
- **File:** `apps/api/src/reviews/reviewer-assignment.scheduler.ts` (line 32-40)
- **Problem:** The scheduler loops over events and awaits releaseExpiredDirectAssignments for each (line 34), but does not use Promise.all or parallel processing. If releaseExpiredDirectAssignments throws an error inside the loop, only that event's operation fails; the catch-all error handler (line 43-46) logs the error but the scheduler continues. However, the greater issue is that errors within the loop can be masked if not explicitly re-thrown, and the loop may silently skip events after a transient failure. This can lead to expired assignments remaining unclaimed.
- **Fix:** Either wrap the loop in a try-catch that re-throws after logging, or use Promise.allSettled to attempt all events and log failures per-event. Ensure all events are processed even if one fails, or fail fast with clear error reporting.

### 168. Step state recomputation called without transaction boundary in bulk operations

- **Severity:** medium  ·  **Category:** logic-bug
- **File:** `apps/api/src/applications/applications.service.ts` (line 2878-2886)
- **Problem:** In the bulk step action handler, recomputeAllStepStates is called via Promise.all for multiple applications (line 2883) outside a transaction context. If the bulk operation partially completes and crashes, some applications will have updated step states while others won't. The calling transaction completes step submissions but the async recomputation is fire-and-forget. This can lead to inconsistent application state if the service restarts.
- **Fix:** Move recomputeAllStepStates calls inside the transaction block, or ensure the async operations are awaited and logged for retry on failure. Alternatively, queue a background job with a unique token so partial retries are idempotent.

### 169. Promise.all with individual updates instead of batch in message_recipients

- **Severity:** medium  ·  **Category:** performance
- **File:** `apps/api/src/messages/messages.service.ts` (line 1556-1570)
- **Problem:** When updating multiple failed message recipients, the code maps each failure to an individual update() call and awaits all with Promise.all (line 1556-1570). For large batches (e.g., 500+ failures), this creates 500+ individual database connections instead of a single batch update. This is inefficient and can exhaust connection pool limits. The code already uses updateMany for sent recipients (line 1542-1552) and deferred updates (line 1577-1582), but inconsistently uses individual updates for failures.
- **Fix:** Batch the failure updates using updateMany with individual row conditions, or use a single Prisma transaction with multiple updateMany calls grouped by failure type (SUPPRESSED vs FAILED).

### 170. Potential off-by-one in review queue filter with limit + 1 pagination pattern

- **Severity:** low  ·  **Category:** logic-bug
- **File:** `apps/api/src/reviews/review-queue.service.ts` (line 142-146)
- **Problem:** The getQueue method fetches limit * 3 + 1 items (line 145) to detect pagination boundary, but only filters and returns the first limit items (lines 307-309). The * 3 multiplier is unusual and not documented. If tag filtering (line 104) or status filtering (lines 244-255) is applied, the *3 overallocation may still undercount after filtering, causing hasMore to be incorrectly false. The math should be verified: if the initial batch size is too large, pagination becomes inaccurate.
- **Fix:** Change take to (limit + 1) instead of (limit * 3 + 1), or document the *3 multiplier and verify it accounts for all filter reductions. If multiple filtering passes are applied, ensure the overallocation is sufficient to guarantee at least (limit + 1) results after all filters, or restructure to apply filters in the query.

### 171. No validation that workflow steps exist when initializing application states

- **Severity:** low  ·  **Category:** validation
- **File:** `apps/api/src/applications/step-state.service.ts` (line 20-47)
- **Problem:** The initializeStepStates method creates step states for all workflow steps in an event without verifying the event exists or has any steps. If an applicationId is associated with a non-existent event, the method silently succeeds with no states created. Later calls to getStepState will fail with NotFoundException, but the silent success makes debugging harder.
- **Fix:** Add an explicit check that the event exists and has at least one step. If no steps exist, either throw BadRequestException or log a warning. This prevents silent failures and makes event misconfiguration detectable.

### 172. Missing error handling for unhandled rejection in email scheduler

- **Severity:** low  ·  **Category:** logic-bug
- **File:** `apps/api/src/messages/messages-email.scheduler.ts` (line 12-32)
- **Problem:** The processQueuedEmails scheduler sets isRunning = true at the start but only sets it to false in the finally block (line 30). If an unhandled rejection occurs in the processQueuedEmails service (e.g., a Prisma query timeout), the error is caught by the scheduler's catch (line 24-28), logged, but isRunning is not immediately reset in case the error handler itself throws. Although the finally block will execute, the pattern is fragile. Additionally, if processQueuedEmails throws an error before isRunning is set to true, subsequent cron invocations will not run.
- **Fix:** The finally block pattern is correct, but add explicit error recovery: catch promise rejections with .catch() in addition to try/catch to ensure isRunning is reset. Consider using a timestamp-based lock instead of a boolean flag to prevent indefinite locks if the service crashes.


## Mobile Horizontal Scroll and Responsive Layout Issues

### 173. Fixed sidebar widths in certificate studio cause horizontal scroll on mobile

- **Severity:** high  ·  **Category:** horizontal-scroll
- **File:** `apps/web/app/(staff)/staff/[eventId]/certificates/studio/inspector-panel.tsx` (line 171)
- **Problem:** InspectorPanel has min-w-[340px] max-w-[360px] fixed widths. On screens < 700px (viewport width minus gap and left rail), this forces horizontal scroll. The layout grid uses xl:grid-cols-[340px_minmax(0,1fr)_360px], which is only active on xl breakpoint, but the sidebar components enforce the width unconditionally.
- **Fix:** Change min-w-[340px] max-w-[360px] to responsive: min-w-0 w-full md:min-w-[340px] md:max-w-[360px]. Update workspace.tsx grid to also apply responsive column layout at md breakpoint: 'grid gap-4 md:grid-cols-[340px_minmax(0,1fr)_360px] xl:grid-cols-[340px_minmax(0,1fr)_360px]' and collapse to single column on mobile.

### 174. Microsite editor grid-cols-5 never collapses on mobile, forcing horizontal scroll

- **Severity:** high  ·  **Category:** responsive
- **File:** `apps/web/app/(staff)/staff/[eventId]/microsite/[pageId]/page.tsx` (line ~1200-1300 (grid-cols-5 usage))
- **Problem:** Multiple hard-coded grid-cols-5 divs in the page editor (for device preview buttons, block toolbar, etc.) do not have responsive breakpoints. grid-cols-5 = 5 × 20% = 100% even on 375px screens, which is impossible. No md: or sm: prefix means these grids are always 5 columns.
- **Fix:** Change all 'grid grid-cols-5' to 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5' or wrap each grid section in a responsive scroll container with 'overflow-x-auto' if fixed widths per column are semantically required.

### 175. Table cells use whitespace-nowrap without text wrapping fallback, breaking mobile tables

- **Severity:** high  ·  **Category:** horizontal-scroll
- **File:** `apps/web/components/ui/table.tsx` (line 73, 86)
- **Problem:** TableHead and TableCell both have 'whitespace-nowrap' class applied unconditionally. This is semantic for table headers (good), but applied to all cells it forces content off-screen on mobile. Names, emails, and long text in table rows cannot wrap, making tables unreadable below 768px.
- **Fix:** Remove 'whitespace-nowrap' from TableCell (line 86). Keep it only on TableHead (line 73) for headers. In downstream pages, add 'truncate' to cell content if needed for specific columns (e.g., email addresses), but allow default wrapping for names and descriptions. Example: '<TableCell><span className="truncate">{{email}}</span></TableCell>' for key-value cells only.

### 176. Flex children in table rows lack min-w-0, preventing text truncation on mobile

- **Severity:** high  ·  **Category:** horizontal-scroll
- **File:** `apps/web/app/(admin)/admin/people/page.tsx` (line 771-792 (avatar + name/email cell))
- **Problem:** In the user table, the avatar + name/email flex row (line 771: '<div className="flex items-center gap-3"><Avatar>...</Avatar><div className="min-w-0"...>') does have min-w-0 on the text wrapper (good!). However, other table pages may not. The avatar has implicit min-width: auto, forcing the text container to shrink. Without min-w-0 on text wrapper, 'truncate' cannot work. Verify all similar patterns.
- **Fix:** Audit all flex rows containing long text + icons in tables. Ensure the text container has min-w-0. Pattern: '<div className="flex items-center gap-3"><SomeIcon /><div className="min-w-0 flex-1"><p className="truncate">...</p></div></div>'. Already correctly applied in people page; replicate in staff applications, reviews, and audit pages.

### 177. Applications list page tables may lack proper responsive overflow handling

- **Severity:** high  ·  **Category:** horizontal-scroll
- **File:** `apps/web/app/(staff)/staff/[eventId]/applications/page.tsx` (line 749-888 (Table usage))
- **Problem:** The staff applications page uses the Table component (which has overflow-x-auto wrapper, good), but the page itself is a complex multi-tab, multi-filter interface. On mobile, the filter toolbar (flex flex-col sm:flex-row at line 690) might be too wide, or the table columns themselves may not collapse. Tables have many columns (User, Applications, Region, Profile, Status, Joined, Actions) and may overflow on narrow screens.
- **Fix:** Test on 375px width. If table overflows: (1) Ensure page-level main container allows overflow-x-auto, (2) Hide low-priority columns on mobile using hidden md:table-cell (e.g., Region, Profile columns), (3) Stagger columns with responsive display utilities, or (4) Switch to card view on mobile using responsive utilities. Add responsive table column management: '<TableCell className="hidden lg:table-cell">Region</TableCell>'.

### 178. Reviews page grid-cols-6 and grid-cols-5 do not collapse on mobile

- **Severity:** high  ·  **Category:** responsive
- **File:** `apps/web/app/(staff)/staff/[eventId]/reviews/page.tsx` (line ~900-1000 (estimated QueueStatsBar or similar grid))
- **Problem:** The reviews page has 'lg:grid-cols-6' and 'lg:grid-cols-5' layout grids for stats and queue display. These are only active on large screens, but if there are fallback grid-cols-N values for smaller screens, they may still cause horizontal scroll. Audit the actual grid declarations in the reviews queue stats rendering.
- **Fix:** Ensure all grid definitions follow pattern: 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 lg:grid-cols-6'. If single-column is intended for mobile, use 'grid grid-cols-1' explicitly.

### 179. Admin roles page may have wide tables or data grids without mobile collapse

- **Severity:** high  ·  **Category:** horizontal-scroll
- **File:** `apps/web/app/(admin)/admin/roles/page.tsx` (line ~500-700 (estimated table usage))
- **Problem:** The roles and staff management pages use data tables with multiple columns (email, full name, role, event, dates, etc.). Tables rely on the Table component's overflow-x-auto, but if columns are too narrow, text squishing or horizontal scroll still occurs. No indication of responsive column hiding.
- **Fix:** Apply responsive column visibility: hide low-priority columns (e.g., accessStartAt, accessEndAt, inviteFailureReason) on mobile. Use '<TableCell className="hidden sm:table-cell">...' for non-critical columns. Or switch to card/list view on mobile for dense tables.

### 180. Badge and button text uses whitespace-nowrap, preventing wrapping on mobile

- **Severity:** medium  ·  **Category:** horizontal-scroll
- **File:** `apps/web/components/ui/badge.tsx` (line 15-20 (estimated))
- **Problem:** Badge variant='default' likely includes whitespace-nowrap. In tight table cells or filter chips on mobile, badges with text like 'Applicant' or 'Verified' should wrap to avoid forcing scrolling. Issue is amplified in people page where multiple badges stack in a cell.
- **Fix:** Remove or conditionally apply whitespace-nowrap from badge default variant. Badges should only use it if they're icon-only or in space-constrained nav contexts. In data tables, allow badges to wrap and use flex-wrap: wrap on their container.

### 181. Microsite blocks use whitespace-nowrap on table cells without wrapping fallback

- **Severity:** medium  ·  **Category:** horizontal-scroll
- **File:** `apps/web/components/microsite/blocks/ranks-block.tsx` (line 98, 122)
- **Problem:** The RanksBlock renders a data table with whitespace-nowrap on th and td (lines 98, 122). The wrapper has overflow-x-auto (good), but on mobile the table min-w-[640px] may still force scroll. Long prize names or cell content will not wrap.
- **Fix:** Add responsive wrapper: change 'overflow-x-auto' wrapper to check mobile: 'w-full overflow-x-auto' is good. But also add 'break-words' or remove 'whitespace-nowrap' from td to allow text wrapping. If rank columns must not wrap, use 'truncate' with fixed column widths instead.

### 182. Microsite media library dialog may exceed mobile width with min-w-0 flex-1 conflict

- **Severity:** medium  ·  **Category:** responsive
- **File:** `apps/web/components/microsite/media-library-dialog.tsx` (line ~80-100 (relative min-w-0 flex-1 lg:min-w-[280px]))
- **Problem:** The media library has '<div className="relative min-w-0 flex-1 lg:min-w-[280px]"...>'. The lg:min-w-[280px] overrides min-w-0 on large screens (intended), but this is a dialog, so it's width-constrained by the dialog container anyway. On mobile, min-w-0 flex-1 should work fine. Low risk, but confirm dialog max-width is set.
- **Fix:** Verify DialogContent has max-w-lg or similar. If dialog is already constrained, the lg:min-w-[280px] is safe. No change needed unless dialog overflows on mobile.

### 183. Forms and input components may have wide select dropdowns or inputs exceeding mobile width

- **Severity:** medium  ·  **Category:** responsive
- **File:** `apps/web/components/ui/select.tsx` (line ~50-100 (SelectTrigger/SelectContent))
- **Problem:** Select components are used throughout (applications page, people page, admin pages). SelectTrigger is often given a fixed width like 'w-[200px]' or 'w-[160px]'. On mobile screens < 375px, these fixed widths exceed the available space after padding/margin, causing horizontal scroll or input truncation.
- **Fix:** Apply responsive widths to SelectTrigger: 'w-full sm:w-[200px]' for forms/toolbars. In tight spaces, use 'w-full' on mobile and let it shrink to fit. Example: '<SelectTrigger className="w-full md:w-[200px]">'. Audit all Select usages in people, audit, roles, applications, and reviews pages.

### 184. Missing focus states on interactive elements in dashboards and tables

- **Severity:** medium  ·  **Category:** accessibility
- **File:** `apps/web/app/(admin)/admin/people/page.tsx` (line ~878 (Button Open link))
- **Problem:** Buttons and links in tables may lack visible focus states for keyboard navigation. The 'Open' button in the people table does not have explicit focus:ring or focus:outline styling. On mobile with keyboard nav (e.g., external keyboard), focus is not visible.
- **Fix:** Ensure all interactive elements have focus:ring focus:ring-2 focus:ring-offset-2 or focus:outline focus:outline-2. This is already defined in shadcn Button variant, but verify custom pages override correctly. Test with Tab key on mobile and desktop.

### 185. Form labels missing on inline filters and search inputs across pages

- **Severity:** medium  ·  **Category:** accessibility
- **File:** `apps/web/app/(admin)/admin/people/page.tsx` (line 692-702 (search input + select without explicit labels))
- **Problem:** The search and filter toolbar uses placeholder-only inputs. The Input has placeholder='Search by name, email, role...' but no <Label> element. Screen readers cannot associate the label with the input, violating WCAG 2.1 Level A.
- **Fix:** Wrap with <Label>: '<div><Label htmlFor="search-users" className="sr-only">Search users</Label><Input id="search-users" placeholder="..." /></div>'. Or add aria-label: '<Input aria-label="Search users" placeholder="..." />'.

### 186. Missing empty states and loading skeletons for data-heavy pages

- **Severity:** medium  ·  **Category:** loading-empty-state
- **File:** `apps/web/app/(staff)/staff/[eventId]/applications/page.tsx` (line 734-735 (TableSkeleton), 746 (EmptyState))
- **Problem:** The applications page does show TableSkeleton during load and EmptyState when no results, which is good. However, audit reviews, audit, and roles pages for missing skeletons or error states. If data fails to load, users see a blank page.
- **Fix:** Ensure all data-fetching pages have (1) TableSkeleton or CardSkeleton while isLoading, (2) EmptyState with helpful message when data.length === 0, (3) Error toast via apiClient already done, but test manually. Pages like reviews (QueueStatsBar) should show skeleton cards during load.

### 187. Pagination controls layout may overflow on mobile in admin and staff pages

- **Severity:** medium  ·  **Category:** responsive
- **File:** `apps/web/app/(admin)/admin/people/page.tsx` (line 893-920 (pagination with 'Page X' label and nav buttons))
- **Problem:** Pagination UI has flex gap-2 with label 'Page {userPage}' and two buttons (Prev/Next). On narrow screens, the label may wrap awkwardly or buttons may squeeze text. Pattern is used in people, audit, roles, and applications pages.
- **Fix:** Add responsive: '<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">'. Stack label and buttons on mobile, row on desktop. Or hide label on mobile: '<p className="hidden sm:block text-sm text-muted-foreground">Page {userPage}</p>'.

### 188. Dashboard and portal pages use responsive grids correctly but may have flex children without min-w-0

- **Severity:** low  ·  **Category:** responsive
- **File:** `apps/web/app/(portal)/dashboard/page.tsx` (line ~500 (estimated grid-cols-2 sm:grid-cols-3 lg:grid-cols-5))
- **Problem:** Dashboard page correctly uses responsive grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 patterns (good!). However, inside cards, if there are flex rows with long text + icons, those flex children must have min-w-0 to allow text truncation. Spot-check card content for proper min-w-0 usage.
- **Fix:** Audit card content flex patterns. Ensure any flex row with text + icon has min-w-0 on text container: '<div className="flex items-center gap-2"><Icon /><div className="min-w-0"><p className="truncate">...</p></div></div>'.

### 189. Negative margins and decorative elements may exceed viewport on mobile

- **Severity:** low  ·  **Category:** horizontal-scroll
- **File:** `apps/web/components/layout/app-shell.tsx` (line 311 ('-ml-1 on SidebarTrigger'))
- **Problem:** The header has 'SidebarTrigger className="-ml-1"' to overlap the trigger with the left padding. This is safe (only 4px negative margin). However, audit other pages for '-m' utilities that may exceed bounds. Generally low risk if margins are < 10% of available space.
- **Fix:** Search codebase for '-m[b|r|t|l]-' patterns. If any exceed 8px negative margin on components near viewport edges, consider removing or using relative positioning instead. Current usage is safe.

### 190. Color-only badges and status indicators without text/icons may rely on color alone

- **Severity:** low  ·  **Category:** accessibility
- **File:** `apps/web/components/microsite/blocks/ranks-block.tsx` (line 20-33 (PrizeBadge with bg and text color classes))
- **Problem:** Prize badges in the ranks block use only color (bg-amber-500/20, text-amber-300, etc.) to convey meaning. WCAG 2.1 requires at least one additional distinguishing feature (shape, icon, text, pattern). If a user has color blindness, they cannot distinguish medals.
- **Fix:** Add a subtle icon (e.g., Medal icon for medals, Trophy for first prize) or text label to badges. Keep colors but add context: '<span className="flex items-center gap-1 ..."><Medal className="h-3 w-3" /><MarkdownText ... /></span>'.

### 191. Disabled buttons lack visual feedback during async operations

- **Severity:** low  ·  **Category:** forms
- **File:** `apps/web/app/(admin)/admin/people/page.tsx` (line 420-424 (Export button disabled during export))
- **Problem:** The 'Export Users CSV' button disables during export and shows 'Exporting...' text. This is good UX. However, other buttons across pages may disable without visual feedback (no spinner, no text change). Users might not know the action is in progress.
- **Fix:** Audit all async button actions. Pattern: '<Button disabled={isLoading}>{isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{isLoading ? "Loading..." : "Action"}</Button>'. Apply to bulk actions (delete, message, decision, issue certs) across applications, reviews, and people pages.


---

## Synthesis (deduplicated remediation plan)

**Executive summary.** The platform is functionally solid with good design-system foundations (consistent StatusBadge, EmptyState, ConfirmDialog, form a11y primitives, and triple-state loading patterns were repeatedly confirmed as correct). The dominant problem is mobile responsiveness: a single root cause — unconditional `whitespace-nowrap` on every TableHead/TableCell in `components/ui/table.tsx` (verified at L73/L86) plus non-responsive Tabs (`inline-flex w-fit`) and a shell `main` that lacks `overflow-x-hidden` — produces horizontal scroll across nearly every data-dense page (admin people/roles/audit/events, staff applications/reviews/checkin, portal dashboard, microsite blocks). Roughly half the 191 findings are restatements of these few component-level defects, so a small number of global edits resolve the user's #1 pain across dozens of pages. Beyond responsiveness, there is one critical correctness bug (login loading-state trap), confirmed UTF-8 mojibake in 5 files, a non-transactional review-claim race in the backend, missing CSRF on a couple of raw `fetch` calls, and a broad but low-risk layer of accessibility gaps (icon-only buttons without aria-label, fixed-width Selects, sub-44px touch targets). Overall health: good architecture, ship-blocking only on mobile UX and a handful of logic/security items.

### Top priorities

1. GLOBAL TABLE FIX (resolves ~15 horizontal-scroll findings at once): in apps/web/components/ui/table.tsx, gate whitespace-nowrap behind sm: on TableHead (L73) and TableCell (L86), add break-words to cells. This is the single highest-impact change for the user's #1 complaint (mobile horizontal scroll) and fixes admin people/roles/audit/events, staff applications/checkin/reviews, and microsite ranks-block tables simultaneously.
1. GLOBAL SHELL FIX: add `w-full overflow-x-hidden` to the <main> in apps/web/components/layout/app-shell.tsx (L387), and `w-full min-w-0` to the staff layout wrapper (apps/web/app/(staff)/staff/[eventId]/layout.tsx). Creates a hard viewport stop so no descendant can propagate horizontal scroll to the page.
1. GLOBAL TABS FIX: make TabsList scrollable/wrappable on mobile in apps/web/components/ui/tabs.tsx (L29 `inline-flex w-fit`) — add an overflow-x-auto/scroll variant. Fixes dashboard, events, inbox, and every line-variant filter tab bar on 375px.
1. CRITICAL LOGIC: fix login loading-state trap in apps/web/app/(auth)/login/page.tsx (L100-136) — wrap the onSubmit redirect/profile-check flow so setIsLoading(false) always runs (finally) and non-401 profile errors still proceed/redirect; today a 5xx leaves the user stuck on a spinner.
1. ENCODING CLEANUP (global): repair UTF-8 mojibake — 10 occurrences across 5 files (apps/web/app/(admin)/admin/audit/page.tsx L187/L384, lib/i18n.tsx, applications/page.tsx, applications/[applicationId]/page.tsx, (portal)/applications/[applicationId]/page.tsx). Replace `â€¦`→…, `â€"`→– and re-save as UTF-8.
1. FIXED-WIDTH SELECT/INPUT SWEEP: convert w-[160px]/w-[200px]/w-[220px]/w-[240px]/w-[340px]/w-[360px] SelectTriggers and panels to `w-full sm:w-[N]` across applications (L1451/L1752/L3365), dashboard/events sort dropdowns, and certificate studio inspector/left-rail. Second-largest source of mobile overflow after tables.
1. BACKEND RACE: wrap claimQueueItem in a Prisma transaction in apps/api/src/reviews/reviewer-assignment.service.ts (L1225-1410); the read-then-retry at L1299-1336 runs outside any transaction and can let two reviewers claim the same item.
1. CSRF ON RAW FETCH: route apps/web/app/(admin)/admin/people/page.tsx export (L326) and staff settings probes through apiClient() (or add X-CSRF-Token); currently bypasses CSRF handling.

### Global fixes

- Table component (apps/web/components/ui/table.tsx L73,L86): replace `whitespace-nowrap` with `sm:whitespace-nowrap` and add `break-words` to TableCell. Single edit removes horizontal scroll from every table page (admin people/roles/audit/events, staff applications/checkin/reviews, microsite ranks-block).
- App shell (apps/web/components/layout/app-shell.tsx L387): add `w-full overflow-x-hidden` to <main>; add `flex-1 min-w-0 overflow-x-auto` wrapper around the header breadcrumb (L314-334) so long paths scroll within the header only.
- Staff layout (apps/web/app/(staff)/staff/[eventId]/layout.tsx L200-211): change children wrapper to `flex flex-col w-full min-w-0 gap-4 min-h-0` so DataTables/Cards respect SidebarInset width.
- Tabs (apps/web/components/ui/tabs.tsx L29): add a mobile scroll/wrap behavior to TabsList (overflow-x-auto with hidden scrollbar, or flex-wrap sm:flex-nowrap) for both default and line variants. Fixes dashboard/events/inbox/portal filter bars.
- Badge (apps/web/components/ui/badge.tsx): drop unconditional whitespace-nowrap so badge clusters wrap in tight table cells (people, roles assignment cells).
- Select trigger default + call-sites: codemod fixed pixel widths to `w-full sm:w-[N]` (apps/web/components/ui/select.tsx call-sites in applications, people, audit, roles, dashboard, events).
- Markdown rendering (apps/web/components/microsite/markdown-text.tsx L21-26 + apps/web/lib/markdown.ts L103-109): add `[&_pre]:break-words [&_table]:block [&_table]:overflow-x-auto [&_img]:max-w-full [&_img]:h-auto` so markdown tables/code/images can't blow out the page.
- Encoding: re-save the 5 mojibake files as UTF-8 and add an ESLint/CI guard (no-irregular-whitespace or a custom mojibake check) to prevent regressions.
- Dialog wrapper convention: standardize DialogContent on `max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)] overflow-y-auto` and apply to inbox (L479 max-w-2xl) and other oversized dialogs.
- Pagination convention: shared responsive pattern `flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between` (people L893-921, audit, roles, applications L4188-4215) to stop bottom-bar overflow at 320-375px.

### Workstreams

#### Mobile horizontal scroll — page/grid level (after global fixes) (high)

Residual overflow from hard-coded multi-column grids and flex rows missing min-w-0 that the global shell/table fixes don't cover.

- apps/web/app/(staff)/staff/[eventId]/microsite/[pageId]/page.tsx (~L1200-1300): grid-cols-5 never collapses — change to grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5.
- apps/web/app/(staff)/staff/[eventId]/checkin/page.tsx L664 (grid-cols-3) and L859 (md:grid-cols-[220px...]): add grid-cols-1 sm:grid-cols-2 base and minmax(0,220px) so the status Select can shrink; add min-w-0 to attendee row L972 and shrink-0 to the Check-in button.
- apps/web/app/(staff)/staff/[eventId]/reviewer-assignment/page.tsx L325: add min-w-0 + truncate on reviewer label so workload badges don't push the row off-screen; stack manual-override Select/buttons on mobile (L437-459).
- apps/web/app/(portal)/profile/page.tsx L278: grid grid-cols-2 → grid-cols-1 sm:grid-cols-2 (first/last name inputs critically narrow on phones).
- apps/web/components/shared/audience-builder.tsx L211,L248,L324: grid-cols-2 → grid-cols-1 sm:grid-cols-2.
- apps/web/components/microsite/blocks: stats-block.tsx L36 (grid-cols-2 → grid-cols-1 sm:grid-cols-2 md:grid-cols-4 + responsive text), countdown-block.tsx L136 (grid-cols-3 needs sm: base), timeline-block.tsx L44-45 (date badge max-w + truncate), tabs-block.tsx L33 (per-tab min-w-fit + truncate), logo-cloud/partner-strip (responsive max-w + gap), agenda-block, hero-block split-layout padding/text.
- apps/web/app/(staff)/staff/[eventId]/applications/[applicationId]/page.tsx and reviews/page.tsx grid-cols-5/6 stat bars: add grid-cols-2 sm:grid-cols-3 base.
- apps/web/components/microsite/blocks/sticky-alert-bar-block.tsx L107-113: fixed top-16 overlaps content — add matching pt offset / mobile top-14.

#### Responsive layout — certificate studio (medium)

Studio panels use fixed min-w that force horizontal scroll on tablets/narrow screens; xl-only breakpoints stack badly below 1280px.

- apps/web/app/(staff)/staff/[eventId]/certificates/studio/inspector-panel.tsx L171: min-w-[340px] max-w-[360px] → min-w-0 w-full lg:min-w-[340px] lg:max-w-[360px].
- studio/workspace.tsx L144-155: add md/lg intermediate grids (hide inspector below lg, sidebar below md) instead of xl-only.
- studio/top-command-bar.tsx L124: add md:grid-cols-2 lg:grid-cols-3 before xl:grid-cols-5.
- studio/editor-canvas.tsx L570: h-[74vh] → h-[50vh] sm:h-[60vh] lg:h-[74vh].
- components/certificates/certificate-render-surface.tsx L81-85 + certificate-artboard.tsx L168-186: wrap artboard with responsive scale/max-w-[100vw] so issued-certificate public preview fits mobile without pinch-zoom; responsive p-4 sm:p-8 on loading/error states.
- apps/web/app/(staff)/staff/[eventId]/certificates/operations/workspace.tsx: confirm Table is inside overflow-x-auto (covered by global table fix).

#### Correctness & workflow logic (frontend) (high)

State not reset on error paths, stale closures, and missing cleanup can send duplicate messages, strand spinners, or desync UI from server.

- apps/web/app/(auth)/login/page.tsx L100-136: add finally{setIsLoading(false)} and let non-401 profile errors still redirect (CRITICAL — verified spinner trap on 5xx).
- apps/web/app/(staff)/staff/[eventId]/applications/page.tsx L2797-2828: applyBulkMessage clears form only on success — move clears to finally so retry doesn't resend stale subject/body.
- applications/page.tsx L2738-2961 (applyBulkTags/DecisionDraft/bulkDelete/publish/step): empty catch blocks → toast.error + refresh to reconcile partial commits.
- applications/page.tsx L1850-1906: selectAllMatchingApplications stale-closure — capture filterSignature at start and abort if it changes mid-pagination.
- applications/page.tsx L730-751: after resetting invalid filters also router.replace(pathname) to clear bad URL query (else refresh re-applies the 400).
- applications/page.tsx L450-510: clear bulk-dialog state on unmount; consider AbortController for in-flight bulk ops.
- apps/web/app/(staff)/staff/[eventId]/reviews/page.tsx L373-400: auto-advance localStorage can silently fail (private browsing) and diverge from server queue — fall back to URL state and re-validate current queue item before auto-advancing.
- apps/web/app/(staff)/staff/[eventId]/workflow/page.tsx + forms/page.tsx: add unsaved-changes dirty flag + navigation guard and validate contiguous stepIndex before save; surface API save errors.

#### Security — CSRF & raw fetch consistency (medium)

Several direct fetch() calls bypass the centralized CSRF/header handling in lib/api.ts.

- apps/web/app/(admin)/admin/people/page.tsx L326: export uses raw fetch with only credentials — route through apiClient() or add X-CSRF-Token from useAuth.
- apps/web/app/(staff)/staff/[eventId]/settings/page.tsx L134-181: archival-job probe + loadMicrosite use raw fetch; standardize on apiClient (and differentiate 403 vs 404 for microsite messaging).
- apps/web/app/(staff)/staff/[eventId]/checkin/page.tsx L368-383: working but duplicates CSRF header logic — extract getAuthHeaders(csrfToken) util in lib/api.ts and reuse everywhere.

#### Backend workflow & data integrity (apps/api) (high)

Non-transactional multi-step DB operations create races and inconsistent state under concurrency or scheduler restart.

- apps/api/src/reviews/reviewer-assignment.service.ts L1225-1410: wrap claimQueueItem read+claim+retry in a transaction (verified: retry at L1299-1336 is outside any tx).
- apps/api/src/applications/step-state.service.ts L137-148: recomputeAllStepStates mutates in-memory state before updateMany — build WHERE from DB state inside a transaction to avoid re-locking already-updated steps.
- apps/api/src/applications/applications.service.ts L2878-2886: recomputeAllStepStates via Promise.all outside tx in bulk step handler — move inside tx or queue idempotent background job.
- apps/api/src/messages/messages.service.ts L1541-1571: combine sent (updateMany) + failed (individual updates) into one transaction; batch failure updates to avoid connection-pool exhaustion and double-increment of email_attempts on restart.
- apps/api/src/reviews/reviewer-assignment.scheduler.ts L32-40: use Promise.allSettled so one event's failure doesn't silently skip the rest.
- apps/api/src/reviews/review-queue.service.ts L142-146: document/verify the `limit*3+1` over-fetch vs filtering, or use limit+1, so hasMore is accurate after tag/status filters.
- apps/api/src/common/guards/permissions.guard.ts L128-212: clarify whether SELF_* applicant permissions require eventId; ensure event-level email-verification isn't bypassed when eventId is absent (validation gap).

#### Accessibility (broad, mostly low effort) (medium)

Systemic icon-only buttons without labels, missing form labels, animations ignoring reduced-motion, and color-only meaning. Each is small; together they materially improve a11y compliance.

- Icon-only buttons missing aria-label: admin events L393-444 (Eye/Settings/Archive/Delete), checkin search L889-898 and undo L1107, shared/qr-scanner.tsx L228 camera toggle, audit filter SelectTrigger L204, certificate studio undo/redo. Add aria-label everywhere (titles already present).
- Form labels: people search toolbar L692-702 (placeholder-only) — add sr-only Label or aria-label; same for other inline filter inputs.
- FormRenderer.tsx L219-250: add aria-labelledby on multiselect role=group; associate error id (L378-386) into aria-describedby; FILE_UPLOAD field L301-364 pass aria-label/aria-describedby.
- FileUpload.tsx: remove button L256-269 → real Button size=icon with aria-label + 44px; file input L278-285 needs accessible label/aria-describedby.
- FileAnswerLinks.tsx L124-162: aria-label on view/download link-buttons.
- Reduced motion: auth pages (login L139-142, signup, forgot/reset, verify-email) wrap framer-motion with prefers-reduced-motion check.
- aria-live on form error summaries (auth pages L152-206).
- Color-only meaning: microsite ranks-block PrizeBadge L20-33 — add icon/text alongside color.
- Markdown image alt + microsite navbar mobile menu role/focus-ring (navbar.tsx L448-480).

#### Touch targets & loading/empty-state polish (low)

Sub-44px tap targets and weak loading/empty states on mobile; lower severity but affects perceived quality.

- Bulk-action buttons applications L4000-4115 use size=sm (32px) — bump to 44px on mobile / w-full sm:w-auto.
- Inbox message-row mark-read affordance + 44px tap area (inbox L392-461); announcements collapsible buttons need min-h-10 (announcements L150).
- Checkin loading/empty states L951-959 are bare <p> — use EmptyState (already imported) with guidance to change status filter.
- Settings skeleton h-32 (settings L145-155) doesn't match content height — causes CLS; size skeleton to expected height.
- FileUpload progress L302: add a real progress bar/spinner during upload.
- Async buttons across pages: standardize spinner+disabled pattern (Loader2) for delete/message/decision/issue-cert actions.

#### Forms & validation correctness (low)

Generic/persistent error messages and naive slug/color handling that confuse users.

- packages/schemas/src/validation.ts L240-252: pattern failures fall back to 'Invalid format' — provide a clearer default and require customMessage for pattern fields.
- FileUpload.tsx L141-154,L224-226: old error persists after a successful retry — always setError(null) on success before re-checking.
- apps/web/app/(admin)/admin/events/page.tsx L216-217: slug generation doesn't normalize accents — use NFD normalize + strip diacritics.
- apps/web/app/(admin)/admin/settings/page.tsx L389-400: hex color input accepts arbitrary text — validate /^#[0-9a-f]{6}$/i.
- apps/web/app/(admin)/admin/roles/page.tsx L306-401: warn when access end date is in the past (currently only start<end checked).
- apps/web/lib/render-answer-value.tsx L129-132: wrap JSON.stringify in try/catch to avoid silently dropping non-serializable values.
- Context-aware empty states (roles L573-583): distinguish 'no data yet' from 'no results for filters'.
- Roles summary counts L473-514 don't reflect active filter — recompute from filtered set or hide when filtering.

### Proposed improvements

- Responsive table strategy beyond wrapping: add a reusable mobile card/stacked view (or `hidden md:table-cell` priority columns) for the densest tables (admin people/roles/events, staff applications) so users get readable rows instead of horizontal scroll, not just a fix for it.
- Password show/hide toggle on all auth + admin password inputs (login, signup, reset-password, people/[userId] L767-781) — low-effort UX win with aria-label'd Eye/EyeOff toggle.
- Landing page (apps/web/app/page.tsx L76-96) hamburger mobile menu mirroring the microsite navbar pattern, replacing the three full-width buttons that wrap awkwardly under 640px.
- Shared DialogContent variant + Select-width preset utilities so future components inherit mobile-safe constraints automatically (prevents recurrence of the fixed-width/overflow class of bugs).
- Optimistic locking / version etag on staff field-answer edits (applications/[id] L2999-3160) so concurrent staff edits surface a conflict instead of silent last-write-wins; pair with field-level last-edited-by/timestamp display.
- Undo affordance (5s toast) for bulk operations (tags/decisions/delete) on the applications page to recover from accidental large-scale actions on slow networks.
- Sticky-top pagination or infinite scroll for long lists on mobile (applications, people) so Next/Prev aren't buried below a long table.
- Keyboard-shortcut discoverability in certificate studio: tooltips on undo/redo showing Cmd/Ctrl+Z, and preserve unsaved zoom on draft-conflict reload (workspace L276-344).
- Mojibake CI guard + a global text-encoding lint rule so re-introduced UTF-8 corruption fails the build rather than reaching production strings.
- Server-persisted user preferences (e.g., reviewer auto-advance) instead of localStorage-only, so settings survive private browsing and sync across devices.

