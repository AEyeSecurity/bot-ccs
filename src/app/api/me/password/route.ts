import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, getOperatorFromRequest } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { isPasswordStrong } from "@/lib/password";

export const dynamic = "force-dynamic";

const schema = z.object({
  password: z
    .string()
    .min(1, "La contraseña es obligatoria")
    .refine(isPasswordStrong, "Debe tener mínimo 8 caracteres, una mayúscula, una minúscula y un número"),
});

export async function POST(request: NextRequest) {
  try {
    const operator = await getOperatorFromRequest(request);
    const { password } = schema.parse(await request.json());
    const supabase = createAdminSupabaseClient();

    if (operator.auth_user_id) {
      const { error: passwordError } = await supabase.auth.admin.updateUserById(operator.auth_user_id, { password });
      if (passwordError) throw new Error(passwordError.message);
    }

    const { error: updateError } = await supabase
      .from("operators")
      .update({ password_change_required: false })
      .eq("id", operator.id);
    if (updateError) throw new Error(updateError.message);

    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
