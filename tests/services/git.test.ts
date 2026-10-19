import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as git from "../../src/main/services/gitService";
import { freshDb, removeDir, tempAllowedDir } from "../helpers";

let dir: string;

function sh(...args: string[]): string {
  return execFileSync("git", args, { cwd: dir, encoding: "utf-8", env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
}

function write(file: string, content: string): void {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  fs.writeFileSync(path.join(dir, file), content);
}

beforeEach(() => {
  freshDb();
  dir = tempAllowedDir("pqw-git-");
  sh("init", "-q", "-b", "main");
  sh("config", "user.name", "Teste");
  sh("config", "user.email", "teste@example.com");
  sh("config", "commit.gpgsign", "false");
  write("README.md", "linha 1\n");
  sh("add", ".");
  sh("commit", "-q", "-m", "inicial");
});

/** Os objetos do git são somente-leitura no Windows: libera a escrita antes de apagar. */
function removeRepo(root: string): void {
  for (const entry of fs.readdirSync(root, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) fs.chmodSync(path.join(entry.parentPath, entry.name), 0o666);
  }
  removeDir(root);
}

afterEach(() => removeRepo(dir));

describe("parse do git status", () => {
  it("lê caminhos crus com -z, renomeações e conflitos", () => {
    const raw = ["## main...origin/main [ahead 2, behind 1]", "?? meu arquivo.txt", " M ação.ts", "R  novo.ts", "velho.ts", "UU conflito.ts", ""].join("\0");
    const { header, files } = git.parsePorcelainZ(raw);
    expect(git.parseBranchHeader(header)).toEqual({ branch: "main", upstream: "origin/main", ahead: 2, behind: 1 });
    expect(files.map((f) => f.path)).toEqual(["meu arquivo.txt", "ação.ts", "novo.ts", "conflito.ts"]);
    expect(files[0].untracked).toBe(true);
    expect(files[2]).toMatchObject({ status: "R", oldPath: "velho.ts", staged: true });
    expect(files[3].conflict).toBe(true);
  });

  it("branch sem upstream e repositório sem commits", () => {
    expect(git.parseBranchHeader("## feat/x")).toEqual({ branch: "feat/x", upstream: null, ahead: 0, behind: 0 });
    expect(git.parseBranchHeader("## No commits yet on main").branch).toBe("main");
    expect(git.parseBranchHeader("## HEAD (no branch)").branch).toBeNull();
  });
});

describe("git em um repositório real", () => {
  it("status e lista de alterações com espaço e acento no nome", async () => {
    write("meu arquivo.txt", "oi\n");
    write("ação.ts", "export {};\n");
    const status = await git.getGitStatus(dir);
    expect(status).toMatchObject({ branch: "main", isRepo: true, modifiedCount: 2, upstream: null, conflicts: 0, operation: null });
    const files = (await git.getChangedFiles(dir)).map((f) => f.path).sort();
    expect(files).toEqual(["ação.ts", "meu arquivo.txt"]);
  });

  it("diff de arquivo modificado e de arquivo novo", async () => {
    write("README.md", "linha 1\nlinha 2\n");
    write("novo arquivo.ts", "a\nb\n");
    const modified = await git.getFileDiff(dir, "README.md");
    expect(modified.untracked).toBe(false);
    expect(modified.diff).toContain("+linha 2");
    const created = await git.getFileDiff(dir, "novo arquivo.ts");
    expect(created).toMatchObject({ untracked: true, binary: false });
    expect(created.diff.split("\n")).toEqual(["@@ -0,0 +1,2 @@", "+a", "+b"]);
  });

  it("diff recusa caminhos fora do repositório e trata binários", async () => {
    await expect(git.getFileDiff(dir, "../fora.txt")).rejects.toThrow(/inválido/);
    await expect(git.getFileDiff(dir, path.join(dir, "README.md"))).rejects.toThrow(/inválido/);
    fs.writeFileSync(path.join(dir, "img.bin"), Buffer.from([0, 1, 2, 0, 3]));
    expect((await git.getFileDiff(dir, "img.bin")).binary).toBe(true);
  });

  it("commit só dos arquivos escolhidos deixa o resto intacto", async () => {
    write("a.txt", "a\n");
    write("b.txt", "b\n");
    write("README.md", "mudou\n");
    await git.commit(dir, "só o a", false, ["a.txt"]);
    const left = (await git.getChangedFiles(dir)).map((f) => f.path).sort();
    expect(left).toEqual(["README.md", "b.txt"]);
    expect(sh("log", "-1", "--name-only", "--pretty=format:%s").trim().split("\n")).toEqual(["só o a", "a.txt"]);
    await expect(git.commit(dir, "x", false, ["../fora"])).rejects.toThrow(/inválido/);
  });

  it("commit dos arquivos marcados funciona com renomeação já no stage", async () => {
    sh("mv", "README.md", "LEIAME.md");
    const renamed = (await git.getChangedFiles(dir)).find((f) => f.status === "R");
    expect(renamed).toMatchObject({ path: "LEIAME.md", oldPath: "README.md" });
    await git.commit(dir, "renomeia", false, ["LEIAME.md", "README.md"]);
    expect(await git.getChangedFiles(dir)).toEqual([]);
  });

  it("caminhos são literais: curinga não seleciona outros arquivos", async () => {
    write("a1.txt", "1\n");
    write("a2.txt", "2\n");
    await expect(git.commit(dir, "curinga", false, ["a*.txt"])).rejects.toThrow();
    expect((await git.getChangedFiles(dir)).map((f) => f.path).sort()).toEqual(["a1.txt", "a2.txt"]);
  });

  it("cria, lista e troca de branch; recusa trocar com alterações locais", async () => {
    await git.createBranch(dir, "feat/nova", false);
    expect((await git.listBranches(dir)).map((b) => b.name).sort()).toEqual(["feat/nova", "main"]);
    await expect(git.createBranch(dir, "feat/nova", false)).rejects.toThrow(/Já existe/);
    await expect(git.createBranch(dir, "nome inválido", false)).rejects.toThrow(/inválido/);
    await expect(git.createBranch(dir, "--force", false)).rejects.toThrow(/inválido/);

    write("README.md", "trabalho não commitado\n");
    await expect(git.switchBranch(dir, "feat/nova")).rejects.toThrow(/alterações não commitadas/);
    // O arquivo continua exatamente como estava.
    expect(fs.readFileSync(path.join(dir, "README.md"), "utf-8")).toBe("trabalho não commitado\n");

    sh("checkout", "-q", "--", "README.md");
    await git.switchBranch(dir, "feat/nova");
    expect((await git.getGitStatus(dir)).branch).toBe("feat/nova");
    expect((await git.listBranches(dir)).find((b) => b.current)?.name).toBe("feat/nova");
    await expect(git.switchBranch(dir, "nao-existe")).rejects.toThrow(/não encontrada/);
  });

  it("criar branch com checkout leva as alterações junto, sem perder nada", async () => {
    write("README.md", "em andamento\n");
    await git.createBranch(dir, "wip", true);
    expect((await git.getGitStatus(dir)).branch).toBe("wip");
    expect(fs.readFileSync(path.join(dir, "README.md"), "utf-8")).toBe("em andamento\n");
  });

  it("detecta conflito de merge e merge em andamento", async () => {
    sh("checkout", "-q", "-b", "outra");
    write("README.md", "versão da outra\n");
    sh("commit", "-q", "-am", "outra");
    sh("checkout", "-q", "main");
    write("README.md", "versão da main\n");
    sh("commit", "-q", "-am", "main");
    try {
      sh("merge", "outra");
    } catch {
      // conflito esperado
    }
    const status = await git.getGitStatus(dir);
    expect(status.conflicts).toBe(1);
    expect(status.operation).toBe("merge");
    expect((await git.getChangedFiles(dir)).find((f) => f.path === "README.md")?.conflict).toBe(true);
  });
});
