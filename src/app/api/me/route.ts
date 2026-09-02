import { NextRequest } from "next/server";
import { apiError, getOperatorFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const operator = await getOperatorFromRequest(request);
    return Response.json({ operator });
  } catch (error) {
    return apiError(error);
  }
}
