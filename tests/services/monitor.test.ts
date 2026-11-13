import { describe, expect, it } from "vitest";
import { parseProcessRows, treeOf } from "../../src/main/services/monitorService";

describe("monitor: árvore de processos", () => {
  const raw = ["10,1,1000,50", "20,10,2000,100", "30,20,3000,0", "40,1,9999,1", "lixo", "50,50,10,10", ""].join("\r\n");
  const rows = parseProcessRows(raw);

  it("lê PID, pai, memória e tempo de CPU", () => {
    expect(rows).toHaveLength(5);
    expect(rows[1]).toEqual({ pid: 20, ppid: 10, memory: 2000, cpuTime: 100 });
  });

  it("pega o processo e todos os descendentes, sem os irmãos e sem laço", () => {
    expect(treeOf(10, rows).sort()).toEqual([10, 20, 30]);
    expect(treeOf(40, rows)).toEqual([40]);
    expect(treeOf(50, rows)).toEqual([50]); // pai de si mesmo não vira laço infinito
  });
});
