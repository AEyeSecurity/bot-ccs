import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, getOperatorFromRequest, requireAdminPanels } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase";
import type { Operator } from "@/lib/domain";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,}$/, "El usuario debe tener al menos 3 caracteres (a-z, 0-9, . _ -)"),
  name: z.string().trim().min(1, "El nombre es obligatorio"),
  role: z.enum(["admin", "operator"]),
  areas: z.array(z.string().trim().min(1)).default([]),
});

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, "El nombre es obligatorio"),
  role: z.enum(["admin", "operator"]),
  areas: z.array(z.string().trim().min(1)).default([]),
  is_active: z.boolean(),
  reset_password: z.boolean().optional().default(false),
});

const emailFor = (username: string) => `${username}@bot-ccs.local`;

function randomPassword() {
  return crypto.randomBytes(9).toString("base64url");
}

async function resolveAreaIds(supabase: ReturnType<typeof createAdminSupabaseClient>, names: string[]) {
  if (!names.length) return [];
  const { data, error } = await supabase.from("areas").select("id,name").in("name", names);
  if (error) throw new Error(error.message);
  const found = (data || []) as Array<{ id: string; name: string }>;
  const missing = names.filter((name) => !found.some((area) => area.name === name));
  if (missing.length) throw Object.assign(new Error(`Áreas inexistentes: ${missing.join(", ")}`), { status: 400 });
  return found.map((area) => area.id);
}

async function replaceAreas(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  operatorId: string,
  role: "admin" | "operator",
  areaIds: string[],
) {
  const { error: deleteError } = await supabase.from("operator_areas").delete().eq("operator_id", operatorId);
  if (deleteError) throw new Error(deleteError.message);
  if (role === "operator" && areaIds.length) {
    const { error: insertError } = await supabase
      .from("operator_areas")
      .insert(areaIds.map((area_id) => ({ operator_id: operatorId, area_id })));
    if (insertError) throw new Error(insertError.message);
  }
}

async function loadOperatorWithAreas(supabase: ReturnType<typeof createAdminSupabaseClient>, id: string) {
  const { data: operator, error } = await supabase
    .from("operators")
    .select("id,auth_user_id,name,email,role,is_active,last_seen_at")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  const { data: areas } = await supabase.from("operator_areas").select("area_id").eq("operator_id", id);
  return { ...(operator as Operator), area_ids: (areas || []).map((row) => String(row.area_id)) };
}

export async function GET(request: NextRequest) {
  try {
    const operator = await getOperatorFromRequest(request);
    requireAdminPanels(operator);
    const supabase = createAdminSupabaseClient();

    const [{ data: operators }, { data: areas }] = await Promise.all([
      supabase
        .from("operators")
        .select("id,auth_user_id,name,email,role,is_active,last_seen_at")
        .order("name", { ascending: true }),
      supabase.from("areas").select("id,name").order("name", { ascending: true }),
    ]);

    const operatorRows = (operators || []) as Operator[];
    const { data: links } = await supabase.from("operator_areas").select("operator_id,area_id");
    const areaIdsByOperator = new Map<string, string[]>();
    for (const link of (links || []) as Array<{ operator_id: string; area_id: string }>) {
      const list = areaIdsByOperator.get(link.operator_id) || [];
      list.push(String(link.area_id));
      areaIdsByOperator.set(link.operator_id, list);
    }

    return Response.json({
      operators: operatorRows.map((row) => ({ ...row, area_ids: areaIdsByOperator.get(row.id) || [] })),
      areas: areas || [],
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const operator = await getOperatorFromRequest(request);
    requireAdminPanels(operator);
    const supabase = createAdminSupabaseClient();
    const input = createSchema.parse(await request.json());

    if (input.role === "operator" && !input.areas.length) {
      return apiError(Object.assign(new Error("Un operador necesita al menos un área"), { status: 400 }));
    }
    const areaIds = await resolveAreaIds(supabase, input.role === "operator" ? input.areas : []);
    const email = emailFor(input.username);

    const { data: existing } = await supabase.from("operators").select("id,auth_user_id").eq("email", email).maybeSingle();

    let authUserId = existing?.auth_user_id || null;
    let temporaryPassword: string | null = null;

    if (!existing) {
      temporaryPassword = randomPassword();
      const { data: created, error: createError } = await supabase.auth.admin.createUser({
        email,
        password: temporaryPassword,
        email_confirm: true,
      });
      if (createError) throw new Error(createError.message);
      authUserId = created.user.id;
    }

    const { data: row, error: upsertError } = await supabase
      .from("operators")
      .upsert({ auth_user_id: authUserId, name: input.name, email, role: input.role, is_active: true }, { onConflict: "email" })
      .select("id")
      .single();
    if (upsertError) throw new Error(upsertError.message);

    await replaceAreas(supabase, row.id, input.role, areaIds);
    return Response.json({ operator: await loadOperatorWithAreas(supabase, row.id), temporaryPassword });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const operator = await getOperatorFromRequest(request);
    requireAdminPanels(operator);
    const supabase = createAdminSupabaseClient();
    const input = updateSchema.parse(await request.json());

    if (input.role === "operator" && !input.areas.length) {
      return apiError(Object.assign(new Error("Un operador necesita al menos un área"), { status: 400 }));
    }

    const { data: current } = await supabase
      .from("operators")
      .select("id,auth_user_id")
      .eq("id", input.id)
      .single();
    if (!current) throw Object.assign(new Error("Usuario inexistente"), { status: 404 });

    let temporaryPassword: string | null = null;
    if (input.reset_password && current.auth_user_id) {
      temporaryPassword = randomPassword();
      const { error: passwordError } = await supabase.auth.admin.updateUserById(current.auth_user_id, {
        password: temporaryPassword,
      });
      if (passwordError) throw new Error(passwordError.message);
    }

    const { error: updateError } = await supabase
      .from("operators")
      .update({ name: input.name, role: input.role, is_active: input.is_active })
      .eq("id", input.id);
    if (updateError) throw new Error(updateError.message);

    const areaIds = await resolveAreaIds(supabase, input.role === "operator" ? input.areas : []);
    await replaceAreas(supabase, input.id, input.role, areaIds);

    return Response.json({ operator: await loadOperatorWithAreas(supabase, input.id), temporaryPassword });
  } catch (error) {
    return apiError(error);
  }
}
