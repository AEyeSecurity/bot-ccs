export type ConversationStatus =
  | "bot_active"
  | "waiting_operator"
  | "human_takeover"
  | "takeover_expired"
  | "closed";

export type OperatorRole = "admin" | "operator";

export type Operator = {
  id: string;
  auth_user_id: string | null;
  name: string;
  email: string;
  role: OperatorRole;
  is_active: boolean;
};

export type Contact = {
  id: string;
  whatsapp_number: string;
  display_name: string | null;
  patient_full_name: string | null;
  dni_received: boolean;
  insurance_member_number: string | null;
  insurance_card_received: boolean;
};

export type Conversation = {
  id: string;
  contact_id: string;
  status: ConversationStatus;
  current_intent: string | null;
  current_step: string | null;
  assigned_operator_id: string | null;
  bot_paused_until: string | null;
  last_inbound_at: string | null;
  unanswered_release_at: string | null;
  last_outbound_at: string | null;
  last_activity_at: string;
  unread_count: number;
  priority: string;
  source: string;
  created_at: string;
  updated_at: string;
  contact?: Contact;
  assigned_operator?: Operator | null;
  latest_message?: Message | null;
};

export type CaseRecord = {
  id: string;
  conversation_id: string;
  contact_id: string;
  intent_key: string;
  status: string;
  current_step: string | null;
  required_fields_status: Record<string, unknown>;
  case_data: Record<string, unknown>;
};

export type Message = {
  id: string;
  conversation_id: string;
  contact_id: string;
  direction: "inbound" | "outbound";
  sender_type: "patient" | "bot" | "operator" | "system";
  operator_id: string | null;
  body: string | null;
  twilio_message_sid: string | null;
  twilio_status: string | null;
  media_received: boolean;
  media_count: number;
  media_content_types: string[] | null;
  intent_detected: string | null;
  confidence: number | null;
  needs_manual_review: boolean;
  created_at: string;
};

export type ConversationListItem = Conversation & {
  contact: Contact;
  assigned_operator: Operator | null;
  latest_message: Message | null;
};

export const STATUS_LABELS: Record<ConversationStatus, string> = {
  bot_active: "Bot activo",
  waiting_operator: "Esperando operador",
  human_takeover: "Control humano",
  takeover_expired: "Control vencido",
  closed: "Cerrada",
};
