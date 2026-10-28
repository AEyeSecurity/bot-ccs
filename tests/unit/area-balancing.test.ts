import { createFakeSupabaseClient } from "../helpers/fake-supabase";
import { getPublishedCatalog } from "@/lib/catalog-store";
import { buildAreaPatch, loadAreaOccupation, pickLeastBusyArea } from "@/lib/areas";

const holder = vi.hoisted(() => ({
  client: null as unknown as ReturnType<typeof createFakeSupabaseClient>,
}));

vi.mock("@/lib/supabase", () => ({ createAdminSupabaseClient: () => holder.client }));

const PASAJE = "area-pasaje";
const ANEXO = "area-anexo";

beforeAll(async () => {
  await getPublishedCatalog();
});

function seed(
  rows: Array<{ id: string; area_ids: string[]; status: string; resolution_status: string }>,
  operators: Array<{ id: string; is_active: boolean; last_seen_at: string | null }> = [],
  operatorAreas: Array<{ operator_id: string; area_id: string }> = [],
) {
  holder.client = createFakeSupabaseClient({
    areas: [
      { id: PASAJE, name: "Pasaje", is_active: true },
      { id: ANEXO, name: "Anexo", is_active: true },
    ],
    area_rules: [
      { area_id: PASAJE, intent_key: "ATENCION_MEDICA_TRAUMATOLOGIA", response_group_id: null, is_active: true },
      { area_id: ANEXO, intent_key: "ATENCION_MEDICA_TRAUMATOLOGIA", response_group_id: null, is_active: true },
    ],
    conversations: rows,
    operators,
    operator_areas: operatorAreas,
  });
}

describe("pickLeastBusyArea", () => {
  test("elige la de menor ocupación", () => {
    const occupation = new Map<string, number>([[PASAJE, 2], [ANEXO, 1]]);
    expect(pickLeastBusyArea([PASAJE, ANEXO], occupation, () => 0.5)).toBe(ANEXO);
  });

  test("en empate elige según el generador aleatorio", () => {
    const occupation = new Map<string, number>([[PASAJE, 1], [ANEXO, 1]]);
    expect(pickLeastBusyArea([PASAJE, ANEXO], occupation, () => 0)).toBe(PASAJE);
    expect(pickLeastBusyArea([PASAJE, ANEXO], occupation, () => 0.99)).toBe(ANEXO);
  });
});

describe("loadAreaOccupation", () => {
  test("cuenta solo conversaciones abiertas con resolución abierta", async () => {
    seed([
      { id: "c1", area_ids: [PASAJE], status: "human_takeover", resolution_status: "abierta" },
      { id: "c2", area_ids: [PASAJE, ANEXO], status: "waiting_operator", resolution_status: "abierta" },
      { id: "c3", area_ids: [ANEXO], status: "closed", resolution_status: "abierta" },
      { id: "c4", area_ids: [ANEXO], status: "human_takeover", resolution_status: "pendiente" },
    ]);
    const occupation = await loadAreaOccupation(holder.client, [PASAJE, ANEXO]);
    expect(occupation.get(PASAJE)).toBe(2);
    expect(occupation.get(ANEXO)).toBe(1);
  });
});

describe("buildAreaPatch", () => {
  test("con varias áreas deriva a la menos ocupada", async () => {
    seed([
      { id: "c1", area_ids: [PASAJE], status: "human_takeover", resolution_status: "abierta" },
      { id: "c2", area_ids: [PASAJE], status: "waiting_operator", resolution_status: "abierta" },
    ]);
    const patch = await buildAreaPatch(holder.client, "ATENCION_MEDICA_TRAUMATOLOGIA", null);
    expect(patch.area_ids).toEqual([ANEXO]);
  });

  test("prioriza el área con operador conectado aunque esté más ocupada", async () => {
    const now = new Date().toISOString();
    seed(
      [{ id: "c1", area_ids: [PASAJE], status: "human_takeover", resolution_status: "abierta" }],
      [{ id: "op-anexo", is_active: true, last_seen_at: now }],
      [{ operator_id: "op-anexo", area_id: ANEXO }],
    );
    const patch = await buildAreaPatch(holder.client, "ATENCION_MEDICA_TRAUMATOLOGIA", null);
    expect(patch.area_ids).toEqual([ANEXO]);
  });

  test("operador conectado hace más de 90 s no cuenta como conectado", async () => {
    const stale = new Date(Date.now() - 100_000).toISOString();
    seed(
      [{ id: "c1", area_ids: [ANEXO], status: "human_takeover", resolution_status: "abierta" }],
      [{ id: "op-anexo", is_active: true, last_seen_at: stale }],
      [{ operator_id: "op-anexo", area_id: ANEXO }],
    );
    const patch = await buildAreaPatch(holder.client, "ATENCION_MEDICA_TRAUMATOLOGIA", null);
    expect(patch.area_ids).toEqual([PASAJE]);
  });

  test("entre áreas conectadas elige la menos ocupada", async () => {
    const now = new Date().toISOString();
    seed(
      [
        { id: "c1", area_ids: [PASAJE], status: "human_takeover", resolution_status: "abierta" },
        { id: "c2", area_ids: [PASAJE], status: "waiting_operator", resolution_status: "abierta" },
        { id: "c3", area_ids: [ANEXO], status: "human_takeover", resolution_status: "abierta" },
      ],
      [
        { id: "op-pasaje", is_active: true, last_seen_at: now },
        { id: "op-anexo", is_active: true, last_seen_at: now },
      ],
      [
        { operator_id: "op-pasaje", area_id: PASAJE },
        { operator_id: "op-anexo", area_id: ANEXO },
      ],
    );
    const patch = await buildAreaPatch(holder.client, "ATENCION_MEDICA_TRAUMATOLOGIA", null);
    expect(patch.area_ids).toEqual([ANEXO]);
  });
});
