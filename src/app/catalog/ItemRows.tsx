import Link from "next/link";
import type { CatalogItem } from "@/lib/catalog/priceBook";

// When the heading above names one column per price ("12" Deep 16" Deep ..."), label each price with it.
function priceLabels(item: CatalogItem): string[] | undefined {
  const cols = item.columns.match(/\d+(?:\s\d\/\d)?\s?["”]\s?(?:deep|d|w|wide|h)?/gi);
  return cols && cols.length === item.prices.length ? cols.map((c) => c.trim()) : undefined;
}

// Priced lines as a table; each links to its page in the book.
export default function ItemRows({ rows, showBook, showSection = true }: { rows: { bookId: number; book: string; item: CatalogItem }[]; showBook?: boolean; showSection?: boolean }) {
  return (
    <table className="list items">
      <thead>
        <tr>
          {showBook && <th>Book</th>}
          {showSection && <th>Section</th>}
          <th>Item</th>
          <th>Price</th>
          <th>Page</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ bookId, book, item }, i) => (
          <tr key={i}>
            {showBook && <td className="muted">{book}</td>}
            {showSection && <td className="muted">{item.section}</td>}
            <td>
              {item.label}
              {item.columns && !priceLabels(item) && <div className="small">{item.columns}</div>}
            </td>
            <td>
              <span className="prices">
                {item.prices.map((p, j) => (
                  <span key={j} className="price">
                    {priceLabels(item) && <span className="col">{priceLabels(item)![j]}</span>}
                    {p}
                  </span>
                ))}
              </span>
            </td>
            <td>
              <Link href={`/catalog/${bookId}?page=${item.page}`}>p. {item.page}</Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
