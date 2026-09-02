import crypto from "crypto";

type Filter =
  | { type: "eq"; field: string; value: unknown }
  | { type: "neq"; field: string; value: unknown }
  | { type: "in"; field: string; values: unknown[] }
  | { type: "gt"; field: string; value: unknown }
  | { type: "lte"; field: string; value: unknown };

type Operation =
  | { type: "select" }
  | { type: "insert"; payload: Record<string, unknown>[] }
  | { type: "update"; patch: Record<string, unknown> }
  | { type: "upsert"; payload: Record<string, unknown>; onConflict: string };

type Tables = Record<string, Array<Record<string, unknown>>>;

type QueryResult = { data: unknown; error: { message: string } | null };

function compareValues(left: unknown, right: unknown) {
  if (left instanceof Date && right instanceof Date) return left.getTime() - right.getTime();
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left ?? "").localeCompare(String(right ?? ""));
}

function cloneRow<T extends Record<string, unknown>>(row: T): T {
  return JSON.parse(JSON.stringify(row));
}

class FakeQuery implements PromiseLike<QueryResult> {
  private filters: Filter[] = [];
  private limitCount: number | null = null;
  private orderField: string | null = null;
  private ascending = true;
  private operation: Operation = { type: "select" };
  private singleMode: "none" | "single" | "maybeSingle" = "none";

  constructor(
    private readonly tables: Tables,
    private readonly tableName: string,
  ) {}

  select(fields?: string) {
    void fields;
    return this;
  }

  insert(payload: Record<string, unknown> | Array<Record<string, unknown>>) {
    const rows = Array.isArray(payload) ? payload : [payload];
    this.operation = { type: "insert", payload: rows };
    return this;
  }

  update(patch: Record<string, unknown>) {
    this.operation = { type: "update", patch };
    return this;
  }

  upsert(payload: Record<string, unknown>, options: { onConflict: string }) {
    this.operation = { type: "upsert", payload, onConflict: options.onConflict };
    return this;
  }

  eq(field: string, value: unknown) {
    this.filters.push({ type: "eq", field, value });
    return this;
  }

  neq(field: string, value: unknown) {
    this.filters.push({ type: "neq", field, value });
    return this;
  }

  in(field: string, values: unknown[]) {
    this.filters.push({ type: "in", field, values });
    return this;
  }

  lte(field: string, value: unknown) {
    this.filters.push({ type: "lte", field, value });
    return this;
  }

  gt(field: string, value: unknown) {
    this.filters.push({ type: "gt", field, value });
    return this;
  }

