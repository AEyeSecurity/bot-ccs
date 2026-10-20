import initialCatalog from "../../data/bot-catalog-initial.json";
import { managedCatalogSchema } from "@/lib/managed-catalog";
import { buildVcard } from "@/lib/vcards";

describe("catalog vCards", () => {
  test("uses the published text phones and follows edits without a parallel phone field", () => {
    const catalog = managedCatalogSchema.parse(initialCatalog);
    catalog.direct.laboratory.body = "Nuevo teléfono +5491112345678";
    const card = buildVcard(catalog, "ccs-laboratorio-clinico.vcf");
    expect(card).toContain("TEL;TYPE=CELL:+5491112345678\r\n");
    expect(card).toContain("VERSION:3.0\r\n");
  });
  test("rejects arbitrary filenames and unavailable services", () => {
    const catalog = managedCatalogSchema.parse(initialCatalog);
    expect(buildVcard(catalog, "../secret")).toBeNull();
    expect(buildVcard(catalog, "constructor")).toBeNull();
    catalog.direct.laboratory.available = false;
    expect(buildVcard(catalog, "ccs-laboratorio-clinico.vcf")).toBeNull();
  });
});
