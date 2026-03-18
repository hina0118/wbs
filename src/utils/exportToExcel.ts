import ExcelJS from "exceljs";
import { invoke } from "@tauri-apps/api/core";
import { Task } from "../types/task";
import { computeProgress, getSignalStatus, sortByTree, toInputDate } from "./taskUtils";

// ── ユーティリティ ────────────────────────────────────────

function getDepth(taskId: string, tasks: Task[]): number {
  const task = tasks.find((t) => t.id === taskId);
  if (!task?.parentId) return 0;
  return 1 + getDepth(task.parentId, tasks);
}

/** 色を白方向に薄める。factor: 0=元色, 1=白 */
function lightenHex(hex: string, factor: number): string {
  const h = hex.replace("#", "").padEnd(6, "0");
  const blend = (ch: string) =>
    Math.round(parseInt(ch, 16) + (255 - parseInt(ch, 16)) * factor)
      .toString(16).padStart(2, "0");
  return ("FF" + blend(h.slice(0, 2)) + blend(h.slice(2, 4)) + blend(h.slice(4, 6))).toUpperCase();
}

function solidFill(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } } as ExcelJS.Fill;
}

const THIN_BORDER: ExcelJS.Border = { style: "thin", color: { argb: "FFD0D7DE" } };

// ── エクスポート本体 ──────────────────────────────────────

