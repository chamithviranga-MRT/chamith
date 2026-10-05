import { describe, expect, it } from "vitest";
import { checkBasicAuth, safeEqual } from "@/lib/access";

const basic = (user: string, pass: string) => "Basic " + btoa(`${user}:${pass}`);

describe("optional access code", () => {
  it("is open when no code is configured", () => {
    expect(checkBasicAuth(null, undefined)).toBe(true);
    expect(checkBasicAuth(null, "")).toBe(true);
  });
  it("accepts the right password with any username", () => {
    expect(checkBasicAuth(basic("anyone", "s3cret"), "s3cret")).toBe(true);
    expect(checkBasicAuth(basic("", "s3cret"), "s3cret")).toBe(true);
  });
  it("keeps a colon inside the password intact", () => {
    expect(checkBasicAuth(basic("u", "pa:ss:word"), "pa:ss:word")).toBe(true);
  });
  it("rejects a wrong or missing password, other schemes and garbage", () => {
    expect(checkBasicAuth(basic("u", "nope"), "s3cret")).toBe(false);
    expect(checkBasicAuth(basic("u", "s3cret "), "s3cret")).toBe(false);
    expect(checkBasicAuth(null, "s3cret")).toBe(false);
    expect(checkBasicAuth("Bearer s3cret", "s3cret")).toBe(false);
    expect(checkBasicAuth("Basic !!!not-base64!!!", "s3cret")).toBe(false);
  });
  it("compares without short-circuiting on length or content", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });
});
