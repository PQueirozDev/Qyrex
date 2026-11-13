import { describe, expect, it } from "vitest";
import { isLocalPreviewUrl } from "../../src/main/services/previewService";

describe("preview: só endereços locais", () => {
  it("aceita localhost, 127.0.0.1, [::1] e *.localhost em http(s)", () => {
    for (const url of ["http://localhost:5173/", "https://localhost:3000/app?x=1", "http://127.0.0.1:8080", "http://[::1]:4321/", "http://app.localhost:3000"]) {
      expect(isLocalPreviewUrl(url), url).toBe(true);
    }
  });

  it("recusa endereço externo, outros protocolos, credenciais na URL e truques de host", () => {
    for (const url of [
      "https://example.com",
      "http://192.168.0.10:3000",
      "file:///C:/Windows/win.ini",
      "javascript:alert(1)",
      "http://localhost.evil.com",
      "http://localhost@evil.com",
      "http://user:senha@localhost:3000",
      "ws://localhost:5173",
      "não é url",
    ]) {
      expect(isLocalPreviewUrl(url), url).toBe(false);
    }
  });
});
