import { looksLikeHtml, markdownToHtml } from "./markdown";

describe("markdownToHtml", () => {
  it("renders headings and emphasis", () => {
    const html = markdownToHtml("# Hello **Math&Maroc**");

    expect(html).toContain("<h1>");
    expect(html).toContain("Hello");
    expect(html).toContain("<strong>Math&amp;Maroc</strong>");
  });

  it("renders ordered and unordered lists with nesting", () => {
    const html = markdownToHtml("- one\n  - two\n1. alpha\n2. beta");

    expect(html).toContain("<ul>");
    expect(html).toContain("<ol>");
    expect(html).toContain("<li>one<ul><li>two</li></ul></li>");
    expect(html).toContain("<li>alpha</li>");
  });

  it("renders checklists and tables with alignment", () => {
    const html = markdownToHtml(
      "- [x] Profile complete\n- [ ] Upload motivation letter\n\n| Track | Seats |\n| :--- | ---: |\n| Foundations | 120 |",
    );

    expect(html).toContain('class="mm-task-item"');
    expect(html).toContain('class="mm-task-box is-checked"');
    expect(html).toContain("&#10003;");
    expect(html).toContain("<table>");
    expect(html).toContain('<th style="text-align:right">Seats</th>');
    expect(html).toContain('<td style="text-align:right">120</td>');
  });

  it("supports reference links and autolinks", () => {
    const html = markdownToHtml(
      "[Guide][docs]\n\n[docs]: https://example.com/docs \"Docs\"\n\nVisit https://mm.test and <https://chat.openai.com>",
    );

    expect(html).toContain('class="mm-md-link"');
    expect(html).toContain('href="https://example.com/docs"');
    expect(html).toContain('title="Docs"');
    expect(html).toContain('href="https://mm.test"');
    expect(html).toContain('href="https://chat.openai.com"');
  });

  it("supports setext headings, blockquotes and code blocks", () => {
    const html = markdownToHtml(
      "Roadmap\n---\n\n> **Launch** soon.\n\n~~~ts\nconst answer = 42;\n~~~\n\n    console.log(answer);",
    );

    expect(html).toContain("<h2>Roadmap</h2>");
    expect(html).toContain("<blockquote>");
    expect(html).toContain("<strong>Launch</strong> soon.");
    expect(html).toContain('<code class="language-ts">const answer = 42;</code>');
    expect(html).toContain("<pre><code>console.log(answer);</code></pre>");
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
