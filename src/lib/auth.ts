import { NextRequest } from "next/server";
import { ZodError } from "zod";
import { createAdminSupabaseClient } from "./supabase";
import type { Operator } from "./domain";

export async function getOperatorFromRequest(request: NextRequest): Promise<Operator> {
  const auth = request.headers.get("authorization") || "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";

  if (!token) {
    throw Object.assign(new Error("Missing bearer token"), { status: 401 });
  }

  const supabase = createAdminSupabaseClient();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    throw Object.assign(new Error("Invalid session"), { status: 401 });
  }

  const { data, error } = await supabase
    .from("operators")
    .select("id,auth_user_id,name,email,role,is_active")
    .eq("auth_user_id", userData.user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw Object.assign(new Error(error.message), { status: 500 });
  }

  if (!data) {
    throw Object.assign(new Error("Operator not registered"), { status: 403 });
  }

  return data as Operator;
}

export function requireAdmin(operator: Operator) {
  if (operator.role !== "admin") {
    throw Object.assign(new Error("Administrator access required"), { status: 403 });
  }
  return operator;
}

export function apiError(error: unknown) {
  const status =
    error instanceof ZodError
      ? 400
      : typeof error === "object" && error && "status" in error
        ? Number(error.status)
        : 500;
  const message = error instanceof Error ? error.message : "Unexpected error";
  return Response.json({ error: message }, { status: Number.isFinite(status) ? status : 500 });
}
