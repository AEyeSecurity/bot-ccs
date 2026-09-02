import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, getOperatorFromRequest, requireAdmin } from "@/lib/auth";
import { publishCatalogDraft } from "@/lib/catalog-admin";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ draftId: z.uuid(), revision: z.number().int().positive() });

export async function POST(request: NextRequest) {
  try {
    const operator = requireAdmin(await getOperatorFromRequest(request));
    const body = bodySchema.parse(await request.json());
    return Response.json({ published: await publishCatalogDraft({
      actorId: operator.id,
      draftId: body.draftId,
      expectedRevision: body.revision,
    }) });
  } catch (error) {
    return apiError(error);
  }
}
