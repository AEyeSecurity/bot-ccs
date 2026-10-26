"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  Bot,
  ChevronLeft,
  CheckCircle2,
  ClipboardList,
  Database,
  LogOut,
  Phone,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Stethoscope,
  UserCheck,
  Users,
  XCircle,
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import type { CaseRecord, ConversationListItem, Message, Operator } from "@/lib/domain";
import { RESOLUTION_LABELS, RESOLUTION_STATUSES, type ResolutionStatus } from "@/lib/domain";
import { CatalogAdminPanel } from "@/components/catalog-admin-panel";
import { UsersAdminPanel } from "@/components/users-admin-panel";
import { AnalyticsPanel } from "@/components/analytics-panel";

const resolutionFilters: Array<{ key: "all" | ResolutionStatus; label: string }> = [
  { key: "all", label: "Todas" },
  ...RESOLUTION_STATUSES.map((status) => ({ key: status as ResolutionStatus, label: RESOLUTION_LABELS[status] })),
];

function resolutionClasses(status?: ResolutionStatus | null) {
  if (status === "pendiente") return "bg-amber-100 text-amber-800 border-amber-200";
  if (status === "resuelta") return "bg-emerald-100 text-emerald-800 border-emerald-200";
  return "bg-zinc-100 text-zinc-600 border-zinc-200";
}

function toLocalIso(dateString: string, endOfDay: boolean) {
  if (!dateString) return null;
  const [year, month, day] = dateString.split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = endOfDay ? new Date(year, month - 1, day, 23, 59, 59, 999) : new Date(year, month - 1, day, 0, 0, 0, 0);
  return date.toISOString();
}

function timeLabel(value?: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(value));
}

function previewMessage(message: Message | null) {
  if (!message) return "Sin mensajes";
  if (message.media_received && !message.body) return "Adjunto recibido";
  return message.body || "Mensaje sin texto";
}

const INTENT_LABELS: Record<string, string> = {
  OPENING: "Consulta inicial",
  TURNOS_MEDICOS_SELECTOR: "Solicitud de turno",
  TURNOS_MEDICOS_ATENCION_MEDICA: "Turno de atención médica",
  TURNOS_MEDICOS_IMAGENES_MEDICAS: "Turno de imágenes médicas",
  LABORATORIO_CLINICO: "Laboratorio clínico",
  INFORMES_MEDICOS_ESTUDIOS_PATOLOGIA: "Informes de patología",
  INFORMES_MEDICOS_LABORATORIO_CLINICO: "Informes de laboratorio",
  INFORMES_MEDICOS_IMAGENES_MEDICAS: "Informes de imágenes médicas",
  RECETAS_MEDICAS: "Recetas médicas",
  INTERNACION: "Internación",
  GUARDIA: "Guardia",
  BUSQUEDA_LABORAL: "Búsqueda laboral",
  MEDICOS_CLINICOS: "Médicos clínicos",
  NUESTROS_EDIFICIOS: "Sedes y ubicaciones",
  TELEMEDICINA_DRA_ESTRADA: "Telemedicina",
  OBRAS_SOCIALES: "Obras sociales",
  OTRAS_CONSULTAS: "Otras consultas",
  FUERA_ALCANCE_MEDICO: "Consulta médica",
};

const STEP_LABELS: Record<string, string> = {
  appointment_area: "Tipo de atención",
  professional_or_service: "Especialidad o profesional",
  patient_identity: "Identidad del paciente",
  insurance: "Cobertura médica",
  availability: "Disponibilidad",
  imaging_study: "Estudio solicitado",
  medical_order: "Pedido médico",
  patient_name: "Nombre del paciente",
  dni: "Documento de identidad",
  study_and_date: "Estudio y fecha",
  city: "Localidad",
  reason: "Motivo de consulta",
};

const CASE_STATUS_LABELS: Record<string, string> = {
  in_progress: "En curso",
  waiting_operator: "Pendiente de atención",
  closed: "Finalizado",
  cancelled: "Cancelado",
};

