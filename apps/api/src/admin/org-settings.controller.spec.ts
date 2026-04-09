import { OrgSettingsController } from './org-settings.controller';

describe('OrgSettingsController', () => {
  const makeController = () => {
    const service = {
      getSettings: jest.fn(),
      updateSettings: jest.fn(),
    } as any;

    return {
      controller: new OrgSettingsController(service),
      service,
    };
  };

  it('does not expose smtpPass on GET and returns smtpPasswordConfigured', async () => {
    const { controller, service } = makeController();
    service.getSettings.mockResolvedValue({
      branding: {},
      security: {},
      email: {
        smtpHost: 'smtp.mail.test',
        smtpPort: 587,
        smtpSecure: false,
        smtpUser: 'apikey',
        smtpPass: 'secret-value',
        smtpSender: 'noreply@test.com',
        smtpFromName: 'Math Maroc Team',
      },
      storage: {},
      retention: {},
    });

    const result = await controller.getSettings();

    expect(result.smtpHost).toBe('smtp.mail.test');
    expect(result.smtpUser).toBe('apikey');
    expect(result.smtpSecure).toBe(false);
    expect(result.smtpSender).toBe('noreply@test.com');
    expect(result.smtpFromName).toBe('Math Maroc Team');
    expect(result.smtpPasswordConfigured).toBe(true);
    expect(result).not.toHaveProperty('smtpPass');
  });

  it('passes non-empty smtpPass through PATCH mapping', async () => {
    const { controller, service } = makeController();
    service.updateSettings.mockResolvedValue({
      branding: {},
      security: {},
      email: {
        smtpHost: 'smtp.mail.test',
        smtpPort: 465,
        smtpSecure: true,
        smtpUser: 'apikey',
        smtpPass: 'new-secret',
        smtpSender: 'noreply@test.com',
        smtpFromName: 'Math Maroc Team',
      },
      storage: {},
      retention: {},
    });

    const result = await controller.updateSettings({
      smtpHost: 'smtp.mail.test',
      smtpPort: 465,
      smtpSecure: true,
      smtpUser: 'apikey',
      smtpPass: 'new-secret',
      smtpSender: 'noreply@test.com',
      smtpFromName: 'Math Maroc Team',
    });

    expect(service.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        email: expect.objectContaining({
          smtpHost: 'smtp.mail.test',
          smtpPort: 465,
          smtpSecure: true,
          smtpUser: 'apikey',
          smtpPass: 'new-secret',
          smtpSender: 'noreply@test.com',
          smtpFromName: 'Math Maroc Team',
        }),
      }),
    );
    expect(result.smtpPasswordConfigured).toBe(true);
    expect(result).not.toHaveProperty('smtpPass');
  });

  it('does not forward blank smtpPass in PATCH mapping', async () => {
    const { controller, service } = makeController();
    service.updateSettings.mockResolvedValue({
      branding: {},
      security: {},
      email: {
        smtpHost: 'smtp.mail.test',
        smtpPort: 587,
        smtpSecure: false,
        smtpUser: 'apikey',
        smtpPass: 'existing-secret',
        smtpSender: 'noreply@test.com',
        smtpFromName: 'Math Maroc Team',
      },
      storage: {},
      retention: {},
    });

    const result = await controller.updateSettings({
      smtpHost: 'smtp.mail.test',
      smtpPort: 587,
      smtpSecure: false,
      smtpUser: 'apikey',
      smtpPass: '   ',
      smtpSender: 'noreply@test.com',
      smtpFromName: 'Math Maroc Team',
    });

    const categorized = service.updateSettings.mock.calls[0][0];
    expect(categorized.email).not.toHaveProperty('smtpPass');
    expect(result.smtpPasswordConfigured).toBe(true);
    expect(result).not.toHaveProperty('smtpPass');
  });

  it('round-trips non-secret SMTP fields', async () => {
    const { controller, service } = makeController();
    service.updateSettings.mockResolvedValue({
      branding: {},
      security: {},
      email: {
        smtpHost: 'smtp.example.org',
        smtpPort: 2525,
        smtpSecure: false,
        smtpUser: 'mailer-user',
        smtpSender: 'mailer@example.org',
        smtpFromName: 'Mailer Team',
      },
      storage: {},
      retention: {},
    });

    const result = await controller.updateSettings({
      smtpHost: 'smtp.example.org',
      smtpPort: 2525,
      smtpSecure: false,
      smtpUser: 'mailer-user',
      smtpSender: 'mailer@example.org',
      smtpFromName: 'Mailer Team',
    });

    expect(service.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        email: expect.objectContaining({
          smtpHost: 'smtp.example.org',
          smtpPort: 2525,
          smtpSecure: false,
          smtpUser: 'mailer-user',
          smtpSender: 'mailer@example.org',
          smtpFromName: 'Mailer Team',
        }),
      }),
    );
    expect(result.smtpHost).toBe('smtp.example.org');
    expect(result.smtpPort).toBe(2525);
    expect(result.smtpSecure).toBe(false);
    expect(result.smtpUser).toBe('mailer-user');
    expect(result.smtpSender).toBe('mailer@example.org');
    expect(result.smtpFromName).toBe('Mailer Team');
    expect(result.smtpPasswordConfigured).toBe(false);
  });
});
