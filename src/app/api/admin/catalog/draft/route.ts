import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, getOperatorFromRequest, requireAdminPanels } from "@/lib/auth";
import { saveCatalogDraft } from "@/lib/catalog-admin";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  payload: z.unknown(),
  revision: z.number().int().positive().nullable(),
});

export async function PUT(request: NextRequest) {
  try {
    const operator = requireAdminPanels(await getOperatorFromRequest(request));
    const body = bodySchema.parse(await request.json());
    return Response.json(await saveCatalogDraft({
      actorId: operator.id,
      payload: body.payload,
      expectedRevision: body.revision,
    }));
  } catch (error) {
    return apiError(error);
  }
}
