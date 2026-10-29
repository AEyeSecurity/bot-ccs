import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, getOperatorFromRequest, requireAdminPanels } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { isPasswordStrong } from "@/lib/password";
import type { Operator } from "@/lib/domain";

export const dynamic = "force-dynamic";

const passwordSchema = z
  .string()
  .min(1, "La contraseña es obligatoria")
  .refine(isPasswordStrong, "Debe tener mínimo 8 caracteres, una mayúscula, una minúscula y un número");

const createSchema = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,}$/, "El usuario debe tener al menos 3 caracteres (a-z, 0-9, . _ -)"),
  name: z.string().trim().min(1, "El nombre es obligatorio"),
  password: passwordSchema,
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
  password: passwordSchema.optional(),
});

const deleteSchema = z.object({ id: z.string().min(1) });

const emailFor = (username: string) => `${username}@bot-ccs.local`;

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

    const { data: existing } = await supabase.from("operators").select("id").eq("email", email).maybeSingle();
    if (existing) {
      return apiError(Object.assign(new Error("Ya existe un usuario con ese nombre de acceso"), { status: 409 }));
    }

    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      password: input.password,
      email_confirm: true,
    });
    if (createError) throw new Error(createError.message);

    const { data: row, error: upsertError } = await supabase
      .from("operators")
      .upsert(
        { auth_user_id: created.user.id, name: input.name, email, role: input.role, is_active: true, password_change_required: true },
        { onConflict: "email" },
      )
      .select("id")
      .single();
    if (upsertError) throw new Error(upsertError.message);

    await replaceAreas(supabase, row.id, input.role, areaIds);
    return Response.json({ operator: await loadOperatorWithAreas(supabase, row.id) });
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

    let passwordChanged = false;
    if (input.reset_password) {
      if (!input.password) {
        return apiError(Object.assign(new Error("Ingresá la nueva contraseña para resetearla"), { status: 400 }));
      }
      if (!current.auth_user_id) throw new Error("El usuario no tiene cuenta de autenticación");
      const { error: passwordError } = await supabase.auth.admin.updateUserById(current.auth_user_id, {
        password: input.password,
      });
      if (passwordError) throw new Error(passwordError.message);
      passwordChanged = true;
    }

    const { error: updateError } = await supabase
      .from("operators")
      .update({
        name: input.name,
        role: input.role,
        is_active: input.is_active,
        ...(passwordChanged ? { password_change_required: true } : {}),
      })
      .eq("id", input.id);
    if (updateError) throw new Error(updateError.message);

    const areaIds = await resolveAreaIds(supabase, input.role === "operator" ? input.areas : []);
    await replaceAreas(supabase, input.id, input.role, areaIds);

    return Response.json({ operator: await loadOperatorWithAreas(supabase, input.id) });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const operator = await getOperatorFromRequest(request);
    requireAdminPanels(operator);
    const supabase = createAdminSupabaseClient();
    const input = deleteSchema.parse(await request.json());

    if (input.id === operator.id) {
      return apiError(Object.assign(new Error("No podés eliminar tu propia cuenta"), { status: 400 }));
    }

    const { data: target, error: targetError } = await supabase
      .from("operators")
      .select("id,auth_user_id")
      .eq("id", input.id)
      .maybeSingle();
    if (targetError) throw new Error(targetError.message);
    if (!target) throw Object.assign(new Error("Usuario inexistente"), { status: 404 });

    if (target.auth_user_id) {
      const { error: authError } = await supabase.auth.admin.deleteUser(target.auth_user_id);
      if (authError) throw new Error(authError.message);
    }

    const { error: deleteError } = await supabase.from("operators").delete().eq("id", input.id);
    if (deleteError) throw new Error(deleteError.message);

    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