function displayIntent(intent?: string | null) {
  if (!intent) return "Sin gestión activa";
  if (INTENT_LABELS[intent]) return INTENT_LABELS[intent];
  if (intent.startsWith("IMAGENES_")) return "Estudio de imágenes médicas";
  return "Gestión en curso";
}

function displayStep(step: string) {
  return STEP_LABELS[step] || "Dato solicitado";
}

type ConversationDetail = {
  conversation: ConversationListItem;
  messages: Message[];
  case: CaseRecord | null;
};

export function DashboardApp() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [operator, setOperator] = useState<Operator | null>(null);
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [resolutionFilter, setResolutionFilter] = useState<"all" | ResolutionStatus>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [query, setQuery] = useState("");
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [nowMs, setNowMs] = useState(0);
  const [view, setView] = useState<"conversations" | "catalog" | "users" | "analytics">("conversations");
  const [confirmClose, setConfirmClose] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const accessToken = session?.access_token || "";

  const apiFetch = useCallback(
    async (path: string, init: RequestInit = {}) => {
      if (!accessToken) throw new Error("Sesión no disponible");
      const response = await fetch(path, {
        ...init,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${accessToken}`,
          ...(init.headers || {}),
        },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Error de API");
      return data;
    },
    [accessToken],
  );

  const loadMe = useCallback(
    async (activeSession: Session) => {
      const response = await fetch("/api/me", {
        headers: { authorization: `Bearer ${activeSession.access_token}` },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "No autorizado");
      setOperator(data.operator);
    },
    [],
  );

  const loadConversations = useCallback(async () => {
    if (!accessToken) return;
    const params = new URLSearchParams();
    if (resolutionFilter !== "all") params.set("resolution", resolutionFilter);
    const fromIso = toLocalIso(fromDate, false);
    const toIso = toLocalIso(toDate, true);
    if (fromIso) params.set("from", fromIso);
    if (toIso) params.set("to", toIso);
    if (query.trim()) params.set("q", query.trim());
    const data = await apiFetch(`/api/conversations?${params.toString()}`);
    setConversations(data.conversations || []);
    if (!selectedId && data.conversations?.[0]?.id) setSelectedId(data.conversations[0].id);
  }, [accessToken, apiFetch, resolutionFilter, fromDate, toDate, query, selectedId]);

  const loadMessages = useCallback(
    async (id: string) => {
      const data = await apiFetch(`/api/conversations/${id}/messages`);
      setDetail(data);
    },
    [apiFetch],
  );

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session) {
        try {
          await loadMe(data.session);
        } catch (error) {
          setAuthError(error instanceof Error ? error.message : "No autorizado");
        }
      }
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setOperator(null);
      if (nextSession) {
        loadMe(nextSession).catch((error) =>
          setAuthError(error instanceof Error ? error.message : "No autorizado"),
        );
      }
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [loadMe, supabase.auth]);

  useEffect(() => {
    if (!accessToken) return;
    void Promise.resolve().then(() =>
      loadConversations().catch((error) => setAuthError(error instanceof Error ? error.message : "Error")),
    );
    const timer = window.setInterval(() => {
      loadConversations().catch(() => undefined);
      if (selectedId) loadMessages(selectedId).catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [accessToken, loadConversations, loadMessages, selectedId]);

  useEffect(() => {
    if (!selectedId || !accessToken) return;
    void Promise.resolve().then(() =>
      loadMessages(selectedId).catch((error) => setAuthError(error instanceof Error ? error.message : "Error")),
    );
  }, [accessToken, loadMessages, selectedId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [detail?.messages]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    const ping = () => apiFetch("/api/presence", { method: "POST" }).catch(() => undefined);
    void ping();
    const timer = window.setInterval(() => void ping(), 30000);
    return () => window.clearInterval(timer);
  }, [accessToken, apiFetch]);

  async function login(event: FormEvent) {
    event.preventDefault();
    setAuthError("");
    setBusy(true);
    const normalizedLogin = loginId.trim().toLowerCase();
    const email = ["admin", "admindev"].includes(normalizedLogin)
      ? `${normalizedLogin}@bot-ccs.local`
      : normalizedLogin;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setAuthError(error.message);
  }

  async function logout() {
    await supabase.auth.signOut();
    setSession(null);
    setOperator(null);
    setDetail(null);
    setSelectedId(null);
  }

  async function action(path: string) {
    if (!selectedId) return;
    setBusy(true);
    try {
      await apiFetch(`/api/conversations/${selectedId}/${path}`, { method: "POST", body: "{}" });
      await Promise.all([loadConversations(), loadMessages(selectedId)]);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Error");
      if (selectedId) {
        await Promise.all([loadConversations(), loadMessages(selectedId)]).catch(() => undefined);
      }
    } finally {
      setBusy(false);
    }
  }

  async function closeConversation(markResolved: boolean) {
    if (!selectedId) return;
    setBusy(true);
    setConfirmClose(false);
    try {
      await apiFetch(`/api/conversations/${selectedId}/close`, {
        method: "POST",
        body: JSON.stringify({ mark_resolved: markResolved }),
      });
      await Promise.all([loadConversations(), loadMessages(selectedId)]);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function setResolution(resolutionStatus: ResolutionStatus) {
    if (!selectedId) return;
    setBusy(true);
    try {
      await apiFetch(`/api/conversations/${selectedId}/resolution`, {
        method: "POST",
        body: JSON.stringify({ resolution_status: resolutionStatus }),
      });
      await Promise.all([loadConversations(), loadMessages(selectedId)]);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function sendReply(event: FormEvent) {
    event.preventDefault();
    if (!selectedId || !reply.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/api/conversations/${selectedId}/send`, {
        method: "POST",
        body: JSON.stringify({ body: reply.trim() }),
      });
      setReply("");
      await Promise.all([loadConversations(), loadMessages(selectedId)]);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="grid h-screen place-items-center text-sm text-zinc-600">Cargando</div>;
  }

  if (!session || !operator) {
    return (
      <main className="login-shell grid h-screen place-items-center px-4">
        <form
          onSubmit={login}
          className="w-full max-w-[390px] rounded-3xl border border-white/70 bg-white/90 p-7 shadow-2xl shadow-teal-950/10 backdrop-blur"
        >
          <div className="mb-8 flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#176b5a] text-white shadow-lg shadow-emerald-900/20">
              <Stethoscope size={21} />
            </div>
            <div>
              <p className="text-lg font-bold tracking-tight text-[#173b35]">BOT CCS</p>
              <p className="text-sm text-zinc-500">Clínica Cruz del Sur</p>
            </div>
          </div>
          <h1 className="mb-1 text-2xl font-bold tracking-tight text-zinc-950">Panel de atención</h1>
          <p className="mb-6 text-sm leading-6 text-zinc-500">Ingresá para gestionar las conversaciones de pacientes.</p>
          <label className="mb-4 block text-sm font-semibold text-zinc-700">
            Usuario o email
            <input
              value={loginId}
              onChange={(event) => setLoginId(event.target.value)}
              type="text"
              autoComplete="username"
              className="mt-2 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 outline-none transition focus:border-[#176b5a] focus:ring-4 focus:ring-emerald-100"
              required
            />
          </label>
          <label className="mb-5 block text-sm font-semibold text-zinc-700">
            Contraseña
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete="current-password"
              className="mt-2 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 outline-none transition focus:border-[#176b5a] focus:ring-4 focus:ring-emerald-100"
              required
            />
          </label>
          {authError ? <p className="mb-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{authError}</p> : null}
          <button
            disabled={busy}
            className="h-11 w-full rounded-xl bg-[#176b5a] px-4 text-sm font-semibold text-white shadow-lg shadow-emerald-900/15 transition hover:bg-[#125747] disabled:hover:bg-[#176b5a]"
          >
            Ingresar
          </button>
        </form>
      </main>
    );
  }

  const selected = detail?.conversation || conversations.find((conversation) => conversation.id === selectedId) || null;
  const takeoverExpired =
    selected?.status === "takeover_expired" ||
    Boolean(
      selected?.status === "human_takeover" &&
        selected.bot_paused_until &&
        new Date(selected.bot_paused_until).getTime() <= nowMs,
    );
  const canReply = Boolean(selected && selected.status === "human_takeover" && !takeoverExpired);
  const replyPlaceholder = !selected
    ? "Seleccione una conversación"
    : takeoverExpired
      ? "Control vencido. Volvé a tomar control para responder."
      : selected.status !== "human_takeover"
        ? "Tomá control para responder"
        : "Responder";

  if (view === "catalog" && operator.role === "admin") {
    return <CatalogAdminPanel apiFetch={apiFetch} onBack={() => setView("conversations")} />;
  }

  if (view === "users" && operator.role === "admin") {
    return <UsersAdminPanel apiFetch={apiFetch} onBack={() => setView("conversations")} />;
  }

  if (view === "analytics" && operator.role === "admin") {
    return <AnalyticsPanel apiFetch={apiFetch} onBack={() => setView("conversations")} />;
  }

  return (
    <main className="dashboard-shell grid h-screen grid-cols-1 overflow-hidden text-zinc-900 lg:grid-cols-[330px_minmax(0,1fr)_310px]">
      <aside className={`${selectedId ? "hidden" : "flex"} min-h-0 flex-col border-r border-zinc-200/80 bg-white/95 backdrop-blur lg:flex`}>
        <header className="border-b border-zinc-200/80 p-4">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="grid h-8 w-8 place-items-center rounded-xl bg-[#176b5a] text-white"><Stethoscope size={16} /></div>
                <h1 className="truncate text-base font-bold tracking-tight text-[#173b35]">BOT CCS</h1>
              </div>
              <p className="mt-1 truncate text-xs text-zinc-500">{operator.name}</p>
            </div>
            <div className="flex gap-1">
              <button
                title="Actualizar"
                onClick={() => loadConversations()}
                className="grid h-9 w-9 place-items-center rounded-xl border border-zinc-200 text-zinc-600 transition hover:bg-emerald-50 hover:text-[#176b5a]"
              >
                <RefreshCw size={17} />
              </button>
              <button
                title="Salir"
                onClick={logout}
                className="grid h-9 w-9 place-items-center rounded-xl border border-zinc-200 text-zinc-600 transition hover:bg-rose-50 hover:text-rose-700"
              >
                <LogOut size={17} />
              </button>
            </div>
          </div>
          {operator.role === "admin" ? (
            <div className="mb-3 grid gap-1">
              <button onClick={() => setView("catalog")} className="flex h-10 w-full items-center gap-2 rounded-xl bg-[#173b35] px-3 text-sm font-semibold text-white transition hover:bg-[#176b5a]">
                <Database size={16} /> Banco de respuestas
              </button>
              <button onClick={() => setView("users")} className="flex h-10 w-full items-center gap-2 rounded-xl bg-[#173b35] px-3 text-sm font-semibold text-white transition hover:bg-[#176b5a]">
                <Users size={16} /> Usuarios
              </button>
              <button onClick={() => setView("analytics")} className="flex h-10 w-full items-center gap-2 rounded-xl bg-[#173b35] px-3 text-sm font-semibold text-white transition hover:bg-[#176b5a]">
                <BarChart3 size={16} /> Panel de datos
              </button>
            </div>
          ) : null}
          <div className="mb-3 flex h-10 items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 transition focus-within:border-[#176b5a] focus-within:bg-white focus-within:ring-4 focus-within:ring-emerald-50">
            <Search size={16} className="text-zinc-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar"
              className="h-full min-w-0 flex-1 outline-none"
            />
          </div>
          <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-400">Resolución</p>
          <div className="mt-1 grid grid-cols-4 gap-1 rounded-xl bg-zinc-100 p-1">
            {resolutionFilters.map((item) => (
              <button
                key={item.key}
                onClick={() => setResolutionFilter(item.key)}
                className={`h-8 rounded-lg text-[11px] font-semibold transition ${
                  resolutionFilter === item.key
                    ? "bg-white text-[#176b5a] shadow-sm"
                    : "text-zinc-500 hover:text-zinc-800"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[11px] font-semibold text-zinc-500">Desde</span>
              <input
                type="date"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-xs outline-none focus:border-[#176b5a]"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold text-zinc-500">Hasta</span>
              <input
                type="date"
                value={toDate}
                onChange={(event) => setToDate(event.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-xs outline-none focus:border-[#176b5a]"
              />
            </label>
          </div>
          {fromDate || toDate ? (
            <button
              onClick={() => {
                setFromDate("");
                setToDate("");
              }}
              className="mt-2 text-[11px] font-semibold text-zinc-500 underline-offset-2 hover:underline"
            >
              Limpiar fechas
            </button>
          ) : null}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {conversations.map((conversation) => (
            <button
              key={conversation.id}
              onClick={() => setSelectedId(conversation.id)}
              className={`block w-full border-b border-zinc-100/80 p-4 text-left transition hover:bg-emerald-50/60 ${
                selectedId === conversation.id ? "bg-[#edf8f3] shadow-[inset_3px_0_0_#176b5a]" : "bg-white"
              }`}
            >
              <div className="mb-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-zinc-800">
                    {conversation.contact?.display_name ||
                      conversation.contact?.patient_full_name ||
                      conversation.contact?.whatsapp_number}
                  </p>
                  <p className="truncate text-xs text-zinc-500">{conversation.contact?.whatsapp_number}</p>
                </div>
                <span className="shrink-0 text-xs text-zinc-500">{timeLabel(conversation.last_activity_at)}</span>
              </div>
              <p className="mb-3 line-clamp-2 text-sm leading-5 text-zinc-600">{previewMessage(conversation.latest_message)}</p>
              <div className="flex items-center justify-between gap-2">
                <span className={`truncate border px-2 py-0.5 text-[11px] ${resolutionClasses(conversation.resolution_status)}`}>
                  {RESOLUTION_LABELS[conversation.resolution_status || "abierta"]}
                </span>
                {conversation.unread_count > 0 ? (
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#176b5a] px-1 text-xs font-bold text-white">
                    {conversation.unread_count}
                  </span>
                ) : null}
              </div>
            </button>
          ))}
          {!conversations.length ? <p className="p-4 text-sm text-zinc-500">Sin conversaciones</p> : null}
        </div>
      </aside>

      <section className={`${selectedId ? "flex" : "hidden"} min-h-0 flex-col bg-[#f2f5f2] lg:flex`}>
        <header className="flex h-[72px] shrink-0 items-center justify-between gap-3 border-b border-zinc-200/80 bg-white/95 px-5 backdrop-blur">
          <div className="flex min-w-0 items-center gap-2">
            <button
              title="Volver a conversaciones"
              onClick={() => setSelectedId(null)}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-zinc-200 text-zinc-700 lg:hidden"
            >
              <ChevronLeft size={19} />
            </button>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-zinc-800">
                {selected?.contact?.display_name || selected?.contact?.patient_full_name || selected?.contact?.whatsapp_number || "Seleccione una conversación"}
              </p>
              <p className="truncate text-xs text-zinc-500">
                {selected ? `${RESOLUTION_LABELS[selected.resolution_status || "abierta"]} · ${displayIntent(selected.current_intent)}` : ""}
              </p>
            </div>
          </div>
          {selected ? (
            <div className="flex shrink-0 gap-2">
              <button
                title="Tomar control"
                disabled={busy || selected.status === "closed"}
                onClick={() => action("takeover")}
                className="grid h-9 w-9 place-items-center rounded-xl border border-zinc-200 text-zinc-700 transition hover:bg-sky-50 hover:text-sky-700"
              >
                <UserCheck size={17} />
              </button>
              <button
                title="Liberar bot"
                disabled={busy || selected.status === "closed"}
                onClick={() => action("release")}
                className="grid h-9 w-9 place-items-center rounded-xl border border-zinc-200 text-zinc-700 transition hover:bg-emerald-50 hover:text-[#176b5a]"
              >
                <Bot size={17} />
              </button>
              <button
                title="Cerrar conversación"
                disabled={busy || selected.status === "closed"}
                onClick={() => {
                  if (selected.resolution_status && selected.resolution_status !== "resuelta") {
                    setConfirmClose(true);
                  } else {
                    void closeConversation(selected.resolution_status === "resuelta");
                  }
                }}
                className="grid h-9 w-9 place-items-center rounded-xl border border-zinc-200 text-zinc-700 transition hover:bg-rose-50 hover:text-rose-700"
              >
                <CheckCircle2 size={17} />
              </button>
            </div>
          ) : null}
        </header>

        <div className="conversation-canvas min-h-0 flex-1 overflow-y-auto px-4 py-6">
          <div className="mx-auto flex max-w-3xl flex-col gap-3">
            {detail?.messages.map((message) => {
              const outgoing = message.direction === "outbound";
              const system = message.sender_type === "system";
              return (
                <div key={message.id} className={`flex ${outgoing ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm ${
                      system
                        ? "bg-zinc-100 text-zinc-600"
                        : outgoing
                          ? "rounded-br-md bg-[#d9f3e6] text-[#173b35]"
                          : "rounded-bl-md bg-white text-zinc-800"
                    }`}
                  >
                    <div className="whitespace-pre-wrap break-words leading-5">
                      {message.body || null}
                      {message.media_received ? (
                          <div className={message.body ? "mt-2 flex items-center gap-1 border-t border-zinc-200/80 pt-2 text-xs text-zinc-500" : "flex items-center gap-1 text-xs text-zinc-500"}>
                          <ClipboardList size={13} /> Adjunto recibido
                        </div>
                      ) : null}
                    </div>
                    <div className="mt-1 flex items-center justify-end gap-2 text-[11px] text-zinc-500">
                      {message.needs_manual_review ? <span>Revisión</span> : null}
                      <span>{message.sender_type}</span>
                      <span>{timeLabel(message.created_at)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <form onSubmit={sendReply} className="flex shrink-0 gap-2 border-t border-zinc-200/80 bg-white/95 p-3 backdrop-blur">
          <textarea
            value={reply}
            onChange={(event) => setReply(event.target.value)}
            disabled={!canReply || busy}
            placeholder={replyPlaceholder}
            rows={2}
            className="max-h-28 min-h-11 flex-1 resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm outline-none transition focus:border-[#176b5a] focus:bg-white focus:ring-4 focus:ring-emerald-50"
          />
          <button
            title="Enviar"
            disabled={!canReply || busy || !reply.trim()}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#176b5a] text-white shadow-lg shadow-emerald-900/15 transition hover:bg-[#125747]"
          >
            <Send size={18} />
          </button>
        </form>
      </section>

      <aside className="hidden min-h-0 flex-col border-l border-zinc-200/80 bg-white/95 lg:flex">
        <header className="border-b border-zinc-200/80 p-5">
          <p className="text-sm font-bold text-[#173b35]">Ficha del paciente</p>
          <p className="mt-1 text-xs text-zinc-500">Información de la conversación</p>
          {authError ? <p className="mt-3 rounded-lg bg-rose-50 px-2 py-1.5 text-xs text-rose-700">{authError}</p> : null}
        </header>
        {selected ? (
          <div className="min-h-0 flex-1 overflow-y-auto p-5 text-sm">
            <div className="mb-6 rounded-2xl bg-[#edf8f3] p-4">
              <div className="mb-3 grid h-9 w-9 place-items-center rounded-xl bg-white text-[#176b5a] shadow-sm"><UserCheck size={17} /></div>
              <p className="break-words font-bold text-zinc-800">{selected.contact?.patient_full_name || selected.contact?.display_name || "Sin nombre"}</p>
              <p className="mt-1 flex items-center gap-1 break-words text-zinc-500"><Phone size={13} />{selected.contact?.whatsapp_number}</p>
            </div>

            <div className="mb-6 grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-zinc-200 bg-white p-3">
                <p className="mb-1 text-xs text-zinc-500">Documento</p>
                <p className="flex items-center gap-1 font-semibold text-zinc-800"><ShieldCheck size={14} className="text-[#176b5a]" />{selected.contact?.dni_received ? "Recibido" : "Pendiente"}</p>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-white p-3">
                <p className="mb-1 text-xs text-zinc-500">Cobertura</p>
                <p className="font-semibold text-zinc-800">{selected.contact?.insurance_card_received ? "Recibida" : "Pendiente"}</p>
              </div>
            </div>

            <div className="mb-5">
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-zinc-400">Resolución</p>
              <span className={`inline-block rounded-full border px-2.5 py-1 text-xs font-semibold ${resolutionClasses(selected.resolution_status)}`}>
                {RESOLUTION_LABELS[selected.resolution_status || "abierta"]}
              </span>
              <div className="mt-2 grid grid-cols-3 gap-1">
                {RESOLUTION_STATUSES.map((status) => (
                  <button
                    key={status}
                    disabled={busy}
                    onClick={() => setResolution(status)}
                    className={`rounded-lg px-2 py-1.5 text-[11px] font-semibold transition ${
                      (selected.resolution_status || "abierta") === status
                        ? "bg-[#176b5a] text-white"
                        : "border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                    }`}
                  >
                    {RESOLUTION_LABELS[status]}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-5">
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-zinc-400">Gestión</p>
              {detail?.case ? (
                <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
                  <div className="border-b border-zinc-100 bg-zinc-50 p-3">
                    <p className="break-words font-bold text-zinc-800">{displayIntent(detail.case.intent_key)}</p>
                    <p className="mt-1 text-xs text-zinc-500">{CASE_STATUS_LABELS[detail.case.status] || "En curso"}</p>
                  </div>
                  <div className="p-3">
                    {Object.entries(detail.case.required_fields_status || {}).map(([key, value]) => (
                      <div key={key} className="flex items-center justify-between gap-2 border-b border-zinc-100 py-2 last:border-b-0">
                        <span className="min-w-0 truncate text-xs font-medium text-zinc-700">{displayStep(key)}</span>
                        {value ? <CheckCircle2 size={15} className="shrink-0 text-emerald-700" /> : <XCircle size={15} className="shrink-0 text-zinc-300" />}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-zinc-500">Sin caso abierto</p>
              )}
            </div>

            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-zinc-400">Operador</p>
              <p className="rounded-xl bg-zinc-50 px-3 py-2 font-medium text-zinc-700">{selected.assigned_operator?.name || "Sin asignar"}</p>
            </div>
          </div>
        ) : (
          <p className="p-4 text-sm text-zinc-500">Sin conversación seleccionada</p>
        )}
      </aside>

      {confirmClose ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <p className="text-sm font-bold text-zinc-800">Cerrar conversación</p>
            <p className="mt-1 text-sm text-zinc-500">¿Querés marcarla como resuelta antes de cerrarla?</p>
            <div className="mt-4 grid gap-2">
              <button
                disabled={busy}
                onClick={() => closeConversation(true)}
                className="h-11 rounded-xl bg-[#176b5a] px-4 text-sm font-semibold text-white transition hover:bg-[#125747]"
              >
                Marcar resuelta y cerrar
              </button>
              <button
                disabled={busy}
                onClick={() => closeConversation(false)}
                className="h-11 rounded-xl border border-zinc-200 px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
              >
                Solo cerrar
              </button>
              <button
                disabled={busy}
                onClick={() => setConfirmClose(false)}
                className="h-9 text-sm font-semibold text-zinc-500 hover:text-zinc-700"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
