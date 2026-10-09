import { describe, expect, it } from "vitest";
import { isComposeVersionSupported, parseComposeVersion } from "../../src/docker.js";
import { parseComposePortOutput, quoteIdent } from "../../src/postgres.js";

describe("Docker Compose version gating", () => {
  it("parses plain and v-prefixed versions", () => {
    expect(parseComposeVersion("2.38.2")).toEqual([2, 38, 2]);
    expect(parseComposeVersion("v2.17.0\n")).toEqual([2, 17, 0]);
    expect(parseComposeVersion("5.0.0")).toEqual([5, 0, 0]);
    expect(parseComposeVersion("garbage")).toBeUndefined();
    expect(parseComposeVersion("")).toBeUndefined();
  });

  it("requires >= 2.17.0 (--wait-timeout) and treats unparsable output as unsupported", () => {
    expect(isComposeVersionSupported("2.17.0")).toBe(true);
    expect(isComposeVersionSupported("2.17.1")).toBe(true);
    expect(isComposeVersionSupported("2.38.2")).toBe(true);
    expect(isComposeVersionSupported("v5.0.0")).toBe(true);
    expect(isComposeVersionSupported("2.16.9")).toBe(false);
    expect(isComposeVersionSupported("1.29.2")).toBe(false);
    expect(isComposeVersionSupported("not-a-version")).toBe(false);
  });
});

describe("parseComposePortOutput", () => {
  it("extracts the published port from `docker compose port` output", () => {
    expect(parseComposePortOutput("127.0.0.1:49153\n")).toBe(49153);
    expect(parseComposePortOutput("0.0.0.0:32768")).toBe(32768);
    expect(parseComposePortOutput("[::]:32770\n")).toBe(32770);
  });

  it("fails closed on anything it cannot parse", () => {
    expect(() => parseComposePortOutput("")).toThrow();
    expect(() => parseComposePortOutput("no port here")).toThrow();
    expect(() => parseComposePortOutput("127.0.0.1:0")).toThrow();
    expect(() => parseComposePortOutput("127.0.0.1:99999")).toThrow();
  });
});

describe("quoteIdent", () => {
  it("quotes safe identifiers", () => {
    expect(quoteIdent("coderlix_it")).toBe('"coderlix_it"');
  });

  it("rejects anything that could alter the statement", () => {
    expect(() => quoteIdent('x"; DROP DATABASE postgres; --')).toThrow();
    expect(() => quoteIdent("has space")).toThrow();
    expect(() => quoteIdent("1leading_digit")).toThrow();
    expect(() => quoteIdent("")).toThrow();
  });
});
