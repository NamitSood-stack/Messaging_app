const state = {
  me: null,
  instanceId: null,         // changes whenever the server restarts
  socket: null,
  conversations: new Map(), // id -> { id, otherUser, lastMessage, unread }
  threads: new Map(),       // id -> { messages, hasMore, loaded, loading }
  activeId: null,
  needsSync: false          // initial fetch failed; sync once the socket connects
};

const $ = (selector) => document.querySelector(selector);

// ---------- helpers ----------

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// crypto.randomUUID only exists on secure origins (https / localhost)
function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const AVATAR_COLORS = ['#4f5ef7', '#f2994a', '#27ae60', '#9b51e0', '#eb5757', '#2d9cdb', '#e2609b', '#219653'];

function setAvatar(el, name) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  el.textContent = name.charAt(0).toUpperCase();
  el.style.background = AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const DAY_MS = 24 * 60 * 60 * 1000;

const formatTime = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function formatDay(iso) {
  const diff = (startOfDay(new Date()) - startOfDay(new Date(iso))) / DAY_MS;
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatListTime(iso) {
  const day = formatDay(iso);
  return day === 'Today' ? formatTime(iso) : day;
}

function showBanner(text) {
  $('#connection-banner').textContent = text;
  $('#connection-banner').hidden = false;
}

const hideBanner = () => ($('#connection-banner').hidden = true);

// ---------- local cache ----------
// Chats, messages and unread counts are saved in localStorage per user, so
// they show up instantly on reload, before the server has answered.
// The key includes the server's instanceId: after a restart every id on the
// server is new, so caches from an earlier run are thrown away.

const CACHE_PREFIX = 'chat-cache:';
const MAX_CACHED_MESSAGES = 200; // per conversation

const cacheKey = () => `${CACHE_PREFIX}${state.instanceId}:${state.me.id}`;

function storageGet(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function storageSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or blocked: the app still works, just without the cache
  }
}

function storageRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch {}
}

function dropStaleCaches() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(CACHE_PREFIX) && !key.startsWith(`${CACHE_PREFIX}${state.instanceId}:`)) {
        localStorage.removeItem(key);
      }
    }
  } catch {}
}

function loadCache() {
  const data = storageGet(cacheKey());
  if (!data) return;
  for (const conv of data.conversations || []) state.conversations.set(conv.id, conv);
  for (const [id, messages] of Object.entries(data.threads || {})) {
    state.threads.set(id, { messages, hasMore: false, loaded: false, loading: false });
  }
}

let saveTimer;
function saveCache() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (!state.me) return;
    const threads = {};
    for (const [id, thread] of state.threads) {
      const sent = thread.messages.filter((m) => m.id); // unsent ones aren't cached
      if (sent.length) threads[id] = sent.slice(-MAX_CACHED_MESSAGES);
    }
    storageSet(cacheKey(), { conversations: [...state.conversations.values()], threads });
  }, 300);
}

function clearCache() {
  clearTimeout(saveTimer);
  storageRemove(cacheKey());
}

// ---------- auth ----------

function showLanding() {
  $('#chat-view').hidden = true;
  $('#auth-view').hidden = true;
  $('#landing-view').hidden = false;
}

function showAuth() {
  $('#chat-view').hidden = true;
  $('#landing-view').hidden = true;
  $('#auth-view').hidden = false;
  $('#auth-form').username.focus();
}

document.querySelectorAll('[data-auth]').forEach((button) => button.addEventListener('click', showAuth));
$('#auth-back').addEventListener('click', showLanding);

$('#auth-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const mode = event.submitter?.value === 'signup' ? 'signup' : 'login';
  const buttons = form.querySelectorAll('button');
  $('#auth-error').textContent = '';
  buttons.forEach((b) => (b.disabled = true));

  try {
    const { user, instanceId } = await api(`/api/${mode}`, {
      method: 'POST',
      body: { username: form.username.value, password: form.password.value }
    });
    form.reset();
    startChat(user, instanceId);
  } catch (err) {
    $('#auth-error').textContent = err.message;
  } finally {
    buttons.forEach((b) => (b.disabled = false));
  }
});

$('#logout-btn').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' }).catch(() => {});
  clearCache(); // don't leave chats readable on a shared computer
  resetSession();
  showLanding();
});

function resetSession() {
  clearTimeout(saveTimer);
  state.socket?.disconnect();
  state.socket = null;
  state.me = null;
  state.instanceId = null;
  state.conversations.clear();
  state.threads.clear();
  state.activeId = null;
  state.needsSync = false;
  hideBanner();
}

