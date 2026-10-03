import Link from "next/link";
import { listURL } from "../lib/list-query";
export function ListControls({
  path,
  q,
  status,
  sort,
  placeholder,
  extra,
  activity = false,
}: {
  path: string;
  q: string;
  status?: string;
  sort: string;
  placeholder: string;
  extra?: React.ReactNode;
  activity?: boolean;
}) {
  return (
    <form
      action={path}
      className="list-controls"
      role="search"
      key={[q, status, sort].join(":")}
    >
      <div className="search-field">
        <label htmlFor="q">Search</label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={q}
          placeholder={placeholder}
          maxLength={160}
        />
      </div>
      {status && (
        <div>
          <label htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={status}>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
            <option value="all">All statuses</option>
          </select>
        </div>
      )}
      {extra}
      <div>
        <label htmlFor="sort">Sort by</label>
        <select id="sort" name="sort" defaultValue={sort}>
          {activity ? (
            <>
              <option value="-createdAt">Newest first</option>
              <option value="createdAt">Oldest first</option>
            </>
          ) : (
            <>
              <option value="-updatedAt">Recently updated</option>
              <option value="name">Name A–Z</option>
              <option value="-name">Name Z–A</option>
            </>
          )}
        </select>
      </div>
      <button className="button secondary" type="submit">
        Apply
      </button>
      <Link href={path} className="filter-reset">
        Reset
      </Link>
    </form>
  );
}
export function Pagination({
  path,
  query,
  page,
  totalPages,
  totalDocs,
  limit,
}: {
  path: string;
  query: Record<string, string | number | undefined>;
  page: number;
  totalPages: number;
  totalDocs: number;
  limit: number;
}) {
  return (
    <nav className="pagination" aria-label="Results pagination">
      <span className="result-count">
        {totalDocs
          ? `${(page - 1) * limit + 1}–${Math.min(page * limit, totalDocs)} of ${totalDocs}`
          : "0 results"}
      </span>
      {page > 1 ? (
        <Link href={listURL(path, { ...query, page: page - 1 })}>Previous</Link>
      ) : (
        <span aria-disabled="true">Previous</span>
      )}
      <span>
        Page {page} of {Math.max(1, totalPages)}
      </span>
      {page < totalPages ? (
        <Link href={listURL(path, { ...query, page: page + 1 })}>Next</Link>
      ) : (
        <span aria-disabled="true">Next</span>
      )}
    </nav>
  );
}
