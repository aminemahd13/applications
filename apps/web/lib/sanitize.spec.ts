import { sanitizeHtml, stripUnsafeHtml } from "./sanitize";

describe("sanitizeHtml", () => {
  it("removes script tags and event handlers in server fallback mode", () => {
    const dirty =
      '<p onclick="alert(1)">Hello</p><script>alert("xss")</script><a href="/ok">ok</a>';
    const clean = sanitizeHtml(dirty);

    expect(clean).toContain("<p>Hello</p>");
    expect(clean).toContain('<a href="/ok">ok</a>');
    expect(clean).not.toContain("<script>");
    expect(clean).not.toContain("onclick=");
  });

  it("neutralizes javascript: URLs", () => {
    const dirty = '<a href="javascript:alert(1)">bad</a>';
    const clean = sanitizeHtml(dirty);

    expect(clean).toContain('href="#"');
    expect(clean).not.toContain("javascript:");
  });
});

describe("stripUnsafeHtml", () => {
  it("preserves safe content and strips unsafe attributes", () => {
    const dirty =
      '<img src="https://example.com/a.jpg" onerror="alert(1)"><span>ok</span>';
    const clean = stripUnsafeHtml(dirty);

    expect(clean).toContain('<img src="https://example.com/a.jpg">');
    expect(clean).toContain("<span>ok</span>");
    expect(clean).not.toContain("onerror=");
  });
});
