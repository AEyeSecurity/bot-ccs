export type PasswordRule = {
  label: string;
  test: (value: string) => boolean;
};

export const PASSWORD_RULES: PasswordRule[] = [
  { label: "Mínimo 8 caracteres", test: (value) => value.length >= 8 },
  { label: "Al menos una minúscula", test: (value) => /[a-z]/.test(value) },
  { label: "Al menos una mayúscula", test: (value) => /[A-Z]/.test(value) },
  { label: "Al menos un número", test: (value) => /[0-9]/.test(value) },
];

export function isPasswordStrong(value: string) {
  return PASSWORD_RULES.every((rule) => rule.test(value));
}
