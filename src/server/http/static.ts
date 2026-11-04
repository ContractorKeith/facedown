import { realpath, stat } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { Fault } from "../tables/types";

// Only files inside the built client are public; API misses never reach this route.
export async function staticFile(path: string, root = resolve("dist/client")) {
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  if (decoded.includes("\0")) return new Response("Not found", { status: 404 });
  root = resolve(root);
  const target = resolve(root, `.${decoded}`);
  if (!target.startsWith(`${root}${sep}`) && target !== root)
    return new Response("Not found", { status: 404 });
  const asset = decoded.startsWith("/assets/");
  const canonicalRoot = await realpath(root).catch(() => null);
  async function fileAt(path: string) {
    const canonical = await realpath(path).catch(() => null);
    if (!canonical || !canonicalRoot) return null;
    if (
      canonical !== canonicalRoot &&
      !canonical.startsWith(`${canonicalRoot}${sep}`)
    )
      throw new Fault("not_found");
    return (await stat(canonical)).isFile() ? Bun.file(canonical) : null;
  }
  let file: ReturnType<typeof Bun.file> | null;
  try {
    file = await fileAt(target);
  } catch (error) {
    if (error instanceof Fault)
      return new Response("Not found", { status: 404 });
    throw error;
  }
  if (file)
    return new Response(file, {
      headers: {
        "cache-control":
          asset && /-[\w-]{8,}\.[\w]+$/.test(decoded)
            ? "public, max-age=31536000, immutable"
            : "no-store",
      },
    });
  if (asset || /\.[a-z0-9]+$/i.test(decoded))
    return new Response("Not found", { status: 404 });
  let index: ReturnType<typeof Bun.file> | null;
  try {
    index = await fileAt(resolve(root, "index.html"));
  } catch (error) {
    if (error instanceof Fault)
      return new Response("Not found", { status: 404 });
    throw error;
  }
  return index
    ? new Response(index, { headers: { "cache-control": "no-store" } })
    : new Response(
        "<!doctype html><title>facedown</title><p>Client not built. Run bun run build.</p>",
        {
          status: 503,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
          },
        },
      );
}
