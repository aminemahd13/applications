import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import type { Response } from 'express';
import { MicrositeMediaService } from './microsite-media.service';
import { MicrositesController } from './microsites.controller';
import { MicrositesService } from './microsites.service';

type PublishFn = MicrositesService['publish'];
type GetPublicMicrositeFn = MicrositesService['getPublicMicrosite'];
type GetPublicPageFn = MicrositesService['getPublicPage'];
type GetPublicAssetUrlFn = MicrositeMediaService['getPublicAssetUrl'];

interface ResponseMock {
  res: Response;
  set: jest.Mock;
  redirect: jest.Mock;
}

function createResponseMock(): ResponseMock {
  const set = jest.fn();
  const redirect = jest.fn();

  return {
    res: { set, redirect } as unknown as Response,
    set,
    redirect,
  };
}

describe('MicrositesController', () => {
  let controller: MicrositesController;
  let service: {
    publish: jest.Mock<ReturnType<PublishFn>, Parameters<PublishFn>>;
    getPublicMicrosite: jest.Mock<
      ReturnType<GetPublicMicrositeFn>,
      Parameters<GetPublicMicrositeFn>
    >;
    getPublicPage: jest.Mock<
      ReturnType<GetPublicPageFn>,
      Parameters<GetPublicPageFn>
    >;
  };
  let mediaService: {
    getPublicAssetUrl: jest.Mock<
      ReturnType<GetPublicAssetUrlFn>,
      Parameters<GetPublicAssetUrlFn>
    >;
  };

  beforeEach(() => {
    service = {
      publish: jest.fn<ReturnType<PublishFn>, Parameters<PublishFn>>(),
      getPublicMicrosite: jest.fn<
        ReturnType<GetPublicMicrositeFn>,
        Parameters<GetPublicMicrositeFn>
      >(),
      getPublicPage: jest.fn<
        ReturnType<GetPublicPageFn>,
        Parameters<GetPublicPageFn>
      >(),
    };
    mediaService = {
      getPublicAssetUrl: jest.fn<
        ReturnType<GetPublicAssetUrlFn>,
        Parameters<GetPublicAssetUrlFn>
      >(),
    };

    controller = new MicrositesController(
      service as unknown as MicrositesService,
      mediaService as unknown as MicrositeMediaService,
    );
  });

  it('publishes using session user id', async () => {
    service.publish.mockResolvedValue({ version: 3 });

    const result = await controller.publish('event-1', {
      session: { user: { id: 'user-session' } },
    });

    expect(service.publish).toHaveBeenCalledWith('event-1', 'user-session');
    expect(result).toEqual({ version: 3 });
  });

  it('publishes using request user id when session user is absent', async () => {
    service.publish.mockResolvedValue({ version: 2 });

    const result = await controller.publish('event-1', {
      user: { id: 'user-request' },
    });

    expect(service.publish).toHaveBeenCalledWith('event-1', 'user-request');
    expect(result).toEqual({ version: 2 });
  });

  it('rejects publish when user id is missing', async () => {
    await expect(
      controller.publish('event-1', {
        session: { user: { email: 'missing-id@example.com' } },
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects empty public asset key', async () => {
    const { res } = createResponseMock();

    await expect(controller.getPublicAsset('   ', res)).rejects.toThrow(
      BadRequestException,
    );
    expect(mediaService.getPublicAssetUrl).not.toHaveBeenCalled();
  });

  it('sets cache headers and redirects for public assets', async () => {
    const { res, set, redirect } = createResponseMock();
    mediaService.getPublicAssetUrl.mockResolvedValue(
      'https://cdn.example.com/file.png',
    );

    await controller.getPublicAsset('assets/logo.png', res);

    expect(mediaService.getPublicAssetUrl).toHaveBeenCalledWith(
      'assets/logo.png',
    );
    expect(set).toHaveBeenCalledWith(
      'Cache-Control',
      'public, max-age=300, stale-while-revalidate=3600',
    );
    expect(redirect).toHaveBeenCalledWith(
      302,
      'https://cdn.example.com/file.png',
    );
  });

  it('sets ETag and cache headers for public microsite payload', async () => {
    const { res, set } = createResponseMock();
    service.getPublicMicrosite.mockResolvedValue({
      publishedVersion: 11,
      settings: {},
      nav: [],
    });

    const result = await controller.getPublicMicrosite('demo-event', res);

    expect(service.getPublicMicrosite).toHaveBeenCalledWith('demo-event');
    expect(set).toHaveBeenCalledWith('ETag', '"demo-event:11"');
    expect(set).toHaveBeenCalledWith(
      'Cache-Control',
      'public, max-age=60, stale-while-revalidate=300',
    );
    expect(result).toEqual({
      publishedVersion: 11,
      settings: {},
      nav: [],
    });
  });

  it('sets ETag and cache headers for public page payload', async () => {
    const { res, set } = createResponseMock();
    service.getPublicPage.mockResolvedValue({
      slug: 'home',
      version: 5,
      blocks: [],
    });

    const result = await controller.getPublicPage('demo', 'home', res);

    expect(service.getPublicPage).toHaveBeenCalledWith('demo', 'home');
    expect(set).toHaveBeenCalledWith('ETag', '"demo:5"');
    expect(set).toHaveBeenCalledWith(
      'Cache-Control',
      'public, max-age=60, stale-while-revalidate=300',
    );
    expect(result).toEqual({ slug: 'home', version: 5, blocks: [] });
  });
});
