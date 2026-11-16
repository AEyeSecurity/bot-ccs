"use client";

import { useState } from "react";
import { Pencil, Phone, ShieldCheck, UserCheck } from "lucide-react";
import type { Contact } from "@/lib/domain";

export type ContactFields = {
  patient_full_name: string;
  dni_number: string;
  insurance_name: string;
  insurance_member_number: string;
};

type Props = {
  contact: Contact | null | undefined;
  busy: boolean;
  onSave: (fields: ContactFields) => Promise<boolean>;
};

const inputClass = "w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-800 outline-none focus:border-[#176b5a]";

function fieldsFrom(contact: Contact | null | undefined): ContactFields {
  return {
    patient_full_name: contact?.patient_full_name || contact?.display_name || "",
    dni_number: contact?.dni_number || "",
    insurance_name: contact?.insurance_name || "",
    insurance_member_number: contact?.insurance_member_number || "",
  };
}

// Ficha editable: cualquier usuario puede corregir el nombre y cargar DNI y obra social.
export function PatientCard({ contact, busy, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ContactFields>(() => fieldsFrom(contact));
  const set = (key: keyof ContactFields) => (event: { target: { value: string } }) =>
    setForm((previous) => ({ ...previous, [key]: event.target.value }));

  function startEditing() {
    setForm(fieldsFrom(contact));
    setEditing(true);
  }

  async function submit(event: { preventDefault: () => void }) {
    event.preventDefault();
    if (await onSave(form)) setEditing(false);
  }

  const name = contact?.patient_full_name || contact?.display_name || "Sin nombre";

  return (
    <>
      <div className="mb-6 rounded-2xl bg-[#edf8f3] p-4">
        <div className="mb-3 flex items-start justify-between">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-white text-[#176b5a] shadow-sm"><UserCheck size={17} /></div>
          {!editing ? (
            <button type="button" onClick={startEditing} className="flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-xs font-semibold text-[#176b5a] shadow-sm" aria-label="Editar ficha del paciente">
              <Pencil size={12} />Editar
            </button>
          ) : null}
        </div>
        <p className="break-words font-bold text-zinc-800">{name}</p>
        <p className="mt-1 flex items-center gap-1 break-words text-zinc-500"><Phone size={13} />{contact?.whatsapp_number}</p>
      </div>

      {editing ? (
        <form onSubmit={submit} className="mb-6 space-y-3 rounded-xl border border-zinc-200 bg-white p-3">
          <label className="block text-xs text-zinc-500">Nombre del paciente
            <input className={inputClass} value={form.patient_full_name} onChange={set("patient_full_name")} maxLength={120} />
          </label>
          <label className="block text-xs text-zinc-500">DNI
            <input className={inputClass} value={form.dni_number} onChange={set("dni_number")} inputMode="numeric" maxLength={12} placeholder="Solo números" />
          </label>
          <label className="block text-xs text-zinc-500">Obra social
            <input className={inputClass} value={form.insurance_name} onChange={set("insurance_name")} maxLength={120} />
          </label>
          <label className="block text-xs text-zinc-500">N° de afiliado
            <input className={inputClass} value={form.insurance_member_number} onChange={set("insurance_member_number")} maxLength={60} />
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="flex-1 rounded-lg bg-[#176b5a] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">Guardar</button>
            <button type="button" disabled={busy} onClick={() => setEditing(false)} className="flex-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-600">Cancelar</button>
          </div>
        </form>
      ) : (
        <div className="mb-6 space-y-2 rounded-xl border border-zinc-200 bg-white p-3">
          <Row label="DNI" value={contact?.dni_number} />
          <Row label="Obra social" value={contact?.insurance_name} />
          <Row label="N° de afiliado" value={contact?.insurance_member_number} />
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-3">
          <p className="mb-1 text-xs text-zinc-500">Documento</p>
          <p className="flex items-center gap-1 font-semibold text-zinc-800"><ShieldCheck size={14} className="text-[#176b5a]" />{contact?.dni_received ? "Recibido" : "Pendiente"}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-3">
          <p className="mb-1 text-xs text-zinc-500">Cobertura</p>
          <p className="font-semibold text-zinc-800">{contact?.insurance_card_received ? "Recibida" : "Pendiente"}</p>
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="break-words text-right font-semibold text-zinc-800">{value || "—"}</span>
    </div>
  );
}
