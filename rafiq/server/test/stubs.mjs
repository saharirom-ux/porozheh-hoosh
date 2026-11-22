// Node stubs for the Expo native modules the app imports.
//
// expo-secure-store keeps the chat keys in memory, standing in for the real
// device keystore. expo-crypto provides randomness and UUIDs.

import nodeCrypto from 'node:crypto';

const storage = new Map();

const secureStore = {
  getItemAsync: async (key) => (storage.has(key) ? storage.get(key) : null),
  setItemAsync: async (key, value) => {
    storage.set(key, value);
  },
  removeItemAsync: async (key) => {
    storage.delete(key);
  },
};

const expoCrypto = {
  getRandomBytes: (n) => new Uint8Array(nodeCrypto.randomBytes(n)),
  getRandomBytesAsync: async (n) => new Uint8Array(nodeCrypto.randomBytes(n)),
  randomUUID: () => nodeCrypto.randomUUID(),
  digestStringAsync: async (algo, data) => {
    const hash = nodeCrypto.createHash('sha256').update(data).digest('hex');
    return hash;
  },
};

// A test client imports the app's modules with a `?u=<name>` query to get a
// separate instance of each. The query has to travel with the app's own
// imports, otherwise two clients would share the same api module and so the
// same token.
function stampOf(context) {
  const match = /[?&]u=([^&]+)/.exec(context.parentURL || '');
  return match ? `?u=${match[1]}` : '';
}

export function resolve(specifier, context, nextResolve) {
  if (specifier === 'expo-secure-store') {
    return { url: `stub:expo-secure-store${stampOf(context)}`, shortCircuit: true };
  }
  if (specifier === 'expo-crypto') {
    return { url: `stub:expo-crypto${stampOf(context)}`, shortCircuit: true };
  }
  if (specifier === '@react-native-async-storage/async-storage') {
    return { url: `stub:async-storage${stampOf(context)}`, shortCircuit: true };
  }

  // The app is written for the bundler, so its own relative imports carry no
  // file extension. Node needs one. A `?u=` query has to stay at the end.
  if (specifier.startsWith('.')) {
    const [path, query] = specifier.split('?');
    if (!/\.[cm]?js$/.test(path)) {
      const withExt = `${path}.js${query ? `?${query}` : ''}`;
      try {
        return nextResolve(withExt, context);
      } catch {
        /* fall through to the plain resolution */
      }
    }
  }

  const resolved = nextResolve(specifier, context);

  // A test client imports the app's modules with a `?u=<name>` query to get a
  // separate instance of each. The query has to travel with the app's own
  // imports, otherwise two clients would share the same api module and so the
  // same token.
  const parent = context.parentURL || '';
  const stamp = /[?&]u=([^&]+)/.exec(parent);
  if (stamp && typeof resolved.url === 'string' && resolved.url.startsWith('file:') && !resolved.url.includes('u=')) {
    const url = new URL(resolved.url);
    url.searchParams.set('u', stamp[1]);
    return { ...resolved, url: url.href };
  }
  return resolved;
}

export function load(url, context, nextLoad) {
  if (url.startsWith('stub:expo-secure-store')) {
    // Each module instance gets its own map, standing in for the device
    // keystore of that particular friend.
    return {
      format: 'module',
      shortCircuit: true,
      source: `const store = new Map();
export const getItemAsync = async (key) => (store.has(key) ? store.get(key) : null);
export const setItemAsync = async (key, value) => { store.set(key, value); };
export const removeItemAsync = async (key) => { store.delete(key); };`,
    };
  }
  if (url.startsWith('stub:expo-crypto')) {
    return {
      format: 'module',
      shortCircuit: true,
      source: `import nodeCrypto from 'node:crypto';
export const getRandomBytes = (n) => new Uint8Array(nodeCrypto.randomBytes(n));
export const getRandomBytesAsync = async (n) => new Uint8Array(nodeCrypto.randomBytes(n));
export const randomUUID = () => nodeCrypto.randomUUID();
export const digestStringAsync = async (algo, data) => nodeCrypto.createHash('sha256').update(data).digest('hex');`,
    };
  }
  if (url.startsWith('stub:async-storage')) {
    // Each module instance gets its own map, so two test clients never share
    // a stored token.
    return {
      format: 'module',
      shortCircuit: true,
      source: `const store = new Map();
export const getItem = async (key) => (store.has(key) ? store.get(key) : null);
export const setItem = async (key, value) => { store.set(key, value); };
export const removeItem = async (key) => { store.delete(key); };
export const clear = async () => { store.clear(); };
export default { getItem, setItem, removeItem, clear };`,
    };
  }
  return nextLoad(url, context);
}
