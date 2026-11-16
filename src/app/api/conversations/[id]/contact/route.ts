import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, getOperatorFromRequest } from "@/lib/auth";
import { insertConversationEvent } from "@/lib/api-helpers";
import { accessDenied, canViewConversation } from "@/lib/areas";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { withConversationLock } from "@/lib/conversation-lock";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

// Texto opcional: vacío = borrar el dato.
const text = (max: number) => z.string().trim().max(max).transform((value) => value || null);

const schema = z
  .object({
    patient_full_name: text(120),
    dni_number: z
      .string()
      .trim()
      .transform((value) => value.replace(/[.\s]/g, ""))
      .refine((value) => value === "" || /^\d{6,9}$/.test(value), "El DNI debe tener entre 6 y 9 dígitos.")
      .transform((value) => value || null),
    insurance_name: text(120),
    insurance_member_number: text(60),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "No hay datos para guardar.");

// Cualquier usuario que pueda ver la conversación puede corregir la ficha del paciente.
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const operator = await getOperatorFromRequest(request);
    const { id } = await context.params;
    const fields = schema.parse(await request.json());
    const supabase = createAdminSupabaseClient();

    return await withConversationLock(supabase, id, async () => {
      const { data: conversation, error: conversationError } = await supabase
        .from("conversations")
        .select("id,contact_id,area_ids")
        .eq("id", id)
        .single();
      if (conversationError) throw new Error(conversationError.message);
      if (!canViewConversation(operator, conversation)) throw accessDenied();

      const { data: contact, error: contactError } = await supabase
        .from("contacts")
        .select("manual_fields")
        .eq("id", conversation.contact_id)
        .single();
      if (contactError) throw new Error(contactError.message);

      const changed = Object.keys(fields);
      const manualFields = Array.from(new Set([...(Array.isArray(contact.manual_fields) ? contact.manual_fields : []), ...changed]));

      const { data, error } = await supabase
        .from("contacts")
        .update({ ...fields, manual_fields: manualFields, updated_at: new Date().toISOString() })
        .eq("id", conversation.contact_id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);

      // El evento solo registra qué campos cambiaron, nunca los valores (DNI).
      await insertConversationEvent(supabase, id, "contact_updated", "operator", operator.id, { fields: changed });
      return Response.json({ contact: data });
    });
  } catch (error) {
    return apiError(error);
  }
}
