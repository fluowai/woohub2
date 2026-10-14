import { describe, it, expect } from "vitest";
import { normalizePhone, phoneFromJid, phoneDigits, samePhone } from "@/lib/phone";

describe("phone helpers", () => {
    it("strips anything that is not a digit", () => {
        expect(phoneDigits("+55 (47) 9270-1014")).toBe("554792701014");
        expect(phoneDigits(null)).toBe("");
    });

    it("normalizes DDI 55 away so the same number compares equal", () => {
        expect(normalizePhone("554792701014")).toBe("4792701014");
        expect(normalizePhone("5511999999999")).toBe("11999999999");
        expect(normalizePhone("(47) 9270-1014")).toBe("4792701014");
        expect(normalizePhone("4792701014")).toBe("4792701014");
    });

    it("keeps numbers that are not Brazilian mobiles untouched", () => {
        expect(normalizePhone("12345")).toBe("12345");
        expect(normalizePhone("555555")).toBe("555555");
    });

    it("reads the number out of a WhatsApp phone JID", () => {
        expect(phoneFromJid("554792701014:11@s.whatsapp.net")).toBe("4792701014");
        expect(phoneFromJid("4792701014@s.whatsapp.net")).toBe("4792701014");
    });

    it("refuses to read a number from a LID JID (not a phone)", () => {
        expect(phoneFromJid("126126630420639:11@lid")).toBeNull();
        expect(phoneFromJid(null)).toBeNull();
    });

    it("compares the same number written in different ways", () => {
        expect(samePhone("554792701014", "4792701014")).toBe(true);
        expect(samePhone("+55 47 9270-1014", "4792701014")).toBe(true);
        expect(samePhone("554792701014", "(47) 9270-1014")).toBe(true);
    });

    it("detects a different number", () => {
        expect(samePhone("4792701014", "11999999999")).toBe(false);
        expect(samePhone("4792701014", "5511999999999")).toBe(false);
    });

    it("never matches an empty side", () => {
        expect(samePhone("", "4792701014")).toBe(false);
        expect(samePhone(null, null)).toBe(false);
        expect(samePhone(undefined, "4792701014")).toBe(false);
    });

    it("compares Brazilian numbers with and without the 9th digit as equivalent", () => {
        expect(samePhone("48988003260", "4888003260")).toBe(true);
        expect(samePhone("5548988003260", "554888003260")).toBe(true);
        expect(samePhone("+55 (48) 99113-8937", "4891138937")).toBe(true);
    });
});
