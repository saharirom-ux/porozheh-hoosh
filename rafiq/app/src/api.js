import AsyncStorage from '@react-native-async-storage/async-storage';

const SERVER_KEY = 'rafiq:server';
const TOKEN_KEY = 'rafiq:token';

let serverUrl = '';
let authToken = null;

export const hasServer = () => !!serverUrl;
export const getServerUrl = () => serverUrl;

export async function loadServer() {
  const stored = await AsyncStorage.getItem(SERVER_KEY);
  serverUrl = stored || '';
  return serverUrl;
}

export async function saveServer(url) {
  serverUrl = String(url || '').trim().replace(/\/+$/, '');
  if (serverUrl) await AsyncStorage.setItem(SERVER_KEY, serverUrl);
  else await AsyncStorage.removeItem(SERVER_KEY);
  return serverUrl;
}

export async function loadToken() {
  authToken = await AsyncStorage.getItem(TOKEN_KEY);
  return authToken;
}

export async function saveToken(token) {
  authToken = token || null;
  if (authToken) await AsyncStorage.setItem(TOKEN_KEY, authToken);
  else await AsyncStorage.removeItem(TOKEN_KEY);
}

export const getToken = () => authToken;

export async function request(path, { method = 'GET', body } = {}) {
  if (!serverUrl) throw new Error('آدرس سرور هنوز تنظیم نشده است');
  const res = await fetch(serverUrl + '/api' + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (!res.ok) {
    const err = new Error(data.error || `خطای سرور (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const wsUrl = () => `${serverUrl.replace(/^http/, 'ws')}/ws?token=${encodeURIComponent(authToken || '')}`;

/** Find people by username or display name. */
export async function searchUsers(query) {
  const { users } = await request(`/users/search?q=${encodeURIComponent(query)}`);
  return users;
}

/** Download an encrypted file's bytes as base64. */
export async function downloadFileBase64(id) {
  const res = await fetch(`${serverUrl}/api/files/${id}/base64`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'فایل در دسترس نیست');
  return data.dataBase64;
}
