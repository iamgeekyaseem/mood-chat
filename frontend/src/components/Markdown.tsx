import { useMemo } from "react";
import hljs from "highlight.js/lib/core";

// Registered individually rather than importing the full bundle: the common
// set is a fraction of the size, and an unregistered language falls back to
// plain text rather than failing.
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

const LANGS: Record<string, unknown> = {
  bash, sh: bash, shell: bash, zsh: bash,
  css,
  go,
  java,
  json,
  markdown, md: markdown,
  python, py: python,
  rust, rs: rust,
  sql,
  typescript, ts: typescript, js: typescript, javascript: typescript,
  tsx: typescript, jsx: typescript,
  html: xml, xml,
  yaml, yml: yaml,
};

let registered = false;
function ensureRegistered() {
  if (registered) return;
  for (const [name, def] of Object.entries(LANGS)) {
    if (!hljs.getLanguage(name)) {
      hljs.registerLanguage(name, def as never);
    }
  }
  registered = true;
}

interface Props {
  source: string;
  /** Chat bubbles are narrow; notes get a roomier scale. */
  compact?: boolean;
}

/**
 * Small markdown renderer shared by chat messages and the notes document.
 *
 * Deliberately hand-rolled rather than a full parser: the input is either text
 * this app wrote or model output rendered as plain text, and the subset here
 * (headings, quotes, lists, rules, fences, inline emphasis) covers it without
 * pulling in a parser plus a sanitiser. No raw HTML is ever interpreted —
 * everything becomes React elements, so model output cannot inject markup.
 */
export function Markdown({ source, compact = false }: Props) {
  const blocks = useMemo(() => render(source, compact), [source, compact]);
  return <>{blocks}</>;
}

function render(source: string, compact: boolean): React.ReactNode[] {
  ensureRegistered();

  const out: React.ReactNode[] = [];
  const lines = source.split("\n");
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trimStart().startsWith("```")) {
      const lang = line.trim().slice(3).trim().toLowerCase();
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        body.push(lines[i++]);
      }
      i += 1;
      out.push(
        <CodeBlock key={key++} code={body.join("\n")} lang={lang} compact={compact} />,
      );
      continue;
    }

    if (/^#{1,4}\s/.test(line)) {
      const level = line.match(/^#+/)![0].length;
      const size =
        level === 1
          ? compact ? "text-[16px]" : "text-[20px]"
          : level === 2
            ? compact ? "text-[15px]" : "text-[17px]"
            : "text-[14px]";
      out.push(
        <p key={key++} className={`mt-4 mb-1.5 font-semibold first:mt-0 ${size}`}>
          {inline(line.replace(/^#+\s/, ""))}
        </p>,
      );
      i += 1;
      continue;
    }

    if (line.startsWith(">")) {
      const body: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) {
        body.push(lines[i].replace(/^>\s?/, ""));
        i += 1;
      }
      out.push(
        <blockquote
          key={key++}
          className="my-2 border-l-2 border-border pl-3 text-muted italic"
        >
          {body.map((b, n) => (
            <p key={n}>{inline(b) || " "}</p>
          ))}
        </blockquote>,
      );
      continue;
    }

    if (/^\s*[-*+]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s/, ""));
        i += 1;
      }
      out.push(
        <ul key={key++} className="my-2 list-disc space-y-0.5 pl-5">
          {items.map((it, n) => (
            <li key={n}>{inline(it)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\s*\d+[.)]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s/, ""));
        i += 1;
      }
      out.push(
        <ol key={key++} className="my-2 list-decimal space-y-0.5 pl-5">
          {items.map((it, n) => (
            <li key={n}>{inline(it)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) {
      out.push(<hr key={key++} className="my-4 border-border" />);
      i += 1;
      continue;
    }

    if (line.trim() === "") {
      i += 1;
      continue;
    }

    // Consecutive non-blank lines form one paragraph, with hard breaks kept.
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(#{1,4}\s|>|\s*[-*+]\s|\s*\d+[.)]\s)/.test(lines[i]) &&
      !lines[i].trimStart().startsWith("```")
    ) {
      para.push(lines[i++]);
    }
    out.push(
      <p key={key++} className="my-2 leading-relaxed whitespace-pre-wrap first:mt-0">
        {inline(para.join("\n"))}
      </p>,
    );
  }

  return out;
}

function CodeBlock({
  code,
  lang,
  compact,
}: {
  code: string;
  lang: string;
  compact: boolean;
}) {
  const html = useMemo(() => {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(code, { language: lang }).value;
      } catch {
        /* fall through to plain */
      }
    }
    return null;
  }, [code, lang]);

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-border bg-sunken">
      {lang && (
        <div className="border-b border-border px-3 py-1 text-[10px] uppercase tracking-wider text-faint">
          {lang}
        </div>
      )}
      {/* Wide code scrolls inside its own box; the page never scrolls sideways. */}
      <pre
        className={`scroll-x px-3 py-2.5 font-mono leading-relaxed ${
          compact ? "text-[12px]" : "text-[12.5px]"
        }`}
      >
        {html ? (
          // hljs output is generated from `code` by the highlighter itself,
          // never passed through from raw input markup.
          <code dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <code>{code}</code>
        )}
      </pre>
    </div>
  );
}

function inline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*|_[^_\n]+_|\[[^\]\n]+\]\([^)\s]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;

  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];

    if (tok.startsWith("`")) {
      out.push(
        <code
          key={key++}
          className="rounded bg-sunken px-1 py-px font-mono text-[0.9em]"
        >
          {tok.slice(1, -1)}
        </code>,
      );
    } else if (tok.startsWith("**")) {
      out.push(<strong key={key++}>{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith("[")) {
      const label = tok.slice(1, tok.indexOf("]"));
      const href = tok.slice(tok.indexOf("(") + 1, -1);
      // Rendered as text, not an anchor: this runs in a desktop shell where a
      // model-supplied link is not something to make one click away.
      out.push(
        <span key={key++}>
          {label} <span className="text-faint">({href})</span>
        </span>,
      );
    } else {
      out.push(<em key={key++}>{tok.slice(1, -1)}</em>);
    }
    last = m.index + tok.length;
  }

  if (last < text.length) out.push(text.slice(last));
  return out;
}
