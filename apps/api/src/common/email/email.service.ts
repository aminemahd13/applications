import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'localhost',
      port: parseInt(process.env.SMTP_PORT || '1025', 10),
      secure: false,
      ...(process.env.SMTP_USER
        ? {
            auth: {
              user: process.env.SMTP_USER,
              pass: process.env.SMTP_PASS,
            },
          }
        : {}),
    });
  }

  private get fromAddress(): string {
    return process.env.SMTP_FROM || 'noreply@mathmaroc.org';
  }

  async sendPasswordReset(
    email: string,
    token: string,
    userName?: string,
  ): Promise<void> {
    const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
    const resetUrl = `${baseUrl}/reset-password#token=${token}`;
    const name = userName || 'there';

    await this.send({
      to: email,
      subject: 'Reset your password - Math&Maroc',
      html: `
                <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
                    <h2 style="color:#1e293b;">Password Reset</h2>
                    <p>Hi ${name},</p>
                    <p>We received a request to reset your password. Click the button below to set a new one:</p>
                    <p style="text-align:center;margin:32px 0;">
                        <a href="${resetUrl}" style="display:inline-block;padding:12px 32px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:500;">Reset Password</a>
                    </p>
                    <p style="color:#64748b;font-size:14px;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
                </div>
            `,
    });
  }

  async sendStaffInvite(
    email: string,
    token: string,
    options?: {
      userName?: string;
      role?: string;
      eventName?: string;
    },
  ): Promise<void> {
    const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
    const inviteUrl = `${baseUrl}/reset-password#token=${token}`;
    const name = options?.userName || 'there';
    const roleLabel = options?.role
      ? options.role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
      : undefined;

    let inviteLine = 'You have been invited to join Math&Maroc.';
    if (roleLabel && options?.eventName) {
      inviteLine = `You have been invited to join ${options.eventName} as ${roleLabel}.`;
    } else if (roleLabel) {
      inviteLine = `You have been invited to join as ${roleLabel}.`;
    } else if (options?.eventName) {
      inviteLine = `You have been invited to join ${options.eventName}.`;
    }

    await this.send({
      to: email,
      subject: 'You are invited - Math&Maroc',
      html: `
                <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
                    <h2 style="color:#1e293b;">Set your password</h2>
                    <p>Hi ${name},</p>
                    <p>${inviteLine}</p>
                    <p>Click the button below to set your password and activate your account:</p>
                    <p style="text-align:center;margin:32px 0;">
                        <a href="${inviteUrl}" style="display:inline-block;padding:12px 32px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:500;">Set Password</a>
                    </p>
                    <p style="color:#64748b;font-size:14px;">This link expires in 1 hour. If you were not expecting this invite, you can safely ignore this email.</p>
                </div>
            `,
    });
  }

  async sendEmailVerification(
    email: string,
    token: string,
    userName?: string,
  ): Promise<void> {
    const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
    const verifyUrl = `${baseUrl}/verify-email?token=${token}`;
    const name = userName || 'there';

    await this.send({
      to: email,
      subject: 'Verify your email - Math&Maroc',
      html: `
                <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
                    <h2 style="color:#1e293b;">Email Verification</h2>
                    <p>Hi ${name},</p>
                    <p>Please verify your email address by clicking the button below:</p>
                    <p style="text-align:center;margin:32px 0;">
                        <a href="${verifyUrl}" style="display:inline-block;padding:12px 32px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:500;">Verify Email</a>
                    </p>
                    <p style="color:#64748b;font-size:14px;">This link expires in 24 hours.</p>
                </div>
            `,
    });
  }

  async sendAnnouncement(
    email: string,
    subject: string,
    bodyHtml: string,
    actionButtons?: Array<{ label: string; url: string }>,
  ): Promise<void> {
    let buttonsHtml = '';
    if (actionButtons?.length) {
      buttonsHtml =
        '<div style="margin-top:24px;text-align:center;">' +
        actionButtons
          .map(
            (btn) =>
              `<a href="${btn.url}" style="display:inline-block;padding:10px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;margin-right:8px;font-weight:500;">${btn.label}</a>`,
          )
          .join('') +
        '</div>';
    }

    await this.send({
      to: email,
      subject,
      html: `
                <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
                    ${bodyHtml}
                    ${buttonsHtml}
                </div>
            `,
    });
  }

  private async send(options: {
    to: string;
    subject: string;
    html: string;
  }): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to: options.to,
        subject: options.subject,
        html: options.html,
      });
      this.logger.log(`Email sent to ${options.to}: ${options.subject}`);
    } catch (error) {
      this.logger.error(`Failed to send email to ${options.to}`, error);
      throw error;
    }
  }
}
