import { describe, it, expect, vi } from "vitest";

describe("tenant schema validation", () => {
    it("accepts valid tenant data", async () => {
        const { z } = await import("zod");
        const schema = z.object({
            name: z.string().min(1).max(120),
            slug: z.string().min(2).max(40).regex(/^[a-z0-9-]+$/),
        });
        const result = schema.safeParse({ name: "Minha Empresa", slug: "minha-empresa" });
        expect(result.success).toBe(true);
    });

    it("rejects invalid slug", async () => {
        const { z } = await import("zod");
        const schema = z.object({
            slug: z.string().min(2).max(40).regex(/^[a-z0-9-]+$/),
        });
        const result = schema.safeParse({ slug: "Minha_Empresa" });
        expect(result.success).toBe(false);
    });
});

describe("plan schema validation", () => {
    it("accepts valid plan data", async () => {
        const { z } = await import("zod");
        const schema = z.object({
            code: z.string().min(2).max(40).regex(/^[a-z0-9-]+$/),
            name: z.string().min(1).max(80),
            priceCents: z.number().int().min(0),
            period: z.enum(["MONTHLY", "YEARLY", "ONE_TIME"]),
        });
        const result = schema.safeParse({ code: "pro-monthly", name: "Pro", priceCents: 9900, period: "MONTHLY" });
        expect(result.success).toBe(true);
    });
});
