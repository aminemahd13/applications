import {
  getMimeEssence,
  hardenUploadResponseHeaders,
  isActiveUploadContentType,
  UPLOAD_SANDBOX_CSP,
} from "./upload-response-headers";

function harden(init: Record<string, string>, status = 200): Headers {
  const headers = new Headers(init);
  hardenUploadResponseHeaders(headers, status);
  return headers;
}

describe("getMimeEssence", () => {
  it("lowercases and drops parameters", () => {
    expect(getMimeEssence("Text/HTML; charset=utf-8")).toBe("text/html");
    expect(getMimeEssence(" application/pdf ")).toBe("application/pdf");
  });

  it("returns null for missing or unparseable types", () => {
    expect(getMimeEssence(null)).toBeNull();
    expect(getMimeEssence(undefined)).toBeNull();
    expect(getMimeEssence("")).toBeNull();
    expect(getMimeEssence("garbage")).toBeNull();
  });
});

describe("isActiveUploadContentType", () => {
  it.each([
    "text/html",
    "TEXT/HTML; charset=utf-8",
    "application/xhtml+xml",
    "image/svg+xml",
    "text/xml",
    "application/xml",
    "application/rss+xml",
    "text/javascript",
    "application/javascript",
    "multipart/x-mixed-replace",
    null,
    "",
  ])("flags %p", (contentType) => {
    expect(isActiveUploadContentType(contentType)).toBe(true);
  });

  it.each(["image/png", "application/pdf", "video/mp4", "application/octet-stream", "text/plain"])(
    "does not flag %p",
    (contentType) => {
      expect(isActiveUploadContentType(contentType)).toBe(false);
    },
  );
});

describe("hardenUploadResponseHeaders", () => {
  it("always sets nosniff and no-referrer", () => {
    for (const contentType of ["image/png", "application/pdf", "text/html"]) {
      const headers = harden({ "content-type": contentType });
      expect(headers.get("x-content-type-options")).toBe("nosniff");
      expect(headers.get("referrer-policy")).toBe("no-referrer");
    }
  });

  it("overrides an upstream nosniff/referrer value instead of duplicating it", () => {
    const headers = harden({
      "content-type": "image/png",
      "x-content-type-options": "nosniff",
    });
    expect(headers.get("x-content-type-options")).toBe("nosniff");
  });

  it.each(["text/html", "image/svg+xml", "image/png", "application/octet-stream", "video/mp4"])(
    "sandboxes %p",
    (contentType) => {
      const headers = harden({ "content-type": contentType });
      expect(headers.get("content-security-policy")).toBe(UPLOAD_SANDBOX_CSP);
    },
  );

  it("replaces the upstream (MinIO) CSP for non-PDF types", () => {
    const headers = harden({
      "content-type": "text/html",
      "content-security-policy": "block-all-mixed-content",
    });
    expect(headers.get("content-security-policy")).toBe(UPLOAD_SANDBOX_CSP);
  });

  it("sandboxes responses without a content type", () => {
    const headers = harden({});
    expect(headers.get("content-security-policy")).toBe(UPLOAD_SANDBOX_CSP);
  });

  it("does not sandbox PDFs (the browser viewer refuses sandboxed documents)", () => {
    expect(harden({ "content-type": "application/pdf" }).get("content-security-policy")).toBeNull();
    expect(
      harden({ "content-type": "Application/PDF; qs=0.001" }).get("content-security-policy"),
    ).toBeNull();
  });

  it("forces attachment for a successful active-type response", () => {
    const headers = harden({ "content-type": "text/html" }, 200);
    expect(headers.get("content-disposition")).toBe("attachment");
  });

  it("overrides an inline disposition on an active type", () => {
    const headers = harden(
      {
        "content-type": "image/svg+xml",
        "content-disposition": 'inline; filename="logo.svg"',
      },
      200,
    );
    expect(headers.get("content-disposition")).toBe("attachment");
  });

  it("keeps an upstream attachment disposition (and its filename)", () => {
    const disposition = `attachment; filename="logo.svg"; filename*=UTF-8''logo.svg`;
    const headers = harden(
      { "content-type": "image/svg+xml", "content-disposition": disposition },
      200,
    );
    expect(headers.get("content-disposition")).toBe(disposition);
  });

  it("forces attachment on partial content of an active type", () => {
    const headers = harden({ "content-type": "text/html" }, 206);
    expect(headers.get("content-disposition")).toBe("attachment");
  });

  it("does not touch the disposition of a MinIO 403 XML error", () => {
    const headers = harden({ "content-type": "application/xml" }, 403);
    expect(headers.get("content-disposition")).toBeNull();
    expect(headers.get("content-security-policy")).toBe(UPLOAD_SANDBOX_CSP);
  });

  it("preserves an inline disposition on a png", () => {
    const disposition = `inline; filename="id.png"; filename*=UTF-8''id.png`;
    const headers = harden(
      { "content-type": "image/png", "content-disposition": disposition },
      200,
    );
    expect(headers.get("content-disposition")).toBe(disposition);
  });

  it("leaves passive types without a disposition alone", () => {
    const headers = harden({ "content-type": "video/mp4" }, 200);
    expect(headers.get("content-disposition")).toBeNull();
  });
});

describe("comma-separated content types (browsers use the last value)", () => {
  it("treats a crafted pdf-then-html type as active: sandboxed and downloaded", () => {
    expect(getMimeEssence("application/pdf;x=1,text/html")).toBeNull();
    const headers = harden({ "content-type": "application/pdf;x=1,text/html" }, 200);
    expect(headers.get("content-security-policy")).toContain("sandbox");
    expect(headers.get("content-disposition") ?? "").toMatch(/^attachment/);
  });
});
