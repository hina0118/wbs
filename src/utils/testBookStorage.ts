import { invoke } from "@tauri-apps/api/core";
import { TestBook } from "../types/testBook";

export async function loadTestBooks(): Promise<TestBook[]> {
  try {
    const saved = await invoke<string | null>("load_test_books");
    if (saved) {
      return JSON.parse(saved) as TestBook[];
    }
  } catch (e) {
    console.warn("テストブックの読み込みに失敗:", e);
  }
  return [];
}

export async function saveTestBooks(books: TestBook[]): Promise<void> {
  const json = JSON.stringify(books);
  await invoke("save_test_books", { json });
}
