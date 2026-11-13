import { describe, expect, it } from "vitest";
import {
  base64Decode,
  base64Encode,
  CASES,
  contrastRatio,
  decodeJwt,
  diffLines,
  formatJson,
  hashText,
  parseColor,
  parseTimestamp,
  slugify,
  sortJsonKeys,
  splitWords,
  toHex,
  toHsl,
  urlDecode,
  urlEncode,
} from "../../src/renderer/lib/devtools";

describe("ferramentas: JSON", () => {
  it("formata, minifica e aponta a linha do erro", () => {
    expect(formatJson('{"a":1,"b":[1,2]}')).toEqual({ ok: true, text: '{\n  "a": 1,\n  "b": [\n    1,\n    2\n  ]\n}' });
    expect(formatJson('{ "a": 1 }', "min")).toEqual({ ok: true, text: '{"a":1}' });
    const bad = formatJson('{\n  "a": 1,\n  "b": }');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.line).toBe(3);
  });

  it("ordena chaves recursivamente sem mexer na ordem dos arrays", () => {
    expect(JSON.stringify(sortJsonKeys({ b: 1, a: { d: 1, c: [{ z: 1, y: 2 }] } }))).toBe('{"a":{"c":[{"y":2,"z":1}],"d":1},"b":1}');
  });
});

describe("ferramentas: Base64, URL e JWT", () => {
  it("Base64 com acentos (UTF-8) e variante URL-safe", () => {
    expect(base64Encode("ação")).toBe("YcOnw6Nv");
    expect(base64Decode("YcOnw6Nv")).toBe("ação");
    expect(base64Encode("??>>", true)).toBe("Pz8-Pg");
    expect(base64Decode("Pz8-Pg")).toBe("??>>");
    expect(() => base64Decode("não é base64!")).toThrow();
  });

  it("URL", () => {
    expect(urlEncode("a b&c=ç")).toBe("a%20b%26c%3D%C3%A7");
    expect(urlDecode("a+b%26c")).toBe("a b&c");
  });

  it("JWT: decodifica e marca expirado (sem verificar assinatura)", () => {
    const enc = (o: object) => base64Encode(JSON.stringify(o), true);
    const token = `${enc({ alg: "HS256", typ: "JWT" })}.${enc({ sub: "1", exp: 1_000_000_000, iat: 999_999_000 })}.assinatura`;
    const jwt = decodeJwt(`Bearer ${token}`);
    expect(jwt.header.alg).toBe("HS256");
    expect(jwt.payload.sub).toBe("1");
    expect(jwt.expired).toBe(true);
    expect(jwt.times.map((t) => t.claim)).toEqual(["exp", "iat"]);
    expect(() => decodeJwt("abc")).toThrow();
  });
});

describe("ferramentas: tempo, texto e diff", () => {
  it("timestamp em segundos, milissegundos ou data ISO", () => {
    expect(parseTimestamp("1700000000")).toBe(1_700_000_000_000);
    expect(parseTimestamp("1700000000123")).toBe(1_700_000_000_123);
    expect(parseTimestamp("2024-01-01T00:00:00Z")).toBe(Date.UTC(2024, 0, 1));
    expect(parseTimestamp("ontem")).toBeNull();
  });

  it("converte nomes entre convenções e gera slug sem acento", () => {
    const words = splitWords("parseHTTPResponse_v2-final");
    expect(words).toEqual(["parse", "http", "response", "v2", "final"]);
    expect(CASES.camel(words)).toBe("parseHttpResponseV2Final");
    expect(CASES.constant(splitWords("nova função"))).toBe("NOVA_FUNÇÃO");
    expect(slugify("  Correção do Login!  ")).toBe("correcao-do-login");
  });

  it("diff por linhas", () => {
    const d = diffLines("a\nb\nc", "a\nc\nd");
    expect(d.map((l) => `${l.kind}:${l.text}`)).toEqual(["same:a", "del:b", "same:c", "add:d"]);
    expect(() => diffLines("x\n".repeat(3000), "y")).toThrow();
  });
});

describe("ferramentas: cores e hash", () => {
  it("lê HEX, RGB e HSL e converte de volta", () => {
    expect(parseColor("#ff9a3c")).toEqual({ r: 255, g: 154, b: 60, a: 1 });
    expect(parseColor("#fff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor("rgb(255 154 60 / 0.5)")).toEqual({ r: 255, g: 154, b: 60, a: 0.5 });
    expect(toHex(parseColor("hsl(0, 100%, 50%)")!)).toBe("#ff0000");
    expect(toHsl({ r: 255, g: 0, b: 0, a: 1 })).toBe("hsl(0 100% 50%)");
    expect(parseColor("rgb(300, 0, 0)")).toBeNull();
    expect(parseColor("azul")).toBeNull();
  });

  it("contraste WCAG", () => {
    expect(contrastRatio({ r: 0, g: 0, b: 0, a: 1 }, { r: 255, g: 255, b: 255, a: 1 })).toBeCloseTo(21, 0);
  });

  it("SHA-256", async () => {
    expect(await hashText("abc", "SHA-256")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
