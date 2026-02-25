import { stripUnsafeHtml } from "./sanitize";

type MarkdownRenderMode = "block" | "inline";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "#";

  const compact = trimmed.replace(/[\u0000-\u001F\u007F\s]+/g, "").toLowerCase();
  if (compact.startsWith("javascript:")) return "#";
  if (compact.startsWith("data:text/html")) return "#";
  return trimmed;
}

function applyInlineMarkdown(input: string): string {
  if (!input) return "";

  const escaped = escapeHtml(input);
  const codeTokens: string[] = [];

  let output = escaped.replace(/`([^`\n]+)`/g, (_, code: string) => {
    const token = `@@CODE_TOKEN_${codeTokens.length}@@`;
    codeTokens.push(`<code>${code}</code>`);
    return token;
  });

  output = output.replace(
    /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g,
    (_, alt: string, rawUrl: string, title?: string) => {
      const safeUrl = escapeHtml(sanitizeUrl(rawUrl));
      const safeAlt = alt || "Image";
      const safeTitle = title ? ` title="${title}"` : "";
      return `<img src="${safeUrl}" alt="${safeAlt}" loading="lazy"${safeTitle} />`;
    },
  );

  output = output.replace(
    /\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g,
    (_, text: string, rawUrl: string, title?: string) => {
      const sanitizedUrl = sanitizeUrl(rawUrl);
      const safeUrl = escapeHtml(sanitizedUrl);
      const safeTitle = title ? ` title="${title}"` : "";
      const externalAttrs = /^https?:\/\//i.test(sanitizedUrl)
        ? ' target="_blank" rel="noopener noreferrer"'
        : "";
      return `<a href="${safeUrl}"${safeTitle}${externalAttrs}>${text}</a>`;
    },
  );

  output = output.replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>");
  output = output.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  output = output.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  output = output.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  output = output.replace(/_([^_\n]+)_/g, "<em>$1</em>");
  output = output.replace(/~~([^~]+)~~/g, "<del>$1</del>");

  output = output.replace(/@@CODE_TOKEN_(\d+)@@/g, (_, indexText: string) => {
    const index = Number(indexText);
    return codeTokens[index] ?? "";
  });

  return output;
}

function isHeadingLine(line: string): boolean {
  return /^#{1,6}\s+/.test(line.trim());
}

function isDividerLine(line: string): boolean {
  return /^(-{3,}|\*{3,}|_{3,})$/.test(line.trim());
}

function isQuoteLine(line: string): boolean {
  return /^>\s?/.test(line.trim());
}

function isUnorderedListLine(line: string): boolean {
  return /^[-*+]\s+/.test(line.trim());
}

function isOrderedListLine(line: string): boolean {
  return /^\d+[.)]\s+/.test(line.trim());
}

function splitTableCells(line: string): string[] {
  const normalized = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return normalized.split("|").map((cell) => cell.trim());
}

function isTableDividerLine(line: string): boolean {
  const cells = splitTableCells(line);
  if (cells.length === 0) return false;
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function isTableStart(lines: string[], startIndex: number): boolean {
  const headerLine = lines[startIndex]?.trim() ?? "";
  const dividerLine = lines[startIndex + 1]?.trim() ?? "";
  if (!headerLine.includes("|")) return false;
  return isTableDividerLine(dividerLine);
}

function parseFencedCode(lines: string[], startIndex: number): { html: string; nextIndex: number } {
  const fenceLine = lines[startIndex] ?? "";
  const language = fenceLine.trim().slice(3).trim();
  const codeLines: string[] = [];
  let cursor = startIndex + 1;

  while (cursor < lines.length && !/^```/.test(lines[cursor].trim())) {
    codeLines.push(lines[cursor] ?? "");
    cursor += 1;
  }

  if (cursor < lines.length && /^```/.test(lines[cursor].trim())) {
    cursor += 1;
  }

  const code = escapeHtml(codeLines.join("\n"));
  const languageClass = language ? ` class="language-${escapeHtml(language)}"` : "";
  return {
    html: `<pre><code${languageClass}>${code}</code></pre>`,
    nextIndex: cursor,
  };
}

function parseQuote(lines: string[], startIndex: number): { html: string; nextIndex: number } {
  const quoteLines: string[] = [];
  let cursor = startIndex;
  while (cursor < lines.length && isQuoteLine(lines[cursor])) {
    quoteLines.push(lines[cursor].replace(/^>\s?/, ""));
    cursor += 1;
  }

  const body = quoteLines
    .map((line) => applyInlineMarkdown(line))
    .join("<br />");

  return { html: `<blockquote>${body}</blockquote>`, nextIndex: cursor };
}

function parseList(lines: string[], startIndex: number, ordered: boolean): { html: string; nextIndex: number } {
  const itemRegex = ordered ? /^\d+[.)]\s+(.*)$/ : /^[-*+]\s+(.*)$/;
  const items: string[] = [];
  let cursor = startIndex;

  while (cursor < lines.length) {
    const current = lines[cursor];
    const trimmed = current.trim();
    if (!trimmed) break;

    const match = trimmed.match(itemRegex);
    if (match) {
      const content = match[1];
      if (!ordered) {
        const taskMatch = content.match(/^\[( |x|X)\]\s+(.*)$/);
        if (taskMatch) {
          const isChecked = taskMatch[1].toLowerCase() === "x";
          const taskContent = applyInlineMarkdown(taskMatch[2]);
          items.push(
            `<li class="mm-task-item"><span class="mm-task-box${
              isChecked ? " is-checked" : ""
            }">${isChecked ? "✓" : ""}</span><span>${taskContent}</span></li>`,
          );
          cursor += 1;
          continue;
        }
      }
      items.push(`<li>${applyInlineMarkdown(content)}</li>`);
      cursor += 1;
      continue;
    }

    const isContinuation = /^\s{2,}\S/.test(current);
    if (isContinuation && items.length > 0) {
      const continuation = applyInlineMarkdown(trimmed);
      items[items.length - 1] = items[items.length - 1].replace(
        /<\/li>$/,
        `<br />${continuation}</li>`,
      );
      cursor += 1;
      continue;
    }
    break;
  }

  const tag = ordered ? "ol" : "ul";
  return {
    html: `<${tag}>${items.join("")}</${tag}>`,
    nextIndex: cursor,
  };
}

