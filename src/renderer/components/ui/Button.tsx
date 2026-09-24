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
  default: "bg-accent text-accent-fg hover:bg-accent-hover shadow-sm",
  secondary: "bg-bg-elevated text-text border border-border hover:bg-bg-hover",
  outline: "border border-border text-text-muted hover:text-text hover:bg-bg-hover",
  ghost: "text-text-muted hover:text-text hover:bg-bg-hover",
  danger: "bg-danger/10 text-danger border border-danger/30 hover:bg-danger/20",
};

const sizeClasses: Record<Size, string> = {
  xs: "h-6 px-2 text-[11px] rounded-md",
  sm: "h-7 px-2.5 text-xs rounded-md",
  md: "h-9 px-3.5 text-sm rounded-lg",
  icon: "h-8 w-8 rounded-lg",
  "icon-sm": "h-6 w-6 rounded-md",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "md", loading, disabled, children, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap font-medium transition-colors duration-150",
        "disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {loading && <Loader2 size={13} className="animate-spin" />}
      {children}
    </button>
  )
);
Button.displayName = "Button";
