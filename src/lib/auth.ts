import { NextRequest } from "next/server";
import { ZodError } from "zod";
import { createAdminSupabaseClient } from "./supabase";
import { getPanelAdminUsernames, getRestoreUsernames } from "./env";
import type { Operator } from "./domain";
import { loadOperatorAreaIds } from "./areas";

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
    .select("id,auth_user_id,name,email,role,is_active,password_change_required")
    .eq("auth_user_id", userData.user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw Object.assign(new Error(error.message), { status: 500 });
  }

  if (!data) {
    throw Object.assign(new Error("Operator not registered"), { status: 403 });
  }

  const operator = data as Operator;
  const area_ids = operator.role === "admin" ? [] : await loadOperatorAreaIds(supabase, operator.id);
  return { ...operator, area_ids };
}

export function requireAdmin(operator: Operator) {
  if (operator.role !== "admin") {
    throw Object.assign(new Error("Administrator access required"), { status: 403 });
  }
  return operator;
}

export function canAccessAdminPanels(operator: Operator) {
  if (operator.role !== "admin") return false;
  const username = (operator.email || "").split("@")[0].toLowerCase();
  return getPanelAdminUsernames().includes(username);
}

export function requireAdminPanels(operator: Operator) {
  if (!canAccessAdminPanels(operator)) {
    throw Object.assign(new Error("Administrator access required"), { status: 403 });
  }
  return operator;
}

export function canRestoreVersions(operator: Operator) {
  const username = (operator.email || "").split("@")[0].toLowerCase();
  return getRestoreUsernames().includes(username);
}

export function requireRestoreVersions(operator: Operator) {
  if (!canRestoreVersions(operator)) {
    throw Object.assign(new Error("Solo el administrador autorizado puede restaurar versiones"), { status: 403 });
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
