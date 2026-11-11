import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, getOperatorFromRequest, requireAdminPanels } from "@/lib/auth";
import { assignGroupToArea, listAreaNames } from "@/lib/area-rules-admin";
import { getEditableCatalog } from "@/lib/catalog-admin";
import { createAdminSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  groupId: z.string().trim().min(1),
  area: z.string().trim().min(1),
});

export async function GET(request: NextRequest) {
  try {
    requireAdminPanels(await getOperatorFromRequest(request));
    return Response.json({ areas: await listAreaNames(createAdminSupabaseClient()) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    requireAdminPanels(await getOperatorFromRequest(request));
    const body = bodySchema.parse(await request.json());
    const catalog = await getEditableCatalog();
    if (!catalog) throw Object.assign(new Error("No existe catálogo"), { status: 503 });
    const result = await assignGroupToArea({
      supabase: createAdminSupabaseClient(),
      catalog,
      groupId: body.groupId,
      areaName: body.area,
    });
    return Response.json(result);
  } catch (error) {
    return apiError(error);
  }
}
