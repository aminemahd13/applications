import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient();
const DEV_PASSWORD_HASH =
    '$argon2id$v=19$m=65536,t=3,p=4$oSN/XpCW3EsRS3RqF56g2A$MslksHlyBs648NzmCCiHYGoTfVFwfqLYNCpL6cqGWos';

function uuid() {
    return crypto.randomUUID();
}

async function main() {
    console.log('🌱 Seeding database...\n');

    // Clean up existing data
    console.log('🧹 Cleaning up existing data...');
    await prisma.$executeRaw`TRUNCATE TABLE events CASCADE`;
    console.log('   ✓ Cleanup complete\n');

    const now = new Date();
    const daysAgo = (days: number) =>
        new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const daysFromNow = (days: number) =>
        new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    // =====================
    // 1. ORG SETTINGS
    // =====================
    console.log('⚙️  Creating org settings...');
    await prisma.org_settings.upsert({
        where: { id: 1 },
        update: {},
        create: {
            id: 1,
            branding: {
                name: 'Math&Maroc',
                logo: '/logo.svg',
                colors: { primary: '#2563eb', secondary: '#7c3aed' }
            },
            security: { sessionTimeout: 3600 },
            email: { from: 'noreply@mathmaroc.org' },
            storage: { provider: 'minio' },
            retention: { days: 365 },
        },
    });
    console.log('   ✓ Org settings created\n');

    // =====================
    // 2. USERS
    // =====================
    console.log('👥 Creating users...');

    const globalAdmin = await prisma.users.upsert({
        where: { email: 'admin@mathmaroc.org' },
        update: {
            password_hash: DEV_PASSWORD_HASH,
            is_disabled: false,
            is_global_admin: true,
            email_verified_at: new Date(),
        },
        create: {
            id: uuid(),
            email: 'admin@mathmaroc.org',
            password_hash: DEV_PASSWORD_HASH,
            is_disabled: false,
            is_global_admin: true,
            email_verified_at: new Date(),
        },
    });

    const organizer = await prisma.users.upsert({
        where: { email: 'organizer@mathmaroc.org' },
        update: {
            password_hash: DEV_PASSWORD_HASH,
            is_disabled: false,
            email_verified_at: new Date(),
        },
        create: {
            id: uuid(),
            email: 'organizer@mathmaroc.org',
            password_hash: DEV_PASSWORD_HASH,
            email_verified_at: new Date(),
        },
    });

    const reviewer = await prisma.users.upsert({
        where: { email: 'reviewer@mathmaroc.org' },
        update: {
            password_hash: DEV_PASSWORD_HASH,
            is_disabled: false,
            email_verified_at: new Date(),
        },
        create: {
            id: uuid(),
            email: 'reviewer@mathmaroc.org',
            password_hash: DEV_PASSWORD_HASH,
            email_verified_at: new Date(),
        },
    });

    const checkinStaff = await prisma.users.upsert({
        where: { email: 'checkin@mathmaroc.org' },
        update: {
            password_hash: DEV_PASSWORD_HASH,
            is_disabled: false,
            email_verified_at: new Date(),
        },
        create: {
            id: uuid(),
            email: 'checkin@mathmaroc.org',
            password_hash: DEV_PASSWORD_HASH,
            email_verified_at: new Date(),
        },
    });

    const contentEditor = await prisma.users.upsert({
        where: { email: 'content@mathmaroc.org' },
        update: {
            password_hash: DEV_PASSWORD_HASH,
            is_disabled: false,
            email_verified_at: new Date(),
        },
        create: {
            id: uuid(),
            email: 'content@mathmaroc.org',
            password_hash: DEV_PASSWORD_HASH,
            email_verified_at: new Date(),
        },
    });

    const aisha = await prisma.users.upsert({
        where: { email: 'aisha@mathmaroc.org' },
        update: {
            password_hash: DEV_PASSWORD_HASH,
            is_disabled: false,
            email_verified_at: new Date(),
        },
        create: {
            id: uuid(),
            email: 'aisha@mathmaroc.org',
            password_hash: DEV_PASSWORD_HASH,
            email_verified_at: new Date(),
        },
    });

    const youssef = await prisma.users.upsert({
        where: { email: 'youssef@mathmaroc.org' },
        update: {
            password_hash: DEV_PASSWORD_HASH,
            is_disabled: false,
            email_verified_at: new Date(),
        },
        create: {
            id: uuid(),
            email: 'youssef@mathmaroc.org',
            password_hash: DEV_PASSWORD_HASH,
            email_verified_at: new Date(),
        },
    });

    const salma = await prisma.users.upsert({
        where: { email: 'salma@mathmaroc.org' },
        update: {
            password_hash: DEV_PASSWORD_HASH,
            is_disabled: false,
            email_verified_at: new Date(),
        },
        create: {
            id: uuid(),
            email: 'salma@mathmaroc.org',
            password_hash: DEV_PASSWORD_HASH,
            email_verified_at: new Date(),
        },
    });

    const omar = await prisma.users.upsert({
        where: { email: 'omar@mathmaroc.org' },
        update: {
            password_hash: DEV_PASSWORD_HASH,
            is_disabled: false,
            email_verified_at: new Date(),
        },
        create: {
            id: uuid(),
            email: 'omar@mathmaroc.org',
            password_hash: DEV_PASSWORD_HASH,
            email_verified_at: new Date(),
        },
    });

    const lina = await prisma.users.upsert({
        where: { email: 'lina@mathmaroc.org' },
        update: {
            password_hash: DEV_PASSWORD_HASH,
            is_disabled: false,
            email_verified_at: new Date(),
        },
        create: {
            id: uuid(),
            email: 'lina@mathmaroc.org',
            password_hash: DEV_PASSWORD_HASH,
            email_verified_at: new Date(),
        },
    });

    const kamal = await prisma.users.upsert({
        where: { email: 'kamal@mathmaroc.org' },
        update: {
            password_hash: DEV_PASSWORD_HASH,
            is_disabled: false,
            email_verified_at: new Date(),
        },
        create: {
            id: uuid(),
            email: 'kamal@mathmaroc.org',
            password_hash: DEV_PASSWORD_HASH,
            email_verified_at: new Date(),
        },
    });

    const nadia = await prisma.users.upsert({
        where: { email: 'nadia@mathmaroc.org' },
        update: {
            password_hash: DEV_PASSWORD_HASH,
            is_disabled: false,
            email_verified_at: new Date(),
        },
        create: {
            id: uuid(),
            email: 'nadia@mathmaroc.org',
            password_hash: DEV_PASSWORD_HASH,
            email_verified_at: new Date(),
        },
    });

    console.log(
        '   ✓ Created: admin, organizer, reviewer, checkin, content editor, applicants\n'
    );

    console.log('🪪 Creating applicant profiles...');
    const profileRows = [
        {
            user_id: globalAdmin.id,
            full_name: 'Global Admin',
            city: 'Rabat',
            country: 'Morocco',
            links: [],
        },
        {
            user_id: organizer.id,
            full_name: 'Yassine Organizer',
            city: 'Casablanca',
            country: 'Morocco',
            links: [],
        },
        {
            user_id: reviewer.id,
            full_name: 'Rania Reviewer',
            city: 'Rabat',
            country: 'Morocco',
            links: [],
        },
        {
            user_id: checkinStaff.id,
            full_name: 'Hassan Checkin',
            city: 'Rabat',
            country: 'Morocco',
            links: [],
        },
        {
            user_id: contentEditor.id,
            full_name: 'Maya Content',
            city: 'Casablanca',
            country: 'Morocco',
            links: [],
        },
        {
            user_id: aisha.id,
            full_name: 'Aisha El Fassi',
            phone: '+212600000001',
            education_level: 'High School',
            institution: 'Lycee Moulay Youssef',
            city: 'Rabat',
            country: 'Morocco',
            links: ['https://example.com/aisha'],
        },
        {
            user_id: youssef.id,
            full_name: 'Youssef Amrani',
            phone: '+212600000002',
            education_level: 'High School',
            institution: 'Lycee Descartes',
            city: 'Casablanca',
            country: 'Morocco',
            links: [],
        },
        {
            user_id: salma.id,
            full_name: 'Salma Idrissi',
            phone: '+212600000003',
            education_level: 'High School',
            institution: 'Groupe Scolaire Al Jabr',
            city: 'Fes',
            country: 'Morocco',
            links: [],
        },
        {
            user_id: omar.id,
            full_name: 'Omar Kabbaj',
            phone: '+212600000004',
            education_level: 'High School',
            institution: 'Lycee Ibn Sina',
            city: 'Tangier',
            country: 'Morocco',
            links: ['https://example.com/omar'],
        },
        {
            user_id: lina.id,
            full_name: 'Lina Benali',
            phone: '+212600000005',
            education_level: 'High School',
            institution: 'Lycee Al Khawarizmi',
            city: 'Marrakesh',
            country: 'Morocco',
            links: [],
        },
        {
            user_id: kamal.id,
            full_name: 'Kamal Essaadi',
            phone: '+212600000006',
            education_level: 'High School',
            institution: 'Lycee Al Massira',
            city: 'Agadir',
            country: 'Morocco',
            links: [],
        },
        {
            user_id: nadia.id,
            full_name: 'Nadia Zerouali',
            phone: '+212600000007',
            education_level: 'High School',
            institution: 'Lycee Omar Khayyam',
            city: 'Rabat',
            country: 'Morocco',
            links: ['https://example.com/nadia'],
        },
    ];

    for (const profile of profileRows) {
        await prisma.applicant_profiles.upsert({
            where: { user_id: profile.user_id },
            update: profile,
            create: profile,
        });
    }
    console.log('   ✓ Applicant profiles created\n');

    // =====================
    // 3. ORG SITE (System Site)
    // =====================
    console.log('🏠 Creating Organization Site...');

    const orgSite = await prisma.events.create({
        data: {
            id: uuid(),
            title: 'Math&Maroc Organization',
            slug: 'org',
            is_system_site: true,
            status: 'published',
            timezone: 'Africa/Casablanca',
            format: 'in_person',
        }
    });

    // Org Site Microsite
    const orgMicrosite = await prisma.microsites.create({
        data: {
            id: uuid(),
            event_id: orgSite.id,
            settings: {
                theme: 'light',
                primaryColor: '#2563eb',
                navigation: {
                    links: [
                        { label: 'Home', href: '/' },
                        { label: 'About', href: '/about' },
                        { label: 'Events', href: '/our-events' },
                        { label: 'Contact', href: '/contact' },
                    ]
                }
            },
            published_version: 1,
        }
    });

    // Org Site Pages
    await prisma.microsite_pages.createMany({
        data: [
            // ... (pages data same as before)
            {
                id: uuid(),
                microsite_id: orgMicrosite.id,
                slug: 'home',
                title: 'Welcome to Math&Maroc',
                blocks: [
                    {
                        id: uuid(),
                        type: 'HERO',
                        data: {
                            title: 'Empowering Morocco Through Mathematics',
                            subtitle: 'Join our community of mathematicians, educators, and students passionate about advancing mathematical education in Morocco.',
                            cta: { label: 'Explore Our Events', href: '/our-events' },
                            facts: [
                                { label: 'Students Reached', value: '5,000+' },
                                { label: 'Events Organized', value: '50+' },
                                { label: 'Partner Schools', value: '120+' },
                            ]
                        }
                    },
                    {
                        id: uuid(),
                        type: 'STATS',
                        data: {
                            items: [
                                { label: 'National Olympiad Medalists', value: '250', suffix: '+' },
                                { label: 'International Competitions', value: '15' },
                                { label: 'Training Camps', value: '30', suffix: '+' },
                                { label: 'Active Volunteers', value: '100', suffix: '+' },
                            ]
                        }
                    },
                    {
                        id: uuid(),
                        type: 'CARD_GRID',
                        data: {
                            columns: 3,
                            items: [
                                { title: 'Math Olympiad', text: 'Compete at the highest level.', icon: 'Trophy' },
                                { title: 'Training Camps', text: 'Intensive preparation programs.', icon: 'GraduationCap' },
                                { title: 'Outreach', text: 'Bringing math to all of Morocco.', icon: 'Heart' },
                            ]
                        }
                    },
                ],
                seo: { title: 'Math&Maroc - Empowering Morocco Through Mathematics', description: 'Math&Maroc organizes mathematical competitions, training camps, and outreach programs across Morocco.' },
                position: 0,
            },
            {
                id: uuid(),
                microsite_id: orgMicrosite.id,
                slug: 'about',
                title: 'About Us',
                blocks: [
                    {
                        id: uuid(),
                        type: 'HERO',
                        data: {
                            title: 'About Math&Maroc',
                            subtitle: 'Our mission is to inspire and nurture mathematical talent in Morocco.',
                        }
                    },
                    {
                        id: uuid(),
                        type: 'TIMELINE',
                        data: {
                            items: [
                                { date: '2015', label: 'Founded' },
                                { date: '2017', label: 'First National Competition' },
                                { date: '2019', label: 'IMO Medals' },
                                { date: '2023', label: 'Platform Launch' },
                            ]
                        }
                    },
                ],
                seo: { title: 'About Math&Maroc' },
                position: 1,
            },
            {
                id: uuid(),
                microsite_id: orgMicrosite.id,
                slug: 'our-events',
                title: 'Our Events',
                blocks: [
                    {
                        id: uuid(),
                        type: 'HERO',
                        data: {
                            title: 'Upcoming Events',
                            subtitle: 'Join our competitions and camps.',
                        }
                    },
                    {
                        id: uuid(),
                        type: 'CARD_GRID',
                        data: {
                            columns: 2,
                            items: [
                                { title: 'Math Maroc Camp 2026', text: 'July 15-25, 2026', cta: { label: 'Learn More', href: '/events/mmc' } },
                                { title: 'National Olympiad 2026', text: 'Coming Soon' },
                            ]
                        }
                    },
                ],
                seo: { title: 'Events - Math&Maroc' },
                position: 2,
            },
            {
                id: uuid(),
                microsite_id: orgMicrosite.id,
                slug: 'contact',
                title: 'Contact Us',
                blocks: [
                    {
                        id: uuid(),
                        type: 'HERO',
                        data: { title: 'Get in Touch' }
                    },
                    {
                        id: uuid(),
                        type: 'FAQ',
                        data: {
                            items: [
                                { q: 'How can I volunteer?', a: 'Email volunteers@mathmaroc.org' },
                                { q: 'How do I register?', a: 'Visit the event page and click Apply Now.' },
                            ]
                        }
                    },
                ],
                seo: { title: 'Contact - Math&Maroc' },
                position: 3,
            },
        ]
    });

    // Create Published Version (Org)
    const orgVersion = await prisma.microsite_versions.create({
        data: {
            microsite_id: orgMicrosite.id,
            version: 1,
            settings: orgMicrosite.settings as any,
            created_by: globalAdmin.id,
        }
    });

    // Create Page Versions (Org)
    const orgPages = await prisma.microsite_pages.findMany({ where: { microsite_id: orgMicrosite.id } });
    await prisma.microsite_page_versions.createMany({
        data: orgPages.map(p => ({
            microsite_id: orgMicrosite.id,
            microsite_version_id: orgVersion.id,
            page_id: p.id,
            version: 1,
            slug: p.slug,
            title: p.title,
            position: p.position,
            blocks: p.blocks as any,
            seo: p.seo as any,
            visibility: p.visibility,
            created_by: globalAdmin.id,
        }))
    });

    console.log('   ✓ Org site published (v1)\n');

    // =====================
    // 4. EVENTS + WORKFLOWS
    // =====================
    console.log('Creating events, workflows, and applications...');

    // Event A: Math Maroc Camp 2026
    console.log('Creating event (Math Maroc Camp 2026)...');

    const mmcEvent = await prisma.events.create({
        data: {
            id: uuid(),
            title: 'Math Maroc Camp 2026',
            slug: 'mmc',
            status: 'published',
            timezone: 'Africa/Casablanca',
            format: 'in_person',
            start_at: new Date('2026-07-15'),
            end_at: new Date('2026-07-25'),
            application_open_at: new Date('2026-01-01'),
            application_close_at: new Date('2026-06-01'),
            venue_name: 'Mohammed V University',
            venue_address: 'Rabat, Morocco',
            description: 'Ten days of intensive mathematics training and workshops.',
            capacity: 120,
            requires_email_verification: true,
            decision_config: { autoPublish: false },
            checkin_config: {
                enabled: true,
                allowSelfCheckin: false,
                qrCodeRequired: false,
            },
        }
    });

    const mmcOrganizerRoleId = uuid();
    const mmcReviewerRoleId = uuid();
    const mmcCheckinRoleId = uuid();
    const mmcContentRoleId = uuid();

    await prisma.event_role_assignments.createMany({
        data: [
            { id: mmcOrganizerRoleId, event_id: mmcEvent.id, user_id: organizer.id, role: 'organizer' },
            { id: mmcReviewerRoleId, event_id: mmcEvent.id, user_id: reviewer.id, role: 'reviewer' },
            { id: mmcCheckinRoleId, event_id: mmcEvent.id, user_id: checkinStaff.id, role: 'checkin_staff' },
            { id: mmcContentRoleId, event_id: mmcEvent.id, user_id: contentEditor.id, role: 'content_editor' },
        ]
    });

    // MMC Microsite
    const mmcMicrosite = await prisma.microsites.create({
        data: {
            id: uuid(),
            event_id: mmcEvent.id,
            settings: {
                theme: 'dark',
                primaryColor: '#7c3aed',
                navigation: {
                    links: [
                        { label: 'Home', href: '/' },
                        { label: 'Schedule', href: '/schedule' },
                        { label: 'FAQ', href: '/faq' },
                    ]
                }
            },
            published_version: 1,
        }
    });

    // MMC Pages
    await prisma.microsite_pages.createMany({
        data: [
            {
                id: uuid(),
                microsite_id: mmcMicrosite.id,
                slug: 'home',
                title: 'Math Maroc Camp 2026',
                blocks: [
                    {
                        id: uuid(),
                        type: 'HERO',
                        data: {
                            title: 'Math Maroc Camp 2026',
                            subtitle: '10 days of intensive mathematics training.',
                            cta: { label: 'Apply Now', href: '/apply' },
                            facts: [
                                { label: 'Dates', value: 'July 15-25' },
                                { label: 'Location', value: 'Rabat' },
                                { label: 'Spots', value: '120' },
                            ]
                        }
                    },
                    {
                        id: uuid(),
                        type: 'STEPS',
                        data: {
                            title: 'How It Works',
                            steps: [
                                { title: 'Apply', description: 'Submit your application.' },
                                { title: 'Selection', description: 'We review applications.' },
                                { title: 'Confirm', description: 'Accepted students confirm.' },
                                { title: 'Attend', description: 'Join the camp!' },
                            ]
                        }
                    },
                ],
                seo: { title: 'Math Maroc Camp 2026' },
                position: 0,
            },
            {
                id: uuid(),
                microsite_id: mmcMicrosite.id,
                slug: 'schedule',
                title: 'Schedule',
                blocks: [
                    {
                        id: uuid(),
                        type: 'HERO',
                        data: { title: 'Daily Schedule' }
                    },
                    {
                        id: uuid(),
                        type: 'TIMELINE',
                        data: {
                            items: [
                                { date: '08:00', label: 'Breakfast' },
                                { date: '09:00', label: 'Lecture' },
                                { date: '12:00', label: 'Lunch' },
                                { date: '14:00', label: 'Problem Session' },
                                { date: '17:00', label: 'Recreation' },
                                { date: '19:00', label: 'Dinner' },
                            ]
                        }
                    },
                ],
                seo: { title: 'Schedule - Math Maroc Camp 2026' },
                position: 1,
            },
            {
                id: uuid(),
                microsite_id: mmcMicrosite.id,
                slug: 'faq',
                title: 'FAQ',
                blocks: [
                    {
                        id: uuid(),
                        type: 'HERO',
                        data: { title: 'FAQ' }
                    },
                    {
                        id: uuid(),
                        type: 'FAQ',
                        data: {
                            items: [
                                { q: 'Who can apply?', a: 'Students aged 14-18.' },
                                { q: 'Is there a fee?', a: 'No, it is free!' },
                                { q: 'What to bring?', a: 'Notebooks and pens.' },
                            ]
                        }
                    },
                ],
                seo: { title: 'FAQ - Math Maroc Camp 2026' },
                position: 2,
            },
        ]
    });

    // Create Published Version (MMC)
    const mmcVersion = await prisma.microsite_versions.create({
        data: {
            microsite_id: mmcMicrosite.id,
            version: 1,
            settings: mmcMicrosite.settings as any,
            created_by: organizer.id,
        }
    });

    // Create Page Versions (MMC)
    const mmcPages = await prisma.microsite_pages.findMany({ where: { microsite_id: mmcMicrosite.id } });
    await prisma.microsite_page_versions.createMany({
        data: mmcPages.map(p => ({
            microsite_id: mmcMicrosite.id,
            microsite_version_id: mmcVersion.id,
            page_id: p.id,
            version: 1,
            slug: p.slug,
            title: p.title,
            position: p.position,
            blocks: p.blocks as any,
            seo: p.seo as any,
            visibility: p.visibility,
            created_by: organizer.id,
        }))
    });

    console.log('   ✓ MMC microsite published (v1)\n');

    // MMC Forms
    const mmcApplicationForm = await prisma.forms.create({
        data: {
            id: uuid(),
            event_id: mmcEvent.id,
            name: 'Application Form',
        }
    });

    const mmcApplicationFormVersion = await prisma.form_versions.create({
        data: {
            id: uuid(),
            form_id: mmcApplicationForm.id,
            version_number: 1,
            schema: {
                sections: [{
                    id: 'personal',
                    title: 'Personal Information',
                    fields: [
                        { id: 'fullName', key: 'fullName', type: 'text', label: 'Full Name', validation: { required: true } },
                        { id: 'school', key: 'school', type: 'text', label: 'School Name', validation: { required: true } },
                        { id: 'city', key: 'city', type: 'text', label: 'City', validation: { required: true } },
                        { id: 'motivation', key: 'motivation', type: 'textarea', label: 'Why do you want to attend?', validation: { required: true } },
                    ]
                }]
            },
            ui: {},
            published_by: organizer.id,
        }
    });

    const mmcEssayForm = await prisma.forms.create({
        data: {
            id: uuid(),
            event_id: mmcEvent.id,
            name: 'Problem Set',
        }
    });

    const mmcEssayFormVersion = await prisma.form_versions.create({
        data: {
            id: uuid(),
            form_id: mmcEssayForm.id,
            version_number: 1,
            schema: {
                sections: [{
                    id: 'problem',
                    title: 'Problem Set',
                    fields: [
                        {
                            id: 'favoriteTopic',
                            key: 'favoriteTopic',
                            type: 'select',
                            label: 'Favorite Topic',
                            validation: { required: true },
                            ui: {
                                options: [
                                    { label: 'Algebra', value: 'algebra' },
                                    { label: 'Geometry', value: 'geometry' },
                                    { label: 'Number Theory', value: 'number_theory' },
                                    { label: 'Combinatorics', value: 'combinatorics' },
                                ]
                            }
                        },
                        {
                            id: 'challenge',
                            key: 'challenge',
                            type: 'textarea',
                            label: 'Describe a challenging problem you solved',
                            validation: { required: true },
                        },
                        {
                            id: 'awards',
                            key: 'awards',
                            type: 'text',
                            label: 'Math awards (optional)',
                        },
                    ]
                }]
            },
            ui: {},
            published_by: organizer.id,
        }
    });

    const mmcConfirmationForm = await prisma.forms.create({
        data: {
            id: uuid(),
            event_id: mmcEvent.id,
            name: 'Attendance Confirmation',
        }
    });

    const mmcConfirmationFormVersion = await prisma.form_versions.create({
        data: {
            id: uuid(),
            form_id: mmcConfirmationForm.id,
            version_number: 1,
            schema: {
                sections: [{
                    id: 'confirm',
                    title: 'Attendance Confirmation',
                    fields: [
                        {
                            id: 'attendance',
                            key: 'attendance',
                            type: 'checkbox',
                            label: 'I confirm I will attend the camp',
                            validation: { required: true },
                        },
                        {
                            id: 'dietary',
                            key: 'dietary',
                            type: 'text',
                            label: 'Dietary restrictions',
                        },
                        {
                            id: 'travel',
                            key: 'travel',
                            type: 'textarea',
                            label: 'Travel needs or notes',
                        },
                    ]
                }]
            },
            ui: {},
            published_by: organizer.id,
        }
    });

    // MMC Workflow Steps
    const mmcStepApplication = await prisma.workflow_steps.create({
        data: {
            id: uuid(),
            event_id: mmcEvent.id,
            step_index: 0,
            category: 'APPLICATION',
            title: 'Application Form',
            instructions_rich: 'Complete all required fields before submitting.',
            unlock_policy: 'AUTO_AFTER_PREV_SUBMITTED',
            review_required: true,
            strict_gating: true,
            form_version_id: mmcApplicationFormVersion.id,
        }
    });

    const mmcStepEssay = await prisma.workflow_steps.create({
        data: {
            id: uuid(),
            event_id: mmcEvent.id,
            step_index: 1,
            category: 'APPLICATION',
            title: 'Problem Set',
            instructions_rich: 'Share your math background and problem-solving approach.',
            unlock_policy: 'AFTER_PREV_APPROVED',
            review_required: true,
            strict_gating: true,
            form_version_id: mmcEssayFormVersion.id,
        }
    });

    const mmcStepConfirmation = await prisma.workflow_steps.create({
        data: {
            id: uuid(),
            event_id: mmcEvent.id,
            step_index: 2,
            category: 'CONFIRMATION',
            title: 'Attendance Confirmation',
            instructions_rich: 'Confirm attendance once you receive an acceptance decision.',
            unlock_policy: 'AFTER_DECISION_ACCEPTED',
            review_required: false,
            strict_gating: true,
            form_version_id: mmcConfirmationFormVersion.id,
        }
    });

    // MMC Applications
    const mmcAppA = await prisma.applications.create({
        data: {
            id: uuid(),
            event_id: mmcEvent.id,
            applicant_user_id: aisha.id,
            decision_status: 'NONE',
            decision_draft: {},
            tags: ['first-time'],
        }
    });

    const mmcAppB = await prisma.applications.create({
        data: {
            id: uuid(),
            event_id: mmcEvent.id,
            applicant_user_id: youssef.id,
            decision_status: 'NONE',
            decision_draft: {},
            tags: ['olympiad', 'priority'],
            assigned_reviewer_id: reviewer.id,
            internal_notes: 'Strong olympiad track.',
        }
    });

    const mmcAppC = await prisma.applications.create({
        data: {
            id: uuid(),
            event_id: mmcEvent.id,
            applicant_user_id: salma.id,
            decision_status: 'NONE',
            decision_draft: {},
            tags: ['needs-info'],
            assigned_reviewer_id: reviewer.id,
            internal_notes: 'Asked to expand motivation.',
        }
    });

    const mmcAppD = await prisma.applications.create({
        data: {
            id: uuid(),
            event_id: mmcEvent.id,
            applicant_user_id: omar.id,
            decision_status: 'ACCEPTED',
            decision_published_at: daysAgo(2),
            decision_draft: {},
            tags: ['accepted', 'scholarship'],
            assigned_reviewer_id: reviewer.id,
        }
    });

    const mmcAppE = await prisma.applications.create({
        data: {
            id: uuid(),
            event_id: mmcEvent.id,
            applicant_user_id: lina.id,
            decision_status: 'ACCEPTED',
            decision_published_at: daysAgo(1),
            decision_draft: {},
            tags: ['accepted'],
            assigned_reviewer_id: reviewer.id,
        }
    });

    const mmcAppF = await prisma.applications.create({
        data: {
            id: uuid(),
            event_id: mmcEvent.id,
            applicant_user_id: kamal.id,
            decision_status: 'REJECTED',
            decision_published_at: daysAgo(3),
            decision_draft: {},
            tags: ['rejected'],
            internal_notes: 'Prerequisites not met.',
        }
    });

    const mmcAppG = await prisma.applications.create({
        data: {
            id: uuid(),
            event_id: mmcEvent.id,
            applicant_user_id: nadia.id,
            decision_status: 'WAITLISTED',
            decision_draft: {},
            tags: ['waitlist'],
            assigned_reviewer_id: reviewer.id,
        }
    });

    // MMC Drafts + Submissions
    const mmcDraftA = await prisma.step_drafts.create({
        data: {
            id: uuid(),
            application_id: mmcAppA.id,
            step_id: mmcStepApplication.id,
            form_version_id: mmcApplicationFormVersion.id,
            answers_draft: {
                fullName: 'Aisha El Fassi',
                school: 'Lycee Moulay Youssef',
                city: 'Rabat',
                motivation: 'I want to deepen my problem-solving skills.',
            },
            updated_at: daysAgo(1),
        }
    });

    const mmcSubB0 = await prisma.step_submission_versions.create({
        data: {
            id: uuid(),
            application_id: mmcAppB.id,
            step_id: mmcStepApplication.id,
            form_version_id: mmcApplicationFormVersion.id,
            version_number: 1,
            answers_snapshot: {
                fullName: 'Youssef Amrani',
                school: 'Lycee Descartes',
                city: 'Casablanca',
                motivation: 'I want to prepare for national competitions.',
            },
            submitted_at: daysAgo(3),
            submitted_by: youssef.id,
        }
    });

    const mmcSubC0 = await prisma.step_submission_versions.create({
        data: {
            id: uuid(),
            application_id: mmcAppC.id,
            step_id: mmcStepApplication.id,
            form_version_id: mmcApplicationFormVersion.id,
            version_number: 1,
            answers_snapshot: {
                fullName: 'Salma Idrissi',
                school: 'Groupe Scolaire Al Jabr',
                city: 'Fes',
                motivation: 'I love math and want to learn more.',
            },
            submitted_at: daysAgo(6),
            submitted_by: salma.id,
        }
    });

    const mmcSubD0 = await prisma.step_submission_versions.create({
        data: {
            id: uuid(),
            application_id: mmcAppD.id,
            step_id: mmcStepApplication.id,
            form_version_id: mmcApplicationFormVersion.id,
            version_number: 1,
            answers_snapshot: {
                fullName: 'Omar Kabbaj',
                school: 'Lycee Ibn Sina',
                city: 'Tangier',
                motivation: 'I want to train with top mentors.',
            },
            submitted_at: daysAgo(10),
            submitted_by: omar.id,
        }
    });

    const mmcSubD1 = await prisma.step_submission_versions.create({
        data: {
            id: uuid(),
            application_id: mmcAppD.id,
            step_id: mmcStepEssay.id,
            form_version_id: mmcEssayFormVersion.id,
            version_number: 1,
            answers_snapshot: {
                favoriteTopic: 'combinatorics',
                challenge: 'I solved a combinatorics counting problem using invariants.',
                awards: 'Regional Olympiad 2025',
            },
            submitted_at: daysAgo(8),
            submitted_by: omar.id,
        }
    });

    const mmcSubD2 = await prisma.step_submission_versions.create({
        data: {
            id: uuid(),
            application_id: mmcAppD.id,
            step_id: mmcStepConfirmation.id,
            form_version_id: mmcConfirmationFormVersion.id,
            version_number: 1,
            answers_snapshot: {
                attendance: true,
                dietary: 'None',
                travel: 'Need airport pickup.',
            },
            submitted_at: daysAgo(2),
            submitted_by: omar.id,
        }
    });

    const mmcSubE0 = await prisma.step_submission_versions.create({
        data: {
            id: uuid(),
            application_id: mmcAppE.id,
            step_id: mmcStepApplication.id,
            form_version_id: mmcApplicationFormVersion.id,
            version_number: 1,
            answers_snapshot: {
                fullName: 'Lina Benali',
                school: 'Lycee Al Khawarizmi',
                city: 'Marrakesh',
                motivation: 'I want to meet other students who love math.',
            },
            submitted_at: daysAgo(9),
            submitted_by: lina.id,
        }
    });

    const mmcSubE1 = await prisma.step_submission_versions.create({
        data: {
            id: uuid(),
            application_id: mmcAppE.id,
            step_id: mmcStepEssay.id,
            form_version_id: mmcEssayFormVersion.id,
            version_number: 1,
            answers_snapshot: {
                favoriteTopic: 'geometry',
                challenge: 'I solved a geometry problem using inversion.',
                awards: 'School Math Club Lead',
            },
            submitted_at: daysAgo(7),
            submitted_by: lina.id,
        }
    });

    const mmcSubE2 = await prisma.step_submission_versions.create({
        data: {
            id: uuid(),
            application_id: mmcAppE.id,
            step_id: mmcStepConfirmation.id,
            form_version_id: mmcConfirmationFormVersion.id,
            version_number: 1,
            answers_snapshot: {
                attendance: true,
                dietary: 'Vegetarian',
                travel: 'Arriving by train.',
            },
            submitted_at: daysAgo(1),
            submitted_by: lina.id,
        }
    });

    const mmcSubF0 = await prisma.step_submission_versions.create({
        data: {
            id: uuid(),
            application_id: mmcAppF.id,
            step_id: mmcStepApplication.id,
            form_version_id: mmcApplicationFormVersion.id,
            version_number: 1,
            answers_snapshot: {
                fullName: 'Kamal Essaadi',
                school: 'Lycee Al Massira',
                city: 'Agadir',
                motivation: 'I want to build stronger foundations.',
            },
            submitted_at: daysAgo(5),
            submitted_by: kamal.id,
        }
    });

    const mmcSubG0 = await prisma.step_submission_versions.create({
        data: {
            id: uuid(),
            application_id: mmcAppG.id,
            step_id: mmcStepApplication.id,
            form_version_id: mmcApplicationFormVersion.id,
            version_number: 1,
            answers_snapshot: {
                fullName: 'Nadia Zerouali',
                school: 'Lycee Omar Khayyam',
                city: 'Rabat',
                motivation: 'I want to join the national training track.',
            },
            submitted_at: daysAgo(4),
            submitted_by: nadia.id,
        }
    });

    const mmcSubG1 = await prisma.step_submission_versions.create({
        data: {
            id: uuid(),
            application_id: mmcAppG.id,
            step_id: mmcStepEssay.id,
            form_version_id: mmcEssayFormVersion.id,
            version_number: 1,
            answers_snapshot: {
                favoriteTopic: 'number_theory',
                challenge: 'I worked on a modular arithmetic proof.',
                awards: 'City Olympiad Finalist',
            },
            submitted_at: daysAgo(3),
            submitted_by: nadia.id,
        }
    });

    // MMC Reviews + Needs Info + Admin Patches
    await prisma.review_records.create({
        data: {
            id: uuid(),
            submission_version_id: mmcSubC0.id,
            reviewer_id: reviewer.id,
            outcome: 'REQUEST_INFO',
            checklist_result: { eligibility: true },
            message_to_applicant: 'Please expand your motivation statement.',
            notes_internal: 'Motivation too brief.',
        }
    });

    await prisma.review_records.create({
        data: {
            id: uuid(),
            submission_version_id: mmcSubD0.id,
            reviewer_id: reviewer.id,
            outcome: 'APPROVE',
            checklist_result: { eligibility: true, completeness: true },
            message_to_applicant: 'Great application.',
            notes_internal: 'Strong background.',
        }
    });

    await prisma.review_records.create({
        data: {
            id: uuid(),
            submission_version_id: mmcSubD1.id,
            reviewer_id: reviewer.id,
            outcome: 'APPROVE',
            checklist_result: { problemSet: true },
            message_to_applicant: 'Excellent solution.',
            notes_internal: 'Ready for acceptance.',
        }
    });

    await prisma.review_records.create({
        data: {
            id: uuid(),
            submission_version_id: mmcSubF0.id,
            reviewer_id: reviewer.id,
            outcome: 'REJECT',
            checklist_result: { eligibility: false },
            message_to_applicant: 'Not eligible this year.',
            notes_internal: 'Missing prerequisites.',
        }
    });

    const mmcNeedsInfo = await prisma.needs_info_requests.create({
        data: {
            id: uuid(),
            application_id: mmcAppC.id,
            step_id: mmcStepApplication.id,
            submission_version_id: mmcSubC0.id,
            target_field_ids: ['motivation'],
            message: 'Please expand your motivation with more details.',
            deadline_at: daysFromNow(7),
            status: 'OPEN',
            created_by: reviewer.id,
        }
    });

    await prisma.admin_change_patches.create({
        data: {
            id: uuid(),
            application_id: mmcAppB.id,
            step_id: mmcStepApplication.id,
            submission_version_id: mmcSubB0.id,
            ops: [
                { op: 'replace', path: '/motivation', value: 'I want to prepare for national competitions and learn from mentors.' },
            ],
            reason: 'Clarified motivation statement',
            visibility: 'INTERNAL_ONLY',
            created_by: organizer.id,
        }
    });

    // MMC Attendance + Check-in
    const omarTicket = uuid();
    const linaTicket = uuid();

    await prisma.attendance_records.create({
        data: {
            application_id: mmcAppD.id,
            confirmed_at: daysAgo(2),
            confirmation_submission_version_id: mmcSubD2.id,
            qr_token_hash: omarTicket,
            qr_issued_at: daysAgo(2),
            checked_in_at: daysAgo(1),
            checked_in_by: checkinStaff.id,
            status: 'CHECKED_IN',
        }
    });

    await prisma.attendance_records.create({
        data: {
            application_id: mmcAppE.id,
            confirmed_at: daysAgo(1),
            confirmation_submission_version_id: mmcSubE2.id,
            qr_token_hash: linaTicket,
            qr_issued_at: daysAgo(1),
            status: 'CONFIRMED',
        }
    });

    await prisma.checkin_records.createMany({
        data: [
            {
                id: uuid(),
                event_id: mmcEvent.id,
                application_id: mmcAppD.id,
                staff_user_id: checkinStaff.id,
                scanned_at: daysAgo(1),
                result: 'SUCCESS',
                raw_token_fingerprint: omarTicket,
            },
        ]
    });

    // MMC Step States
    await prisma.application_step_states.createMany({
        data: [
            {
                id: uuid(),
                application_id: mmcAppA.id,
                step_id: mmcStepApplication.id,
                status: 'UNLOCKED',
                current_draft_id: mmcDraftA.id,
                unlocked_at: daysAgo(2),
                last_activity_at: daysAgo(1),
            },
            { id: uuid(), application_id: mmcAppA.id, step_id: mmcStepEssay.id, status: 'LOCKED' },
            { id: uuid(), application_id: mmcAppA.id, step_id: mmcStepConfirmation.id, status: 'LOCKED' },

            {
                id: uuid(),
                application_id: mmcAppB.id,
                step_id: mmcStepApplication.id,
                status: 'SUBMITTED',
                latest_submission_version_id: mmcSubB0.id,
                last_activity_at: daysAgo(3),
            },
            { id: uuid(), application_id: mmcAppB.id, step_id: mmcStepEssay.id, status: 'LOCKED' },
            { id: uuid(), application_id: mmcAppB.id, step_id: mmcStepConfirmation.id, status: 'LOCKED' },

            {
                id: uuid(),
                application_id: mmcAppC.id,
                step_id: mmcStepApplication.id,
                status: 'NEEDS_REVISION',
                latest_submission_version_id: mmcSubC0.id,
                revision_cycle_count: 1,
                last_activity_at: daysAgo(2),
            },
            { id: uuid(), application_id: mmcAppC.id, step_id: mmcStepEssay.id, status: 'LOCKED' },
            { id: uuid(), application_id: mmcAppC.id, step_id: mmcStepConfirmation.id, status: 'LOCKED' },

            {
                id: uuid(),
                application_id: mmcAppD.id,
                step_id: mmcStepApplication.id,
                status: 'APPROVED',
                latest_submission_version_id: mmcSubD0.id,
                last_activity_at: daysAgo(8),
            },
            {
                id: uuid(),
                application_id: mmcAppD.id,
                step_id: mmcStepEssay.id,
                status: 'APPROVED',
                latest_submission_version_id: mmcSubD1.id,
                last_activity_at: daysAgo(6),
            },
            {
                id: uuid(),
                application_id: mmcAppD.id,
                step_id: mmcStepConfirmation.id,
                status: 'SUBMITTED',
                latest_submission_version_id: mmcSubD2.id,
                last_activity_at: daysAgo(2),
            },

            {
                id: uuid(),
                application_id: mmcAppE.id,
                step_id: mmcStepApplication.id,
                status: 'APPROVED',
                latest_submission_version_id: mmcSubE0.id,
                last_activity_at: daysAgo(7),
            },
            {
                id: uuid(),
                application_id: mmcAppE.id,
                step_id: mmcStepEssay.id,
                status: 'APPROVED',
                latest_submission_version_id: mmcSubE1.id,
                last_activity_at: daysAgo(5),
            },
            {
                id: uuid(),
                application_id: mmcAppE.id,
                step_id: mmcStepConfirmation.id,
                status: 'SUBMITTED',
                latest_submission_version_id: mmcSubE2.id,
                last_activity_at: daysAgo(1),
            },

            {
                id: uuid(),
                application_id: mmcAppF.id,
                step_id: mmcStepApplication.id,
                status: 'REJECTED_FINAL',
                latest_submission_version_id: mmcSubF0.id,
                last_activity_at: daysAgo(4),
            },
            { id: uuid(), application_id: mmcAppF.id, step_id: mmcStepEssay.id, status: 'LOCKED' },
            { id: uuid(), application_id: mmcAppF.id, step_id: mmcStepConfirmation.id, status: 'LOCKED' },

            {
                id: uuid(),
                application_id: mmcAppG.id,
                step_id: mmcStepApplication.id,
                status: 'APPROVED',
                latest_submission_version_id: mmcSubG0.id,
                last_activity_at: daysAgo(4),
            },
            {
                id: uuid(),
                application_id: mmcAppG.id,
                step_id: mmcStepEssay.id,
                status: 'APPROVED',
                latest_submission_version_id: mmcSubG1.id,
                last_activity_at: daysAgo(3),
            },
            { id: uuid(), application_id: mmcAppG.id, step_id: mmcStepConfirmation.id, status: 'LOCKED' },
        ]
    });

    console.log('   ✓ MMC event seeded with applications\n');

    // Event B: National Olympiad 2026
    console.log('Creating event (National Olympiad 2026)...');

    const olympiadEvent = await prisma.events.create({
        data: {
            id: uuid(),
            title: 'National Olympiad 2026',
            slug: 'olympiad-2026',
            status: 'published',
            timezone: 'Africa/Casablanca',
            format: 'in_person',
            start_at: new Date('2026-04-10'),
            end_at: new Date('2026-04-12'),
            application_open_at: new Date('2026-03-01'),
            application_close_at: new Date('2026-03-20'),
            venue_name: 'Casablanca Convention Center',
            venue_address: 'Casablanca, Morocco',
            description: 'National-level competition for top students.',
            capacity: 300,
            decision_config: { autoPublish: true },
            checkin_config: { enabled: false },
        }
    });

    const olympiadOrganizerRoleId = uuid();
    const olympiadReviewerRoleId = uuid();
    const olympiadCheckinRoleId = uuid();

    await prisma.event_role_assignments.createMany({
        data: [
            { id: olympiadOrganizerRoleId, event_id: olympiadEvent.id, user_id: organizer.id, role: 'organizer' },
            { id: olympiadReviewerRoleId, event_id: olympiadEvent.id, user_id: reviewer.id, role: 'reviewer' },
            { id: olympiadCheckinRoleId, event_id: olympiadEvent.id, user_id: checkinStaff.id, role: 'checkin_staff' },
        ]
    });

    // Olympiad Microsite
    const olympiadMicrosite = await prisma.microsites.create({
        data: {
            id: uuid(),
            event_id: olympiadEvent.id,
            settings: {
                theme: 'light',
                primaryColor: '#0ea5e9',
                navigation: {
                    links: [
                        { label: 'Home', href: '/' },
                        { label: 'Schedule', href: '/schedule' },
                        { label: 'FAQ', href: '/faq' },
                    ]
                }
            },
            published_version: 1,
        }
    });

    await prisma.microsite_pages.createMany({
        data: [
            {
                id: uuid(),
                microsite_id: olympiadMicrosite.id,
                slug: 'home',
                title: 'National Olympiad 2026',
                blocks: [
                    {
                        id: uuid(),
                        type: 'HERO',
                        data: {
                            title: 'National Olympiad 2026',
                            subtitle: 'A national competition for Morocco\'s top students.',
                            cta: { label: 'Apply Now', href: '/apply' },
                            facts: [
                                { label: 'Dates', value: 'April 10-12' },
                                { label: 'Location', value: 'Casablanca' },
                                { label: 'Participants', value: '300' },
                            ]
                        }
                    },
                    {
                        id: uuid(),
                        type: 'CARD_GRID',
                        data: {
                            columns: 3,
                            items: [
                                { title: 'Rounds', text: 'Two contest rounds.', icon: 'Target' },
                                { title: 'Workshops', text: 'Expert-led sessions.', icon: 'BookOpen' },
                                { title: 'Awards', text: 'Medals + scholarships.', icon: 'Award' },
                            ]
                        }
                    },
                ],
                seo: { title: 'National Olympiad 2026' },
                position: 0,
            },
            {
                id: uuid(),
                microsite_id: olympiadMicrosite.id,
                slug: 'schedule',
                title: 'Schedule',
                blocks: [
                    {
                        id: uuid(),
                        type: 'HERO',
                        data: { title: 'Event Schedule' }
                    },
                    {
                        id: uuid(),
                        type: 'TIMELINE',
                        data: {
                            items: [
                                { date: 'Day 1', label: 'Registration + Opening' },
                                { date: 'Day 2', label: 'Contest Round 1' },
                                { date: 'Day 3', label: 'Contest Round 2 + Awards' },
                            ]
                        }
                    },
                ],
                seo: { title: 'Schedule - National Olympiad 2026' },
                position: 1,
            },
            {
                id: uuid(),
                microsite_id: olympiadMicrosite.id,
                slug: 'faq',
                title: 'FAQ',
                blocks: [
                    {
                        id: uuid(),
                        type: 'HERO',
                        data: { title: 'FAQ' }
                    },
                    {
                        id: uuid(),
                        type: 'FAQ',
                        data: {
                            items: [
                                { q: 'Who can apply?', a: 'Top students selected by schools.' },
                                { q: 'Is travel covered?', a: 'Travel grants are available.' },
                                { q: 'How many rounds?', a: 'Two rounds over three days.' },
                            ]
                        }
                    },
                ],
                seo: { title: 'FAQ - National Olympiad 2026' },
                position: 2,
            },
        ]
    });

    const olympiadVersion = await prisma.microsite_versions.create({
        data: {
            microsite_id: olympiadMicrosite.id,
            version: 1,
            settings: olympiadMicrosite.settings as any,
            created_by: organizer.id,
        }
    });

    const olympiadPages = await prisma.microsite_pages.findMany({ where: { microsite_id: olympiadMicrosite.id } });
    await prisma.microsite_page_versions.createMany({
        data: olympiadPages.map(p => ({
            microsite_id: olympiadMicrosite.id,
            microsite_version_id: olympiadVersion.id,
            page_id: p.id,
            version: 1,
            slug: p.slug,
            title: p.title,
            position: p.position,
            blocks: p.blocks as any,
            seo: p.seo as any,
            visibility: p.visibility,
            created_by: organizer.id,
        }))
    });

    // Olympiad Forms
    const olympiadRegistrationForm = await prisma.forms.create({
        data: {
            id: uuid(),
            event_id: olympiadEvent.id,
            name: 'Registration Form',
        }
    });

    const olympiadRegistrationVersion = await prisma.form_versions.create({
        data: {
            id: uuid(),
            form_id: olympiadRegistrationForm.id,
            version_number: 1,
            schema: {
                sections: [{
                    id: 'registration',
                    title: 'Registration',
                    fields: [
                        { id: 'fullName', key: 'fullName', type: 'text', label: 'Full Name', validation: { required: true } },
                        {
                            id: 'gradeLevel',
                            key: 'gradeLevel',
                            type: 'select',
                            label: 'Grade Level',
                            validation: { required: true },
                            ui: {
                                options: [
                                    { label: '10th Grade', value: 'grade10' },
                                    { label: '11th Grade', value: 'grade11' },
                                    { label: '12th Grade', value: 'grade12' },
                                ]
                            }
                        },
                        { id: 'region', key: 'region', type: 'text', label: 'Region', validation: { required: true } },
                        { id: 'experience', key: 'experience', type: 'textarea', label: 'Olympiad experience', validation: { required: true } },
                    ]
                }]
            },
            ui: {},
            published_by: organizer.id,
        }
    });

    const olympiadProblemForm = await prisma.forms.create({
        data: {
            id: uuid(),
            event_id: olympiadEvent.id,
            name: 'Problem Set',
        }
    });

    const olympiadProblemVersion = await prisma.form_versions.create({
        data: {
            id: uuid(),
            form_id: olympiadProblemForm.id,
            version_number: 1,
            schema: {
                sections: [{
                    id: 'scores',
                    title: 'Practice Scores',
                    fields: [
                        { id: 'algebraScore', key: 'algebraScore', type: 'number', label: 'Algebra score', validation: { required: true } },
                        { id: 'geometryScore', key: 'geometryScore', type: 'number', label: 'Geometry score', validation: { required: true } },
                        { id: 'comment', key: 'comment', type: 'textarea', label: 'Coach comments' },
                    ]
                }]
            },
            ui: {},
            published_by: organizer.id,
        }
    });

    const olympiadStepRegistration = await prisma.workflow_steps.create({
        data: {
            id: uuid(),
            event_id: olympiadEvent.id,
            step_index: 0,
            category: 'APPLICATION',
            title: 'Registration',
            instructions_rich: 'Complete registration details.',
            unlock_policy: 'AUTO_AFTER_PREV_SUBMITTED',
            review_required: true,
            strict_gating: true,
            form_version_id: olympiadRegistrationVersion.id,
        }
    });

    const olympiadStepProblem = await prisma.workflow_steps.create({
        data: {
            id: uuid(),
            event_id: olympiadEvent.id,
            step_index: 1,
            category: 'APPLICATION',
            title: 'Problem Set',
            instructions_rich: 'Provide practice scores and coach notes.',
            unlock_policy: 'AFTER_PREV_APPROVED',
            review_required: true,
            strict_gating: true,
            form_version_id: olympiadProblemVersion.id,
        }
    });

    const olympiadAppA = await prisma.applications.create({
        data: {
            id: uuid(),
            event_id: olympiadEvent.id,
            applicant_user_id: aisha.id,
            decision_status: 'NONE',
            decision_draft: {},
            tags: ['regional'],
        }
    });

    const olympiadAppB = await prisma.applications.create({
        data: {
            id: uuid(),
            event_id: olympiadEvent.id,
            applicant_user_id: nadia.id,
            decision_status: 'ACCEPTED',
            decision_published_at: daysAgo(1),
            decision_draft: {},
            tags: ['accepted'],
            assigned_reviewer_id: reviewer.id,
        }
    });

    const olympiadSubA0 = await prisma.step_submission_versions.create({
        data: {
            id: uuid(),
            application_id: olympiadAppA.id,
            step_id: olympiadStepRegistration.id,
            form_version_id: olympiadRegistrationVersion.id,
            version_number: 1,
            answers_snapshot: {
                fullName: 'Aisha El Fassi',
                gradeLevel: 'grade11',
                region: 'Rabat-Sale',
                experience: 'School olympiad finalist.',
            },
            submitted_at: daysAgo(2),
            submitted_by: aisha.id,
        }
    });

    const olympiadSubB0 = await prisma.step_submission_versions.create({
        data: {
            id: uuid(),
            application_id: olympiadAppB.id,
            step_id: olympiadStepRegistration.id,
            form_version_id: olympiadRegistrationVersion.id,
            version_number: 1,
            answers_snapshot: {
                fullName: 'Nadia Zerouali',
                gradeLevel: 'grade12',
                region: 'Rabat-Sale',
                experience: 'National olympiad finalist.',
            },
            submitted_at: daysAgo(4),
            submitted_by: nadia.id,
        }
    });

    const olympiadSubB1 = await prisma.step_submission_versions.create({
        data: {
            id: uuid(),
            application_id: olympiadAppB.id,
            step_id: olympiadStepProblem.id,
            form_version_id: olympiadProblemVersion.id,
            version_number: 1,
            answers_snapshot: {
                algebraScore: 92,
                geometryScore: 88,
                comment: 'Consistent performance across topics.',
            },
            submitted_at: daysAgo(2),
            submitted_by: nadia.id,
        }
    });

    await prisma.application_step_states.createMany({
        data: [
            {
                id: uuid(),
                application_id: olympiadAppA.id,
                step_id: olympiadStepRegistration.id,
                status: 'SUBMITTED',
                latest_submission_version_id: olympiadSubA0.id,
                last_activity_at: daysAgo(2),
            },
            { id: uuid(), application_id: olympiadAppA.id, step_id: olympiadStepProblem.id, status: 'LOCKED' },

            {
                id: uuid(),
                application_id: olympiadAppB.id,
                step_id: olympiadStepRegistration.id,
                status: 'APPROVED',
                latest_submission_version_id: olympiadSubB0.id,
                last_activity_at: daysAgo(3),
            },
            {
                id: uuid(),
                application_id: olympiadAppB.id,
                step_id: olympiadStepProblem.id,
                status: 'APPROVED',
                latest_submission_version_id: olympiadSubB1.id,
                last_activity_at: daysAgo(2),
            },
        ]
    });

    console.log('   ✓ Olympiad event seeded\n');

    // Event C: Archived event for admin views
    console.log('Creating archived event (Winter School 2025)...');

    await prisma.events.create({
        data: {
            id: uuid(),
            title: 'Winter School 2025',
            slug: 'winter-school-2025',
            status: 'archived',
            timezone: 'Africa/Casablanca',
            format: 'virtual',
            start_at: new Date('2025-12-10'),
            end_at: new Date('2025-12-15'),
            application_open_at: new Date('2025-09-01'),
            application_close_at: new Date('2025-10-15'),
            description: 'Archived event retained for admin validation.',
        }
    });

    // =====================
    // 5. MESSAGES + AUDIT LOGS
    // =====================
    console.log('Creating messages and audit logs...');

    const mmcApplicantUserIds = [
        aisha.id,
        youssef.id,
        salma.id,
        omar.id,
        lina.id,
        kamal.id,
        nadia.id,
    ];

    const mmcAnnouncement = await prisma.messages.create({
        data: {
            id: uuid(),
            event_id: mmcEvent.id,
            type: 'ANNOUNCEMENT',
            title: 'Welcome to MMC 2026',
            body_rich: {
                type: 'doc',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Thanks for applying! We will share updates here.' }] }],
            },
            action_buttons: [
                {
                    kind: 'OPEN_APPLICATION',
                    eventId: mmcEvent.id,
                    label: 'View your application',
                },
            ],
            created_by: organizer.id,
            body_text: 'Thanks for applying! We will share updates here.',
            resolved_recipient_count: mmcApplicantUserIds.length,
            resolved_at: now,
            status: 'SENT',
        }
    });

    await prisma.message_recipients.createMany({
        data: mmcApplicantUserIds.map((userId, index) => ({
            id: uuid(),
            message_id: mmcAnnouncement.id,
            recipient_user_id: userId,
            delivery_inbox_status: 'DELIVERED',
            delivery_email_status: 'NOT_REQUESTED',
            read_at: index % 3 === 0 ? daysAgo(1) : null,
        })),
    });

    const mmcDirect = await prisma.messages.create({
        data: {
            id: uuid(),
            event_id: mmcEvent.id,
            type: 'DIRECT',
            title: 'Application reminder',
            body_rich: {
                type: 'doc',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Please complete your application before the deadline.' }] }],
            },
            action_buttons: [],
            created_by: organizer.id,
            body_text: 'Please complete your application before the deadline.',
            resolved_recipient_count: 1,
            resolved_at: now,
            status: 'SENT',
        }
    });

    await prisma.message_recipients.create({
        data: {
            id: uuid(),
            message_id: mmcDirect.id,
            recipient_user_id: aisha.id,
            delivery_inbox_status: 'DELIVERED',
            delivery_email_status: 'NOT_REQUESTED',
            read_at: null,
        }
    });

    const olympiadAnnouncement = await prisma.messages.create({
        data: {
            id: uuid(),
            event_id: olympiadEvent.id,
            type: 'ANNOUNCEMENT',
            title: 'Olympiad schedule published',
            body_rich: {
                type: 'doc',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The full schedule is now available on the microsite.' }] }],
            },
            action_buttons: [
                { kind: 'EXTERNAL_LINK', url: 'https://mathmaroc.org/olympiad', label: 'View schedule' },
            ],
            created_by: organizer.id,
            body_text: 'The full schedule is now available on the microsite.',
            resolved_recipient_count: 2,
            resolved_at: now,
            status: 'SENT',
        }
    });

    await prisma.message_recipients.createMany({
        data: [aisha.id, nadia.id].map((userId) => ({
            id: uuid(),
            message_id: olympiadAnnouncement.id,
            recipient_user_id: userId,
            delivery_inbox_status: 'DELIVERED',
            delivery_email_status: 'NOT_REQUESTED',
        })),
    });

    await prisma.audit_logs.createMany({
        data: [
            {
                id: uuid(),
                event_id: mmcEvent.id,
                actor_user_id: globalAdmin.id,
                action: 'EVENT_CREATED',
                entity_type: 'events',
                entity_id: mmcEvent.id,
                after: { _diff: true, changes: { title: ['-', mmcEvent.title] } },
            },
            {
                id: uuid(),
                event_id: mmcEvent.id,
                actor_user_id: youssef.id,
                action: 'APPLICATION_SUBMITTED',
                entity_type: 'applications',
                entity_id: mmcAppB.id,
                after: { status: 'SUBMITTED' },
            },
            {
                id: uuid(),
                event_id: mmcEvent.id,
                actor_user_id: reviewer.id,
                action: 'NEEDS_INFO_REQUESTED',
                entity_type: 'needs_info_requests',
                entity_id: mmcNeedsInfo.id,
                after: { step: mmcStepApplication.title },
            },
            {
                id: uuid(),
                event_id: mmcEvent.id,
                actor_user_id: organizer.id,
                action: 'ROLE_ASSIGNED',
                entity_type: 'event_role_assignments',
                entity_id: mmcCheckinRoleId,
                after: { role: 'checkin_staff', userId: checkinStaff.id },
            },
            {
                id: uuid(),
                event_id: mmcEvent.id,
                actor_user_id: organizer.id,
                action: 'MESSAGE_SENT',
                entity_type: 'messages',
                entity_id: mmcAnnouncement.id,
                after: { title: mmcAnnouncement.title },
            },
        ]
    });

    console.log('   ✓ Messages and audit logs seeded\n');

    // =====================
    // DONE
    // =====================
    console.log('✅ Seeding completed!\n');
    console.log('📌 Test accounts (password: password123):');
    console.log('   • Admin:        admin@mathmaroc.org');
    console.log('   • Organizer:    organizer@mathmaroc.org');
    console.log('   • Reviewer:     reviewer@mathmaroc.org');
    console.log('   • Check-in:     checkin@mathmaroc.org');
    console.log('   • Content:      content@mathmaroc.org');
    console.log('   • Applicants:   aisha@mathmaroc.org, youssef@mathmaroc.org, salma@mathmaroc.org');
    console.log('                  omar@mathmaroc.org, lina@mathmaroc.org, kamal@mathmaroc.org, nadia@mathmaroc.org\n');
    console.log('🌐 Access the app:');
    console.log('   • Org Site:     http://localhost:3000/');
    console.log('   • Event Site:   http://localhost:3000/events/mmc');
    console.log('   • Event Site:   http://localhost:3000/events/olympiad-2026');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
