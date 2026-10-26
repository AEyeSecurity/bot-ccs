import { NextRequest } from "next/server";
import { apiError, getOperatorFromRequest, requireAdminPanels } from "@/lib/auth";
import { getCatalogAdminState } from "@/lib/catalog-admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    requireAdminPanels(await getOperatorFromRequest(request));
    return Response.json(await getCatalogAdminState());
  } catch (error) {
    return apiError(error);
  }
}
