import { getPublishedCatalog } from "@/lib/catalog-store";
import { buildVcard } from "@/lib/vcards";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ filename: string }> }) {
  try {
    const { filename } = await context.params;
    const version = await getPublishedCatalog();
    const card = buildVcard(version.payload, filename);
    if (!card) return new Response("Not found", { status: 404 });
    return new Response(card, { headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    } });
  } catch {
    return new Response("Unavailable", { status: 503 });
  }
}
