import { withContactLock } from "./contact-lock";
import { createAdminSupabaseClient } from "./supabase";

// Mismo turno serial que inbound: pausa antes de enviar y resolución después del envío.
export async function withConversationLock<T>(
  supabase: ReturnType<typeof createAdminSupabaseClient>, id: string, operation: () => Promise<T>,
) {
  const { data: conversation, error } = await supabase.from("conversations").select("contact_id").eq("id", id).single();
  if (error) throw new Error(error.message);
  const { data: contact, error: contactError } = await supabase.from("contacts").select("whatsapp_number").eq("id", conversation.contact_id).single();
  if (contactError) throw new Error(contactError.message);
  if (!contact?.whatsapp_number) throw Object.assign(new Error("La conversación no tiene contacto WhatsApp"), { status: 400 });
  return withContactLock(contact.whatsapp_number, operation);
}
