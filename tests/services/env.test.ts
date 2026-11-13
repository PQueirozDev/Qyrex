import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkEnv, parseDotenvKeys } from "../../src/main/services/envService";
import { createProject } from "../../src/main/services/projectService";
import { freshDb, removeDir, tempAllowedDir } from "../helpers";

let dir: string;
let app: string;
let projectId: string;

beforeEach(() => {
  freshDb();
  dir = tempAllowedDir("pqw-env-");
  app = path.join(dir, "app");
  fs.mkdirSync(app);
  projectId = createProject({ name: "App", localPath: app }).id;
});
afterEach(() => removeDir(dir));

describe(".env: leitura das chaves", () => {
  it("entende export, aspas, comentários e valores vazios", () => {
    const keys = parseDotenvKeys(
      ["# comentário", "export API_URL=https://x", 'NAME="Qyrex"', "EMPTY=", 'QUOTED_EMPTY=""', "PORT=3000 # porta", "COMMENT_ONLY= # nada", "inválida", "  SPACED = sim  "].join("\n")
    );
    expect([...keys.entries()]).toEqual([
      ["API_URL", true],
      ["NAME", true],
      ["EMPTY", false],
      ["QUOTED_EMPTY", false],
      ["PORT", true],
      ["COMMENT_ONLY", false],
      ["SPACED", true],
    ]);
  });
});

describe(".env x .env.example", () => {
  it("aponta o que falta, o que sobra e o que está vazio, sem devolver valores", () => {
    fs.writeFileSync(path.join(app, ".env.example"), "DB_URL=\nSECRET=\nPORT=3000\n");
    fs.writeFileSync(path.join(app, ".env"), "DB_URL=postgres://segredo\nPORT=\nDEBUG=1\n");
    fs.writeFileSync(path.join(app, ".env.local"), "PORT=4000\n");
    const check = checkEnv(projectId);
    expect(check).toEqual({
      exampleFile: ".env.example",
      envFiles: [".env", ".env.local"],
      expected: 3,
      defined: 3,
      missing: ["SECRET"],
      extra: ["DEBUG"],
      empty: [],
    });
    expect(JSON.stringify(check)).not.toContain("segredo");
  });

  it("projeto sem arquivos de ambiente", () => {
    expect(checkEnv(projectId)).toMatchObject({ exampleFile: null, envFiles: [], missing: [] });
  });
});
