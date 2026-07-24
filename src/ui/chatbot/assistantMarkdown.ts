const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (char) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#39;"
}[char] ?? char));

function safeLink(value: string): string | null {
  const trimmed = value.trim();
  if (/^(https?:\/\/|mailto:)/iu.test(trimmed)) return escapeHtml(trimmed);
  return null;
}

function renderInline(value: string): string {
  const code: string[] = [];
  let output = escapeHtml(value).replace(/`([^`\n]+)`/gu, (_match, content: string) => {
    const index = code.push(`<code>${content}</code>`) - 1;
    return `\u0000CODE${index}\u0000`;
  });
  output = output.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/gu, (_match, label: string, href: string) => {
    const safe = safeLink(href);
    return safe ? `<a href="${safe}" target="_blank" rel="noopener noreferrer">${label}</a>` : label;
  });
  output = output
    .replace(/\*\*([^*\n]+)\*\*/gu, "<strong>$1</strong>")
    .replace(/__([^_\n]+)__/gu, "<strong>$1</strong>")
    .replace(/~~([^~\n]+)~~/gu, "<del>$1</del>")
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/gu, "$1<em>$2</em>")
    .replace(/(^|[^_])_([^_\n]+)_(?!_)/gu, "$1<em>$2</em>");
  return output.replace(/\u0000CODE(\d+)\u0000/gu, (_match, index: string) => code[Number(index)] ?? "");
}

const isFence = (line: string) => /^\s*```/u.test(line);
const isHeading = (line: string) => /^\s{0,3}#{1,4}\s+/u.test(line);
const isQuote = (line: string) => /^\s{0,3}>\s?/u.test(line);
const isList = (line: string) => /^\s{0,3}(?:[-+*]|\d+\.)\s+/u.test(line);
const isRule = (line: string) => /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/u.test(line);
const isTableDivider = (line: string) => /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/u.test(line);

function tableCells(line: string): string[] {
  return line.trim().replace(/^\|/u, "").replace(/\|$/u, "").split("|").map((cell) => cell.trim());
}

/** Renders the supported CommonMark/GFM subset without allowing raw HTML. */
export function assistantMarkdownToSafeHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n?/gu, "\n").split("\n");
  const blocks: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (isFence(line)) {
      const language = line.trim().slice(3).trim().replace(/[^a-z0-9_-]/giu, "").slice(0, 32);
      const content: string[] = [];
      index += 1;
      while (index < lines.length && !isFence(lines[index] ?? "")) content.push(lines[index++] ?? "");
      if (index < lines.length) index += 1;
      blocks.push(`<pre${language ? ` data-language="${escapeHtml(language)}"` : ""}><code>${escapeHtml(content.join("\n"))}</code></pre>`);
      continue;
    }

    const heading = /^\s{0,3}(#{1,4})\s+(.+)$/u.exec(line);
    if (heading) {
      const level = heading[1]?.length ?? 2;
      blocks.push(`<h${level}>${renderInline(heading[2] ?? "")}</h${level}>`);
      index += 1;
      continue;
    }

    if (isRule(line)) {
      blocks.push("<hr>");
      index += 1;
      continue;
    }

    if (isQuote(line)) {
      const quoted: string[] = [];
      while (index < lines.length && isQuote(lines[index] ?? "")) {
        quoted.push((lines[index] ?? "").replace(/^\s{0,3}>\s?/u, ""));
        index += 1;
      }
      blocks.push(`<blockquote>${assistantMarkdownToSafeHtml(quoted.join("\n"))}</blockquote>`);
      continue;
    }

    if (index + 1 < lines.length && line.includes("|") && isTableDivider(lines[index + 1] ?? "")) {
      const headings = tableCells(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && (lines[index] ?? "").includes("|") && (lines[index] ?? "").trim()) {
        rows.push(tableCells(lines[index] ?? ""));
        index += 1;
      }
      blocks.push(`<div class="chatbot-table-wrap"><table><thead><tr>${headings.map((cell) => `<th>${renderInline(cell)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${headings.map((_cell, cellIndex) => `<td>${renderInline(row[cellIndex] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
      continue;
    }

    if (isList(line)) {
      const ordered = /^\s{0,3}\d+\.\s+/u.test(line);
      const tag = ordered ? "ol" : "ul";
      const items: string[] = [];
      while (index < lines.length) {
        const candidate = lines[index] ?? "";
        const match = ordered
          ? /^\s{0,3}\d+\.\s+(.+)$/u.exec(candidate)
          : /^\s{0,3}[-+*]\s+(.+)$/u.exec(candidate);
        if (!match) break;
        items.push(`<li>${renderInline(match[1] ?? "")}</li>`);
        index += 1;
      }
      blocks.push(`<${tag}>${items.join("")}</${tag}>`);
      continue;
    }

    const paragraph: string[] = [line.trim()];
    index += 1;
    while (index < lines.length) {
      const next = lines[index] ?? "";
      if (!next.trim() || isFence(next) || isHeading(next) || isQuote(next) || isList(next) || isRule(next)) break;
      if (index + 1 < lines.length && next.includes("|") && isTableDivider(lines[index + 1] ?? "")) break;
      paragraph.push(next.trim());
      index += 1;
    }
    blocks.push(`<p>${paragraph.map(renderInline).join("<br>")}</p>`);
  }

  return blocks.join("");
}