// ---------- chat bootstrap ----------

async function startChat(user, instanceId) {
  state.me = user;
  state.instanceId = instanceId;
  dropStaleCaches();
  loadCache();

  $('#auth-view').hidden = true;
  $('#chat-view').hidden = false;
  $('#me-name').textContent = user.username;
  setAvatar($('#me-avatar'), user.username);
  updateLayout();
  renderConversationList();
  connectSocket();

  try {
    await refreshConversations();
  } catch {
    state.needsSync = true;
    showBanner('Reconnecting…');
  }
}

function connectSocket() {
  const socket = io();
  let connectedBefore = false;
  state.socket = socket;

  socket.on('connect', () => {
    hideBanner();
    if (connectedBefore || state.needsSync) resync();
    connectedBefore = true;
  });

  socket.on('disconnect', () => showBanner('Reconnecting…'));

  socket.on('connect_error', (err) => {
    if (err.message === 'Unauthorized') {
      clearCache();
      resetSession();
      showAuth();
      return;
    }
    showBanner('Reconnecting…');
  });

  socket.on('message:new', onMessageNew);
}

// After a reconnect we may have missed messages: refetch what's on screen
async function resync() {
  for (const [id, thread] of state.threads) {
    if (id !== state.activeId) thread.loaded = false;
  }
  await refreshConversations();
  state.needsSync = false;
  if (state.activeId) await loadMessages(state.activeId);
}

// ---------- conversations ----------

async function refreshConversations() {
  const { conversations } = await api('/api/conversations');
  const previous = state.conversations;
  state.conversations = new Map(
    conversations.map((c) => [c.id, { ...c, unread: previous.get(c.id)?.unread || 0 }])
  );
  renderConversationList();
}

function sortedConversations() {
  const key = (c) => (c.lastMessage ? Number(c.lastMessage.id) : 0);
  return [...state.conversations.values()].sort((a, b) => key(b) - key(a) || Number(b.id) - Number(a.id));
}

// Every change to chats or messages ends in a render, so saving the cache
// here (debounced) keeps localStorage in sync without calls all over the file
function renderConversationList() {
  saveCache();
  const list = $('#conversation-list');
  const items = sortedConversations();
  list.replaceChildren();
  $('#conversation-empty').hidden = items.length > 0;
  $('#chats-label').hidden = items.length === 0;
  renderRecentStrip(items);

  for (const conv of items) {
    const button = el('button');
    button.type = 'button';
    if (conv.id === state.activeId) button.classList.add('active');
    if (conv.unread) button.classList.add('unread');

    const avatar = el('span', 'avatar');
    setAvatar(avatar, conv.otherUser.username);

    const top = el('div', 'top');
    top.append(el('span', 'name', conv.otherUser.username));
    if (conv.lastMessage) top.append(el('span', 'time', formatListTime(conv.lastMessage.createdAt)));

    const bottom = el('div', 'bottom');
    const last = conv.lastMessage;
    const preview = last ? (last.senderId === state.me.id ? 'You: ' : '') + last.body : 'No messages yet';
    bottom.append(el('span', 'preview', preview));
    if (conv.unread) bottom.append(el('span', 'badge', String(conv.unread)));

    const text = el('div', 'text');
    text.append(top, bottom);
    button.append(avatar, text);
    button.addEventListener('click', () => openConversation(conv.id));

    const li = el('li');
    li.append(button);
    list.append(li);
  }
}

// Row of avatars for the most recent chats, like a stories bar
function renderRecentStrip(items) {
  const strip = $('#recent-strip');
  const recent = items.filter((c) => c.lastMessage).slice(0, 10);
  strip.replaceChildren();
  $('#recent-section').hidden = recent.length < 2;

  for (const conv of recent) {
    const button = el('button');
    button.type = 'button';
    const avatar = el('span', 'avatar');
    setAvatar(avatar, conv.otherUser.username);
    if (conv.unread) avatar.classList.add('has-unread');
    button.append(avatar, el('span', '', conv.otherUser.username));
    button.addEventListener('click', () => openConversation(conv.id));
    strip.append(button);
  }
}

function updateLastMessage(message) {
  const conv = state.conversations.get(message.conversationId);
  if (!conv) return;
  if (!conv.lastMessage || Number(message.id) >= Number(conv.lastMessage.id)) {
    conv.lastMessage = message;
  }
}

// ---------- search ----------

