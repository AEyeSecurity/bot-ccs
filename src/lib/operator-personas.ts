import { z } from "zod";

export const personasSchema = z.array(z.object({
  first_name: z.string().trim().min(1, "Ingresá el nombre de cada persona").max(100),
  last_name: z.string().trim().min(1, "Ingresá el apellido de cada persona").max(100),
})).max(50, "Se permiten hasta 50 personas por cuenta");

export type OperatorPersona = z.infer<typeof personasSchema>[number];
