import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let api: typeof import("./api").api;

beforeAll(async () => {
  vi.stubGlobal("window", { location: { search: "" } });
  ({ api } = await import("./api"));
});

afterAll(() => vi.unstubAllGlobals());

function okResponse(data: unknown): Response {
  return { ok: true, json: async () => ({ ok: true, data }) } as Response;
}

describe("GET 在途请求合并", () => {
  it("同地址并发只请求一次，完成后不缓存", async () => {
    let release!: (response: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { release = resolve; }));
    vi.stubGlobal("fetch", fetchMock);

    const first = api.gold();
    const second = api.gold();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    release(okResponse({ gold: null }));
    await expect(first).resolves.toEqual({ gold: null });
    await expect(second).resolves.toEqual({ gold: null });

    fetchMock.mockResolvedValue(okResponse({ gold: null }));
    await api.gold();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("失败后清除在途状态，允许后续重试", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: "boom" }) } as Response)
      .mockResolvedValueOnce(okResponse({ gold: null }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.gold()).rejects.toThrow("boom");
    await expect(api.gold()).resolves.toEqual({ gold: null });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
