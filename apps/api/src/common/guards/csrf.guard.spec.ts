import { CsrfGuard } from './csrf.guard';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';

describe('CsrfGuard', () => {
    let guard: CsrfGuard;
    let reflector: Reflector;

    beforeEach(() => {
        reflector = new Reflector();
        guard = new CsrfGuard(reflector);
    });

    function createMockContext(overrides: {
        method?: string;
        csrfToken?: string;
        headerToken?: string;
        skipCsrf?: boolean;
    }): ExecutionContext {
        const { method = 'POST', csrfToken, headerToken, skipCsrf = false } = overrides;

        const handler = () => { };
        const cls = class { };

        jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(skipCsrf);

        return {
            switchToHttp: () => ({
                getRequest: () => ({
                    method,
                    session: csrfToken != null ? { csrfToken } : {},
                    headers: headerToken != null ? { 'x-csrf-token': headerToken } : {},
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

    it('should allow GET requests without CSRF token', () => {
        const ctx = createMockContext({ method: 'GET' });
        expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should allow HEAD requests without CSRF token', () => {
        const ctx = createMockContext({ method: 'HEAD' });
        expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should allow OPTIONS requests without CSRF token', () => {
        const ctx = createMockContext({ method: 'OPTIONS' });
        expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should allow POST with matching CSRF tokens', () => {
        const ctx = createMockContext({
            method: 'POST',
            csrfToken: 'valid-token-123',
            headerToken: 'valid-token-123',
        });
        expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should throw ForbiddenException when header token is missing', () => {
        const ctx = createMockContext({
            method: 'POST',
            csrfToken: 'valid-token-123',
        });
        expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when session token is missing', () => {
        const ctx = createMockContext({
            method: 'POST',
            headerToken: 'valid-token-123',
        });
        expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when tokens do not match', () => {
        const ctx = createMockContext({
            method: 'POST',
            csrfToken: 'session-token',
            headerToken: 'different-token',
        });
        expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should allow POST when @SkipCsrf() decorator is present', () => {
        const ctx = createMockContext({
            method: 'POST',
            skipCsrf: true,
            // No tokens provided — should still pass
        });
        expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should allow PATCH with matching CSRF tokens', () => {
        const ctx = createMockContext({
            method: 'PATCH',
            csrfToken: 'patch-token',
            headerToken: 'patch-token',
        });
        expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should throw ForbiddenException for DELETE without tokens', () => {
        const ctx = createMockContext({ method: 'DELETE' });
        expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
});
