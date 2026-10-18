/* eslint-disable @next/next/no-img-element -- Uploaded image URLs are owned by this instance. */
type Block = {
  id?: string;
  blockType: string;
  heading?: string;
  text?: string;
  caption?: string;
  image?: { url?: string; alt?: string } | string | number;
};
export function PageView({
  page,
}: {
  page: { title?: unknown; content?: unknown };
}) {
  return (
    <main>
      <h1>{String(page.title ?? "")}</h1>
      {(Array.isArray(page.content) ? (page.content as Block[]) : []).map(
        (block, index) => (
          <section key={block.id ?? index}>
            {block.blockType === "text" ? (
              <>
                {block.heading && <h2>{block.heading}</h2>}
                <p style={{ whiteSpace: "pre-wrap" }}>{block.text}</p>
              </>
            ) : (
              block.blockType === "image" &&
              typeof block.image === "object" &&
              block.image?.url && (
                <figure>
                  <img src={block.image.url} alt={block.image.alt ?? ""} />
                  {block.caption && <figcaption>{block.caption}</figcaption>}
                </figure>
              )
            )}
          </section>
        ),
      )}
    </main>
  );
}
