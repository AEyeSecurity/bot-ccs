const health = vi.hoisted(() => ({ fail: false }));
vi.mock("@/lib/supabase", () => ({
  createAdminSupabaseClient: () => ({ from: () => ({ select: () => ({ eq: () => ({
    single: async () => ({ error: health.fail ? new Error("private backend detail") : null }),
  }) }) }) }),
}));

describe("readiness", () => {
  test("is available when Supabase and catalog are ready", async () => {
    health.fail = false;
    const { GET } = await import("@/app/api/health/ready/route");
    expect((await GET()).status).toBe(200);
  });
  test("reports dependency failure without disclosing backend details", async () => {
    health.fail = true;
    const { GET } = await import("@/app/api/health/ready/route");
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false });
  });
});
