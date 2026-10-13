import { z } from "zod";

export const PASSWORD_MIN_LENGTH = 8;

const PASSWORD_REQUIREMENTS =
  "A senha deve ter no mínimo 8 caracteres, com letras maiúsculas, minúsculas e números";

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, PASSWORD_REQUIREMENTS)
  .max(128)
  .regex(/[a-z]/, PASSWORD_REQUIREMENTS)
  .regex(/[A-Z]/, PASSWORD_REQUIREMENTS)
  .regex(/[0-9]/, PASSWORD_REQUIREMENTS);

export const passwordPolicyMessage = PASSWORD_REQUIREMENTS;

export function isStrongPassword(password: unknown): boolean {
  return passwordSchema.safeParse(password).success;
}
