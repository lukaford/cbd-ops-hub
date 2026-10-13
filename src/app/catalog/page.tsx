import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { priceBooks } from "@/db/schema";
import { accountsEnabled, currentStaff } from "@/lib/auth/current";
import { can } from "@/lib/auth/permissions";
import { searchCatalog, type PriceBookModel } from "@/lib/catalog/priceBook";
import { retireBook, uploadBooks } from "./actions";
import ItemRows from "./ItemRows";

export const dynamic = "force-dynamic";

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const db = await getDb();
  const rows = await db
    .select({
      id: priceBooks.id,
      name: priceBooks.name,
      revision: priceBooks.revision,
      model: priceBooks.model,
      uploadedAt: priceBooks.uploadedAt,
    })
    .from(priceBooks)
    .where(eq(priceBooks.archived, false))
    .orderBy(asc(priceBooks.position), asc(priceBooks.name));
  const books = rows.map((r) => ({ ...r, model: r.model as PriceBookModel }));
  const hits = q ? searchCatalog(books, q) : [];
  const manage =
    !(await accountsEnabled()) || can(await currentStaff(), "pricebook.manage");
  // Pages whose printed words match, for picture-heavy pages without clear price lines.
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const pageHits = q
    ? books.flatMap((b) =>
        b.model.pages
          .filter((p) => words.every((w) => p.text.toLowerCase().includes(w)))
          .map((p) => ({ book: b, page: p })),
      )
    : [];

  return (
    <>
      <header className="top">
        <div>
          <div className="label">Closets by Design · Sales</div>
          <h1>Price book</h1>
          <p>
            Search every price book by item, code or SKU, or open a book to page
            through it.
          </p>
        </div>
      </header>

      <form className="controls" action="/catalog">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search: valet rod, quartz, 547.52, drawer"
          aria-label="Search the price book"
        />
        <button className="btn primary" type="submit">
          Search
        </button>
      </form>

      {q && (
        <section className="panel">
          <h2>
            {hits.length} priced {hits.length === 1 ? "line" : "lines"} for
            &quot;{q}&quot;
          </h2>
          {hits.length > 0 && (
            <ItemRows
              rows={hits.map((h) => ({
                bookId: h.bookId,
                book: h.book,
                item: h.item,
              }))}
              showBook
            />
          )}
          {pageHits.length > 0 && (
            <>
              <h3 className="label">Pages that mention it</h3>
              <div className="tabs">
                {pageHits.slice(0, 40).map(({ book, page }) => (
                  <Link
                    key={`${book.id}-${page.n}`}
                    className="tab"
                    href={`/catalog/${book.id}?page=${page.n}`}
                  >
                    {book.name} p. {page.n}
                  </Link>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      <section className="books">
        {books.map((b) => (
          <Link key={b.id} className="book" href={`/catalog/${b.id}`}>
            <span className="t">{b.name}</span>
            <span className="small">
              {b.model.pages.length} pages · {b.model.items.length} priced lines{" "}
              {b.revision && `· ${b.revision}`}
            </span>
          </Link>
        ))}
        {books.length === 0 && (
          <p className="muted">
            No price books yet.
            {manage
              ? " Upload the PDFs below."
              : " Ask price verification to upload them."}
          </p>
        )}
      </section>

      {manage && (
        <details className="panel" open={books.length === 0}>
          <summary>Add or replace price books</summary>
          <form action={uploadBooks} className="stack">
            <p className="muted">
              Upload the price book PDFs. Start file names with their number
              (&quot;01 Main Components Rev8 05-01-25.pdf&quot;) to keep the
              books in order. A newer copy of a book replaces the old one. The
              books stay in this app&apos;s database only.
            </p>
            <label className="drop">
              <input type="file" name="files" multiple accept=".pdf" required />
            </label>
            <button className="btn primary" type="submit">
              Upload
            </button>
          </form>
          {sp.added && <p className="msg">Added: {sp.added}</p>}
          {sp.skipped && <p className="msg err">Not added: {sp.skipped}</p>}
          {books.length > 0 && (
            <ul className="checks">
              {books.map((b) => (
                <li key={b.id}>
                  {b.name} {b.revision}, uploaded{" "}
                  {b.uploadedAt.toLocaleDateString("en-US")}
                  <form action={retireBook} className="inline">
                    <input type="hidden" name="id" value={b.id} />
                    <button className="link" type="submit">
                      Remove
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </details>
      )}
    </>
  );
}
