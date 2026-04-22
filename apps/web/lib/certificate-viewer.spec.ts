import {
  computeCanvasScale,
  parseCertificateLayout,
  parseCertificatePayloadMap,
} from "./certificate-viewer";

describe("certificate-viewer helpers", () => {
  it("computes a fit scale using both width and height constraints", () => {
    expect(
      computeCanvasScale({
        containerWidth: 1200,
        containerHeight: 500,
        canvasWidth: 1600,
        canvasHeight: 900,
      }),
    ).toBeCloseTo(0.5555, 3);

    expect(
      computeCanvasScale({
        containerWidth: 2200,
        containerHeight: 1500,
        canvasWidth: 1600,
        canvasHeight: 900,
      }),
    ).toBe(1);
  });

  it("handles invalid dimensions safely when computing scale", () => {
    expect(
      computeCanvasScale({
        containerWidth: 0,
        containerHeight: 400,
        canvasWidth: 1000,
        canvasHeight: 700,
      }),
    ).toBe(1);

    expect(
      computeCanvasScale({
        containerWidth: 900,
        containerHeight: Number.POSITIVE_INFINITY,
        canvasWidth: 1800,
        canvasHeight: 1200,
      }),
    ).toBeCloseTo(0.5, 3);
  });

  it("parses valid certificate layout payloads", () => {
    const layout = parseCertificateLayout({
      version: 2,
      canvas: {
        width: 1600,
        height: 1131,
        unit: "px",
      },
      elements: [
        {
          id: "title",
          type: "text",
          x: 100,
          y: 120,
          width: 800,
          height: 80,
          content: "Certificate",
        },
      ],
      signatureSlots: [
        {
          key: "lead",
          label: "Lead Organizer",
        },
      ],
    });

    expect(layout).not.toBeNull();
    expect(layout?.canvas.width).toBe(1600);
    expect(layout?.canvas.height).toBe(1131);
    expect(layout?.elements[0]?.id).toBe("title");
    expect(layout?.signatureSlots[0]?.key).toBe("lead");
  });

  it("rejects invalid layout payloads", () => {
    expect(
      parseCertificateLayout({
        canvas: { width: 1600, height: 1131, unit: "px" },
        elements: [
          {
            id: "bad",
            type: "text",
            x: 0,
            y: 0,
            width: -1,
            height: 80,
          },
        ],
      }),
    ).toBeNull();

    expect(parseCertificateLayout("not-an-object")).toBeNull();
  });

  it("parses payload values into display-safe token strings", () => {
    const parsed = parseCertificatePayloadMap({
      participantName: "Amina",
      issuedYear: 2026,
      checkedIn: true,
      nested: { ignored: true },
      nullValue: null,
    });

    expect(parsed).toEqual({
      participantName: "Amina",
      issuedYear: "2026",
      checkedIn: "true",
    });
  });
});

