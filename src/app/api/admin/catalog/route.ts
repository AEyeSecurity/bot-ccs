import { NextRequest } from "next/server";
import { apiError, canRestoreVersions, getOperatorFromRequest, requireAdminPanels } from "@/lib/auth";
import { getCatalogAdminState } from "@/lib/catalog-admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const operator = await getOperatorFromRequest(request);
    requireAdminPanels(operator);
    const state = await getCatalogAdminState();
    return Response.json(canRestoreVersions(operator) ? state : { ...state, history: [] });
  } catch (error) {
    return apiError(error);
  }
}
