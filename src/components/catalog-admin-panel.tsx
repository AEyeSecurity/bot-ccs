"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  Clock3,
  FileText,
  Eye,
  History,
  Info,
  LoaderCircle,
  Phone,
  Search,
  Send,
} from "lucide-react";
import {
  editorialState,
  joinReply,
  pendingEntryCount,
  phonesIn,
  specialtyEditorModel,
} from "@/lib/catalog-editor";
import type { ManagedCatalog } from "@/lib/managed-catalog";

type ApiFetch = (path: string, init?: RequestInit) => Promise<Record<string, unknown>>;
type Category = "specialties" | "professionals" | "studies" | "insurance" | "messages";
type ReviewFilter = "all" | "available" | "unavailable" | "reviewed" | "pending";

type Version = {
  id: string;
  version: number;
  status: "draft" | "published" | "archived";
  revision: number;
  payload: ManagedCatalog;
  updated_at: string;
  published_at: string | null;
};

type AdminState = {
  published: Version | null;
  draft: Version | null;
  validation: { errors: string[]; pending: string[] };
  history: Array<Omit<Version, "payload">>;
};

type EditorItem = {
  id: string;
  title: string;
  subtitle: string;
  body: string;
  available?: boolean;
  reviewStatus: "reviewed" | "pending";
  preview: string;
  phones: string[];
  bodyLabel: string;
  bodyHelp?: string;
  emptyBodyMessage?: string;
  searchText?: string;
  blocks?: EditorBlock[];
  hasNestedPending?: boolean;
  setBody?: (catalog: ManagedCatalog, value: string) => void;
  setAvailable?: (catalog: ManagedCatalog, value: boolean) => void;
  setReview: (catalog: ManagedCatalog, value: "reviewed" | "pending") => void;
  customBody?: string;
  customBodyLabel?: string;
  customBodyHelp?: string;
  customPhones?: string[];
  setCustomBody?: (catalog: ManagedCatalog, value: string) => void;
};

type EditorBlock = {
  id: string;
  title: string;
  subtitle: string;
  body: string;
  phones: string[];
  available: boolean;
  reviewStatus: "reviewed" | "pending";
  setBody: (catalog: ManagedCatalog, value: string) => void;
  setReview: (catalog: ManagedCatalog, value: "reviewed" | "pending") => void;
};

const categories: Array<{ id: Category; label: string }> = [
  { id: "specialties", label: "Especialidades" },
  { id: "professionals", label: "Profesionales" },
  { id: "studies", label: "Estudios" },
  { id: "insurance", label: "Obras sociales" },
  { id: "messages", label: "Mensajes generales" },
];

const directLabels: Record<string, string> = {
  laboratory: "Laboratorio clínico",
  reportsImages: "Informes de imágenes",
  reportsPathology: "Informes de patología",
  reportsLaboratory: "Informes de laboratorio",
  prescriptions: "Recetas médicas",
  buildings: "Sedes y ubicaciones",
  hospitalization: "Internación",
  guard: "Guardia",
  employment: "Búsqueda laboral",
  clinicalMedicine: "Médicos clínicos",
  telemedicine: "Telemedicina",
  socialInsurance: "Introducción de obras sociales",
};

const messageLabels: Record<string, string> = {
  greetingQuestion: "Saludo para solicitud indefinida",
  greetingThanks: "Agradecimiento para solicitud identificada",
  unavailableService: "Servicio no disponible",
  medicalAppointmentIntro: "Introducción de turno médico",
  medicalAppointmentHandoff: "Derivación de turno médico",
  imagingAppointmentIntro: "Introducción de imágenes",
  imagingAppointmentHandoff: "Derivación de imágenes",
  reportsHandoff: "Derivación de informes",
  insuranceHandoff: "Derivación de obras sociales",
  otherConsultIntro: "Introducción de otras consultas",
  otherConsultHandoff: "Derivación de otras consultas",
  outOfScope: "Consulta clínica fuera de alcance",
  turnServicePrompt: "Pregunta por profesional o servicio",
  patientIdentityPrompt: "Solicitud de identidad y DNI",
  insurancePrompt: "Solicitud de cobertura",
  availabilityPrompt: "Solicitud de disponibilidad",
  imagingStudyPrompt: "Pregunta por estudio",
  reportsPatientPrompt: "Solicitud de paciente para informes",
  reportsDniPrompt: "Solicitud de DNI para informes",
  reportsStudyDatePrompt: "Solicitud de estudio y fecha",
  insuranceReasonPrompt: "Motivo de obra social",
  otherConsultPrompt: "Motivo de otra consulta",
  telemedicineIntro: "Introducción de telemedicina",
  telemedicineCityPrompt: "Pregunta por localidad",
  surgerySelector: "Selector de cirugía",
  cardosoSelector: "Aclaración de Cardoso",
  unknownServicePrompt: "Servicio no identificado",
};

