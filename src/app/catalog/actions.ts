"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { requireStaff } from "@/lib/auth/current";
import { priceBookChunks, priceBooks } from "@/db/schema";
import { bookInfo, parsePriceBook } from "@/lib/catalog/priceBook";

const CHUNK = 2 * 1024 * 1024;

export async function uploadBooks(form: FormData): Promise<void> {
  const me = await requireStaff("pricebook.manage");
  const db = await getDb();
  const added: string[] = [];
  const skipped: string[] = [];
  for (const entry of form.getAll("files")) {
    if (!(entry instanceof File) || !entry.size) continue;
    try {
      if (!/\.pdf$/i.test(entry.name)) throw new Error("only PDF price books can be added");
      const bytes = new Uint8Array(await entry.arrayBuffer());
      const model = await parsePriceBook(bytes);
      const info = bookInfo(entry.name);
      // A newer copy of a book replaces the old one.
      await db.update(priceBooks).set({ archived: true }).where(and(eq(priceBooks.name, info.name), eq(priceBooks.archived, false)));
      const [book] = await db.insert(priceBooks).values({ ...info, fileName: entry.name, uploadedByUserId: me?.user.id ?? null, size: bytes.length, model }).returning({ id: priceBooks.id });
      for (let seq = 0, at = 0; at < bytes.length; seq++, at += CHUNK) await db.insert(priceBookChunks).values({ bookId: book.id, seq, data: bytes.slice(at, at + CHUNK) });
      added.push(`${info.name} (${model.pages.length} pages, ${model.items.length} priced lines)`);
    } catch (err) {
      skipped.push(`${entry.name}: ${err instanceof Error ? err.message : err}`);
    }
  }
  revalidatePath("/catalog");
  const q = new URLSearchParams();
  if (added.length) q.set("added", added.join(", "));
  if (skipped.length) q.set("skipped", skipped.join(" | "));
  redirect(`/catalog?${q}`);
}

export async function retireBook(form: FormData): Promise<void> {
  await requireStaff("pricebook.manage");
  const db = await getDb();
  await db.update(priceBooks).set({ archived: true }).where(eq(priceBooks.id, Number(form.get("id"))));
  revalidatePath("/catalog");
  redirect("/catalog");
}
