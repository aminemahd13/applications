import { stripUnsafeHtml } from "./sanitize";

type MarkdownRenderMode = "block" | "inline";
type LinkDefinition = { url: string; title?: string };
type LinkDefinitionMap = Map<string, LinkDefinition>;
type TableAlignment = "left" | "center" | "right";
type ListLineMatch = {
  indent: number;
  ordered: boolean;
  marker: string;
  content: string;
};

const EMPTY_LINK_DEFINITIONS: LinkDefinitionMap = new Map();

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
  if (compact.startsWith("vbscript:")) return "#";
  if (compact.startsWith("data:")) return "#";
  return trimmed;
}

function normalizeMarkdownLines(input: string): string[] {
  return input
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, "    ")
    .split("\n");
}

function getIndentWidth(line: string): number {
  const match = line.match(/^ */);
  return match?.[0]?.length ?? 0;
}

function normalizeLinkLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

function unwrapAngleBrackets(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("&lt;") && trimmed.endsWith("&gt;")) {
    return trimmed.slice(4, -4);
  }
  if (trimmed.startsWith("<") && trimmed.endsWith(">")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseLinkDefinitions(lines: string[]): { lines: string[]; linkDefinitions: LinkDefinitionMap } {
  const linkDefinitions: LinkDefinitionMap = new Map();
  const outputLines: string[] = [];
  const definitionRegex =
    /^\s{0,3}\[([^\]]+)\]:\s*(?:<([^>]+)>|(\S+))(?:\s+(?:"([^"]+)"|'([^']+)'|\(([^)]+)\)))?\s*$/;

  for (const line of lines) {
    const match = line.match(definitionRegex);
    if (!match) {
      outputLines.push(line);
      continue;
    }
    const label = normalizeLinkLabel(match[1] ?? "");
    if (!label) continue;
    const rawUrl = match[2] ?? match[3] ?? "";
    if (!rawUrl) continue;
    const title = match[4] ?? match[5] ?? match[6] ?? undefined;
    linkDefinitions.set(label, { url: rawUrl, title });
  }

  return { lines: outputLines, linkDefinitions };
}

function resolveLinkDefinition(label: string, linkDefinitions: LinkDefinitionMap): LinkDefinition | null {
  const normalized = normalizeLinkLabel(label);
  if (!normalized) return null;
  return linkDefinitions.get(normalized) ?? null;
}

function buildAnchorTag(textHtml: string, rawUrl: string, title?: string): string {
  const sanitizedUrl = sanitizeUrl(rawUrl);
  const safeUrl = escapeHtml(sanitizedUrl);
  const safeTitle = title ? ` title="${escapeHtml(title)}"` : "";
  const externalAttrs = /^https?:\/\//i.test(sanitizedUrl)
    ? ' target="_blank" rel="noopener noreferrer nofollow"'
    : "";
  return `<a class="mm-md-link" href="${safeUrl}"${safeTitle}${externalAttrs}>${textHtml}</a>`;
}

function buildImageTag(alt: string, rawUrl: string, title?: string): string {
  const sanitizedUrl = sanitizeUrl(rawUrl);
  const safeUrl = escapeHtml(sanitizedUrl);
  const safeAlt = escapeHtml(alt || "Image");
  const safeTitle = title ? ` title="${escapeHtml(title)}"` : "";
  return `<img class="mm-md-image" src="${safeUrl}" alt="${safeAlt}" loading="lazy"${safeTitle} />`;
}

function trimTrailingUrlPunctuation(value: string): { url: string; trailing: string } {
  let url = value;
  let trailing = "";
  while (url && /[),.;!?]$/.test(url)) {
    trailing = `${url.slice(-1)}${trailing}`;
    url = url.slice(0, -1);
  }
  return { url, trailing };
}

function applyInlineDecorators(value: string): string {
  let output = value;
  output = output.replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>");
  output = output.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  output = output.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  output = output.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  output = output.replace(/_([^_\n]+)_/g, "<em>$1</em>");
  output = output.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  return output;
}

