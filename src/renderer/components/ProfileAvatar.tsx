import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { initials } from "@/lib/format";
import { useSettingsStore } from "@/stores/useSettingsStore";

/**
 * Avatar do usuário: a foto de perfil, se houver, ou as iniciais do nome
 * num círculo com a cor de destaque. `children` fica por cima (ex.: status online).
 */
export function ProfileAvatar({ size = 28, className, children }: { size?: number; className?: string; children?: ReactNode }) {
  const avatar = useSettingsStore((s) => s.avatar);
  const name = useSettingsStore((s) => s.settings?.userName ?? "");
  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-full font-semibold text-accent ring-1 ring-accent/25",
        !avatar && "bg-gradient-to-br from-accent/30 to-accent/10",
        className
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      {avatar ? (
        <img src={avatar} alt="" draggable={false} className="h-full w-full rounded-full object-cover" />
      ) : (
        initials(name, "Q")
      )}
      {children}
    </span>
  );
}
