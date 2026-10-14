import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { priceBooks } from "@/db/schema";
import type { PriceBookModel } from "@/lib/catalog/priceBook";
import ItemRows from "../ItemRows";
import PageView from "./PageViewLazy";

export const dynamic = "force-dynamic";

export default async function BookPage({ params, searchParams }: { params: Promise<{ bookId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const id = Number((await params).bookId);
  const db = await getDb();
  const [b] = await db
    .select({ id: priceBooks.id, name: priceBooks.name, revision: priceBooks.revision, model: priceBooks.model })
    .from(priceBooks)
    .where(eq(priceBooks.id, id));
  if (!b) notFound();
  const model = b.model as PriceBookModel;
  const n = Math.min(Math.max(1, Number((await searchParams).page) || 1), model.pages.length || 1);
  const items = model.items.filter((i) => i.page === n);

  return (
    <>
      <header className="top">
        <div>
          <div className="label">
            <Link href="/catalog">Price book</Link> · {b.revision}
          </div>
          <h1>{b.name}</h1>
        </div>
        <form className="controls" action="/catalog">
          <input type="search" name="q" placeholder="Search all books" aria-label="Search all books" />
        </form>
      </header>

      <nav className="tabs pagetabs" aria-label="Pages">
        {model.pages.map((p) => (
          <Link key={p.n} className={`tab${p.n === n ? " on" : ""}`} href={`/catalog/${b.id}?page=${p.n}`} title={p.title}>
            {p.n}
            <span className="n">{p.title.slice(0, 28)}</span>
          </Link>
        ))}
      </nav>

      <div className="bookview">
        <div className="panel">
          <div className="actions">
            {n > 1 && (
              <Link className="btn" href={`/catalog/${b.id}?page=${n - 1}`}>
                ← Page {n - 1}
              </Link>
            )}
            <strong>
              Page {n} of {model.pages.length}
            </strong>
            {n < model.pages.length && (
              <Link className="btn" href={`/catalog/${b.id}?page=${n + 1}`}>
                Page {n + 1} →
              </Link>
            )}
          </div>
          <PageView url={`/catalog/${b.id}/file`} page={n} />
        </div>
        <div className="panel">
          <h2>Priced lines on this page</h2>
          {items.length ? <ItemRows rows={items.map((item) => ({ bookId: b.id, book: b.name, item }))} showSection={false} /> : <p className="muted">No price lines could be read from this page; see the page itself.</p>}
        </div>
      </div>
    </>
  );
}
