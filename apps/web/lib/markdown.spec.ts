import { looksLikeHtml, markdownToHtml } from "./markdown";

describe("markdownToHtml", () => {
  it("renders headings and emphasis", () => {
    const html = markdownToHtml("# Hello **Math&Maroc**");

    expect(html).toContain("<h1>");
    expect(html).toContain("Hello");
    expect(html).toContain("<strong>Math&amp;Maroc</strong>");
  });

  it("renders ordered and unordered lists", () => {
    const html = markdownToHtml("- one\n- two\n\n1. alpha\n2. beta");

    expect(html).toContain("<ul>");
    expect(html).toContain("<ol>");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain("<li>alpha</li>");
  });

  it("sanitizes unsafe links", () => {
    const html = markdownToHtml("[bad](javascript:alert(1))", "inline");

    expect(html).toContain('href="#"');
    expect(html).not.toContain("javascript:");
  });
});

describe("looksLikeHtml", () => {
  it("detects html snippets", () => {
    expect(looksLikeHtml("<p>Hello</p>")).toBe(true);
    expect(looksLikeHtml("Plain **markdown**")).toBe(false);
  });
});

