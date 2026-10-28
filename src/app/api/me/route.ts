import { NextRequest } from "next/server";
import { apiError, canAccessAdminPanels, canRestoreVersions, getOperatorFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const operator = await getOperatorFromRequest(request);
    return Response.json({
      operator,
      permissions: { admin: canAccessAdminPanels(operator), restore: canRestoreVersions(operator) },
    });
  } catch (error) {
    return apiError(error);
  }
}
