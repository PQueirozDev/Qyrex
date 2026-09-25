import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

type Variant = "default" | "secondary" | "ghost" | "danger" | "outline";
type Size = "xs" | "sm" | "md" | "icon" | "icon-sm";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variantClasses: Record<Variant, string> = {
  default: "shine bg-accent text-accent-fg hover:bg-accent-hover shadow-sm hover:shadow-[0_6px_20px_-6px_rgb(var(--accent)/0.6)]",
  secondary: "bg-bg-elevated text-text border border-border hover:bg-bg-hover hover:border-text-faint/40",
  outline: "border border-border text-text-muted hover:text-text hover:bg-bg-hover",
  ghost: "text-text-muted hover:text-text hover:bg-bg-hover",
  danger: "bg-danger/10 text-danger border border-danger/30 hover:bg-danger/20",
};

// Pílulas, como na referência de UI: cantos totalmente arredondados.
const sizeClasses: Record<Size, string> = {
  xs: "h-6 px-2.5 text-[11px] rounded-full",
  sm: "h-7 px-3 text-xs rounded-full",
  md: "h-9 px-4 text-sm rounded-full",
  icon: "h-8 w-8 rounded-full",
  "icon-sm": "h-6 w-6 rounded-full",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "md", loading, disabled, children, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "press relative inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap font-medium",
        "disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {/* Carregando: o conteúdo some com blur e o spinner entra no lugar, sem mudar a largura. */}
      <span className={cn("inline-flex items-center gap-1.5 transition-all duration-200", loading && "scale-90 opacity-0 blur-[2px]")}>{children}</span>
      {loading && (
        <span className="absolute inset-0 flex animate-pop-in items-center justify-center">
          <Loader2 size={14} className="animate-spin" />
        </span>
      )}
    </button>
  )
);
Button.displayName = "Button";
