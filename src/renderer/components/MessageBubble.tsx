import { useState, type ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Copy, Check, Paperclip, User, Bot } from "lucide-react";
import { cn } from "@/lib/cn";
import type { AIMessageRole, AttachedFileRef } from "@shared/types";

interface MessageBubbleProps {
  role: AIMessageRole;
  content: string;
  attachedFiles?: AttachedFileRef[];
}

function CodeBlock({ children, className }: ComponentProps<"code">) {
  const [copied, setCopied] = useState(false);
  const text = String(children).replace(/\n$/, "");
  const isBlock = className?.includes("language-") || text.includes("\n");

  if (!isBlock) {
    return <code className="rounded bg-bg-elevated px-1 py-0.5 text-[13px]">{children}</code>;
  }

  return (
    <div className="group relative">
      <button
        onClick={() => {
          void navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="absolute right-2 top-2 rounded-md border border-border bg-bg-elevated p-1 text-text-faint opacity-0 transition-opacity hover:text-text group-hover:opacity-100"
        aria-label="Copiar código"
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
      <pre className={cn("overflow-x-auto rounded-lg border border-border-subtle bg-bg-elevated p-3 text-[13px]", className)}>
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}

export function MessageBubble({ role, content, attachedFiles = [] }: MessageBubbleProps) {
  const isUser = role === "user";

  return (
    <div className={cn("flex gap-2.5", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
          isUser ? "bg-accent-muted text-accent" : "bg-bg-card text-text-muted"
        )}
      >
        {isUser ? <User size={13} /> : <Bot size={13} />}
      </div>

      <div className={cn("max-w-[75%] space-y-1.5", isUser && "items-end")}>
        {attachedFiles.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {attachedFiles.map((f) => (
              <span
                key={f.path}
                className="inline-flex items-center gap-1 rounded-md border border-border-subtle bg-bg-card px-1.5 py-0.5 text-[11px] text-text-faint"
              >
                <Paperclip size={10} /> {f.name}
              </span>
            ))}
          </div>
        )}

        <div
          className={cn(
            "rounded-card px-3.5 py-2.5 text-sm leading-relaxed",
            isUser ? "bg-accent-muted text-text" : "bg-bg-card text-text",
            "prose prose-invert prose-sm max-w-none prose-p:my-1.5 prose-pre:p-0 prose-pre:bg-transparent"
          )}
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
            components={{ code: CodeBlock }}
          >
            {content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
