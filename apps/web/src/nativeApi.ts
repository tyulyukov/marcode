import {
  __resetWsNativeApiForTests,
  createWsNativeApi,
  type MarCodeNativeApi,
} from "./wsNativeApi";

export type NativeApi = MarCodeNativeApi;

let cachedApi: MarCodeNativeApi | undefined;

export function readNativeApi(): MarCodeNativeApi | undefined {
  if (typeof window === "undefined") return undefined;
  if (cachedApi) return cachedApi;

  if ((window as unknown as Record<string, unknown>).nativeApi) {
    cachedApi = (window as unknown as Record<string, unknown>).nativeApi as MarCodeNativeApi;
    return cachedApi;
  }

  cachedApi = createWsNativeApi();
  return cachedApi;
}

export function ensureNativeApi(): MarCodeNativeApi {
  const api = readNativeApi();
  if (!api) {
    throw new Error("Native API not found");
  }
  return api;
}

export async function __resetNativeApiForTests() {
  cachedApi = undefined;
  await __resetWsNativeApiForTests();
}
