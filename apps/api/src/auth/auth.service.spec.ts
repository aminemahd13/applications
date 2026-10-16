import { AuthService } from './auth.service';
import {
    BadRequestException,
    ForbiddenException,
    UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';

// Pre-hash a known password so tests don't need real argon2 rounds
let TEST_HASH: string;

beforeAll(async () => {
    TEST_HASH = await argon2.hash('correct-password');
});

describe('AuthService', () => {
    let service: AuthService;
    let mockPrisma: any;
    let mockOrgSettings: any;
    let mockRateLimiter: any;

    beforeEach(() => {
        mockPrisma = {
            users: {
                findUnique: jest.fn(),
                create: jest.fn(),
                update: jest.fn(),
                delete: jest.fn(),
            },
            applicant_profiles: {
                upsert: jest.fn(),
                create: jest.fn(),
            },
            event_role_assignments: {
                findFirst: jest.fn().mockResolvedValue(null),
                deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
            audit_logs: {
                updateMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
            attendance_records: {
                updateMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
            applications: {
                updateMany: jest.fn().mockResolvedValue({ count: 0 }),
                deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
            microsite_page_versions: {
                updateMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
            microsite_versions: {
                updateMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
            file_objects: {
                deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
            $transaction: jest.fn((fn: any) => fn(mockPrisma)),
        };

        mockOrgSettings = {
            getSettings: jest.fn().mockResolvedValue({
                security: {
                    registrationEnabled: true,
                    maintenanceMode: false,
                    emailVerificationRequired: false,
                },
            }),
        };

        mockRateLimiter = {
            isAllowed: jest.fn().mockResolvedValue(true),
            recordAttempt: jest.fn(),
            checkLoginLimit: jest.fn().mockResolvedValue(true),
            checkSignupEmailLimit: jest.fn().mockResolvedValue(true),
            checkSignupIpLimit: jest.fn().mockResolvedValue(true),
            trackSession: jest.fn(),
            trackUserSession: jest.fn(),
            revokeUserSessions: jest.fn().mockResolvedValue(0),
        };

        service = new AuthService(mockPrisma, mockOrgSettings, mockRateLimiter);
    });

    // ─── signup ──────────────────────────────────────────

    describe('signup', () => {
        const dto = { email: 'test@example.com', password: 'StrongPass123!' };

        it('should throw ForbiddenException when registration is disabled', async () => {
            mockOrgSettings.getSettings.mockResolvedValue({
                security: { registrationEnabled: false },
            });

            await expect(service.signup(dto)).rejects.toThrow(ForbiddenException);
        });

        it('should throw BadRequestException when email already exists (verified)', async () => {
            mockPrisma.users.findUnique.mockResolvedValue({
                id: 'user-1',
                email: dto.email,
                email_verified_at: new Date(),
            });

            await expect(service.signup(dto)).rejects.toThrow(BadRequestException);
        });

        describe('when the email belongs to an unverified account', () => {
            beforeEach(() => {
                mockOrgSettings.getSettings.mockResolvedValue({
                    security: {
                        registrationEnabled: true,
                        emailVerificationRequired: true,
                    },
                });
                mockPrisma.users.findUnique.mockResolvedValue({
                    id: 'user-1',
                    email: dto.email,
                    email_verified_at: null,
                    password_hash: TEST_HASH,
                });
            });

            it.each(['correct-password', 'wrong-password'])(
                'answers exactly like a verified account (password %s is never checked)',
                async (password) => {
                    const unverifiedError = await service
                        .signup({ ...dto, password })
                        .catch((e) => e);

                    mockPrisma.users.findUnique.mockResolvedValue({
                        id: 'user-2',
                        email: dto.email,
                        email_verified_at: new Date(),
                        password_hash: TEST_HASH,
                    });
                    const verifiedError = await service
                        .signup({ ...dto, password })
                        .catch((e) => e);

                    expect(unverifiedError).toBeInstanceOf(BadRequestException);
                    expect(unverifiedError.getStatus()).toBe(verifiedError.getStatus());
                    expect(unverifiedError.getResponse()).toEqual(
                        verifiedError.getResponse(),
                    );
                    expect(unverifiedError.getResponse()).toEqual(
                        expect.objectContaining({ message: 'Email already in use' }),
                    );
                    expect(mockPrisma.applicant_profiles.upsert).not.toHaveBeenCalled();
                    expect(mockPrisma.users.update).not.toHaveBeenCalled();
                    expect(mockPrisma.users.create).not.toHaveBeenCalled();
                },
            );
        });

        it('should succeed for new user', async () => {
            mockPrisma.users.findUnique.mockResolvedValue(null);
            mockPrisma.$transaction.mockImplementation(async (fn: any) => {
                return fn(mockPrisma);
            });

            // Mock create to return a new user
            mockPrisma.users.create.mockResolvedValue({
                id: 'new-user-uuid',
                email: dto.email,
            });

            const result = await service.signup(dto);
            expect(result).toBeDefined();
            expect(result.email).toBe(dto.email);
            expect(result.wasExistingUnverified).toBe(false);
        });
    });

    // ─── validateUser ────────────────────────────────────

    describe('validateUser', () => {
        it('should return user (without password_hash) with correct password', async () => {
            mockPrisma.users.findUnique.mockResolvedValue({
                id: 'user-1',
                email: 'test@example.com',
                password_hash: TEST_HASH,
                is_disabled: false,
                is_global_admin: false,
            });

            const result = await service.validateUser(
                'test@example.com',
                'correct-password',
            );
            expect(result).toBeDefined();
            expect(result.id).toBe('user-1');
            expect(result.password_hash).toBeUndefined();
        });

        it('should return null with incorrect password', async () => {
            mockPrisma.users.findUnique.mockResolvedValue({
                id: 'user-1',
                email: 'test@example.com',
                password_hash: TEST_HASH,
                is_disabled: false,
            });

            const result = await service.validateUser(
                'test@example.com',
                'wrong-password',
            );
            expect(result).toBeNull();
        });

        it('should return null for disabled user', async () => {
            mockPrisma.users.findUnique.mockResolvedValue({
                id: 'user-1',
                email: 'test@example.com',
                password_hash: TEST_HASH,
                is_disabled: true,
            });

            const result = await service.validateUser(
                'test@example.com',
                'correct-password',
            );
            expect(result).toBeNull();
        });

        it('should return null for non-existent user', async () => {
            mockPrisma.users.findUnique.mockResolvedValue(null);

            const result = await service.validateUser(
                'nobody@example.com',
                'any-password',
            );
            expect(result).toBeNull();
        });
    });

    // ─── changePassword ──────────────────────────────────

    describe('changePassword', () => {
        it('should throw BadRequestException when passwords are missing', async () => {
            await expect(
                service.changePassword('user-1', '', 'newpass123'),
            ).rejects.toThrow(BadRequestException);
        });

        it('should throw BadRequestException when new password is too short', async () => {
            await expect(
                service.changePassword('user-1', 'current', 'short'),
            ).rejects.toThrow(BadRequestException);
        });

        it('should throw UnauthorizedException when current password is wrong', async () => {
            mockPrisma.users.findUnique.mockResolvedValue({
                id: 'user-1',
                password_hash: TEST_HASH,
            });

            await expect(
                service.changePassword('user-1', 'wrong-current', 'newpassword123'),
            ).rejects.toThrow(UnauthorizedException);
        });

        it('should succeed with correct current password and valid new password', async () => {
            mockPrisma.users.findUnique.mockResolvedValue({
                id: 'user-1',
                password_hash: TEST_HASH,
            });
            mockPrisma.users.update.mockResolvedValue({});

            const result = await service.changePassword(
                'user-1',
                'correct-password',
                'new-strong-password-123',
            );
            expect(result.message).toContain('changed successfully');
            expect(mockPrisma.users.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: 'user-1' },
                    data: expect.objectContaining({ password_hash: expect.any(String) }),
                }),
            );
        });
    });

    describe('updateMyProfile date of birth', () => {
        beforeEach(() => {
            mockPrisma.applicant_profiles.upsert.mockResolvedValue({});
            mockPrisma.users.findUnique.mockResolvedValue({
                email: 'test@example.com',
                applicant_profiles: null,
            });
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it.each([
            '20009-01-30',
            '2009-02-30',
            '1899-12-31',
            'not-a-date',
            '2009-01-30T00:00:00.000Z',
        ])('rejects %p with a 400 and saves nothing', async (dateOfBirth) => {
            await expect(
                service.updateMyProfile('user-1', { firstName: 'A', dateOfBirth }),
            ).rejects.toThrow(
                new BadRequestException(
                    'Date of birth must be a valid date between 1900-01-01 and today.',
                ),
            );
            expect(mockPrisma.applicant_profiles.upsert).not.toHaveBeenCalled();
        });

        it('rejects a non-string value', async () => {
            await expect(
                service.updateMyProfile('user-1', { dateOfBirth: 20090130 as any }),
            ).rejects.toThrow(BadRequestException);
            expect(mockPrisma.applicant_profiles.upsert).not.toHaveBeenCalled();
        });

        it('rejects a date in the future but accepts the latest local today', async () => {
            jest.useFakeTimers({ now: new Date('2026-10-16T12:00:00.000Z') });

            await expect(
                service.updateMyProfile('user-1', { dateOfBirth: '2026-10-18' }),
            ).rejects.toThrow(BadRequestException);

            // 2026-10-17 is already "today" in UTC+14.
            await expect(
                service.updateMyProfile('user-1', { dateOfBirth: '2026-10-17' }),
            ).resolves.toBeDefined();
        });

        it('stores a valid date as UTC midnight', async () => {
            await service.updateMyProfile('user-1', { dateOfBirth: '2009-01-30' });

            const expected = new Date('2009-01-30T00:00:00.000Z');
            expect(mockPrisma.applicant_profiles.upsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    update: expect.objectContaining({ date_of_birth: expected }),
                    create: expect.objectContaining({ date_of_birth: expected }),
                }),
            );
        });

        it('accepts 1900-01-01', async () => {
            await service.updateMyProfile('user-1', { dateOfBirth: '1900-01-01' });

            expect(mockPrisma.applicant_profiles.upsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    update: expect.objectContaining({
                        date_of_birth: new Date('1900-01-01T00:00:00.000Z'),
                    }),
                }),
            );
        });

        it.each(['', '   ', undefined, null])(
            'leaves the stored date unchanged for %p',
            async (dateOfBirth) => {
                await service.updateMyProfile('user-1', {
                    dateOfBirth: dateOfBirth as any,
                });

                expect(mockPrisma.applicant_profiles.upsert).toHaveBeenCalledWith(
                    expect.objectContaining({
                        update: expect.objectContaining({ date_of_birth: undefined }),
                        create: expect.objectContaining({ date_of_birth: null }),
                    }),
                );
            },
        );
    });

    describe('deleteMyAccount', () => {
        it('should throw BadRequestException when current password is missing', async () => {
            await expect(service.deleteMyAccount('user-1', '')).rejects.toThrow(
                BadRequestException,
            );
        });

        it('should throw UnauthorizedException when current password is invalid', async () => {
            mockPrisma.users.findUnique.mockResolvedValue({
                id: 'user-1',
                password_hash: TEST_HASH,
            });

            await expect(
                service.deleteMyAccount('user-1', 'wrong-password'),
            ).rejects.toThrow(UnauthorizedException);
        });

        it('should hard-delete account and related records with valid password', async () => {
            mockPrisma.users.findUnique.mockResolvedValue({
                id: 'user-1',
                password_hash: TEST_HASH,
            });
            mockPrisma.users.delete.mockResolvedValue({ id: 'user-1' });

            const result = await service.deleteMyAccount(
                'user-1',
                'correct-password',
            );

            expect(result.message).toContain('Account deleted successfully');
            expect(mockPrisma.audit_logs.updateMany).toHaveBeenCalledWith({
                where: { actor_user_id: 'user-1' },
                data: { actor_user_id: null },
            });
            expect(mockPrisma.applications.deleteMany).toHaveBeenCalledWith({
                where: { applicant_user_id: 'user-1' },
            });
            expect(mockPrisma.users.delete).toHaveBeenCalledWith({
                where: { id: 'user-1' },
            });
            expect(mockRateLimiter.revokeUserSessions).toHaveBeenCalledWith(
                'user-1',
            );
        });

        it('should return BadRequestException when hard delete is blocked by FK constraints', async () => {
            mockPrisma.users.findUnique.mockResolvedValue({
                id: 'user-1',
                password_hash: TEST_HASH,
            });
            mockPrisma.users.delete.mockRejectedValue({ code: 'P2003' });

            await expect(
                service.deleteMyAccount('user-1', 'correct-password'),
            ).rejects.toThrow(BadRequestException);
        });
    });
});