  order(field: string, options?: { ascending?: boolean }) {
    this.orderField = field;
    this.ascending = options?.ascending !== false;
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  single() {
    this.singleMode = "single";
    return this.execute();
  }

  maybeSingle() {
    this.singleMode = "maybeSingle";
    return this.execute();
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private ensureTable() {
    this.tables[this.tableName] ||= [];
    return this.tables[this.tableName];
  }

  private applyFilters(rows: Array<Record<string, unknown>>) {
    return rows.filter((row) =>
      this.filters.every((filter) => {
        const current = row[filter.field];
        switch (filter.type) {
          case "eq":
            return current === filter.value;
          case "neq":
            return current !== filter.value;
          case "in":
            return filter.values.includes(current);
          case "lte":
            return compareValues(current, filter.value) <= 0;
          case "gt":
            return compareValues(current, filter.value) > 0;
          default:
            return false;
        }
      }),
    );
  }

  private finalizeRows(rows: Array<Record<string, unknown>>) {
    let result = [...rows];

    if (this.orderField) {
      const field = this.orderField;
      result.sort((left, right) => {
        const value = compareValues(left[field], right[field]);
        return this.ascending ? value : value * -1;
      });
    }

    if (typeof this.limitCount === "number") {
      result = result.slice(0, this.limitCount);
    }

    return result.map((row) => cloneRow(row));
  }

  private buildReturn(rows: Array<Record<string, unknown>>): QueryResult {
    const finalized = this.finalizeRows(rows);
    if (this.singleMode === "single") {
      if (!finalized.length) {
        return { data: null, error: { message: `No rows found in ${this.tableName}` } };
      }
      return { data: finalized[0], error: null };
    }

    if (this.singleMode === "maybeSingle") {
      return { data: finalized[0] || null, error: null };
    }

    return { data: finalized, error: null };
  }

  private async execute(): Promise<QueryResult> {
    const table = this.ensureTable();
    const operation = this.operation;

    switch (operation.type) {
      case "select": {
        return this.buildReturn(this.applyFilters(table));
      }
      case "insert": {
        const inserted = operation.payload.map((payload) => {
          const row = {
            id: payload.id || crypto.randomUUID(),
            ...payload,
          };
          table.push(row);
          return row;
        });
        return this.buildReturn(inserted);
      }
      case "upsert": {
        const field = operation.onConflict;
        const value = operation.payload[field];
        const existing = table.find((row) => row[field] === value);
        if (existing) {
          Object.assign(existing, operation.payload);
          return this.buildReturn([existing]);
        }
        const row = {
          id: operation.payload.id || crypto.randomUUID(),
          ...operation.payload,
        };
        table.push(row);
        return this.buildReturn([row]);
      }
      case "update": {
        const rows = this.applyFilters(table);
        rows.forEach((row) => Object.assign(row, operation.patch));
        return this.buildReturn(rows);
      }
      default:
        return { data: null, error: { message: `Unsupported operation on ${this.tableName}` } };
    }
  }
}

export class FakeSupabaseClient {
  public readonly tables: Tables;
  public readonly auth = {
    getUser: async () => ({ data: { user: null }, error: null }),
  };

  constructor(initial?: Partial<Tables>) {
    this.tables = {
      contacts: [],
      conversations: [],
      cases: [],
      messages: [],
      conversation_events: [],
      twilio_callbacks: [],
      operators: [],
      ...initial,
    };
  }

  from(tableName: string) {
    return new FakeQuery(this.tables, tableName);
  }

  async rpc(name: string, args: Record<string, unknown> = {}): Promise<QueryResult> {
    if (name === "publish_bot_catalog") {
      const draft = this.table("bot_catalog_versions").find(
        (row) => row.id === args.p_draft_id && row.status === "draft",
      );
      if (!draft) return { data: null, error: { message: "Draft catalog not found" } };
      if (draft.revision !== args.p_expected_revision) {
        return { data: null, error: { message: "Catalog revision conflict" } };
      }
      const versions = this.table("bot_catalog_versions");
      const nextVersion = Math.max(0, ...versions.map((row) => Number(row.version || 0))) + 1;
      versions.filter((row) => row.status === "published").forEach((row) => { row.status = "archived"; });
      Object.assign(draft, {
        status: "published",
        version: nextVersion,
        revision: Number(draft.revision) + 1,
        published_by: args.p_actor,
        published_at: new Date().toISOString(),
      });
      return { data: [cloneRow(draft)], error: null };
    }
    if (name === "restore_bot_catalog") {
      const versions = this.table("bot_catalog_versions");
      const source = versions.find((row) => row.id === args.p_version_id && ["published", "archived"].includes(String(row.status)));
      if (!source) return { data: null, error: { message: "Catalog version not found" } };
      this.tables.bot_catalog_versions = versions.filter((row) => row.status !== "draft");
      const draft = {
        id: crypto.randomUUID(), version: 0, status: "draft", payload: cloneRow(source).payload,
        revision: 1, created_by: args.p_actor, updated_by: args.p_actor,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(), published_at: null,
      };
      this.tables.bot_catalog_versions.push(draft);
      return { data: [cloneRow(draft)], error: null };
    }
    return { data: null, error: { message: `Unsupported RPC ${name}` } };
  }

  table<T extends Record<string, unknown> = Record<string, unknown>>(name: string) {
    this.tables[name] ||= [];
    return this.tables[name] as T[];
  }
}

export function createFakeSupabaseClient(initial?: Partial<Tables>) {
  return new FakeSupabaseClient(initial);
}
