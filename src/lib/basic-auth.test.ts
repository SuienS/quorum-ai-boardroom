// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isAuthorized } from "./basic-auth";

const header = (credentials: string) =>
  `Basic ${btoa(String.fromCharCode(...new TextEncoder().encode(credentials)))}`;

describe("basic auth", () => {
  it("accepts the exact credentials", async () => {
    expect(await isAuthorized(header("board:s3cret"), "board:s3cret")).toBe(true);
  });

  it("supports non-ASCII passwords", async () => {
    expect(await isAuthorized(header("board:pässwörd"), "board:pässwörd")).toBe(true);
  });

  it("rejects wrong, missing or malformed credentials", async () => {
    expect(await isAuthorized(header("board:wrong"), "board:s3cret")).toBe(false);
    expect(await isAuthorized(header("board:s3cret "), "board:s3cret")).toBe(false);
    expect(await isAuthorized(null, "board:s3cret")).toBe(false);
    expect(await isAuthorized("Bearer abc", "board:s3cret")).toBe(false);
    expect(await isAuthorized("Basic !!!", "board:s3cret")).toBe(false);
  });
});
