import { canAccessAdminPanels } from "@/lib/auth";
import type { Operator } from "@/lib/domain";

function operator(overrides: Partial<Operator> = {}): Operator {
  return {
    id: "op-1",
    auth_user_id: null,
    name: "Test",
    email: "admin@bot-ccs.local",
    role: "admin",
    is_active: true,
    ...overrides,
  };
}

const original = process.env.BOT_CCS_ADMIN_USERS;

afterEach(() => {
  if (original === undefined) delete process.env.BOT_CCS_ADMIN_USERS;
  else process.env.BOT_CCS_ADMIN_USERS = original;
});

describe("canAccessAdminPanels", () => {
  test("permite a los admins listados por defecto", () => {
    expect(canAccessAdminPanels(operator({ email: "admin@bot-ccs.local" }))).toBe(true);
    expect(canAccessAdminPanels(operator({ email: "admindev@bot-ccs.local" }))).toBe(true);
  });

  test("rechaza a un admin no listado", () => {
    expect(canAccessAdminPanels(operator({ email: "otroadmin@bot-ccs.local" }))).toBe(false);
  });

  test("rechaza a un operador aunque tenga username de admin", () => {
    expect(canAccessAdminPanels(operator({ role: "operator" }))).toBe(false);
  });

  test("respeta la lista configurada por env", () => {
    process.env.BOT_CCS_ADMIN_USERS = "foo,bar";
    expect(canAccessAdminPanels(operator({ email: "foo@bot-ccs.local" }))).toBe(true);
    expect(canAccessAdminPanels(operator({ email: "admin@bot-ccs.local" }))).toBe(false);
  });
});
