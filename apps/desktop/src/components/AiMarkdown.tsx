// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Shared renderer for AI-generated text. Local and cloud models almost always
 * reply in Markdown (bold, lists, headings, tables, code), so every AI surface
 * routes its output through here instead of dumping raw Markdown into a <p>.
 *
 * Safety: react-markdown does NOT render embedded raw HTML by default (we add
 * no rehype-raw plugin), so model output cannot inject markup or scripts. Only
 * GitHub-flavoured Markdown structure is rendered, styled to match the app.
 */

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type AiMarkdownProps = {
  children: string;
  /** Wrapper classes — set the base text size/colour for the surface here. */
  className?: string;
};

export function AiMarkdown({ children, className }: AiMarkdownProps) {
  return (
    <div className={className ?? 'text-sm leading-relaxed text-ink'}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ node: _node, ...props }) => <p className="my-2 first:mt-0 last:mb-0" {...props} />,
          ul: ({ node: _node, ...props }) => (
            <ul className="my-2 list-disc space-y-1 pl-5" {...props} />
          ),
          ol: ({ node: _node, ...props }) => (
            <ol className="my-2 list-decimal space-y-1 pl-5" {...props} />
          ),
          li: ({ node: _node, ...props }) => <li className="leading-relaxed" {...props} />,
          strong: ({ node: _node, ...props }) => (
            <strong className="font-semibold text-ink" {...props} />
          ),
          em: ({ node: _node, ...props }) => <em className="italic" {...props} />,
          a: ({ node: _node, ...props }) => (
            <a
              className="text-accent underline underline-offset-2 hover:text-ink"
              target="_blank"
              rel="noreferrer noopener"
              {...props}
            />
          ),
          h1: ({ node: _node, ...props }) => (
            <h1 className="mb-2 mt-3 text-base font-semibold text-ink first:mt-0" {...props} />
          ),
          h2: ({ node: _node, ...props }) => (
            <h2 className="mb-2 mt-3 text-sm font-semibold text-ink first:mt-0" {...props} />
          ),
          h3: ({ node: _node, ...props }) => (
            <h3 className="mb-1 mt-2 text-sm font-semibold text-ink first:mt-0" {...props} />
          ),
          blockquote: ({ node: _node, ...props }) => (
            <blockquote className="my-2 border-l-2 border-border pl-3 text-muted" {...props} />
          ),
          code: ({ node: _node, className: codeClass, ...props }) =>
            codeClass?.includes('language-') ? (
              <code className={`${codeClass} text-xs`} {...props} />
            ) : (
              <code
                className="rounded bg-white/10 px-1 py-0.5 font-mono text-[0.85em] text-ink"
                {...props}
              />
            ),
          pre: ({ node: _node, ...props }) => (
            <pre
              className="my-2 overflow-x-auto rounded-lg bg-background/60 p-3 font-mono text-xs text-ink"
              {...props}
            />
          ),
          table: ({ node: _node, ...props }) => (
            <div className="my-2 overflow-x-auto">
              <table className="w-full border-collapse text-xs" {...props} />
            </div>
          ),
          th: ({ node: _node, ...props }) => (
            <th
              className="border border-border bg-white/5 px-2 py-1 text-left font-semibold"
              {...props}
            />
          ),
          td: ({ node: _node, ...props }) => (
            <td className="border border-border px-2 py-1 align-top" {...props} />
          ),
          hr: ({ node: _node, ...props }) => <hr className="my-3 border-border" {...props} />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