function cloneCatalog(catalog: ManagedCatalog) {
  return structuredClone(catalog);
}

function catalogChangeSummary(current: ManagedCatalog, published: ManagedCatalog) {
  const changed = (left: unknown, right: unknown) => JSON.stringify(left) !== JSON.stringify(right);
  return {
    especialidades: current.medicalServices.filter((item, index) => changed(
      { body: item.generalBody, customBody: item.customBody, available: item.available },
      { body: published.medicalServices[index].generalBody, customBody: published.medicalServices[index].customBody, available: published.medicalServices[index].available },
    )).length,
    profesionales: current.professionals.filter((item, index) => {
      const currentGroup = current.professionalResponseGroups.find((group) => group.id === item.responseGroupId);
      const publishedGroup = published.professionalResponseGroups.find((group) => group.id === item.responseGroupId);
      return changed(
        { available: item.available, body: currentGroup?.body, groupAvailable: currentGroup?.available },
        {
          available: published.professionals[index].available,
          body: publishedGroup?.body,
          groupAvailable: publishedGroup?.available,
        },
      );
    }).length,
    estudios: current.imagingStudies.filter((item, index) => changed(
      { body: item.body, available: item.available },
      { body: published.imagingStudies[index].body, available: published.imagingStudies[index].available },
    )).length,
    obrasSociales: current.insurancePlans.filter((item, index) => changed(
      { name: item.name, available: item.available },
      { name: published.insurancePlans[index].name, available: published.insurancePlans[index].available },
    )).length,
    mensajes: Object.keys(current.messages).filter((key) => current.messages[key].body !== published.messages[key].body).length
      + Object.keys(current.direct).filter((key) => changed(
        { body: current.direct[key].body, available: current.direct[key].available },
        { body: published.direct[key].body, available: published.direct[key].available },
      )).length,
  };
}