let searchTimer;
$('#search-input').addEventListener('input', (event) => {
  clearTimeout(searchTimer);
  const term = event.target.value.trim();
  if (!term) {
    $('#search-section').hidden = true;
    return;
  }
  searchTimer = setTimeout(() => runSearch(term), 250);
});

$('#search-input').addEventListener('keydown', (event) => {
  if (event.key === 'Escape') clearSearch();
});

async function runSearch(term) {
  const { users } = await api(`/api/users?search=${encodeURIComponent(term)}`);
  if ($('#search-input').value.trim() !== term) return; // a newer search is in flight

  const results = $('#search-results');
  results.replaceChildren();
  $('#search-section').hidden = false;

  if (!users.length) {
    results.append(el('li', 'hint', 'No users found'));
    return;
  }

  for (const user of users) {
    const button = el('button');
    button.type = 'button';
    const avatar = el('span', 'avatar');
    setAvatar(avatar, user.username);
    const text = el('div', 'text');
    text.append(el('span', 'name', user.username));
    button.append(avatar, text);
    button.addEventListener('click', () => startConversationWith(user.username));
    const li = el('li');
    li.append(button);
    results.append(li);
  }
}

function clearSearch() {
  $('#search-input').value = '';
  $('#search-section').hidden = true;
}

$('#compose-btn').addEventListener('click', () => {
  closeConversation();
  $('#search-input').focus();
});

async function startConversationWith(username) {
  try {
    const { conversation } = await api('/api/conversations', { method: 'POST', body: { username } });
    const existing = state.conversations.get(conversation.id);
    state.conversations.set(conversation.id, { ...conversation, unread: existing?.unread || 0 });
    clearSearch();
    openConversation(conversation.id);
  } catch (err) {
    alert(err.message);
  }
}

// ---------- messages ----------

function getThread(id) {
  if (!state.threads.has(id)) {
    state.threads.set(id, { messages: [], hasMore: false, loaded: false, loading: false });
  }
  return state.threads.get(id);
}

// Insert or replace a message. Server copies match by id, or replace our own
// pending copy by clientMsgId. Confirmed messages sort by id, pending go last.
function addMessage(thread, message) {
  const index = thread.messages.findIndex(
    (m) =>
      (message.id && m.id === message.id) ||
      (m.senderId === message.senderId && m.clientMsgId === message.clientMsgId)
  );
  if (index >= 0) thread.messages[index] = message;
  else thread.messages.push(message);

  thread.messages.sort((a, b) => {
    if (a.id && b.id) return Number(a.id) - Number(b.id);
    return (a.id ? 0 : 1) - (b.id ? 0 : 1);
  });
}

async function loadMessages(conversationId, { older = false } = {}) {
  const thread = getThread(conversationId);
  if (thread.loading) return;
  thread.loading = true;

  try {
    const oldest = thread.messages.find((m) => m.id);
    const query = older && oldest ? `?before=${oldest.id}` : '';
    const data = await api(`/api/conversations/${conversationId}/messages${query}`);

    if (!older) {
      // Keep unsent messages, plus any that arrived after this page was read
      const newest = data.messages.at(-1);
      thread.messages = thread.messages.filter(
        (m) => !m.id || !newest || Number(m.id) > Number(newest.id)
      );
    }
    for (const message of data.messages) addMessage(thread, message);
    thread.hasMore = data.hasMore;
    thread.loaded = true;
  } finally {
    thread.loading = false;
  }

  if (conversationId === state.activeId) renderMessages(older ? 'keep' : 'bottom');
}

function openConversation(id) {
  const conv = state.conversations.get(id);
  if (!conv) return;

  state.activeId = id;
  conv.unread = 0;
  $('#chat-name').textContent = conv.otherUser.username;
  $('#chat-subtitle').textContent = `@${conv.otherUser.username}`;
  setAvatar($('#chat-avatar'), conv.otherUser.username);
  updateLayout();
  renderConversationList();

  const thread = getThread(id);
  renderMessages('bottom');
  if (!thread.loaded) loadMessages(id);
  $('#composer-input').focus();
}

function closeConversation() {
  state.activeId = null;
  updateLayout();
  renderConversationList();
}

function updateLayout() {
  const open = Boolean(state.activeId);
  $('#chat-panel').hidden = !open;
  $('#chat-placeholder').hidden = open;
  $('#chat-view').classList.toggle('show-chat', open);
}

$('#back-btn').addEventListener('click', closeConversation);

