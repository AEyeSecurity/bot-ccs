"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, LoaderCircle, MessageSquare, Timer, UserRound } from "lucide-react";

type ApiFetch = (path: string, init?: RequestInit) => Promise<Record<string, unknown>>;

type Report = {
  period: { from: string; to: string; operator_id: string | null };
  volume: { total: number; open: number; closed: number };
  resolution: { abierta: number; pendiente: number; resuelta: number };
  activity: { participatedConversations: number; interventions: number; operatorMessages: number };
  times: { firstResponseMinutes: number | null; resolutionMinutes: number | null; queueMinutes: number | null };
  topIntents: Array<{ intent: string; count: number }>;
  topAreas: Array<{ area: string; count: number }>;
  presence: { connected: number | boolean };
};

type OperatorOption = { id: string; name: string; email: string; last_seen_at: string | null };

function todayString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function minutesLabel(value: number | null) {
  if (value === null) return "—";
  if (value < 60) return `${value} min`;
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return minutes ? `${hours} h ${minutes} min` : `${hours} h`;
}

function card(label: string, value: string | number, icon: React.ReactNode) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-zinc-500">
        {icon}
        {label}
      </div>
      <p className="text-2xl font-bold tracking-tight text-zinc-900">{value}</p>
    </div>
  );
}

function bars(entries: Array<{ label: string; count: number }>) {
  const max = Math.max(1, ...entries.map((entry) => entry.count));
  return (
    <div className="space-y-2">
      {entries.map((entry) => (
        <div key={entry.label} className="flex items-center gap-2">
          <span className="w-40 shrink-0 truncate text-xs text-zinc-600">{entry.label}</span>
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-zinc-100">
            <div className="h-full rounded-full bg-[#176b5a]" style={{ width: `${(entry.count / max) * 100}%` }} />
          </div>
          <span className="w-8 shrink-0 text-right text-xs font-semibold text-zinc-700">{entry.count}</span>
        </div>
      ))}
      {!entries.length ? <p className="text-xs text-zinc-400">Sin datos en el período</p> : null}
    </div>
  );
}

export function AnalyticsPanel({ apiFetch, onBack }: { apiFetch: ApiFetch; onBack: () => void }) {
  const [from, setFrom] = useState(todayString());
  const [to, setTo] = useState(todayString());
  const [operatorId, setOperatorId] = useState("");
  const [operators, setOperators] = useState<OperatorOption[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ from, to });
      if (operatorId) params.set("operator_id", operatorId);
      const data = await apiFetch(`/api/admin/analytics?${params.toString()}`);
      setReport(data.report as Report);
      setOperators((data.operators as OperatorOption[]) || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudo cargar");
    } finally {
      setLoading(false);
    }
  }, [apiFetch, from, to, operatorId]);

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  const selectedOperator = operators.find((operator) => operator.id === operatorId)?.name || "Todos";

  return (
    <main className="catalog-shell min-h-screen bg-[#f5f7f3] text-zinc-900">
      <header className="sticky top-0 z-20 border-b border-emerald-950/10 bg-[#173b35] text-white shadow-lg shadow-emerald-950/10">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <button onClick={onBack} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 transition hover:bg-white/20" title="Volver a conversaciones">
              <ArrowLeft size={19} />
            </button>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200">Administración</p>
              <h1 className="truncate text-xl font-bold tracking-tight">Panel de datos</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-xs text-white">
              Desde
              <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="rounded-lg bg-white px-2 py-1 text-zinc-900 outline-none" />
            </label>
            <label className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-xs text-white">
              Hasta
              <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="rounded-lg bg-white px-2 py-1 text-zinc-900 outline-none" />
            </label>
            <select
              value={operatorId}
              onChange={(event) => setOperatorId(event.target.value)}
              className="rounded-xl border border-white/20 bg-white px-3 py-2 text-xs font-semibold text-zinc-900 outline-none"
            >
              <option value="">Todos</option>
              {operators.map((operator) => (
                <option key={operator.id} value={operator.id}>{operator.name} ({operator.email.split("@")[0]})</option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1100px] px-4 py-5">
        {error ? <p className="mb-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

        {loading && !report ? (
          <div className="grid h-40 place-items-center text-zinc-500"><LoaderCircle className="animate-spin" /></div>
        ) : report ? (
          <>
            <p className="mb-4 text-sm text-zinc-500">
              Vista: <span className="font-semibold text-zinc-800">{selectedOperator}</span> · Período {from} a {to}
            </p>

            <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {card("Conversaciones", report.volume.total, <MessageSquare size={15} />)}
              {card("Abiertas", report.volume.open, <MessageSquare size={15} />)}
              {card("Cerradas", report.volume.closed, <MessageSquare size={15} />)}
              {card("Pendientes", report.resolution.pendiente, <Timer size={15} />)}
              {card("Resueltas", report.resolution.resuelta, <MessageSquare size={15} />)}
            </div>

            <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {card("Participó en", report.activity.participatedConversations, <UserRound size={15} />)}
              {card("Intervenciones", report.activity.interventions, <UserRound size={15} />)}
              {card("Mensajes enviados", report.activity.operatorMessages, <MessageSquare size={15} />)}
              {card("Primera respuesta", minutesLabel(report.times.firstResponseMinutes), <Timer size={15} />)}
              {card("Resolución", minutesLabel(report.times.resolutionMinutes), <Timer size={15} />)}
              {card("Tiempo en cola", minutesLabel(report.times.queueMinutes), <Timer size={15} />)}
            </div>

            <div className="mb-5 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="mb-3 text-sm font-bold text-zinc-800">Conectados ahora</p>
              <p className="text-2xl font-bold text-[#176b5a]">
                {typeof report.presence.connected === "boolean" ? (report.presence.connected ? "Sí" : "No") : report.presence.connected}
              </p>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <p className="mb-3 text-sm font-bold text-zinc-800">Derivación por gestión</p>
                {bars(report.topIntents.map((entry) => ({ label: entry.intent, count: entry.count })))}
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <p className="mb-3 text-sm font-bold text-zinc-800">Derivación por área</p>
                {bars(report.topAreas.map((entry) => ({ label: entry.area, count: entry.count })))}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}
