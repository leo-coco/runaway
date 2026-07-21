/**
 * This jsdom setup ships no localStorage, so zustand's `persist` binds an
 * undefined storage at import time and then throws on the first write. Import
 * this module *before* anything that pulls in `@/store` — ES modules evaluate in
 * import order, so the global is in place by the time the store is created.
 */
const map = new Map<string, string>();

const storage: Storage = {
  get length() {
    return map.size;
  },
  clear: () => map.clear(),
  getItem: (k) => map.get(k) ?? null,
  key: (i) => [...map.keys()][i] ?? null,
  removeItem: (k) => void map.delete(k),
  setItem: (k, v) => void map.set(k, String(v)),
};

Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
