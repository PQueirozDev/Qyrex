import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useSettingsStore } from "@/stores/useSettingsStore";
import logoUrl from "@/assets/logo.svg";

/**
 * Avatar do usuário: a foto de perfil escolhida ou, por padrão, o ícone do
 * Qyrex (a capivara). `children` fica por cima (ex.: status online).
 */
export function ProfileAvatar({ size = 28, className, children }: { size?: number; className?: string; children?: ReactNode }) {
  const avatar = useSettingsStore((s) => s.avatar);
  return (
    <span
      className={cn("relative flex shrink-0 items-center justify-center rounded-full ring-1 ring-accent/25", className)}
      style={{ width: size, height: size }}
      data-avatar={avatar ? "custom" : "default"}
    >
      <img
        src={avatar ?? logoUrl}
        alt=""
        draggable={false}
        className={cn("h-full w-full rounded-full object-cover", !avatar && "[image-rendering:pixelated]")}
      />
      {children}
    </span>
  );
}
