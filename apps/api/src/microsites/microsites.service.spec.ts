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

  it('allows empty slug when creating the homepage', async () => {
    prisma.microsites.upsert.mockResolvedValue({ id: 'ms-1' });
    prisma.microsite_pages.findFirst.mockResolvedValue(null);
    let createInput:
      | {
          data: { slug: string };
        }
      | undefined;
    prisma.microsite_pages.create.mockImplementation((input) => {
      createInput = input as { data: { slug: string } };
      return Promise.resolve(input);
    });

    await service.createPage('event-1', {
      slug: '',
      title: 'Home',
      position: 0,
      blocks: [],
      seo: {},
      customCode: {},
      visibility: 'PUBLIC',
    });

    expect(prisma.microsite_pages.findFirst).toHaveBeenCalledWith({
      where: { microsite_id: 'ms-1', slug: '' },
      select: { id: true },
    });
    expect(createInput).toBeDefined();
    expect((createInput as { data: { slug: string } }).data.slug).toBe('');
  });

  it('rejects empty slug when creating a non-home page', async () => {
    prisma.microsites.upsert.mockResolvedValue({ id: 'ms-1' });
    prisma.microsite_pages.findFirst.mockResolvedValue({ id: 'page-1' });

    await expect(
      service.createPage('event-1', {
        slug: '',
        title: 'FAQ',
        position: 1,
        blocks: [],
        seo: {},
        customCode: {},
        visibility: 'PUBLIC',
      }),
    ).rejects.toThrow('Only the homepage can use an empty slug');
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

  it('allows empty slug when updating the homepage', async () => {
    prisma.microsite_pages.findUnique.mockResolvedValue({
      id: 'page-1',
      slug: 'landing',
      microsite_id: 'ms-1',
      microsites: { event_id: 'event-1' },
      seo: {},
    });
    prisma.microsite_pages.findFirst
      .mockResolvedValueOnce({ id: 'page-1' })
      .mockResolvedValueOnce(null);
    let updateInput:
      | {
          data: { slug: string };
        }
      | undefined;
    prisma.microsite_pages.update.mockImplementation((input) => {
      updateInput = input as { data: { slug: string } };
      return Promise.resolve(input);
    });

    await service.updatePage('event-1', 'page-1', { slug: '' });

    expect(prisma.microsite_pages.findFirst).toHaveBeenNthCalledWith(1, {
      where: { microsite_id: 'ms-1', slug: '' },
      select: { id: true },
    });
    expect(prisma.microsite_pages.findFirst).toHaveBeenNthCalledWith(2, {
      where: { microsite_id: 'ms-1', slug: '' },
    });
    expect(updateInput).toBeDefined();
    expect((updateInput as { data: { slug: string } }).data.slug).toBe('');
  });

  it('rejects empty slug when updating a non-home page', async () => {
    prisma.microsite_pages.findUnique.mockResolvedValue({
      id: 'page-2',
      slug: 'faq',
      microsite_id: 'ms-1',
      microsites: { event_id: 'event-1' },
      seo: {},
    });
    prisma.microsite_pages.findFirst.mockResolvedValue({ id: 'page-1' });

    await expect(
      service.updatePage('event-1', 'page-2', { slug: '' }),
    ).rejects.toThrow('Only the homepage can use an empty slug');
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
      slug: '',
    });
    expect(
      (
        pageVersionQuery as {
          orderBy?: Record<string, unknown>;
        }
      ).orderBy,
    ).toBeUndefined();
  });

  it('falls back to first page by position when root alias has no empty-slug page', async () => {
    prisma.microsites.findFirst.mockResolvedValue({
      id: 'ms-1',
      published_version: 4,
    });
    let pageVersionQueries: Array<{
      where: Record<string, unknown>;
      orderBy?: unknown;
    }> = [];
    prisma.microsite_page_versions.findFirst.mockImplementation((query) => {
      pageVersionQueries.push(
        query as {
          where: Record<string, unknown>;
          orderBy?: unknown;
        },
      );
      if (pageVersionQueries.length === 1) {
        return Promise.resolve(null);
      }
      return Promise.resolve({
        id: 'pv-1',
        slug: 'welcome',
        version: 4,
      });
    });

    const result = await service.getPublicPage('demo-event', '');

    expect(result).toEqual({ id: 'pv-1', slug: 'welcome', version: 4 });
    expect(pageVersionQueries).toHaveLength(2);
    expect(pageVersionQueries[0]).toMatchObject({
      where: {
        microsite_id: 'ms-1',
        version: 4,
        visibility: 'PUBLIC',
        slug: '',
      },
    });
    expect(pageVersionQueries[1]).toMatchObject({
      where: {
        microsite_id: 'ms-1',
        version: 4,
        visibility: 'PUBLIC',
      },
      orderBy: [{ position: 'asc' }, { created_at: 'asc' }],
    });
    expect(pageVersionQueries[1].where).not.toHaveProperty('slug');
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

  it('maps the empty-slug page to the root navigation link', async () => {
    prisma.microsites.findFirst.mockResolvedValue({
      id: 'ms-1',
      published_version: 7,
      events: { slug: 'summer-school' },
    });
    prisma.microsite_versions.findUnique.mockResolvedValue({
      settings: { theme: 'light' },
    });
    prisma.microsite_page_versions.findMany.mockResolvedValue([
      { title: 'FAQ', slug: 'faq' },
      { title: 'Home', slug: '' },
    ]);

    const result = await service.getPublicMicrosite('summer-school');

    expect(result).toEqual({
      settings: { theme: 'light' },
      nav: [
        { label: 'FAQ', href: '/events/summer-school/faq' },
        { label: 'Home', href: '/events/summer-school' },
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
