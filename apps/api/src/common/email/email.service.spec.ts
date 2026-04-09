import { EmailService } from './email.service';
import * as nodemailer from 'nodemailer';

const sendMailMock = jest.fn();
const verifyMock = jest.fn();

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

const SMTP_ENV_KEYS = [
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_SECURE',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_FROM',
];

describe('EmailService', () => {
  let orgSettingsService: { getSettings: jest.Mock };
  let service: EmailService;
  const mockedNodemailer = nodemailer as jest.Mocked<typeof nodemailer>;

  const resetSmtpEnv = () => {
    for (const key of SMTP_ENV_KEYS) {
      delete process.env[key];
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    resetSmtpEnv();
    process.env.NODE_ENV = 'test';
    orgSettingsService = {
      getSettings: jest.fn().mockResolvedValue({ email: {} }),
    };
    service = new EmailService(orgSettingsService as any);
    sendMailMock.mockResolvedValue(undefined);
    verifyMock.mockResolvedValue(true);
    mockedNodemailer.createTransport.mockReturnValue({
      sendMail: sendMailMock,
      verify: verifyMock,
    } as any);
  });

  afterEach(() => {
    resetSmtpEnv();
  });

  it('prefers admin SMTP settings over environment values', async () => {
    process.env.SMTP_HOST = 'env.smtp.test';
    process.env.SMTP_PORT = '2525';
    process.env.SMTP_SECURE = 'true';
    process.env.SMTP_USER = 'env-user';
    process.env.SMTP_PASS = 'env-pass';
    process.env.SMTP_FROM = 'env-from@test.com';

    orgSettingsService.getSettings.mockResolvedValue({
      email: {
        smtpHost: 'admin.smtp.test',
        smtpPort: 587,
        smtpSecure: false,
        smtpUser: 'admin-user',
        smtpPass: 'admin-pass',
        smtpSender: 'admin-from@test.com',
      },
    });

    await service.sendAnnouncement('recipient@test.com', 'Subject', '<p>Hi</p>');

    expect(mockedNodemailer.createTransport).toHaveBeenCalledWith({
      host: 'admin.smtp.test',
      port: 587,
      secure: false,
      auth: { user: 'admin-user', pass: 'admin-pass' },
    });
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'admin-from@test.com',
      }),
    );
  });

  it('falls back to SMTP_* environment values when admin settings are missing', async () => {
    process.env.SMTP_HOST = 'env.smtp.test';
    process.env.SMTP_PORT = '2525';
    process.env.SMTP_SECURE = 'true';
    process.env.SMTP_USER = 'env-user';
    process.env.SMTP_PASS = 'env-pass';
    process.env.SMTP_FROM = 'env-from@test.com';

    orgSettingsService.getSettings.mockResolvedValue({
      email: {},
    });

    await service.sendAnnouncement('recipient@test.com', 'Subject', '<p>Hi</p>');

    expect(mockedNodemailer.createTransport).toHaveBeenCalledWith({
      host: 'env.smtp.test',
      port: 2525,
      secure: true,
      auth: { user: 'env-user', pass: 'env-pass' },
    });
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'env-from@test.com',
      }),
    );
  });

  it('rebuilds transporter only when effective SMTP config changes', async () => {
    orgSettingsService.getSettings
      .mockResolvedValueOnce({
        email: {
          smtpHost: 'smtp.one.test',
          smtpPort: 587,
          smtpSecure: false,
          smtpSender: 'from-one@test.com',
        },
      })
      .mockResolvedValueOnce({
        email: {
          smtpHost: 'smtp.one.test',
          smtpPort: 587,
          smtpSecure: false,
          smtpSender: 'from-one@test.com',
        },
      })
      .mockResolvedValueOnce({
        email: {
          smtpHost: 'smtp.two.test',
          smtpPort: 587,
          smtpSecure: false,
          smtpSender: 'from-two@test.com',
        },
      });

    await service.sendAnnouncement('recipient@test.com', 'S1', '<p>One</p>');
    await service.sendAnnouncement('recipient@test.com', 'S2', '<p>Two</p>');
    await service.sendAnnouncement('recipient@test.com', 'S3', '<p>Three</p>');

    expect(mockedNodemailer.createTransport).toHaveBeenCalledTimes(2);
    expect(sendMailMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ from: 'from-one@test.com', subject: 'S2' }),
    );
    expect(sendMailMock).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ from: 'from-two@test.com', subject: 'S3' }),
    );
  });

  it('uses effective sender address from fallback source', async () => {
    process.env.SMTP_HOST = 'env.smtp.test';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_FROM = 'env-from@test.com';

    orgSettingsService.getSettings.mockResolvedValue({
      email: {
        smtpHost: '',
        smtpSender: '',
      },
    });

    await service.sendAnnouncement('recipient@test.com', 'Subject', '<p>Hi</p>');

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'env-from@test.com',
      }),
    );
  });
});
