import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { MicrositesService } from './microsites.service';

function createPrismaMock() {
  return {
    microsites: {
      upsert: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    microsite_pages: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    microsite_page_versions: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    microsite_versions: {
      findUnique: jest.fn(),
    },
  };
}

type MicrositesPrismaMock = ReturnType<typeof createPrismaMock>;

describe('MicrositesService', () => {
  let service: MicrositesService;
  let prisma: MicrositesPrismaMock;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new MicrositesService(prisma as unknown as PrismaService);
  });

  it('removes legacy customCode.js from settings updates', async () => {
    prisma.microsites.upsert.mockResolvedValue({
      id: 'ms-1',
      settings: {
        branding: { siteName: 'Math&Maroc' },
        customCode: { headHtml: '<meta data-x="1">', js: 'alert(1)' },
      },
    });
    let updateInput:
      | {
          data: { settings: Record<string, unknown> };
        }
      | undefined;
    prisma.microsites.update.mockImplementation((input) => {
      updateInput = input as { data: { settings: Record<string, unknown> } };
      return Promise.resolve(input);
    });

    await service.updateSettings('event-1', {
      branding: { tagline: 'New tagline' },
      customCode: { bodyEndHtml: '<script src="/ok.js"></script>' },
    });

    expect(updateInput).toBeDefined();
    const settings = (
      updateInput as { data: { settings: Record<string, unknown> } }
    ).data.settings;
    const customCode = settings.customCode as Record<string, unknown>;
    const branding = settings.branding as Record<string, unknown>;

    expect(customCode).toMatchObject({
      headHtml: '<meta data-x="1">',
      bodyEndHtml: '<script src="/ok.js"></script>',
    });
    expect(customCode).not.toHaveProperty('js');
    expect(branding).toMatchObject({
      siteName: 'Math&Maroc',
      tagline: 'New tagline',
    });
  });

  it('normalizes slug and rejects duplicate page slugs on create', async () => {
    prisma.microsites.upsert.mockResolvedValue({ id: 'ms-1' });
    prisma.microsite_pages.findFirst.mockResolvedValue({ id: 'existing' });

    await expect(
      service.createPage('event-1', {
        slug: 'About-Us',
        title: 'About',
        position: 0,
        blocks: [],
        seo: {},
        customCode: {},
        visibility: 'PUBLIC',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.microsite_pages.findFirst).toHaveBeenCalledWith({
      where: { microsite_id: 'ms-1', slug: 'about-us' },
    });
  });

  it('merges and sanitizes SEO custom code on create', async () => {
    prisma.microsites.upsert.mockResolvedValue({ id: 'ms-1' });
    prisma.microsite_pages.findFirst.mockResolvedValue(null);
    let createInput:
      | {
          data: { seo: Record<string, unknown> };
        }
      | undefined;
    prisma.microsite_pages.create.mockImplementation((input) => {
      createInput = input as { data: { seo: Record<string, unknown> } };
      return Promise.resolve(input);
    });

    await service.createPage('event-1', {
      slug: 'landing',
      title: 'Landing',
      position: 0,
      blocks: [],
      seo: {
        title: 'Landing Title',
        customCode: { htmlTop: '<meta name="x">', js: 'legacy' },
      },
      customCode: {
        css: 'body { color: red; }',
        htmlBottom: '<div id="footer"></div>',
      },
      visibility: 'PUBLIC',
    });

    expect(createInput).toBeDefined();
    const seo = (createInput as { data: { seo: Record<string, unknown> } }).data
      .seo;
    const customCode = seo.customCode as Record<string, unknown>;

    expect(customCode).toMatchObject({
      htmlTop: '<meta name="x">',
      css: 'body { color: red; }',
      htmlBottom: '<div id="footer"></div>',
    });
    expect(customCode).not.toHaveProperty('js');
  });

  it('normalizes update slug and removes legacy customCode.js', async () => {
    prisma.microsite_pages.findUnique.mockResolvedValue({
      id: 'page-1',
      slug: 'old-page',
      microsite_id: 'ms-1',
      microsites: { event_id: 'event-1' },
      seo: {
        title: 'Old title',
        customCode: { headHtml: '<meta charset="utf-8">', js: 'legacy' },
      },
    });
    prisma.microsite_pages.findFirst.mockResolvedValue(null);
    let updateInput:
      | {
          data: {
            slug: string;
            seo: Record<string, unknown>;
          };
        }
      | undefined;
    prisma.microsite_pages.update.mockImplementation((input) => {
      updateInput = input as {
        data: {
          slug: string;
          seo: Record<string, unknown>;
        };
      };
      return Promise.resolve(input);
    });

    await service.updatePage('event-1', 'page-1', {
      slug: 'New Slug!!',
      seo: {
        description: 'Updated description',
        customCode: { bodyEndHtml: '<div>ok</div>', js: 'remove-me' },
      },
      customCode: { css: '.hero { color: blue; }' },
    });

    expect(prisma.microsite_pages.findFirst).toHaveBeenCalledWith({
      where: { microsite_id: 'ms-1', slug: 'newslug' },
    });

    expect(updateInput).toBeDefined();
    const seo = (
      updateInput as {
        data: {
          slug: string;
          seo: Record<string, unknown>;
        };
      }
    ).data.seo;
    const customCode = seo.customCode as Record<string, unknown>;

    expect(
      (
        updateInput as {
          data: {
            slug: string;
          };
        }
      ).data.slug,
    ).toBe('newslug');
    expect(customCode).toMatchObject({
      headHtml: '<meta charset="utf-8">',
      bodyEndHtml: '<div>ok</div>',
      css: '.hero { color: blue; }',
    });
    expect(customCode).not.toHaveProperty('js');
  });

  it('uses root-page alias when fetching public home page', async () => {
    prisma.microsites.findFirst.mockResolvedValue({
      id: 'ms-1',
      published_version: 4,
    });
    let pageVersionQuery:
      | {
          where: Record<string, unknown>;
          orderBy?: Record<string, unknown>;
        }
      | undefined;
    prisma.microsite_page_versions.findFirst.mockImplementation((query) => {
      pageVersionQuery = query as {
        where: Record<string, unknown>;
        orderBy?: Record<string, unknown>;
      };
      return Promise.resolve({
        id: 'pv-1',
        slug: 'welcome',
        version: 4,
      });
    });

    const result = await service.getPublicPage('demo-event', 'home');

    expect(result).toEqual({ id: 'pv-1', slug: 'welcome', version: 4 });
    expect(pageVersionQuery).toBeDefined();
    expect(
      (
        pageVersionQuery as {
          where: Record<string, unknown>;
        }
      ).where,
    ).toMatchObject({
      microsite_id: 'ms-1',
      version: 4,
      visibility: 'PUBLIC',
    });
    expect(
      (
        pageVersionQuery as {
          where: Record<string, unknown>;
        }
      ).where,
    ).not.toHaveProperty('slug');
    expect(
      (
        pageVersionQuery as {
          orderBy?: Record<string, unknown>;
        }
      ).orderBy,
    ).toEqual({ position: 'asc' });
  });

  it('returns computed public navigation links from published pages', async () => {
    prisma.microsites.findFirst.mockResolvedValue({
      id: 'ms-1',
      published_version: 7,
      events: { slug: 'summer-school' },
    });
    prisma.microsite_versions.findUnique.mockResolvedValue({
      settings: { theme: 'light' },
    });
    prisma.microsite_page_versions.findMany.mockResolvedValue([
      { title: 'Home', slug: 'home' },
      { title: 'FAQ', slug: 'faq' },
    ]);

    const result = await service.getPublicMicrosite('summer-school');

    expect(result).toEqual({
      settings: { theme: 'light' },
      nav: [
        { label: 'Home', href: '/events/summer-school' },
        { label: 'FAQ', href: '/events/summer-school/faq' },
      ],
      publishedVersion: 7,
    });
  });

  it('throws when published microsite metadata is missing', async () => {
    prisma.microsites.findFirst.mockResolvedValue({
      id: 'ms-1',
      published_version: 2,
      events: { slug: 'demo' },
    });
    prisma.microsite_versions.findUnique.mockResolvedValue(null);
    prisma.microsite_page_versions.findMany.mockResolvedValue([]);

    await expect(service.getPublicMicrosite('demo')).rejects.toThrow(
      NotFoundException,
    );
  });
});
