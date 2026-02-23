import { AuthController } from './auth.controller';

describe('AuthController', () => {
  const makeController = () => {
    const authService = {
      getUserEventRoles: jest.fn(),
      getUserEmailVerificationState: jest.fn(),
    } as any;

    const passwordResetService = {} as any;
    const emailVerificationService = {} as any;

    return {
      controller: new AuthController(
        authService,
        passwordResetService,
        emailVerificationService,
      ),
      authService,
    };
  };

  describe('getMe', () => {
    it('returns null user when the session has no authenticated user', async () => {
      const { controller } = makeController();

      await expect(controller.getMe({})).resolves.toEqual({ user: null });
    });

    it('caches event roles and verification state in the session', async () => {
      const { controller, authService } = makeController();

      authService.getUserEventRoles.mockResolvedValue([
        { eventId: 'event-1', role: 'reviewer' },
      ]);
      authService.getUserEmailVerificationState.mockResolvedValue({
        emailVerified: true,
        emailVerificationRequired: true,
        mustVerifyEmail: false,
      });

      const session: any = {
        user: {
          id: 'user-1',
          email: 'user@example.com',
          is_global_admin: false,
        },
        createdAt: 123,
      };

      const first = await controller.getMe(session);
      const second = await controller.getMe(session);

      expect(first).toEqual(second);
      expect(authService.getUserEventRoles).toHaveBeenCalledTimes(1);
      expect(authService.getUserEmailVerificationState).toHaveBeenCalledTimes(
        1,
      );
      expect(session.authMeCache).toEqual(
        expect.objectContaining({
          eventRoles: [{ eventId: 'event-1', role: 'reviewer' }],
          verificationState: {
            emailVerified: true,
            emailVerificationRequired: true,
            mustVerifyEmail: false,
          },
        }),
      );
      expect(typeof session.authMeCache.fetchedAt).toBe('number');
    });
  });
});
