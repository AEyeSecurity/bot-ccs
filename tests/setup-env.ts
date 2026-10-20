process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "anon-test-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "service-role-test-key";
process.env.TWILIO_ACCOUNT_SID ||= "ACtest";
process.env.TWILIO_AUTH_TOKEN ||= "twilio-auth-test";
process.env.TWILIO_WHATSAPP_FROM ||= "whatsapp:+5493516424148";
process.env.BOT_CCS_WEBHOOK_SECRET = "bot-ccs-secret";
process.env.VCARD_PUBLIC_BASE_URL ||= "https://vcards.aeye.com.ar";

import initialCatalog from "../data/bot-catalog-initial.json";
import { replacePublishedCatalog } from "../src/lib/catalog-store";
import { managedCatalogSchema } from "../src/lib/managed-catalog";

replacePublishedCatalog({
  id: "test-catalog",
  version: 1,
  revision: 1,
  payload: managedCatalogSchema.parse(initialCatalog),
  published_at: "2026-01-01T00:00:00.000Z",
});
