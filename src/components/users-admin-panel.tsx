"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, KeyRound, LoaderCircle, UserPlus } from "lucide-react";

type ApiFetch = (path: string, init?: RequestInit) => Promise<Record<string, unknown>>;

type OperatorRow = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "operator";
  is_active: boolean;
  last_seen_at?: string | null;
  area_ids?: string[];
};

type AreaRow = { id: string; name: string };

type FormState = {
  mode: "create" | "edit";
  id?: string;
  username: string;
  name: string;
  role: "admin" | "operator";
  areas: string[];
  is_active: boolean;
  reset_password: boolean;
};

const emptyForm: FormState = {
  mode: "create",
  username: "",
  name: "",
  role: "operator",
  areas: [],
  is_active: true,
  reset_password: false,
};

function areaName(areas: AreaRow[], id: string) {
  return areas.find((area) => area.id === id)?.name || id;
}

export function UsersAdminPanel({ apiFetch, onBack }: { apiFetch: ApiFetch; onBack: () => void }) {
  const [operators, setOperators] = useState<OperatorRow[]>([]);
  const [areas, setAreas] = useState<AreaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState<FormState | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch("/api/admin/operators");
      setOperators((data.operators as OperatorRow[]) || []);
      setAreas((data.areas as AreaRow[]) || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudo cargar");
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      setNowMs(Date.now());
      return load();
    });
    const timer = window.setInterval(() => setNowMs(Date.now()), 5000);
    return () => window.clearInterval(timer);
  }, [load]);

  const connected = useMemo(() => {
    return (lastSeenAt?: string | null) =>
      Boolean(lastSeenAt && nowMs - new Date(lastSeenAt).getTime() <= 90_000);
  }, [nowMs]);

  function openCreate() {
    setTemporaryPassword(null);
    setNotice("");
    setForm({ ...emptyForm });
  }

  function openEdit(operator: OperatorRow) {
    setTemporaryPassword(null);
    setNotice("");
    setForm({
      mode: "edit",
      id: operator.id,
      username: operator.email.replace("@bot-ccs.local", ""),
      name: operator.name,
      role: operator.role,
      areas: operator.area_ids || [],
      is_active: operator.is_active,
      reset_password: false,
    });
  }

  function toggleArea(areaId: string) {
    if (!form) return;
    setForm((current) =>
      current
        ? { ...current, areas: current.areas.includes(areaId) ? current.areas.filter((id) => id !== areaId) : [...current.areas, areaId] }
        : current,
    );
  }

  async function save() {
    if (!form) return;
    setBusy(true);
    setError("");
    setNotice("");
    setTemporaryPassword(null);
    try {
      const body =
        form.mode === "create"
          ? { username: form.username, name: form.name, role: form.role, areas: form.areas }
          : { id: form.id, name: form.name, role: form.role, areas: form.areas, is_active: form.is_active, reset_password: form.reset_password };
      const data = await apiFetch("/api/admin/operators", {
        method: form.mode === "create" ? "POST" : "PATCH",
        body: JSON.stringify(body),
      });
      if (data.temporaryPassword) setTemporaryPassword(String(data.temporaryPassword));
      setForm(null);
      setNotice(form.mode === "create" ? "Usuario creado" : "Usuario actualizado");
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Error al guardar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="catalog-shell min-h-screen bg-[#f5f7f3] text-zinc-900">
      <header className="sticky top-0 z-20 border-b border-emerald-950/10 bg-[#173b35] text-white shadow-lg shadow-emerald-950/10">
        <div className="mx-auto flex max-w-[1100px] items-center justify-between gap-4 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <button onClick={onBack} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 transition hover:bg-white/20" title="Volver a conversaciones">
              <ArrowLeft size={19} />
            </button>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200">Administración</p>
              <h1 className="truncate text-xl font-bold tracking-tight">Usuarios</h1>
            </div>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-[#173b35] transition hover:bg-emerald-50"
          >
            <UserPlus size={17} /> Nuevo usuario
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-[1100px] px-4 py-5">
        {error ? <p className="mb-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
        {notice ? <p className="mb-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p> : null}
        {temporaryPassword ? (
          <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm">
            <p className="font-bold text-amber-900">Contraseña temporal (mostrar una sola vez):</p>
            <p className="mt-1 font-mono text-base text-amber-900">{temporaryPassword}</p>
            <p className="mt-1 text-xs text-amber-700">Entregarla en persona; el usuario debe cambiarla en el primer acceso.</p>
          </div>
        ) : null}

        {loading ? (
          <div className="grid h-40 place-items-center text-zinc-500"><LoaderCircle className="animate-spin" /></div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            {operators.map((operator) => (
              <div key={operator.id} className="flex items-center gap-3 border-b border-zinc-100 p-4 last:border-b-0">
                <span className={`h-3 w-3 shrink-0 rounded-full ${operator.is_active ? "bg-emerald-500" : "bg-zinc-300"}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-zinc-800">{operator.name}</p>
                  <p className="truncate text-xs text-zinc-500">
                    {operator.role === "admin" ? "Administrador" : operator.area_ids?.map((id) => areaName(areas, id)).join(", ") || "Sin área"} · {operator.email}
                  </p>
                </div>
                <span className={`hidden shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold sm:flex ${operator.is_active && connected(operator.last_seen_at) ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500"}`}>
                  {operator.is_active && connected(operator.last_seen_at) ? "Conectado" : "Desconectado"}
                </span>
                <button
                  onClick={() => openEdit(operator)}
                  className="shrink-0 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50"
                >
                  Editar
                </button>
              </div>
            ))}
            {!operators.length ? <p className="p-4 text-sm text-zinc-500">Sin usuarios</p> : null}
          </div>
        )}
      </div>

      {form ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <p className="text-sm font-bold text-zinc-800">{form.mode === "create" ? "Nuevo usuario" : "Editar usuario"}</p>
            <div className="mt-4 grid gap-3">
              {form.mode === "create" ? (
                <label className="block text-sm">
                  <span className="font-semibold text-zinc-700">Usuario</span>
                  <input
                    value={form.username}
                    onChange={(event) => setForm({ ...form, username: event.target.value.toLowerCase() })}
                    className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 outline-none focus:border-[#176b5a]"
                    placeholder="cardiologia"
                  />
                  <span className="mt-1 block text-xs text-zinc-400">Se crea como {form.username || "usuario"}@bot-ccs.local</span>
                </label>
              ) : null}
              <label className="block text-sm">
                <span className="font-semibold text-zinc-700">Nombre</span>
                <input
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 outline-none focus:border-[#176b5a]"
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setForm({ ...form, role: "operator" })}
                  className={`h-10 rounded-xl text-sm font-semibold ${form.role === "operator" ? "bg-[#176b5a] text-white" : "border border-zinc-200 text-zinc-600"}`}
                >
                  Operador
                </button>
                <button
                  onClick={() => setForm({ ...form, role: "admin" })}
                  className={`h-10 rounded-xl text-sm font-semibold ${form.role === "admin" ? "bg-[#176b5a] text-white" : "border border-zinc-200 text-zinc-600"}`}
                >
                  Admin
                </button>
              </div>

              {form.role === "operator" ? (
                <div className="rounded-xl border border-zinc-200 p-3">
                  <p className="mb-2 text-xs font-semibold text-zinc-700">Áreas</p>
                  <div className="grid max-h-44 grid-cols-2 gap-1 overflow-y-auto">
                    {areas.map((area) => (
                      <label key={area.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50">
                        <input type="checkbox" checked={form.areas.includes(area.id)} onChange={() => toggleArea(area.id)} />
                        {area.name}
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}

              {form.mode === "edit" ? (
                <label className="flex items-center justify-between rounded-xl border border-zinc-200 px-3 py-2.5 text-sm">
                  <span className="font-semibold text-zinc-700">Cuenta activa</span>
                  <input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} />
                </label>
              ) : null}

              {form.mode === "edit" ? (
                <label className="flex items-center justify-between rounded-xl border border-zinc-200 px-3 py-2.5 text-sm">
                  <span className="flex items-center gap-2 font-semibold text-zinc-700"><KeyRound size={14} /> Resetear contraseña</span>
                  <input type="checkbox" checked={form.reset_password} onChange={(event) => setForm({ ...form, reset_password: event.target.checked })} />
                </label>
              ) : null}
            </div>
            <div className="mt-5 grid gap-2">
              <button
                disabled={busy || (form.mode === "create" && !form.username.trim()) || !form.name.trim() || (form.role === "operator" && !form.areas.length)}
                onClick={() => void save()}
                className="h-11 rounded-xl bg-[#176b5a] px-4 text-sm font-semibold text-white transition hover:bg-[#125747] disabled:opacity-40"
              >
                {busy ? <LoaderCircle className="mx-auto animate-spin" size={17} /> : form.mode === "create" ? "Crear usuario" : "Guardar cambios"}
              </button>
              <button onClick={() => setForm(null)} className="h-9 text-sm font-semibold text-zinc-500 hover:text-zinc-700">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
