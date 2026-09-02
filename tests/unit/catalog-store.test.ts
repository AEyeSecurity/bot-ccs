import initialCatalog from "../../data/bot-catalog-initial.json";
import { getPublishedCatalog, setPublishedCatalogLoaderForTests } from "@/lib/catalog-store";

const holder = { calls: 0, fail: false, hasPublished: true };

function publishedRows() {
  return [{
    id: "catalog-1",
    version: 1,
    revision: 1,
    status: "published",
    payload: initialCatalog,
    published_at: "2026-08-01T12:00:00.000Z",
  }];
}

beforeEach(() => {
  holder.calls = 0;
  holder.fail = false;
  holder.hasPublished = true;
  setPublishedCatalogLoaderForTests(async () => {
    holder.calls += 1;
    if (holder.fail) throw Object.assign(new Error("database unavailable"), { status: 503 });
    if (!holder.hasPublished) throw Object.assign(new Error("No existe un catálogo publicado"), { status: 503 });
    return publishedRows()[0];
  });
});

describe("published catalog cache", () => {
  test("shares one database load between concurrent requests", async () => {
    const versions = await Promise.all(Array.from({ length: 20 }, () => getPublishedCatalog()));
    expect(holder.calls).toBe(1);
    expect(versions.every((version) => version.id === "catalog-1")).toBe(true);
  });

  test("continues using the already loaded published version during a database outage", async () => {
    await getPublishedCatalog();
    holder.fail = true;
    await expect(getPublishedCatalog()).resolves.toMatchObject({ id: "catalog-1" });
    expect(holder.calls).toBe(1);
  });

  test("fails with controlled 503 when no published version can be loaded", async () => {
    holder.hasPublished = false;
    await expect(getPublishedCatalog()).rejects.toMatchObject({ status: 503 });
  });
});