// scroll: 'bottom' jumps to newest, 'keep' holds position after prepending
// older messages, 'auto' follows new messages only if already near the bottom
function renderMessages(scroll = 'auto') {
  saveCache();
  const box = $('#messages');
  const thread = getThread(state.activeId);
  const prevHeight = box.scrollHeight;
  const prevTop = box.scrollTop;
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;

  box.replaceChildren();

  if (thread.loading && !thread.loaded) {
    box.append(el('div', 'loading-older', 'Loading…'));
  } else if (thread.hasMore) {
    box.append(el('div', 'loading-older', 'Scroll up for older messages'));
  }

  // Consecutive messages from the same sender within 5 minutes form a group;
  // the time is shown once, under the last bubble of each group
  const GROUP_GAP_MS = 5 * 60 * 1000;
  const messages = thread.messages;
  let lastDay = null;

  messages.forEach((message, i) => {
    const day = formatDay(message.createdAt);
    if (day !== lastDay) {
      box.append(el('div', 'day', day));
      lastDay = day;
    }

    const next = messages[i + 1];
    const groupEnd =
      !next ||
      next.senderId !== message.senderId ||
      formatDay(next.createdAt) !== day ||
      Date.parse(next.createdAt) - Date.parse(message.createdAt) > GROUP_GAP_MS;

    const mine = message.senderId === state.me.id;
    const row = el('div', `msg-row ${mine ? 'mine' : 'theirs'}`);
    if (groupEnd) row.classList.add('group-end');
    row.append(el('div', 'msg', message.body));

    if (message.status === 'failed') {
      row.classList.add('failed', 'group-end');
      row.append(el('div', 'msg-meta', 'Not sent · tap to retry'));
      row.addEventListener('click', () => sendMessage(state.activeId, message));
    } else if (message.status === 'pending') {
      row.classList.add('pending');
      if (groupEnd) row.append(el('div', 'msg-meta', 'Sending…'));
    } else if (groupEnd) {
      const meta = el('div', 'msg-meta', formatTime(message.createdAt));
      if (mine) meta.append(' ', el('span', 'tick', '✓'));
      row.append(meta);
    }
    box.append(row);
  });

  if (scroll === 'keep') box.scrollTop = box.scrollHeight - prevHeight + prevTop;
  else if (scroll === 'bottom' || nearBottom) box.scrollTop = box.scrollHeight;
}

$('#messages').addEventListener('scroll', (event) => {
  const thread = state.activeId && getThread(state.activeId);
  if (thread && thread.hasMore && !thread.loading && event.target.scrollTop < 60) {
    loadMessages(state.activeId, { older: true });
  }
});

$('#composer').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = $('#composer-input');
  const body = input.value.trim();
  if (!body || !state.activeId) return;

  const pending = {
    clientMsgId: uuid(),
    conversationId: state.activeId,
    senderId: state.me.id,
    body,
    createdAt: new Date().toISOString(),
    status: 'pending'
  };
  addMessage(getThread(state.activeId), pending);
  input.value = '';
  renderMessages('bottom');
  sendMessage(state.activeId, pending);
});

// Socket.IO buffers emits while offline; the server dedupes on clientMsgId,
// so a retry after a timeout can never create a second copy.
function sendMessage(conversationId, pending) {
  pending.status = 'pending';
  if (conversationId === state.activeId) renderMessages();

  state.socket
    .timeout(10000)
    .emit(
      'message:send',
      { conversationId, clientMsgId: pending.clientMsgId, body: pending.body },
      (err, res) => {
        const thread = getThread(conversationId);
        if (err || res?.error) {
          pending.status = 'failed';
        } else {
          addMessage(thread, res.message);
          updateLastMessage(res.message);
          renderConversationList();
        }
        if (conversationId === state.activeId) renderMessages();
      }
    );
}

function onMessageNew(message) {
  const conv = state.conversations.get(message.conversationId);
  if (!conv) {
    // First message in a chat someone else just started with us
    refreshConversations().then(() => {
      const fresh = state.conversations.get(message.conversationId);
      if (fresh && message.senderId !== state.me.id) {
        fresh.unread = 1;
        renderConversationList();
      }
    });
    return;
  }

  updateLastMessage(message);
  if (message.senderId !== state.me.id && message.conversationId !== state.activeId) {
    conv.unread += 1;
  }
  renderConversationList();

  const thread = state.threads.get(message.conversationId);
  if (thread?.loaded) {
    addMessage(thread, message);
    if (message.conversationId === state.activeId) renderMessages();
  }
}


api('/api/me')
  .then(({ user, instanceId }) => startChat(user, instanceId))
  .catch(showLanding);
