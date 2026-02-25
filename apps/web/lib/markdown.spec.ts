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

  it("renders checklists and tables", () => {
    const html = markdownToHtml(
      "- [x] Profile complete\n- [ ] Upload motivation letter\n\n| Track | Seats |\n| --- | --- |\n| Foundations | 120 |",
    );

    expect(html).toContain('class="mm-task-item"');
    expect(html).toContain('class="mm-task-box is-checked"');
    expect(html).toContain("<table>");
    expect(html).toContain("<th>Track</th>");
    expect(html).toContain("<td>120</td>");
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
