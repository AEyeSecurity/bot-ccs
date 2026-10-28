import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, getOperatorFromRequest, requireAdminPanels, requireRestoreVersions } from "@/lib/auth";
import { restoreCatalogVersion } from "@/lib/catalog-admin";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ versionId: z.uuid() });

export async function POST(request: NextRequest) {
  try {
    const operator = requireRestoreVersions(requireAdminPanels(await getOperatorFromRequest(request)));
    const body = bodySchema.parse(await request.json());
    return Response.json({ draft: await restoreCatalogVersion({ actorId: operator.id, versionId: body.versionId }) });
  } catch (error) {
    return apiError(error);
  }
}
