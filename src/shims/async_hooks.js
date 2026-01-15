// src/shims/async_hooks.js
export class AsyncLocalStorage {
  // A minimal stub just so imports don’t crash
  constructor() {}
  run(store, callback) {
    return callback();
  }
  getStore() {
    return undefined;
  }
  enterWith(store) {}
}
