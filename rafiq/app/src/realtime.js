import { wsUrl } from './api';

let socket = null;
let onPacket = null;
let shouldRun = false;
let retryTimer = null;
let heartbeatTimer = null;
let retryDelay = 1000;

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function scheduleRetry() {
  if (!shouldRun || retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    open();
  }, retryDelay);
  retryDelay = Math.min(retryDelay * 2, 20000);
}

function open() {
  if (!shouldRun) return;
  try {
    socket?.close();
  } catch {
    /* ignore */
  }

  let ws;
  try {
    ws = new WebSocket(wsUrl());
  } catch {
    scheduleRetry();
    return;
  }
  socket = ws;

  ws.onopen = () => {
    retryDelay = 1000;
  };
  ws.onmessage = (event) => {
    let packet;
    try {
      packet = JSON.parse(event.data);
    } catch {
      return;
    }
    onPacket?.(packet);
  };
  ws.onerror = () => {
    /* close will follow */
  };
  ws.onclose = () => {
    socket = null;
    stopHeartbeat();
    scheduleRetry();
  };

  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (socket?.readyState === 1) socket.send(JSON.stringify({ t: 'ping' }));
  }, 25000);
}

export function connectRealtime(handler) {
  onPacket = handler;
  shouldRun = true;
  retryDelay = 1000;
  open();
}

export function disconnectRealtime() {
  shouldRun = false;
  stopHeartbeat();
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  try {
    socket?.close();
  } catch {
    /* ignore */
  }
  socket = null;
}

export function isSocketOpen() {
  return socket?.readyState === 1;
}

export function sendEvent(packet) {
  if (socket?.readyState !== 1) return false;
  try {
    socket.send(JSON.stringify(packet));
    return true;
  } catch {
    return false;
  }
}