function editorItems(category: Category, catalog: ManagedCatalog): EditorItem[] {
  if (category === "specialties") {
    return catalog.medicalServices.map((service, index) => {
      const model = specialtyEditorModel(catalog, service.intent);
      const blocks = (model?.blocks || []).map((block): EditorBlock => {
        const groupIndex = catalog.professionalResponseGroups.findIndex((group) => group.id === block.id);
        const professionalIndexes = catalog.professionals
          .map((professional, professionalIndex) => ({ professional, professionalIndex }))
          .filter(({ professional }) => professional.responseGroupId === block.id)
          .map(({ professionalIndex }) => professionalIndex);
        return {
          ...block,
          setBody: (next, value) => { next.professionalResponseGroups[groupIndex].body = value; },
          setReview: (next, value) => {
            next.professionalResponseGroups[groupIndex].reviewStatus = value;
            for (const professionalIndex of professionalIndexes) next.professionals[professionalIndex].reviewStatus = value;
          },
        };
      });
      return {
        id: service.intent,
        title: service.title,
        subtitle: `${model?.activeBlockCount || 0} bloques profesionales disponibles`,
        body: service.generalBody,
        available: service.available,
        reviewStatus: service.reviewStatus,
        preview: model?.preview || service.generalBody,
        phones: model?.generalPhones || [],
        bodyLabel: "Texto general de la especialidad",
        bodyHelp: "Se muestra antes de los bloques profesionales en la respuesta completa.",
        emptyBodyMessage: "Esta especialidad no tiene texto general. La respuesta se construye con los siguientes bloques profesionales.",
        searchText: blocks.map((block) => `${block.title} ${block.subtitle} ${block.body}`).join(" "),
        blocks,
        hasNestedPending: blocks.some((block) => block.reviewStatus === "pending"),
        setBody: (next, value) => { next.medicalServices[index].generalBody = value; },
        setAvailable: (next, value) => { next.medicalServices[index].available = value; },
        setReview: (next, value) => { next.medicalServices[index].reviewStatus = value; },
        customBody: service.customBody,
        customBodyLabel: "Texto general propio de la especialidad",
        customBodyHelp: "Si se completa, reemplaza por completo la respuesta de la especialidad: no se concatenan el texto general ni los bloques profesionales.",
        customPhones: model?.customPhones || [],
        setCustomBody: (next, value) => { next.medicalServices[index].customBody = value; },
      };
    });
  }

  if (category === "professionals") {
    return catalog.professionals.map((professional, index) => {
      const groupIndex = catalog.professionalResponseGroups.findIndex((group) => group.id === professional.responseGroupId);
      const group = catalog.professionalResponseGroups[groupIndex];
      const service = catalog.medicalServices.find((item) => item.title === professional.specialty);
      const sharedProfessionals = catalog.professionals.filter((item) => item.responseGroupId === professional.responseGroupId);
      const preview = joinReply([group?.includeServiceGeneral ? service?.generalBody : "", group?.body]);
      return {
        id: professional.name,
        title: professional.name,
        subtitle: [professional.specialty, ...professional.subservices].join(" · "),
        body: group?.body || "",
        available: professional.available && Boolean(group?.available),
        reviewStatus: professional.reviewStatus === "pending" || group?.reviewStatus === "pending" ? "pending" : "reviewed",
        preview,
        phones: phonesIn(group?.body || ""),
        bodyLabel: "Respuesta de este profesional",
        bodyHelp: sharedProfessionals.length > 1
          ? `Este bloque se comparte con ${sharedProfessionals.map((item) => item.name).join(", ")}. Cualquier edición se reflejará en todos.`
          : "Este es el texto que recibe quien consulta directamente por este profesional.",
        setBody: group ? (next, value) => { next.professionalResponseGroups[groupIndex].body = value; } : undefined,
        setAvailable: (next, value) => {
          next.professionals[index].available = value;
          if (groupIndex >= 0) next.professionalResponseGroups[groupIndex].available = value;
        },
        setReview: (next, value) => {
          if (groupIndex >= 0) next.professionalResponseGroups[groupIndex].reviewStatus = value;
          next.professionals.forEach((item) => {
            if (item.responseGroupId === professional.responseGroupId) item.reviewStatus = value;
          });
        },
      };
    });
  }

  if (category === "studies") {
    return catalog.imagingStudies.map((study, index) => ({
      id: study.intent,
      title: study.title,
      subtitle: "Estudio de imágenes médicas",
      body: study.body,
      available: study.available,
      reviewStatus: study.reviewStatus,
      preview: study.body,
      phones: phonesIn(study.body),
      bodyLabel: "Respuesta del estudio",
      bodyHelp: "Este es el mensaje exacto que recibe el paciente.",
      setBody: (next, value) => { next.imagingStudies[index].body = value; },
      setAvailable: (next, value) => { next.imagingStudies[index].available = value; },
      setReview: (next, value) => { next.imagingStudies[index].reviewStatus = value; },
    }));
  }

  if (category === "insurance") {
    return catalog.insurancePlans.map((plan, index) => ({
      id: plan.id,
      title: plan.name,
      subtitle: "Cobertura médica",
      body: plan.name,
      available: plan.available,
      reviewStatus: plan.reviewStatus,
      preview: plan.available
        ? `Sí, trabajamos con ${plan.name}. ¿Podemos ayudarle en algo más?`
        : `Por el momento no contamos con convenio vigente con ${plan.name}. ¿Podemos ayudarle en algo más?`,
      phones: [],
      bodyLabel: "Nombre visible de la obra social",
      bodyHelp: "La vista previa se genera automáticamente con este nombre y su disponibilidad.",
      setBody: (next, value) => { next.insurancePlans[index].name = value; },
      setAvailable: (next, value) => { next.insurancePlans[index].available = value; },
      setReview: (next, value) => { next.insurancePlans[index].reviewStatus = value; },
    }));
  }

  const directItems = Object.entries(catalog.direct).map(([key, entry]) => ({
    id: `direct:${key}`,
    title: directLabels[key] || key,
    subtitle: "Servicio directo",
    body: entry.body,
    available: entry.available,
    reviewStatus: entry.reviewStatus,
    preview: entry.body,
    phones: phonesIn(entry.body),
    bodyLabel: "Respuesta del servicio",
    bodyHelp: "Este es el mensaje exacto que recibe el paciente.",
    setBody: (next: ManagedCatalog, value: string) => { next.direct[key].body = value; },
    setAvailable: (next: ManagedCatalog, value: boolean) => { next.direct[key].available = value; },
    setReview: (next: ManagedCatalog, value: "reviewed" | "pending") => { next.direct[key].reviewStatus = value; },
  } satisfies EditorItem));
  const messageItems = Object.entries(catalog.messages).map(([key, entry]) => ({
    id: `message:${key}`,
    title: messageLabels[key] || key,
    subtitle: "Mensaje del flujo",
    body: entry.body,
    reviewStatus: entry.reviewStatus,
    preview: entry.body,
    phones: phonesIn(entry.body),
    bodyLabel: "Texto del mensaje",
    bodyHelp: "Este mensaje forma parte del flujo conversacional.",
    setBody: (next: ManagedCatalog, value: string) => { next.messages[key].body = value; },
    setReview: (next: ManagedCatalog, value: "reviewed" | "pending") => { next.messages[key].reviewStatus = value; },
  } satisfies EditorItem));
  return [...directItems, ...messageItems];
}

