import { PermissionsGuard } from './permissions.guard';
import { Reflector } from '@nestjs/core';
import {
    ExecutionContext,
    ForbiddenException,
    UnauthorizedException,
    ServiceUnavailableException,
} from '@nestjs/common';
import { Permission } from '@event-platform/shared';

describe('PermissionsGuard', () => {
    let guard: PermissionsGuard;
    let reflector: Reflector;
    let mockPrisma: any;
    let mockCls: any;

    beforeEach(() => {
        reflector = new Reflector();
        mockPrisma = {
            org_settings: {
                findUnique: jest.fn().mockResolvedValue({
                    security: { maintenanceMode: false, emailVerificationRequired: false },
                }),
            },
            event_role_assignments: {
                findMany: jest.fn().mockResolvedValue([]),
            },
        };
        mockCls = {
            set: jest.fn(),
            get: jest.fn(),
        };

        // Clear static cache before each test
        (PermissionsGuard as any).orgSettingsCache = null;

        guard = new PermissionsGuard(reflector, mockPrisma, mockCls);
    });

    function createMockContext(overrides: {
        permissions?: Permission[];
        userId?: string;
        isGlobalAdmin?: boolean;
        eventId?: string;
        emailVerifiedAt?: Date | null;
    }): ExecutionContext {
        const {
            permissions = [],
            userId,
            isGlobalAdmin = false,
            eventId,
            emailVerifiedAt = new Date(),
        } = overrides;

        jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(permissions);

        const handler = () => { };
        const cls = class { };

        return {
            switchToHttp: () => ({
                getRequest: () => ({
                    method: 'GET',
                    ip: '127.0.0.1',
                    headers: { 'user-agent': 'test' },
                    session: userId
                        ? {
                            user: {
                                id: userId,
                                is_global_admin: isGlobalAdmin,
                                email_verified_at: emailVerifiedAt,
                            },
                        }
                        : {},
                    params: eventId ? { eventId } : {},
                    body: {},
                }),
                getResponse: () => ({}),
            }),
            getHandler: () => handler,
            getClass: () => cls,
            getType: () => 'http',
            getArgs: () => [],
            getArgByIndex: () => undefined,
            switchToRpc: () => ({} as any),
            switchToWs: () => ({} as any),
        } as unknown as ExecutionContext;
    }

    it('should allow access when no permissions are required', async () => {
        const ctx = createMockContext({ permissions: [] });
        const result = await guard.canActivate(ctx);
        expect(result).toBe(true);
    });

    it('should throw UnauthorizedException when user is not authenticated', async () => {
        const ctx = createMockContext({
            permissions: [Permission.SELF_PROFILE_UPDATE],
        });
        await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('should allow global admin access to any permission', async () => {
        const ctx = createMockContext({
            permissions: [Permission.ADMIN_EVENTS_MANAGE],
            userId: 'admin-user-id',
            isGlobalAdmin: true,
        });
        const result = await guard.canActivate(ctx);
        expect(result).toBe(true);
    });

    it('should throw ServiceUnavailableException during maintenance mode for non-admin', async () => {
        mockPrisma.org_settings.findUnique.mockResolvedValue({
            security: { maintenanceMode: true },
        });

        const ctx = createMockContext({
            permissions: [Permission.SELF_PROFILE_UPDATE],
            userId: 'regular-user-id',
            isGlobalAdmin: false,
        });

        await expect(guard.canActivate(ctx)).rejects.toThrow(
            ServiceUnavailableException,
        );
    });

    it('should allow global admin during maintenance mode', async () => {
        mockPrisma.org_settings.findUnique.mockResolvedValue({
            security: { maintenanceMode: true },
        });

        const ctx = createMockContext({
            permissions: [Permission.ADMIN_EVENTS_MANAGE],
            userId: 'admin-user-id',
            isGlobalAdmin: true,
        });

        const result = await guard.canActivate(ctx);
        expect(result).toBe(true);
    });

    it('should throw ForbiddenException when user lacks required event permission', async () => {
        mockPrisma.event_role_assignments.findMany.mockResolvedValue([]);

        const ctx = createMockContext({
            permissions: [Permission.EVENT_APPLICATION_LIST],
            userId: 'regular-user-id',
            isGlobalAdmin: false,
            eventId: 'event-uuid-123',
        });

        await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });

    it('should set actor context (actorId, ip, ua) in CLS', async () => {
        const ctx = createMockContext({
            permissions: [Permission.SELF_PROFILE_UPDATE],
            userId: 'user-123',
        });

        // SELF_PROFILE_UPDATE is an applicant permission, should succeed
        await guard.canActivate(ctx);

        expect(mockCls.set).toHaveBeenCalledWith('actorId', 'user-123');
        expect(mockCls.set).toHaveBeenCalledWith('ip', '127.0.0.1');
        expect(mockCls.set).toHaveBeenCalledWith('ua', 'test');
    });
});
