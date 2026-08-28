import { AsyncLocalStorage } from "node:async_hooks";

type Store = { requestId: string };

const als = new AsyncLocalStorage<Store>();

export function getRequestId(): string {
  return als.getStore()?.requestId ?? "";
}

export function runWithRequestContext<T>(requestId: string, fn: () => T): T {
  return als.run({ requestId }, fn);
}