export function CatalogAdminPanel({ apiFetch, onBack }: { apiFetch: ApiFetch; onBack: () => void }) {
  const [state, setState] = useState<AdminState | null>(null);
  const [catalog, setCatalog] = useState<ManagedCatalog | null>(null);
  const [category, setCategory] = useState<Category>("specialties");
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setBusy(true);
    try {
      const response = await apiFetch("/api/admin/catalog") as unknown as AdminState;
      setState(response);
      setCatalog(cloneCatalog(response.draft?.payload || response.published?.payload as ManagedCatalog));
      setDirty(false);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudo cargar el banco");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const items = useMemo(() => catalog ? editorItems(category, catalog) : [], [catalog, category]);
  const visibleItems = useMemo(() => items.filter((item) => {
    const normalizedQuery = query.trim().toLocaleLowerCase("es");
    const matchesQuery = !normalizedQuery || `${item.title} ${item.subtitle} ${item.body} ${item.searchText || ""}`.toLocaleLowerCase("es").includes(normalizedQuery);
    const matchesFilter = filter === "all"
      || (filter === "available" && item.available !== false)
      || (filter === "unavailable" && item.available === false)
      || item.reviewStatus === filter
      || (filter === "pending" && item.hasNestedPending);
    return matchesQuery && matchesFilter;
  }), [items, query, filter]);

  function updateItem(item: EditorItem, updater: (next: ManagedCatalog) => void, markPending = true) {
    if (!catalog) return;
    const next = cloneCatalog(catalog);
    updater(next);
    if (markPending) item.setReview(next, "pending");
    setCatalog(next);
    setDirty(true);
    setNotice("");
  }

  function updateBlock(block: EditorBlock, updater: (next: ManagedCatalog) => void) {
    if (!catalog) return;
    const next = cloneCatalog(catalog);
    updater(next);
    block.setReview(next, "pending");
    setCatalog(next);
    setDirty(true);
    setNotice("");
  }

  function applyDraftResponse(response: { draft: Version; validation: AdminState["validation"] }) {
    setState((previous) => previous ? { ...previous, draft: response.draft, validation: response.validation } : previous);
    setCatalog(cloneCatalog(response.draft.payload));
    setDirty(false);
    setError("");
  }

  async function writeDraft(payload: ManagedCatalog) {
    return apiFetch("/api/admin/catalog/draft", {
      method: "PUT",
      body: JSON.stringify({ payload, revision: state?.draft?.revision ?? null }),
    }) as Promise<{ draft: Version; validation: AdminState["validation"] }>;
  }

  async function handleWriteError(writeError: unknown, fallback: string) {
    const message = writeError instanceof Error ? writeError.message : fallback;
    if (/modificado por otro administrador/i.test(message)) {
      await load();
      setError("Otro administrador modificó el borrador. Cargamos la versión más reciente para evitar sobrescribirla.");
      return;
    }
    setError(message);
  }

  async function save() {
    if (!catalog) return;
    setBusy(true);
    try {
      applyDraftResponse(await writeDraft(catalog));
      setNotice("Borrador guardado en la base de datos. El bot todavía usa la versión publicada.");
    } catch (saveError) {
      await handleWriteError(saveError, "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  }

  async function persistReview(
    setReview: (next: ManagedCatalog, value: "reviewed" | "pending") => void,
    value: "reviewed" | "pending",
  ) {
    if (!catalog || dirty || busy) return;
    const next = cloneCatalog(catalog);
    setReview(next, value);
    setBusy(true);
    try {
      applyDraftResponse(await writeDraft(next));
      setNotice(value === "reviewed"
        ? "Revisión guardada en la base de datos. Publique los cambios cuando no queden pendientes."
        : "El elemento quedó marcado para revisión en el borrador.");
    } catch (reviewError) {
      await handleWriteError(reviewError, "No se pudo guardar la revisión");
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    const draft = state?.draft;
    if (!draft || dirty || state.validation.pending.length || state.validation.errors.length) return;
    const summary = catalog && state.published
      ? catalogChangeSummary(catalog, state.published.payload)
      : { especialidades: 0, profesionales: 0, estudios: 0, obrasSociales: 0, mensajes: 0 };
    const summaryText = [
      `${summary.especialidades} especialidades`, `${summary.profesionales} profesionales`,
      `${summary.estudios} estudios`, `${summary.obrasSociales} obras sociales`, `${summary.mensajes} mensajes`,
    ].join(", ");
    if (!window.confirm(`Resumen de cambios: ${summaryText}. ¿Publicar esta versión?`)) return;
    setBusy(true);
    try {
      await apiFetch("/api/admin/catalog/publish", {
        method: "POST",
        body: JSON.stringify({ draftId: draft.id, revision: draft.revision }),
      });
      await load();
      setNotice("Cambios publicados. El bot ya está usando esta versión.");
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "No se pudo publicar");
      setBusy(false);
    }
  }

  async function restore(versionId: string) {
    if (dirty && !window.confirm("Hay cambios sin guardar. ¿Descartarlos y restaurar otra versión?")) return;
    setBusy(true);
    try {
      await apiFetch("/api/admin/catalog/restore", { method: "POST", body: JSON.stringify({ versionId }) });
      await load();
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "No se pudo restaurar");
      setBusy(false);
    }
  }

  function back() {
    if (dirty && !window.confirm("Hay cambios sin guardar. ¿Salir de todos modos?")) return;
    onBack();
  }

  const pendingCount = catalog ? pendingEntryCount(catalog) : 0;
  const currentEditorialState = editorialState({ dirty, pendingCount, hasDraft: Boolean(state?.draft) });

  return (
    <main className="catalog-shell min-h-screen bg-[#f5f7f3] text-zinc-900">
      <header className="sticky top-0 z-20 border-b border-emerald-950/10 bg-[#173b35] text-white shadow-lg shadow-emerald-950/10">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <button onClick={back} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 transition hover:bg-white/20" title="Volver a conversaciones">
              <ArrowLeft size={19} />
            </button>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200">Administración</p>
              <h1 className="truncate text-xl font-bold tracking-tight">Banco de respuestas</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`hidden rounded-full px-3 py-1 text-xs font-bold sm:block ${dirty || pendingCount ? "bg-amber-300 text-amber-950" : "bg-emerald-100 text-emerald-900"}`}>{currentEditorialState}</span>
            <button title="Guarda los cambios en la base sin modificar el bot productivo" disabled={busy || !dirty} onClick={save} className="rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-[#173b35] transition hover:bg-emerald-50 disabled:opacity-40">Guardar borrador</button>
            <button title="Activa el borrador revisado para que lo use el bot" disabled={busy || dirty || !state?.draft || pendingCount > 0 || Boolean(state?.validation.errors.length)} onClick={publish} className="rounded-xl bg-[#f4c95d] px-4 py-2.5 text-sm font-bold text-[#173b35] transition hover:bg-amber-300 disabled:opacity-40">Publicar cambios</button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] gap-5 px-4 py-5 lg:grid-cols-[230px_minmax(0,1fr)_280px]">
        <aside className="h-fit rounded-2xl border border-zinc-200 bg-white p-2 shadow-sm lg:sticky lg:top-24">
          {categories.map((item) => (
            <button key={item.id} onClick={() => { setCategory(item.id); setExpanded(null); }} className={`mb-1 flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition last:mb-0 ${category === item.id ? "bg-[#e4f2eb] text-[#176b5a]" : "text-zinc-600 hover:bg-zinc-50"}`}>
              {item.label}<span className="text-xs opacity-60">{catalog ? editorItems(item.id, catalog).length : 0}</span>
            </button>
          ))}
        </aside>

        <section className="min-w-0">
          <div className="mb-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row">
              <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 focus-within:border-[#176b5a] focus-within:bg-white">
                <Search size={17} className="text-zinc-400" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre o contenido" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
              </label>
              <select value={filter} onChange={(event) => setFilter(event.target.value as ReviewFilter)} className="h-11 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold outline-none">
                <option value="all">Todos</option><option value="available">Disponibles</option><option value="unavailable">No disponibles</option><option value="reviewed">Revisados</option><option value="pending">Pendientes</option>
              </select>
            </div>
            {error ? <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
            {notice ? <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p> : null}
            {state?.validation.errors.length ? <div className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.validation.errors.join(" · ")}</div> : null}
          </div>

          {busy && !catalog ? <div className="grid h-56 place-items-center text-zinc-500"><LoaderCircle className="animate-spin" /></div> : null}
          <div className="space-y-3">
            {visibleItems.map((item) => {
              const isExpanded = expanded === item.id;
              const hasAnyPending = item.reviewStatus === "pending" || item.hasNestedPending;
              return (
                <article key={item.id} className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition ${hasAnyPending ? "border-amber-300 ring-2 ring-amber-100" : "border-zinc-200"}`}>
                  <button onClick={() => setExpanded(isExpanded ? null : item.id)} className="flex w-full items-center gap-3 p-4 text-left">
                    <span className={`h-3 w-3 shrink-0 rounded-full ${item.available === false ? "bg-zinc-300" : "bg-emerald-500"}`} />
                    <span className="min-w-0 flex-1"><span className="block truncate font-bold text-zinc-800">{item.title}</span><span className="block truncate text-xs text-zinc-500">{item.subtitle}</span></span>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${hasAnyPending ? "bg-amber-100 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>{item.reviewStatus === "pending" ? "Pendiente" : item.hasNestedPending ? "Bloques pendientes" : "Revisado"}</span>
                    <ChevronDown size={18} className={`text-zinc-400 transition ${isExpanded ? "rotate-180" : ""}`} />
                  </button>
                  {isExpanded ? (
                    <div className="grid gap-4 border-t border-zinc-100 bg-zinc-50/60 p-4 xl:grid-cols-2">
                      <div>
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                          {item.setAvailable ? <button onClick={() => updateItem(item, (next) => item.setAvailable?.(next, item.available === false))} className={`rounded-lg px-3 py-2 text-xs font-bold ${item.available === false ? "bg-zinc-200 text-zinc-700" : "bg-emerald-100 text-emerald-800"}`}>{item.available === false ? "No disponible" : "Disponible"}</button> : null}
                          <button disabled={busy || dirty} title={dirty ? "Guardá el borrador antes de cambiar su revisión" : "La revisión se guardará inmediatamente en la base"} onClick={() => void persistReview(item.setReview, item.reviewStatus === "pending" ? "reviewed" : "pending")} className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"><Check size={14} />{item.reviewStatus === "pending" ? "Marcar revisado" : "Marcar para revisión"}</button>
                        </div>
                        {item.setBody && item.body ? <div className="rounded-xl border border-zinc-200 bg-white p-3">
                          <p className="flex items-center gap-2 text-sm font-bold text-zinc-800"><FileText size={16} className="text-[#176b5a]" />{item.bodyLabel}</p>
                          {item.bodyHelp ? <p className="mt-1 text-xs leading-5 text-zinc-500">{item.bodyHelp}</p> : null}
                          <textarea aria-label={item.bodyLabel} value={item.body} onChange={(event) => updateItem(item, (next) => item.setBody?.(next, event.target.value))} rows={Math.min(14, Math.max(5, item.body.split("\n").length + 2))} className="mt-3 w-full resize-y rounded-xl border border-zinc-200 bg-white p-3 text-sm leading-6 outline-none focus:border-[#176b5a] focus:ring-4 focus:ring-emerald-50" />
                          {item.phones.length ? <div className="mt-3"><p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-zinc-500"><Phone size={13} />Teléfonos detectados automáticamente</p><div className="flex flex-wrap gap-2">{item.phones.map((phone) => <span key={phone} title="Para modificarlo, edite el número dentro del texto" className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">{phone}</span>)}</div><p className="mt-2 text-[11px] text-zinc-400">Se modifican dentro del texto; no son campos separados.</p></div> : null}
                        </div> : item.emptyBodyMessage ? <div className="flex gap-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm leading-6 text-sky-900"><Info size={17} className="mt-0.5 shrink-0" /><p>{item.emptyBodyMessage}</p></div> : null}

                        {item.setCustomBody ? <div className={`mt-3 rounded-xl border p-3 ${item.customBody?.trim() ? "border-violet-300 bg-violet-50/40" : "border-zinc-200 bg-white"}`}>
                          <p className="flex items-center gap-2 text-sm font-bold text-zinc-800"><FileText size={16} className="text-violet-600" />{item.customBodyLabel}</p>
                          {item.customBodyHelp ? <p className="mt-1 text-xs leading-5 text-zinc-500">{item.customBodyHelp}</p> : null}
                          <textarea aria-label={item.customBodyLabel} value={item.customBody} onChange={(event) => updateItem(item, (next) => item.setCustomBody?.(next, event.target.value))} rows={Math.min(14, Math.max(5, (item.customBody || "").split("\n").length + 2))} placeholder="Opcional: deje este campo vacío para conservar el armado automático (texto general + bloques)." className="mt-3 w-full resize-y rounded-xl border border-zinc-200 bg-white p-3 text-sm leading-6 outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-50" />
                          {item.customPhones?.length ? <div className="mt-3"><p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-zinc-500"><Phone size={13} />Teléfonos detectados automáticamente</p><div className="flex flex-wrap gap-2">{item.customPhones.map((phone) => <span key={phone} title="Para modificarlo, edite el número dentro del texto" className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">{phone}</span>)}</div><p className="mt-2 text-[11px] text-zinc-400">Se modifican dentro del texto; no son campos separados.</p></div> : null}
                        </div> : null}

                        {item.blocks?.length ? <div className="mt-4 space-y-3">
                          <div><p className="font-bold text-zinc-800">Bloques profesionales</p><p className="mt-1 text-xs leading-5 text-zinc-500">Cada bloque edita el mismo contenido disponible en la sección Profesionales. No se crean copias.</p></div>
                          {item.blocks.map((block) => <section key={block.id} className={`rounded-xl border bg-white p-3 ${block.reviewStatus === "pending" ? "border-amber-300 ring-2 ring-amber-50" : "border-zinc-200"}`}>
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div><p className="text-sm font-bold text-zinc-800">{block.title}</p><p className="mt-0.5 text-xs text-zinc-500">{block.subtitle}{block.available ? " · Disponible" : " · No disponible"}</p></div>
                              <button disabled={busy || dirty} title={dirty ? "Guardá el borrador antes de cambiar su revisión" : "La revisión se guardará inmediatamente en la base"} onClick={() => void persistReview(block.setReview, block.reviewStatus === "pending" ? "reviewed" : "pending")} className="flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-[11px] font-bold text-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"><Check size={13} />{block.reviewStatus === "pending" ? "Marcar revisado" : "Marcar para revisión"}</button>
                            </div>
                            <textarea aria-label={block.title} value={block.body} onChange={(event) => updateBlock(block, (next) => block.setBody(next, event.target.value))} rows={Math.min(12, Math.max(5, block.body.split("\n").length + 2))} className="mt-3 w-full resize-y rounded-xl border border-zinc-200 bg-white p-3 text-sm leading-6 outline-none focus:border-[#176b5a] focus:ring-4 focus:ring-emerald-50" />
                            {block.phones.length ? <div className="mt-3"><p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-zinc-500"><Phone size={13} />Teléfonos detectados automáticamente</p><div className="flex flex-wrap gap-2">{block.phones.map((phone) => <span key={phone} title="Para modificarlo, edite el número dentro de este bloque" className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">{phone}</span>)}</div><p className="mt-2 text-[11px] text-zinc-400">Se modifican dentro de este texto.</p></div> : null}
                          </section>)}
                        </div> : null}
                      </div>
                      <div>
                        <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-zinc-400"><Eye size={14} />Vista previa de WhatsApp</p>
                        <div className="catalog-preview rounded-2xl p-4"><div className="rounded-2xl rounded-tl-md bg-white p-3 text-sm leading-6 text-zinc-800 shadow-sm"><p className="whitespace-pre-wrap">{item.preview || "Sin contenido visible"}</p><p className="mt-2 flex items-center justify-end gap-1 text-[10px] text-zinc-400">bot · ahora</p></div></div>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
            {!visibleItems.length && catalog ? <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500">No hay registros para estos filtros.</div> : null}
          </div>
        </section>

        <aside className="h-fit space-y-4 lg:sticky lg:top-24">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="mb-3 flex items-center gap-2 text-sm font-bold text-[#173b35]"><Clock3 size={16} />Estado editorial</p>
            <div className="grid grid-cols-2 gap-2"><div className="rounded-xl bg-emerald-50 p-3"><p className="text-xs text-emerald-700">Publicada</p><p className="mt-1 text-lg font-bold text-emerald-900">v{state?.published?.version || "-"}</p></div><div className="rounded-xl bg-amber-50 p-3"><p className="text-xs text-amber-700">Pendientes</p><p className="mt-1 text-lg font-bold text-amber-900">{pendingCount}</p></div></div>
            <p className={`mt-3 rounded-lg px-3 py-2 text-xs font-bold ${dirty || pendingCount ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>{currentEditorialState}</p>
            {pendingCount ? <p className="mt-3 flex gap-2 text-xs leading-5 text-amber-800"><AlertTriangle size={15} className="mt-0.5 shrink-0" />Revise todos los elementos amarillos antes de publicar.</p> : <p className="mt-3 flex gap-2 text-xs leading-5 text-emerald-700"><Check size={15} className="mt-0.5 shrink-0" />El contenido no tiene revisiones pendientes.</p>}
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="mb-3 text-sm font-bold text-[#173b35]">Cómo aplicar un cambio</p>
            <ol className="space-y-2 text-xs leading-5 text-zinc-600">
              <li><strong className="text-zinc-800">1. Editá.</strong> El elemento queda pendiente y todavía no cambia el bot.</li>
              <li><strong className="text-zinc-800">2. Guardá borrador.</strong> El cambio queda protegido en la base de datos.</li>
              <li><strong className="text-zinc-800">3. Marcá revisado.</strong> La revisión se guarda inmediatamente.</li>
              <li><strong className="text-zinc-800">4. Publicá.</strong> Recién entonces el bot usa el contenido nuevo.</li>
            </ol>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="mb-3 flex items-center gap-2 text-sm font-bold text-[#173b35]"><History size={16} />Historial</p>
            <div className="space-y-2">{state?.history.filter((version) => version.status !== "draft").slice(0, 6).map((version) => <div key={version.id} className="flex items-center justify-between gap-2 rounded-xl bg-zinc-50 p-2.5"><div><p className="text-sm font-bold">Versión {version.version}</p><p className="text-[11px] text-zinc-500">{new Date(version.published_at || version.updated_at).toLocaleString("es-AR")}</p></div>{version.status === "archived" ? <button disabled={busy} onClick={() => restore(version.id)} className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs font-bold text-[#176b5a]">Restaurar</button> : <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-700"><Send size={12} />Activa</span>}</div>)}</div>
          </div>
        </aside>
      </div>
    </main>
  );
}
