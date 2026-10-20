import { getPublishedCatalog } from "@/lib/catalog-store";
import { createAdminSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { error } = await createAdminSupabaseClient().from("bot_catalog_versions").select("id").eq("status", "published").single();
    if (error) throw error;
    await getPublishedCatalog();
    return Response.json({ ok: true, testInstance: process.env.BOT_CCS_TEST_INSTANCE === "1" && process.env.TWILIO_TRANSPORT === "mock" });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
