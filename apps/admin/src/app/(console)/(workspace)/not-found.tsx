import Link from "next/link";
export default function NotFound() {
  return (
    <section className="panel empty">
      <h1>Record not found</h1>
      <p>
        This link does not match an available customer or project. Search your
        workspace to find the record.
      </p>
      <Link className="button" href="/">
        Back to projects
      </Link>
    </section>
  );
}
