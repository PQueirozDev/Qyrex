import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getNote, saveNote } from "../../src/main/services/notesService";
import { createProject, deleteProject } from "../../src/main/services/projectService";
import { getDb } from "../../src/main/database/db";
import { freshDb, removeDir, tempAllowedDir } from "../helpers";

let dir: string;
let projectId: string;
beforeEach(() => {
  freshDb();
  dir = tempAllowedDir("pqw-notes-");
  fs.mkdirSync(path.join(dir, "app"));
  projectId = createProject({ name: "App", localPath: path.join(dir, "app") }).id;
});
afterEach(() => removeDir(dir));

describe("notas do projeto", () => {
  it("começa vazia, salva, atualiza e some junto com o projeto", () => {
    expect(getNote(projectId)).toMatchObject({ content: "", updatedAt: null });
    saveNote(projectId, "## Ideias");
    expect(saveNote(projectId, "## Ideias\n- cache").content).toBe("## Ideias\n- cache");
    expect(getNote(projectId).updatedAt).not.toBeNull();
    deleteProject(projectId);
    expect((getDb().prepare("SELECT COUNT(*) AS n FROM project_notes").get() as { n: number }).n).toBe(0);
  });

  it("recusa projeto inexistente e nota grande demais", () => {
    expect(() => saveNote("nao-existe", "x")).toThrow();
    expect(() => saveNote(projectId, "x".repeat(200_001))).toThrow();
  });
});
