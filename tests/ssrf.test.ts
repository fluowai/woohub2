import { describe, it, expect } from "vitest";
import { isPrivateAddress, assertSafeUrl, SsrfError } from "@/lib/security/ssrf";

describe("SSRF protection", () => {
    it("blocks loopback addresses via isPrivateAddress", () => {
        expect(isPrivateAddress("127.0.0.1")).toBe(true);
        expect(isPrivateAddress("::1")).toBe(true);
        expect(isPrivateAddress("localhost")).toBe(true);
        expect(isPrivateAddress("0.0.0.0")).toBe(true);
    });

    it("blocks link-local and metadata endpoints", () => {
        expect(isPrivateAddress("169.254.169.254")).toBe(true);
    });

    it("assertSafeUrl rejects non-http schemes", async () => {
        await expect(assertSafeUrl("file:///etc/passwd")).rejects.toThrow(SsrfError);
        await expect(assertSafeUrl("ftp://internal")).rejects.toThrow(SsrfError);
    });

    it("assertSafeUrl blocks private hosts", async () => {
        await expect(assertSafeUrl("http://127.0.0.1/")).rejects.toThrow(SsrfError);
        await expect(assertSafeUrl("http://localhost/")).rejects.toThrow(SsrfError);
    });

    it("assertSafeUrl allows https public hosts", async () => {
        const url = await assertSafeUrl("https://example.com/");
        expect(url.hostname).toBe("example.com");
    });
});
