
import { z } from 'zod';

// UUID regex for validation
export const UuidSchema = z.string().uuid();
export const EmailSchema = z.string().email().toLowerCase();
export const PasswordSchema = z.string().min(8, 'Password must be at least 8 characters');

export const LoginSchema = z.object({
    email: EmailSchema,
    password: z.string(), // Don't enforce complexity on login, just on signup/reset
});

export type LoginDto = z.infer<typeof LoginSchema>;

export const SignupSchema = z.object({
    email: EmailSchema,
    password: PasswordSchema,
});

export type SignupDto = z.infer<typeof SignupSchema>;

export const RequestPasswordResetSchema = z.object({
    email: EmailSchema,
});

export type RequestPasswordResetDto = z.infer<typeof RequestPasswordResetSchema>;

export const ResetPasswordSchema = z.object({
    token: z.string().min(1),
    newPassword: PasswordSchema,
});

export type ResetPasswordDto = z.infer<typeof ResetPasswordSchema>;

export const VerifyEmailSchema = z.object({
    token: z.string().min(1),
});

export type VerifyEmailDto = z.infer<typeof VerifyEmailSchema>;
