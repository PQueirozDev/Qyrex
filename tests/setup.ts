import { vi } from "vitest";
import os from "node:os";
import path from "node:path";

// Substitui o módulo "electron" por um dublê: os testes exercitam a lógica do
// main process sem abrir janelas nem usar o cofre real do sistema.
vi.mock("electron", () => {
  const userData = path.join(os.tmpdir(), `pqw-test-${process.pid}`);
  return {
    app: {
      getPath: () => userData,
      getVersion: () => "0.0.0-test",
      isPackaged: false,
      getApplicationNameForProtocol: () => "",
      setLoginItemSettings: () => undefined,
    },
    safeStorage: {
      isEncryptionAvailable: () => true,
      encryptString: (s: string) => Buffer.from(`enc:${s}`),
      decryptString: (b: Buffer) => b.toString().replace(/^enc:/, ""),
    },
    shell: {
      openExternal: vi.fn(async () => undefined),
      openPath: vi.fn(async () => ""),
      showItemInFolder: vi.fn(),
    },
    dialog: { showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })) },
    ipcMain: { handle: vi.fn() },
    BrowserWindow: { fromWebContents: () => null },
    Notification: class {
      static isSupported() {
        return false;
      }
      on() {}
      show() {}
    },
  };
});
