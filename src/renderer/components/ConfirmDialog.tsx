import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  danger?: boolean;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Toda ação que remove/move dados ou dispara algo irreversível passa por aqui
 * antes de chegar ao IPC — nada é "auto-confirmado", inclusive quando a ação
 * é sugerida por uma IA (ver spec de segurança, seção 22).
 */
export function ConfirmDialog({
  open,
  title,
  description,
  danger,
  confirmLabel = "Confirmar",
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onCancel} title={title} description={description} danger={danger}>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
        <Button variant={danger ? "danger" : "default"} size="sm" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
