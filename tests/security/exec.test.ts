import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCapture, spawnDetached } from "../../src/main/security/exec";

const isWin = process.platform === "win32";

describe("exec (proteção contra shell injection)", () => {
  it("passa metacaracteres de shell como texto literal", async () => {
    const marker = path.join(os.tmpdir(), `pqw-injected-${process.pid}.txt`);
    fs.rmSync(marker, { force: true });
    const payload = isWin ? `x & echo hacked > "${marker}"` : `x; echo hacked > "${marker}"`;

    // node -e imprime o argv recebido: o payload tem que chegar intacto como UM argumento.
    const result = await runCapture(process.execPath, ["-e", "console.log(JSON.stringify(process.argv.slice(1)))", payload], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    });

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout.trim())).toEqual([payload]);
    expect(fs.existsSync(marker)).toBe(false);
  });

  it("recusa executáveis .cmd/.bat (que exigiriam shell)", async () => {
    await expect(spawnDetached("code.cmd", ["C:\\x"])).rejects.toThrow(/cmd/);
    await expect(runCapture("script.BAT", [])).rejects.toThrow(/cmd/);
  });

  it("respeita timeout", async () => {
    const result = await runCapture(process.execPath, ["-e", "setTimeout(()=>{}, 10000)"], {
      timeoutMs: 300,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    });
    expect(result.timedOut).toBe(true);
  });
});
