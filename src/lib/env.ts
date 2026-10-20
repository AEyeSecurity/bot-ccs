const optional = (name: string) => process.env[name]?.trim() || "";

export function requiredEnv(name: string): string {
  const value = optional(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getPublicEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || "";
  if (!supabaseUrl) throw new Error("Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL");
  if (!supabaseAnonKey) throw new Error("Missing required environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return { supabaseUrl, supabaseAnonKey };
}

export function getSupabaseAdminEnv() {
  return {
    supabaseUrl: requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    supabaseServiceRoleKey: requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

export function getDocumentFingerprintSecret() {
  return requiredEnv("SESSION_SECRET");
}

export function getServerEnv() {
  return {
    supabaseUrl: requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    supabaseAnonKey: requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    supabaseServiceRoleKey: requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    twilioAccountSid: requiredEnv("TWILIO_ACCOUNT_SID"),
    twilioAuthToken: requiredEnv("TWILIO_AUTH_TOKEN"),
    twilioWhatsappFrom: requiredEnv("TWILIO_WHATSAPP_FROM"),
    twilioMessagingServiceSid: optional("TWILIO_MESSAGING_SERVICE_SID"),
    twilioStatusCallbackUrl: optional("TWILIO_STATUS_CALLBACK_URL"),
    geminiApiKey: optional("GEMINI_API_KEY"),
    geminiVisionModel: optional("GEMINI_VISION_MODEL") || "gemini-2.5-flash",
    geminiIntentModel: optional("GEMINI_INTENT_MODEL") || "gemini-2.5-flash",
    botWebhookSecret: requiredEnv("BOT_CCS_WEBHOOK_SECRET"),
    vcardPublicBaseUrl: optional("VCARD_PUBLIC_BASE_URL") || "https://ccs.aeye.com.ar/vcards",
    humanTakeoverTimeoutMinutes: Number(optional("HUMAN_TAKEOVER_TIMEOUT_MINUTES") || "10"),
    retentionMessagesDays: Number(optional("RETENTION_MESSAGES_DAYS") || "90"),
    retentionLogsDays: Number(optional("RETENTION_LOGS_DAYS") || "30"),
    retentionMediaMetadataDays: Number(optional("RETENTION_MEDIA_METADATA_DAYS") || "30"),
  };
}