function parseTable(lines: string[], startIndex: number): { html: string; nextIndex: number } {
  const headerCells = splitTableCells(lines[startIndex] ?? "");
  let cursor = startIndex + 2;
  const bodyRows: string[][] = [];

  while (cursor < lines.length) {
    const current = lines[cursor] ?? "";
    const trimmed = current.trim();
    if (!trimmed) break;
    if (!trimmed.includes("|")) break;
    const rowCells = splitTableCells(current);
    if (rowCells.length === 0) break;
    bodyRows.push(rowCells);
    cursor += 1;
  }

  const headerHtml = `<tr>${headerCells
    .map((cell) => `<th>${applyInlineMarkdown(cell)}</th>`)
    .join("")}</tr>`;
  const bodyHtml = bodyRows
    .map((row) => `<tr>${row.map((cell) => `<td>${applyInlineMarkdown(cell)}</td>`).join("")}</tr>`)
    .join("");

  return {
    html: `<table><thead>${headerHtml}</thead><tbody>${bodyHtml}</tbody></table>`,
    nextIndex: cursor,
  };
}

function parseParagraph(lines: string[], startIndex: number): { html: string; nextIndex: number } {
  const paragraphLines: string[] = [];
  let cursor = startIndex;

  while (cursor < lines.length) {
    const current = lines[cursor];
    const trimmed = current.trim();
    if (!trimmed) break;
    if (
      /^```/.test(trimmed) ||
      isHeadingLine(current) ||
      isDividerLine(current) ||
      isQuoteLine(current) ||
      isUnorderedListLine(current) ||
      isOrderedListLine(current) ||
      isTableStart(lines, cursor)
    ) {
      break;
    }
    paragraphLines.push(current);
    cursor += 1;
  }

  const body = applyInlineMarkdown(paragraphLines.join("\n")).replace(/\n/g, "<br />");
  return {
    html: `<p>${body}</p>`,
    nextIndex: cursor,
  };
}

function renderBlockMarkdown(input: string): string {
  const lines = input.replace(/\r\n?/g, "\n").split("\n");
  const html: string[] = [];
  let cursor = 0;

  while (cursor < lines.length) {
    const current = lines[cursor];
    const trimmed = current.trim();
    if (!trimmed) {
      cursor += 1;
      continue;
    }

    if (/^```/.test(trimmed)) {
      const { html: codeHtml, nextIndex } = parseFencedCode(lines, cursor);
      html.push(codeHtml);
      cursor = nextIndex;
      continue;
    }

    if (isTableStart(lines, cursor)) {
      const { html: tableHtml, nextIndex } = parseTable(lines, cursor);
      html.push(tableHtml);
      cursor = nextIndex;
      continue;
    }

    if (isHeadingLine(current)) {
      const match = trimmed.match(/^(#{1,6})\s+(.*)$/);
      const level = Math.min(6, Math.max(1, match?.[1]?.length ?? 2));
      const content = applyInlineMarkdown(match?.[2] ?? "");
      html.push(`<h${level}>${content}</h${level}>`);
      cursor += 1;
      continue;
    }

    if (isDividerLine(current)) {
      html.push("<hr />");
      cursor += 1;
      continue;
    }

    if (isQuoteLine(current)) {
      const { html: quoteHtml, nextIndex } = parseQuote(lines, cursor);
      html.push(quoteHtml);
      cursor = nextIndex;
      continue;
    }

    if (isUnorderedListLine(current)) {
      const { html: listHtml, nextIndex } = parseList(lines, cursor, false);
      html.push(listHtml);
      cursor = nextIndex;
      continue;
    }

    if (isOrderedListLine(current)) {
      const { html: listHtml, nextIndex } = parseList(lines, cursor, true);
      html.push(listHtml);
      cursor = nextIndex;
      continue;
    }

    const { html: paragraphHtml, nextIndex } = parseParagraph(lines, cursor);
    html.push(paragraphHtml);
    cursor = nextIndex;
  }

  return stripUnsafeHtml(html.join("\n"));
}

function renderInlineMarkdown(input: string): string {
  const normalized = input.replace(/\r\n?/g, "\n");
  const html = applyInlineMarkdown(normalized).replace(/\n/g, "<br />");
  return stripUnsafeHtml(html);
}

export function markdownToHtml(input: string, mode: MarkdownRenderMode = "block"): string {
  if (!input?.trim()) return "";
  return mode === "inline" ? renderInlineMarkdown(input) : renderBlockMarkdown(input);
}

export function looksLikeHtml(input: string): boolean {
  if (!input) return false;
  return /<\/?[a-z][\s\S]*>/i.test(input);
}
