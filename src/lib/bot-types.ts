export type NormalizedInbound = {
  from: string;
  to: string;
  body: string;
  messageSid: string | null;
  profileName?: string | null;
  numMedia: number;
  mediaContentTypes: string[];
  mediaUrls?: string[];
  documentValidations?: Partial<Record<DocumentMediaField, DocumentValidationResult>>;
  rawPayload?: Record<string, unknown>;
  geminiClassification?: {
    intent_key?: string;
    confidence?: number;
    needs_operator?: boolean;
    reason?: string;
  } | null;
};

export type ConversationStatus =
  | "bot_active"
  | "waiting_operator"
  | "human_takeover"
  | "takeover_expired"
  | "closed";

export type CaseStatus = "in_progress" | "waiting_operator" | "closed" | "cancelled";

export type BotFieldKey =
  | "appointmentArea"
  | "imagingStudy"
  | "professionalOrService"
  | "patientFullName"
  | "dniMedia"
  | "insuranceMemberNumber"
  | "insuranceCredentialMedia"
  | "availability"
  | "medicalOrderMedia"
  | "studyAndDate"
  | "operatorReason"
  | "city";

export type DocumentMediaField = "dniMedia" | "insuranceCredentialMedia" | "medicalOrderMedia";

export type DocumentValidationReason =
  | "valid"
  | "missing_media"
  | "unsupported_media"
  | "not_document"
  | "missing_dni_side"
  | "name_mismatch"
  | "low_confidence"
  | "technical_error";

export type DocumentValidationResult = {
  field: DocumentMediaField;
  valid: boolean;
  reason: DocumentValidationReason;
  confidence: number;
  technicalError?: boolean;
  documentType?: "dni" | "insurance_credential" | "medical_order" | "unknown";
  dniHasFront?: boolean;
  dniHasBack?: boolean;
  dniNameMatches?: boolean;
  dniDocumentFingerprint?: string;
  dniNameFingerprint?: string;
};

export type BotCaseData = Partial<Record<BotFieldKey, string | boolean>> & Record<string, unknown>;

export type CaseSnapshot = {
  id?: string;
  intent_key: string;
  status: CaseStatus;
  current_step: string | null;
  required_fields_status: Record<string, boolean>;
  case_data: BotCaseData;
};

export type ConversationSnapshot = {
  id?: string;
  status: ConversationStatus;
  current_intent: string | null;
  current_step: string | null;
  assigned_operator_id?: string | null;
  bot_paused_until?: string | null;
  last_inbound_at?: string | null;
  unanswered_release_at?: string | null;
  last_outbound_at?: string | null;
  last_activity_at: string;
  unread_count: number;
  created_at?: string;
  updated_at?: string;
};

export type BotMessageDraft =
  | {
      kind: "text";
      text: string;
    }
  | {
      kind: "media";
      text: string;
      mediaKind: "vcard";
      mediaUrls: string[];
    };

export type PersistedCaseState = {
  intentKey: string;
  status: CaseStatus;
  currentStep: string | null;
  caseData: BotCaseData;
  requiredFieldsStatus: Record<string, boolean>;
  completedAt?: string | null;
};

export type CoreTurnResult = {
  shouldReply: boolean;
  reason: "bot_reply" | "human_takeover" | "waiting_operator";
  intent: string | null;
  confidence: number;
  status: ConversationStatus;
  currentIntent: string | null;
  currentStep: string | null;
  reply: BotMessageDraft | null;
  caseState: PersistedCaseState | null;
  contactPatch: Record<string, unknown> | null;
};