function applyInlineMarkdown(input: string, linkDefinitions: LinkDefinitionMap = EMPTY_LINK_DEFINITIONS): string {
  if (!input) return "";

  const escaped = escapeHtml(input).replace(/\\([\\`*_{}\[\]()#+\-.!|>~])/g, "$1");
  const htmlTokens: string[] = [];

  const stashToken = (html: string): string => {
    const token = `@@MDTOKEN${htmlTokens.length}@@`;
    htmlTokens.push(html);
    return token;
  };

  let output = escaped.replace(/(`+)([^`\n]+?)\1/g, (_, _ticks: string, code: string) => {
    return stashToken(`<code>${code}</code>`);
  });

  output = output.replace(
    /!\[([^\]]*)\]\(((?:&lt;[^&]+&gt;|(?:[^()\s]+|\([^()\s]*\))+))(?:\s+(?:"([^"]*)"|'([^']*)'))?\)/g,
    (_, altText: string, rawUrl: string, doubleQuotedTitle?: string, singleQuotedTitle?: string) => {
      const title = doubleQuotedTitle ?? singleQuotedTitle;
      return stashToken(buildImageTag(altText, unwrapAngleBrackets(rawUrl), title));
    },
  );

  output = output.replace(
    /!\[([^\]]*)\]\[([^\]]*)\]/g,
    (_, altText: string, definitionLabel: string) => {
      const resolved = resolveLinkDefinition(definitionLabel || altText, linkDefinitions);
      if (!resolved) return `![${altText}][${definitionLabel}]`;
      return stashToken(buildImageTag(altText, resolved.url, resolved.title));
    },
  );

  output = output.replace(
    /\[([^\]]+)\]\(((?:&lt;[^&]+&gt;|(?:[^()\s]+|\([^()\s]*\))+))(?:\s+(?:"([^"]*)"|'([^']*)'))?\)/g,
    (_, text: string, rawUrl: string, doubleQuotedTitle?: string, singleQuotedTitle?: string) => {
      const title = doubleQuotedTitle ?? singleQuotedTitle;
      const textHtml = applyInlineDecorators(text);
      return stashToken(buildAnchorTag(textHtml, unwrapAngleBrackets(rawUrl), title));
    },
  );

  output = output.replace(
    /\[([^\]]+)\]\[([^\]]*)\]/g,
    (_, text: string, definitionLabel: string) => {
      const resolved = resolveLinkDefinition(definitionLabel || text, linkDefinitions);
      if (!resolved) return `[${text}][${definitionLabel}]`;
      const textHtml = applyInlineDecorators(text);
      return stashToken(buildAnchorTag(textHtml, resolved.url, resolved.title));
    },
  );

  output = output.replace(/(?:&lt;|<)((?:https?:\/\/|mailto:)[^<>\s]+)(?:&gt;|>)/gi, (_, rawUrl: string) => {
    return stashToken(buildAnchorTag(rawUrl, rawUrl));
  });

  output = output.replace(
    /(^|[\s(>])((?:https?:\/\/|www\.)[^\s<]+)/gi,
    (_, prefix: string, rawUrl: string) => {
      const { url, trailing } = trimTrailingUrlPunctuation(rawUrl);
      if (!url) return `${prefix}${rawUrl}`;
      const href = url.startsWith("www.") ? `https://${url}` : url;
      return `${prefix}${stashToken(buildAnchorTag(url, href))}${trailing}`;
    },
  );

  output = applyInlineDecorators(output);

  output = output.replace(/@@MDTOKEN(\d+)@@/g, (_, indexText: string) => {
    const index = Number(indexText);
    return htmlTokens[index] ?? "";
  });

  return output;
}

function isHeadingLine(line: string): boolean {
  return /^\s{0,3}#{1,6}(?:\s+|$)/.test(line);
}

function isSetextDividerLine(line: string): boolean {
  return /^\s{0,3}(=+|-+)\s*$/.test(line);
}

function isDividerLine(line: string): boolean {
  return /^\s{0,3}(?:(?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,})$/.test(line);
}

function isQuoteLine(line: string): boolean {
  return /^\s{0,3}>\s?/.test(line);
}

function getListLineMatch(line: string): ListLineMatch | null {
  const match = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
  if (!match) return null;
  const marker = match[2];
  return {
    indent: match[1].length,
    ordered: /^\d+[.)]$/.test(marker),
    marker,
    content: match[3] ?? "",
  };
}

function isTopLevelListLine(line: string): boolean {
  const match = getListLineMatch(line);
  return Boolean(match && match.indent <= 3);
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

function parseTableAlignments(line: string): TableAlignment[] {
  return splitTableCells(line).map((cell) => {
    const trimmed = cell.trim();
    if (trimmed.startsWith(":") && trimmed.endsWith(":")) return "center";
    if (trimmed.endsWith(":")) return "right";
    return "left";
  });
}

function isTableStart(lines: string[], startIndex: number): boolean {
  const headerLine = lines[startIndex]?.trim() ?? "";
  const dividerLine = lines[startIndex + 1]?.trim() ?? "";
  if (!headerLine.includes("|")) return false;
  return isTableDividerLine(dividerLine);
}

function isFencedCodeStart(line: string): boolean {
  return /^\s{0,3}(?:`{3,}|~{3,})/.test(line);
}

function parseFencedCode(lines: string[], startIndex: number): { html: string; nextIndex: number } {
  const fenceLine = lines[startIndex] ?? "";
  const fenceMatch = fenceLine.match(/^\s{0,3}(`{3,}|~{3,})(.*)$/);
  if (!fenceMatch) {
    return {
      html: `<pre><code>${escapeHtml(fenceLine)}</code></pre>`,
      nextIndex: startIndex + 1,
    };
  }
  const openingFence = fenceMatch[1];
  const infoString = (fenceMatch[2] ?? "").trim();
  const language = infoString.split(/\s+/)[0] ?? "";
  const fenceChar = openingFence[0];
  const fenceLength = openingFence.length;
  const codeLines: string[] = [];
  let cursor = startIndex + 1;
  const closingFenceRegex = new RegExp(`^\\s{0,3}${fenceChar}{${fenceLength},}\\s*$`);

  while (cursor < lines.length && !closingFenceRegex.test(lines[cursor] ?? "")) {
    codeLines.push(lines[cursor] ?? "");
    cursor += 1;
  }

  if (cursor < lines.length && closingFenceRegex.test(lines[cursor] ?? "")) {
    cursor += 1;
  }

  const code = escapeHtml(codeLines.join("\n"));
  const languageClass = language ? ` class="language-${escapeHtml(language)}"` : "";
  return {
    html: `<pre><code${languageClass}>${code}</code></pre>`,
    nextIndex: cursor,
  };
}

function isIndentedCodeLine(line: string): boolean {
  return /^(?: {4,})/.test(line);
}

function parseIndentedCode(lines: string[], startIndex: number): { html: string; nextIndex: number } {
  const codeLines: string[] = [];
  let cursor = startIndex;

  while (cursor < lines.length) {
    const current = lines[cursor] ?? "";
    if (!current.trim()) {
      codeLines.push("");
      cursor += 1;
      continue;
    }
    if (!isIndentedCodeLine(current)) break;
    codeLines.push(current.slice(4));
    cursor += 1;
  }

  while (codeLines.length > 0 && !codeLines[codeLines.length - 1]) {
    codeLines.pop();
  }

  return {
    html: `<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`,
    nextIndex: cursor,
  };
}

function findNextNonEmptyLine(lines: string[], startIndex: number): number {
  for (let index = startIndex; index < lines.length; index += 1) {
    if ((lines[index] ?? "").trim()) return index;
  }
  return -1;
}

function appendToListItem(itemHtml: string, addition: string): string {
  if (itemHtml.includes('class="mm-task-item"')) {
    return itemHtml.replace(/<\/span><\/li>$/, `${addition}</span></li>`);
  }
  return itemHtml.replace(/<\/li>$/, `${addition}</li>`);
}

function buildListItemHtml(
  content: string,
  ordered: boolean,
  linkDefinitions: LinkDefinitionMap,
): string {
  if (!ordered) {
    const taskMatch = content.match(/^\[( |x|X)\]\s+(.*)$/);
    if (taskMatch) {
      const isChecked = taskMatch[1].toLowerCase() === "x";
      const taskContent = applyInlineMarkdown(taskMatch[2], linkDefinitions);
      return `<li class="mm-task-item"><span class="mm-task-box${
        isChecked ? " is-checked" : ""
      }">${isChecked ? "&#10003;" : ""}</span><span>${taskContent}</span></li>`;
    }
  }
  return `<li>${applyInlineMarkdown(content, linkDefinitions)}</li>`;
}

function parseList(
  lines: string[],
  startIndex: number,
  linkDefinitions: LinkDefinitionMap,
): { html: string; nextIndex: number } {
  const firstMatch = getListLineMatch(lines[startIndex] ?? "");
  if (!firstMatch) return { html: "", nextIndex: startIndex + 1 };

  const listIndent = firstMatch.indent;
  const ordered = firstMatch.ordered;
  const items: string[] = [];
  let cursor = startIndex;

  while (cursor < lines.length) {
    const current = lines[cursor] ?? "";
    if (!current.trim()) {
      cursor += 1;
      continue;
    }

    const currentMatch = getListLineMatch(current);
    if (!currentMatch) break;
    if (currentMatch.indent < listIndent) break;

    if (currentMatch.indent > listIndent) {
      if (items.length === 0) break;
      const nestedList = parseList(lines, cursor, linkDefinitions);
      if (!nestedList.html || nestedList.nextIndex <= cursor) break;
      items[items.length - 1] = appendToListItem(items[items.length - 1], nestedList.html);
      cursor = nestedList.nextIndex;
      continue;
    }

    if (currentMatch.ordered !== ordered) break;

    items.push(buildListItemHtml(currentMatch.content, ordered, linkDefinitions));
    cursor += 1;

    while (cursor < lines.length) {
      const nextLine = lines[cursor] ?? "";

      if (!nextLine.trim()) {
        const nextNonEmpty = findNextNonEmptyLine(lines, cursor + 1);
        if (nextNonEmpty === -1) {
          cursor = lines.length;
          break;
        }
        const nextLineMatch = getListLineMatch(lines[nextNonEmpty] ?? "");
        if (
          nextLineMatch &&
          nextLineMatch.indent === listIndent &&
          nextLineMatch.ordered === ordered
        ) {
          cursor = nextNonEmpty;
          break;
        }
        if (nextLineMatch && nextLineMatch.indent > listIndent) {
          cursor = nextNonEmpty;
          continue;
        }
        const continuationIndent = getIndentWidth(lines[nextNonEmpty] ?? "");
        if (continuationIndent > listIndent) {
          const continuationText = (lines[nextNonEmpty] ?? "").trim();
          items[items.length - 1] = appendToListItem(
            items[items.length - 1],
            `<br />${applyInlineMarkdown(continuationText, linkDefinitions)}`,
          );
          cursor = nextNonEmpty + 1;
          continue;
        }
        cursor = nextNonEmpty;
        break;
      }

      const nextMatch = getListLineMatch(nextLine);
      if (nextMatch) {
        if (nextMatch.indent === listIndent && nextMatch.ordered === ordered) {
          break;
        }
        if (nextMatch.indent > listIndent) {
          const nestedList = parseList(lines, cursor, linkDefinitions);
          if (nestedList.html && nestedList.nextIndex > cursor) {
            items[items.length - 1] = appendToListItem(items[items.length - 1], nestedList.html);
            cursor = nestedList.nextIndex;
            continue;
          }
        }
        if (nextMatch.indent <= listIndent) break;
      }

      const nextIndent = getIndentWidth(nextLine);
      if (nextIndent > listIndent) {
        const continuation = nextLine.trim();
        items[items.length - 1] = appendToListItem(
          items[items.length - 1],
          `<br />${applyInlineMarkdown(continuation, linkDefinitions)}`,
        );
        cursor += 1;
        continue;
      }
      break;
    }
  }

  const startMatch = firstMatch.marker.match(/^(\d+)[.)]$/);
  const startValue = startMatch ? Number(startMatch[1]) : 1;
  const startAttr = ordered && startValue > 1 ? ` start="${startValue}"` : "";
  const tag = ordered ? "ol" : "ul";

  return {
    html: `<${tag}${startAttr}>${items.join("")}</${tag}>`,
    nextIndex: cursor,
  };
}

