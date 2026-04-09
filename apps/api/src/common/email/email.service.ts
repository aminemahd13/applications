import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { OrgSettingsService } from '../../admin/org-settings.service';

type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
  fromName: string;
  hostSource: 'admin' | 'env' | 'default';
};

type SenderAddress = {
  name: string;
  address: string;
};

@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private transporterConfigKey: string | null = null;
  private fromAddress: SenderAddress = {
    name: 'Math&Maroc',
    address: 'noreply@mathmaroc.org',
  };

  constructor(private readonly orgSettingsService: OrgSettingsService) {}

  async onModuleInit(): Promise<void> {
    await this.ensureTransporter({ verifyConnectivity: true });
  }

  private parsePort(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      const normalized = Math.trunc(value);
      return normalized > 0 ? normalized : 1025;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        const parsed = Number.parseInt(trimmed, 10);
        if (Number.isFinite(parsed) && parsed > 0) {
          return parsed;
        }
      }
    }

    return 1025;
  }

  private parseSecure(rawValue: unknown, port: number): boolean {
    if (typeof rawValue === 'boolean') {
      return rawValue;
    }

    if (typeof rawValue === 'number') {
      return rawValue !== 0;
    }

    if (typeof rawValue === 'string' && rawValue.trim().length > 0) {
      const normalized = rawValue.trim().toLowerCase();
      if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
      if (['false', '0', 'no', 'off'].includes(normalized)) return false;
      this.logger.warn(
        `SMTP_SECURE value "${rawValue}" is invalid; falling back to port-based default.`,
      );
    }

    return port === 465;
  }

  private readNonEmptyString(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    if (value.trim().length === 0) return undefined;
    return value;
  }

  private shouldUseAdminValue(value: unknown): boolean {
    if (value === undefined || value === null) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    return true;
  }

  private pickStringSetting(adminValue: unknown, envValue?: string): string | undefined {
    return this.shouldUseAdminValue(adminValue)
      ? this.readNonEmptyString(adminValue)
      : this.readNonEmptyString(envValue);
  }

  private resolveHost(
    emailSettings: Record<string, unknown>,
  ): { host: string; hostSource: 'admin' | 'env' | 'default' } {
    const adminHost = this.readNonEmptyString(emailSettings.smtpHost);
    if (adminHost) return { host: adminHost, hostSource: 'admin' };

    const envHost = this.readNonEmptyString(process.env.SMTP_HOST);
    if (envHost) return { host: envHost, hostSource: 'env' };

    return { host: 'localhost', hostSource: 'default' };
  }

  private resolvePort(emailSettings: Record<string, unknown>): number {
    if (this.shouldUseAdminValue(emailSettings.smtpPort)) {
      return this.parsePort(emailSettings.smtpPort);
    }
    return this.parsePort(process.env.SMTP_PORT);
  }

  private resolveSecure(
    emailSettings: Record<string, unknown>,
    port: number,
  ): boolean {
    if (this.shouldUseAdminValue(emailSettings.smtpSecure)) {
      return this.parseSecure(emailSettings.smtpSecure, port);
    }
    return this.parseSecure(process.env.SMTP_SECURE, port);
  }

  private resolveFrom(emailSettings: Record<string, unknown>): string {
    const adminFrom = this.pickStringSetting(
      emailSettings.smtpSender ??
        emailSettings.smtpFrom ??
        emailSettings.from,
    );
    if (adminFrom) return adminFrom;

    return this.readNonEmptyString(process.env.SMTP_FROM) ?? 'noreply@mathmaroc.org';
  }

  private resolveFromName(
    emailSettings: Record<string, unknown>,
    brandingSettings: Record<string, unknown>,
  ): string {
    const adminFromName = this.pickStringSetting(
      emailSettings.smtpFromName ?? emailSettings.fromName,
    );
    if (adminFromName) return adminFromName;

    const brandingFromName = this.pickStringSetting(
      brandingSettings.platformName ?? brandingSettings.name,
    );
    if (brandingFromName) return brandingFromName;

    return 'Math&Maroc';
  }

  private async resolveSmtpConfig(): Promise<SmtpConfig> {
    const settings = await this.orgSettingsService.getSettings();
    const emailSettings =
      settings?.email && typeof settings.email === 'object'
        ? (settings.email as Record<string, unknown>)
        : {};
    const brandingSettings =
      settings?.branding && typeof settings.branding === 'object'
        ? (settings.branding as Record<string, unknown>)
        : {};

    const { host, hostSource } = this.resolveHost(emailSettings);
    const port = this.resolvePort(emailSettings);
    const secure = this.resolveSecure(emailSettings, port);
    const user = this.pickStringSetting(emailSettings.smtpUser, process.env.SMTP_USER);
    const pass = this.pickStringSetting(emailSettings.smtpPass, process.env.SMTP_PASS);
    const from = this.resolveFrom(emailSettings);
    const fromName = this.resolveFromName(emailSettings, brandingSettings);

    return {
      host,
      hostSource,
      port,
      secure,
      user,
      pass,
      from,
      fromName,
    };
  }

  private buildTransporterConfigKey(config: SmtpConfig): string {
    return JSON.stringify({
      host: config.host,
      port: config.port,
      secure: config.secure,
      user: config.user ?? '',
      pass: config.pass ?? '',
      from: config.from,
      fromName: config.fromName,
    });
  }

  private async ensureTransporter(options?: {
    verifyConnectivity?: boolean;
  }): Promise<void> {
    const config = await this.resolveSmtpConfig();
    const nextKey = this.buildTransporterConfigKey(config);
    const hasChanged =
      this.transporter == null || this.transporterConfigKey !== nextKey;

    if (hasChanged) {
      this.transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        ...(config.user
          ? {
              auth: {
                user: config.user,
                pass: config.pass ?? '',
              },
            }
          : {}),
      });
      this.fromAddress = {
        name: config.fromName,
        address: config.from,
      };
      this.transporterConfigKey = nextKey;

      this.logger.log(
        `SMTP transport configured host=${config.host} port=${config.port} secure=${config.secure} auth=${config.user ? 'on' : 'off'} from="${this.fromAddress.name} <${this.fromAddress.address}>"`,
      );

      if (config.hostSource === 'default') {
        this.logger.warn(
          'SMTP host is not configured in admin settings or environment. Falling back to localhost; outbound email will fail unless an SMTP server is available in this environment.',
        );
      }
    }

    if (options?.verifyConnectivity && process.env.NODE_ENV !== 'test') {
      const transporter = this.transporter;
      if (!transporter) {
        throw new Error('SMTP transporter is not initialized');
      }
      try {
        await transporter.verify();
        this.logger.log('SMTP connection verified successfully.');
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        this.logger.error(`SMTP verification failed: ${reason}`);
      }
    } else if (options?.verifyConnectivity) {
      this.logger.log('Skipping SMTP connectivity verification in test mode.');
    }
  }

  async sendPasswordReset(
    email: string,
    token: string,
    userName?: string,
  ): Promise<void> {
    const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
    const encodedToken = encodeURIComponent(token);
    const resetUrl = `${baseUrl}/reset-password?token=${encodedToken}`;
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
    const encodedToken = encodeURIComponent(token);
    const inviteUrl = `${baseUrl}/reset-password?token=${encodedToken}`;
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
                    <p style="color:#64748b;font-size:14px;">This link expires in 1 week. If you were not expecting this invite, you can safely ignore this email.</p>
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
    await this.ensureTransporter();
    const transporter = this.transporter;
    if (!transporter) {
      throw new Error('SMTP transporter is not initialized');
    }

    try {
      await transporter.sendMail({
        from: this.fromAddress,
        to: options.to,
        subject: options.subject,
        html: options.html,
      });
      this.logger.log(`Email sent to ${options.to}: ${options.subject}`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Failed to send email to ${options.to}: ${reason}`,
        stack,
      );
      throw error;
    }
  }
}
