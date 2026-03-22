import { describe, it, expect, vi, beforeEach } from "vitest";

// @tauri-apps/api/core の invoke をモック
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

// ExcelJS をスタブで差し替え (new Workbook() が使えるようクラスで定義)
vi.mock("exceljs", () => {
  const makeCell = () => ({
    value: null as unknown,
    font: {},
    fill: {},
    alignment: {},
    border: {},
  });
  const makeRow = () => ({ height: 0, getCell: makeCell });
  const makeWs = () => ({
    views: [] as unknown[],
    getRow: makeRow,
    getColumn: () => ({ width: 0 }),
    mergeCells: vi.fn(),
  });
  class MockWorkbook {
    xlsx = { writeBuffer: async () => new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]) };
    addWorksheet() {
      return makeWs();
    }
  }
  return { default: { Workbook: MockWorkbook } };
});

import { invoke } from "@tauri-apps/api/core";
import { exportToExcel } from "../utils/exportToExcel";
import type { Task } from "../types/task";

const mockInvoke = vi.mocked(invoke);

function makeTask(id: string, start: string, end: string, progress = 0, parentId?: string): Task {
  return { id, name: id, startDate: new Date(start), endDate: new Date(end), progress, parentId };
}

beforeEach(() => vi.clearAllMocks());

// ─── exportToExcel ───────────────────────────────────────────────
describe("exportToExcel", () => {
  it("タスクが空の場合は invoke を呼ばずに null を返す", async () => {
    const result = await exportToExcel([]);
    expect(result).toBeNull();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("save_excel_file コマンドで invoke が呼ばれる", async () => {
    mockInvoke.mockResolvedValueOnce("/Desktop/out.xlsx");
    await exportToExcel([makeTask("t1", "2026-01-01", "2026-03-31", 50)]);
    const [cmd] = mockInvoke.mock.calls[0] as [string, unknown];
    expect(cmd).toBe("save_excel_file");
  });

  it("filename が WBS_ガントチャート_YYYYMMDD.xlsx 形式になる", async () => {
    mockInvoke.mockResolvedValueOnce("path");
    await exportToExcel([makeTask("t1", "2026-01-01", "2026-03-31")]);
    const [, args] = mockInvoke.mock.calls[0] as [string, { filename: string }];
    expect(args.filename).toMatch(/^WBS_ガントチャート_\d{8}\.xlsx$/);
  });

  it("カスタムファイル名を指定した場合はそのまま使われる", async () => {
    mockInvoke.mockResolvedValueOnce("path");
    await exportToExcel([makeTask("t1", "2026-01-01", "2026-03-31")], "custom.xlsx");
    const [, args] = mockInvoke.mock.calls[0] as [string, { filename: string }];
    expect(args.filename).toBe("custom.xlsx");
  });

  it("data は数値の配列として渡される", async () => {
    mockInvoke.mockResolvedValueOnce("path");
    await exportToExcel([makeTask("t1", "2026-01-01", "2026-03-31")]);
    const [, args] = mockInvoke.mock.calls[0] as [string, { data: unknown[] }];
    expect(Array.isArray(args.data)).toBe(true);
    expect(typeof args.data[0]).toBe("number");
  });

  it("invoke が null を返した場合（キャンセル）は null を返す", async () => {
    mockInvoke.mockResolvedValueOnce(null);
    const result = await exportToExcel([makeTask("t1", "2026-01-01", "2026-03-31")]);
    expect(result).toBeNull();
  });

  it("invoke が返したパスをそのまま返す", async () => {
    const savedPath = "C:\\Users\\user\\Desktop\\WBS.xlsx";
    mockInvoke.mockResolvedValueOnce(savedPath);
    const result = await exportToExcel([makeTask("t1", "2026-01-01", "2026-03-31")]);
    expect(result).toBe(savedPath);
  });

  it("invoke が失敗した場合は例外を投げる", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("disk full"));
    await expect(exportToExcel([makeTask("t1", "2026-01-01", "2026-03-31")])).rejects.toThrow(
      "disk full",
    );
  });

  it("複数タスクがあっても invoke は 1 回だけ呼ばれる", async () => {
    mockInvoke.mockResolvedValueOnce("path");
    const tasks = [
      makeTask("p1", "2026-01-01", "2026-03-31"),
      makeTask("c1", "2026-01-01", "2026-02-28", 0, "p1"),
      makeTask("c2", "2026-03-01", "2026-03-31", 50, "p1"),
    ];
    await exportToExcel(tasks);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });
});
