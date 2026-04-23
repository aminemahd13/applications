import {
  buildCertificateTokenValues,
  collectCertificateAssetUrls,
  collectCertificateFontAssetKeys,
  parseCertificateDocumentResponse,
} from "./certificate-document";

describe("certificate document helpers", () => {
  it("parses API responses into certificate document data", () => {
    const parsed = parseCertificateDocumentResponse({
      issuedCertificateId: "issued-1",
      certificateId: "certificate-1",
      credentialId: "credential-1",
      status: "ISSUED",
      issuedAt: "2026-04-23T10:00:00.000Z",
      issuer: "Issuer",
      certificateUrl: "/credentials/certificate/certificate-1",
      verifiableCredentialUrl: "/credentials/verify/credential-1",
      event: {
        id: "event-1",
        title: "Math Camp",
        slug: "math-camp",
      },
      recipient: {
        name: "Amina",
      },
      payload: {
        participantName: "Amina",
      },
    });

    expect(parsed).toMatchObject({
      issuedCertificateId: "issued-1",
      certificateId: "certificate-1",
      credentialId: "credential-1",
      issuer: "Issuer",
      event: {
        title: "Math Camp",
      },
      recipient: {
        name: "Amina",
      },
    });
  });

  it("builds certificate token values with canonical verification links", () => {
    const document = parseCertificateDocumentResponse({
      certificateId: "certificate-1",
      credentialId: "credential-1",
      status: "ISSUED",
      issuedAt: "2026-04-23T10:00:00.000Z",
      issuer: "Issuer",
      certificateUrl: "https://participant.example.com/credentials/certificate/certificate-1",
      verifiableCredentialUrl: "https://participant.example.com/credentials/verify/credential-1",
      qrVerificationUrl: "https://participant.example.com/credentials/qr/token-1",
      event: {
        id: "event-1",
        title: "Math Camp",
        slug: "math-camp",
      },
      recipient: {
        name: "Amina",
      },
      payload: {
        participantName: "Amina",
      },
    });

    const tokens = buildCertificateTokenValues(document, {
      participantName: "Amina",
      customField: "Winner",
    });

    expect(tokens).toEqual(
      expect.objectContaining({
        participantName: "Amina",
        customField: "Winner",
        certificateUrl:
          "https://participant.example.com/credentials/certificate/certificate-1",
        verifiableCredentialUrl:
          "https://participant.example.com/credentials/verify/credential-1",
        qrVerificationUrl: "https://participant.example.com/credentials/qr/token-1",
      }),
    );
  });

  it("collects the font and asset dependencies required before the artboard is ready", () => {
    const layout = {
      layoutSchemaVersion: 2 as const,
      canvas: {
        width: 1600,
        height: 1131,
        unit: "px" as const,
        backgroundAssetKey: "events/event-1/certificates/assets/background/bg.png",
      },
      elements: [
        {
          id: "title",
          type: "text" as const,
          x: 100,
          y: 120,
          width: 400,
          height: 80,
          content: "Certificate",
          style: {
            fontAssetKey: "events/event-1/certificates/assets/font/brand.woff2",
          },
        },
        {
          id: "image-1",
          type: "image" as const,
          x: 40,
          y: 40,
          width: 300,
          height: 180,
          assetKey: "events/event-1/certificates/assets/image/logo.png",
        },
        {
          id: "signature-1",
          type: "signature" as const,
          x: 40,
          y: 240,
          width: 300,
          height: 120,
          signatureSlotKey: "lead",
        },
      ],
      signatureSlots: [
        {
          key: "lead",
          label: "Lead",
          assetKey: "events/event-1/certificates/assets/signature/lead.png",
        },
      ],
      metadata: {},
    };

    expect(collectCertificateFontAssetKeys(layout)).toEqual([
      "events/event-1/certificates/assets/font/brand.woff2",
    ]);
    expect(collectCertificateAssetUrls(layout)).toEqual([
      "/credentials/assets?key=events%2Fevent-1%2Fcertificates%2Fassets%2Fbackground%2Fbg.png",
      "/credentials/assets?key=events%2Fevent-1%2Fcertificates%2Fassets%2Fimage%2Flogo.png",
      "/credentials/assets?key=events%2Fevent-1%2Fcertificates%2Fassets%2Fsignature%2Flead.png",
    ]);
  });
});