function renderBlockLines(lines: string[], linkDefinitions: LinkDefinitionMap): string {
  const html: string[] = [];
  let cursor = 0;

  while (cursor < lines.length) {
    const current = lines[cursor] ?? "";
    const trimmed = current.trim();
    if (!trimmed) {
      cursor += 1;
      continue;
    }

    if (isFencedCodeStart(current)) {
      const { html: codeHtml, nextIndex } = parseFencedCode(lines, cursor);
      html.push(codeHtml);
      cursor = nextIndex;
      continue;
    }

    if (
      cursor + 1 < lines.length &&
      !isHeadingLine(current) &&
      !isDividerLine(current) &&
      !isQuoteLine(current) &&
      !isTopLevelListLine(current) &&
      !isTableStart(lines, cursor) &&
      isSetextDividerLine(lines[cursor + 1] ?? "")
    ) {
      const level = (lines[cursor + 1] ?? "").trim().startsWith("=") ? 1 : 2;
      html.push(`<h${level}>${applyInlineMarkdown(trimmed, linkDefinitions)}</h${level}>`);
      cursor += 2;
      continue;
    }

    if (isTableStart(lines, cursor)) {
      const { html: tableHtml, nextIndex } = parseTable(lines, cursor, linkDefinitions);
      html.push(tableHtml);
      cursor = nextIndex;
      continue;
    }

    if (isIndentedCodeLine(current)) {
      const { html: codeHtml, nextIndex } = parseIndentedCode(lines, cursor);
      html.push(codeHtml);
      cursor = nextIndex;
      continue;
    }

    if (isHeadingLine(current)) {
      const match = trimmed.match(/^(#{1,6})\s*(.*?)\s*#*\s*$/);
      const level = Math.min(6, Math.max(1, match?.[1]?.length ?? 2));
      const content = applyInlineMarkdown(match?.[2] ?? "", linkDefinitions);
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
      const { html: quoteHtml, nextIndex } = parseQuote(lines, cursor, linkDefinitions);
      html.push(quoteHtml);
      cursor = nextIndex;
      continue;
    }

    if (isTopLevelListLine(current)) {
      const { html: listHtml, nextIndex } = parseList(lines, cursor, linkDefinitions);
      html.push(listHtml);
      cursor = nextIndex;
      continue;
    }

    const { html: paragraphHtml, nextIndex } = parseParagraph(lines, cursor, linkDefinitions);
    html.push(paragraphHtml);
    cursor = nextIndex;
  }

  return html.join("\n");
}

function parseQuote(
  lines: string[],
  startIndex: number,
  linkDefinitions: LinkDefinitionMap,
): { html: string; nextIndex: number } {
  const quoteLines: string[] = [];
  let cursor = startIndex;

  while (cursor < lines.length) {
    const current = lines[cursor] ?? "";
    if (isQuoteLine(current)) {
      quoteLines.push(current.replace(/^\s{0,3}>\s?/, ""));
      cursor += 1;
      continue;
    }
    if (!current.trim()) {
      const nextNonEmpty = findNextNonEmptyLine(lines, cursor + 1);
      if (nextNonEmpty !== -1 && isQuoteLine(lines[nextNonEmpty] ?? "")) {
        quoteLines.push("");
        cursor = nextNonEmpty;
        continue;
      }
    }
    break;
  }

  const bodyHtml = renderBlockLines(quoteLines, linkDefinitions);
  return { html: `<blockquote>${bodyHtml}</blockquote>`, nextIndex: cursor };
}

function parseTable(
  lines: string[],
  startIndex: number,
  linkDefinitions: LinkDefinitionMap,
): { html: string; nextIndex: number } {
  const headerCells = splitTableCells(lines[startIndex] ?? "");
  const alignments = parseTableAlignments(lines[startIndex + 1] ?? "");
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

  const resolveAlignmentStyle = (index: number): string => {
    const alignment = alignments[index] ?? "left";
    return alignment === "left" ? "" : ` style="text-align:${alignment}"`;
  };

  const headerHtml = `<tr>${headerCells
    .map((cell, index) => `<th${resolveAlignmentStyle(index)}>${applyInlineMarkdown(cell, linkDefinitions)}</th>`)
    .join("")}</tr>`;

  const bodyHtml = bodyRows
    .map((row) => {
      const normalizedRow = row.slice(0, headerCells.length);
      while (normalizedRow.length < headerCells.length) {
        normalizedRow.push("");
      }
      const rowHtml = normalizedRow
        .map(
          (cell, index) =>
            `<td${resolveAlignmentStyle(index)}>${applyInlineMarkdown(cell, linkDefinitions)}</td>`,
        )
        .join("");
      return `<tr>${rowHtml}</tr>`;
    })
    .join("");

  return {
    html: `<table><thead>${headerHtml}</thead><tbody>${bodyHtml}</tbody></table>`,
    nextIndex: cursor,
  };
}

function parseParagraph(
  lines: string[],
  startIndex: number,
  linkDefinitions: LinkDefinitionMap,
): { html: string; nextIndex: number } {
  const paragraphLines: string[] = [];
  let cursor = startIndex;

  while (cursor < lines.length) {
    const current = lines[cursor] ?? "";
    const trimmed = current.trim();
    if (!trimmed) break;
    if (
      isFencedCodeStart(current) ||
      isHeadingLine(current) ||
      isSetextDividerLine(current) ||
      isDividerLine(current) ||
      isQuoteLine(current) ||
      isTopLevelListLine(current) ||
      isTableStart(lines, cursor) ||
      isIndentedCodeLine(current)
    ) {
      break;
    }
    paragraphLines.push(current);
    cursor += 1;
  }

  const body = applyInlineMarkdown(paragraphLines.join("\n"), linkDefinitions).replace(/\n/g, "<br />");
  return {
    html: `<p>${body}</p>`,
    nextIndex: cursor,
  };
}

function renderBlockMarkdown(input: string): string {
  const normalizedLines = normalizeMarkdownLines(input);
  const { lines, linkDefinitions } = parseLinkDefinitions(normalizedLines);
  return stripUnsafeHtml(renderBlockLines(lines, linkDefinitions));
}

function renderInlineMarkdown(input: string): string {
  const normalizedLines = normalizeMarkdownLines(input);
  const { lines, linkDefinitions } = parseLinkDefinitions(normalizedLines);
  const html = applyInlineMarkdown(lines.join("\n"), linkDefinitions).replace(/\n/g, "<br />");
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