/** タスク一覧をガントチャート風 Excel として保存し、保存先パスを返す。キャンセル時は null */
export async function exportToExcel(tasks: Task[], filename?: string): Promise<string | null> {
  const sorted = sortByTree(tasks);
  if (sorted.length === 0) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dateStr = toInputDate(today).replace(/-/g, "");
  const outputFilename = filename ?? `WBS_ガントチャート_${dateStr}.xlsx`;

  // ── 日付範囲 ──────────────────────────────────────────
  const times = sorted.flatMap((t) => [t.startDate.getTime(), t.endDate.getTime()]);
  const rangeStart = new Date(Math.min(...times));
  const rangeEnd   = new Date(Math.max(...times));
  rangeStart.setHours(0, 0, 0, 0);
  rangeEnd.setHours(0, 0, 0, 0);

  const days: Date[] = [];
  for (const d = new Date(rangeStart); d <= rangeEnd; d.setDate(d.getDate() + 1)) {
    days.push(new Date(d));
  }

  // ── ワークブック ──────────────────────────────────────
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("WBSガントチャート");

  const INFO = 6; // タスク名, 担当者, 開始日, 終了日, 進捗率, ステータス

  // 列幅
  ws.getColumn(1).width = 36;
  ws.getColumn(2).width = 12;
  ws.getColumn(3).width = 11;
  ws.getColumn(4).width = 11;
  ws.getColumn(5).width = 9;
  ws.getColumn(6).width = 11;
  for (let i = 0; i < days.length; i++) ws.getColumn(INFO + 1 + i).width = 2.5;

  // ペイン固定 (情報列 + ヘッダー2行)
  ws.views = [{ state: "frozen", xSplit: INFO, ySplit: 2 }];

  // ── 色定数 ────────────────────────────────────────────
  const HDR1_BG  = "FF1E3A5F";
  const HDR2_BG  = "FF2C4F7A";
  const HDR_FG   = "FFFFFFFF";
  const WE_HDR   = "FF3D566E";  // 週末ヘッダー
  const WE_CELL  = "FFF0F0F0";  // 週末セル
  const TODAY_H  = "FF3B82F6";  // 今日ヘッダー
  const TODAY_C  = "FFFFF3CD";  // 今日セル

  // ── ヘッダー行1: 情報列ラベル + 月ラベル ─────────────
  const row1 = ws.getRow(1);
  row1.height = 22;

  const infoLabels = ["タスク名", "担当者", "開始日", "終了日", "進捗率(%)", "ステータス"];
  infoLabels.forEach((label, i) => {
    const c = row1.getCell(i + 1);
    c.value = label;
    c.font      = { bold: true, size: 10, color: { argb: HDR_FG } };
    c.fill      = solidFill(HDR1_BG);
    c.alignment = { horizontal: "center", vertical: "middle" };
    c.border    = { bottom: THIN_BORDER, right: THIN_BORDER };
  });

  // 月ラベル (同月は結合)
  let mi = 0;
  while (mi < days.length) {
    const mo = days[mi].getMonth(), yr = days[mi].getFullYear();
    let mj = mi;
    while (mj < days.length && days[mj].getMonth() === mo && days[mj].getFullYear() === yr) mj++;
    const sc = INFO + 1 + mi, ec = INFO + mj;
    if (ec > sc) ws.mergeCells(1, sc, 1, ec);
    const mc = row1.getCell(sc);
    mc.value = `${yr}年${mo + 1}月`;
    mc.font      = { bold: true, size: 9, color: { argb: HDR_FG } };
    mc.fill      = solidFill(HDR1_BG);
    mc.alignment = { horizontal: "center", vertical: "middle" };
    mc.border    = { bottom: THIN_BORDER, right: THIN_BORDER };
    mi = mj;
  }

  // ── ヘッダー行2: 日番号 ──────────────────────────────
  const row2 = ws.getRow(2);
  row2.height = 14;

  for (let i = 1; i <= INFO; i++) {
    const c = row2.getCell(i);
    c.fill   = solidFill(HDR1_BG);
    c.border = { bottom: THIN_BORDER };
  }

  days.forEach((d, i) => {
    const c = row2.getCell(INFO + 1 + i);
    const isToday = d.getTime() === today.getTime();
    const isSat   = d.getDay() === 6;
    const isSun   = d.getDay() === 0;
    c.value = d.getDate();
    c.font  = {
      size: 7, bold: isToday,
      color: { argb: isToday ? "FFFF4444" : isSun ? "FFFF9999" : isSat ? "FF99BBDD" : HDR_FG },
    };
    c.fill      = solidFill(isToday ? TODAY_H : (isSat || isSun) ? WE_HDR : HDR2_BG);
    c.alignment = { horizontal: "center", vertical: "middle" };
    c.border    = { bottom: THIN_BORDER };
  });

  // ── タスク行 ──────────────────────────────────────────
  sorted.forEach((task, ri) => {
    const depth    = getDepth(task.id, tasks);
    const isParent = tasks.some((t) => t.parentId === task.id);
    const progress = computeProgress(task.id, tasks);
    const signal   = getSignalStatus(task.id, tasks);
    const colorHex = (task.color ?? "#4A90D9").replace("#", "");
    const colorArgb = ("FF" + colorHex).toUpperCase();

    const statusLabel =
      progress === 100       ? "完了" :
      signal === "red"       ? "遅延" :
      signal === "yellow"    ? "着手遅れ" : "正常";

    const rowBg =
      depth === 0 ? "FFEBF2FA" :
      depth === 1 ? "FFF5F8FB" : "FFFFFFFF";

    const exRow = ws.getRow(3 + ri);
    exRow.height = isParent ? 20 : 18;

    // タスク名
    const nc = exRow.getCell(1);
    nc.value     = task.name;
    nc.font      = { bold: isParent, size: isParent ? 10 : 9, color: { argb: "FF1A2B3C" } };
    nc.fill      = solidFill(rowBg);
    nc.alignment = { vertical: "middle", indent: depth * 2, wrapText: false };
    nc.border    = { left: { style: "medium", color: { argb: colorArgb } }, bottom: THIN_BORDER };

    // 担当者
    const ac = exRow.getCell(2);
    ac.value     = task.assignee ?? "";
    ac.font      = { size: 9 };
    ac.fill      = solidFill(rowBg);
    ac.alignment = { horizontal: "center", vertical: "middle" };
    ac.border    = { bottom: THIN_BORDER };

    // 開始日 / 終了日
    [[3, toInputDate(task.startDate)], [4, toInputDate(task.endDate)]].forEach(([col, val]) => {
      const c = exRow.getCell(col as number);
      c.value     = val as string;
      c.font      = { size: 9 };
      c.fill      = solidFill(rowBg);
      c.alignment = { horizontal: "center", vertical: "middle" };
      c.border    = { bottom: THIN_BORDER };
    });

    // 進捗率 (タスク色の薄いトーンで背景)
    const pc = exRow.getCell(5);
    pc.value     = `${progress}%`;
    pc.font      = { bold: true, size: 9, color: { argb: colorArgb } };
    pc.fill      = solidFill(lightenHex("#" + colorHex, 0.82));
    pc.alignment = { horizontal: "center", vertical: "middle" };
    pc.border    = { bottom: THIN_BORDER };

    // ステータス
    const sc2 = exRow.getCell(6);
    sc2.value = statusLabel;
    const [stFg, stBg] =
      progress === 100    ? ["FF2E7D32", "FFE8F5E9"] :
      signal === "red"    ? ["FFC62828", "FFFFEBEE"] :
      signal === "yellow" ? ["FFE65100", "FFFFF3E0"] :
                            ["FF1565C0", "FFE3F2FD"];
    sc2.font      = { size: 9, color: { argb: stFg } };
    sc2.fill      = solidFill(stBg);
    sc2.alignment = { horizontal: "center", vertical: "middle" };
    sc2.border    = { bottom: THIN_BORDER, right: { style: "medium", color: { argb: "FFB0BEC5" } } };

    // ── ガントバー ─────────────────────────────────────
    const tStart  = task.startDate.getTime();
    const tEnd    = task.endDate.getTime();
    const doneMs  = (tEnd - tStart) * (progress / 100);
    const barDone = colorArgb;                           // 完了部分 = タスク色
    const barTodo = lightenHex("#" + colorHex, 0.55);   // 未完了 = 薄い色

    days.forEach((d, i) => {
      const dayMs    = d.getTime();
      const c        = exRow.getCell(INFO + 1 + i);
      const isToday  = dayMs === today.getTime();
      const isWE     = d.getDay() === 0 || d.getDay() === 6;

      if (dayMs >= tStart && dayMs <= tEnd) {
        const elapsed = dayMs - tStart;
        c.fill = solidFill(elapsed < doneMs ? barDone : barTodo);
      } else {
        c.fill = solidFill(isToday ? TODAY_C : isWE ? WE_CELL : "FFFFFFFF");
      }

      c.border = {
        bottom: THIN_BORDER,
        ...(isToday ? {
          left:  { style: "thin", color: { argb: TODAY_H } },
          right: { style: "thin", color: { argb: TODAY_H } },
        } : {}),
      };
    });
  });

  // ── ファイル生成 & 保存 ───────────────────────────────
  const buffer = await wb.xlsx.writeBuffer();
  const bytes  = Array.from(new Uint8Array(buffer as ArrayBuffer));

  return invoke<string | null>("save_excel_file", { filename: outputFilename, data: bytes });
}
