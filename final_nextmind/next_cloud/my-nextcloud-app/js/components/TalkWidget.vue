<template>
    <div v-if="!closed" class="chat-widget" :class="{ embedded, minimized, meeting: showMeeting, aiExpanded: activeTab==='ai' }" role="region" aria-label="SmartTalk widget">
		<div class="header">
			<div class="title">
				<div class="header-icon">🤖</div>
				<div class="header-text">
					<h2>Smart Talk</h2>
					<p>{{ selectedRoomName || 'Conversations & AI Assistant' }}</p>
				</div>
			</div>
			<!-- Controls on the right: minimize and close -->
			<div class="header-controls">
                <button class="icon-btn" @click="minimizeWidget" :title="minimized ? 'Expand' : 'Minimize'">−</button>
				<button class="icon-btn" @click="closeWidget" title="Close">×</button>
			</div>
		</div>

		<!-- Body collapses when minimized -->
		<div v-if="!minimized" class="widget-body">
		<!-- Tabs -->
        <div class="tabs" role="tablist">
            <button :class="['tab', activeTab==='talk' && 'active']" role="tab" :aria-selected="activeTab==='talk'" @click="activeTab='talk'">💬 Smart Talk</button>
            <button :class="['tab', activeTab==='ai' && 'active']" role="tab" :aria-selected="activeTab==='ai'" @click="activeTab='ai'">🤖 AI</button>
		</div>

		<!-- Controls row (Talk only; frees vertical space for AI chat) -->
        <div v-if="activeTab==='talk'" class="toolbar">
            <select v-if="activeTab==='talk'" class="room-select" v-model="selectedRoomToken" @change="onSelectRoom" :title="'Select conversation'">
				<option disabled value="">Select a conversation…</option>
				<option v-for="r in rooms" :key="r.token" :value="r.token">{{ r.displayName }}</option>
			</select>
            <div class="toolbar-actions" v-if="activeTab==='talk'">
                <button class="btn" @click="toggleCreate">➕ New group</button>
                <button class="btn" @click="toggleMeetingPicker">📞 Start meeting</button>
            </div>
		</div>

        <!-- Inline create group panel -->
        <div v-if="showCreate" class="panel">
            <input v-model="newGroupName" class="panel-input" placeholder="Group name" />
            <div class="panel-actions">
                <button class="btn" @click="submitCreate">Create</button>
                <button class="btn" @click="toggleCreate">Cancel</button>
            </div>
        </div>

		<!-- Talk view -->
        <div v-if="activeTab==='talk'" class="messages-area" ref="messagesContainer">
            <div v-for="message in messages" :key="message.id" class="message-row" :class="{ self: isSelf(message) }">
                <div class="avatar" :title="message.actorDisplayName">{{ (message.actorDisplayName || '?').charAt(0).toUpperCase() }}</div>
                <div class="bubble">
                    <div class="meta">
                        <span class="user-name">{{ message.actorDisplayName }}</span>
                        <span class="time">{{ formatTime(message.timestamp) }}</span>
                    </div>
                    <div class="message-text">{{ message.message }}</div>
                </div>
            </div>
			<div v-if="messages.length===0" class="empty-hint">No messages yet.</div>
		</div>
		<div v-if="activeTab==='talk'" class="message-input-area">
			<input v-model="newMessage" @keyup.enter="sendMessage" type="text" class="message-input" placeholder="Type your message..." />
			<button class="send-button" @click="sendMessage">Send</button>
		</div>

		<!-- AI view: dedicated panel (no shared messages-area styles) -->
        <div v-if="activeTab==='ai'" class="ai-panel">
            <AiChat />
		</div>
        <!-- Add participants dropdown appears after group creation -->
        <AddParticipantsDropdown v-if="showParticipants" :room-id="lastCreatedRoomId" :participants="['admin','aashu','adithya','dhanush']" @done="() => { showParticipants = false; fetchTalk() }" />

        <!-- Meeting room picker -->
        <div v-if="showMeetingPicker" class="panel">
            <select v-model="meetingRoomToken" class="panel-input">
                <option v-for="r in rooms" :key="r.token" :value="r.token">{{ r.displayName }}</option>
            </select>
            <div class="panel-actions">
                <button class="btn" @click="startMeeting">Start</button>
                <button class="btn" @click="toggleMeetingPicker">Cancel</button>
            </div>
        </div>

        <!-- In-widget meeting overlay (Talk-only UI) -->
        <div v-if="showMeeting" class="overlay">
            <div class="overlay-inner">
                <div class="overlay-bar">
                    <span>Talk meeting</span>
                    <button class="btn" @click="toggleMeeting">Close</button>
                </div>
                <iframe
                    ref="meetingFrame"
                    :src="meetingSrc"
                    class="overlay-frame"
                    allow="camera; microphone; display-capture; autoplay; fullscreen"
                    @load="onMeetingLoaded"
                ></iframe>
            </div>
        </div>
	</div>
	</div>
</template>
<script setup>
import { ref, nextTick, onMounted, onBeforeUnmount, defineProps, computed } from 'vue'
import AddParticipantsDropdown from './AddParticipantsDropdown.vue'
import AiChat from './AiChat.vue'
const props = defineProps({ embedded: { type: Boolean, default: false } })
const TALK_DISABLED = false
const messages = ref([])
const newMessage = ref('')
const selectedRoomName = ref('General')
const messagesContainer = ref(null)
const activeTab = ref('talk') // 'talk' | 'ai'
const minimized = ref(false)
const closed = ref(false)
const selectedRoomToken = ref(localStorage.getItem('talk_room_token') || '')
const rooms = ref([])
const showCreate = ref(false)
const newGroupName = ref('')
const showMeeting = ref(false)
const showMeetingPicker = ref(false)
const meetingRoomToken = ref('')
const meetingFrame = ref(null)
const lastCreatedRoomId = ref('')
const showParticipants = ref(false)
// Weather state
const weatherTemp = ref('--')
const weatherIcon = ref('⛅')
const weatherLoading = ref(true)
const weatherTitle = ref('Weather')
const DEFAULT_CITY = (localStorage.getItem('weather_city') || 'London')
const fetchWeather = async () => {
	try {
		weatherLoading.value = true
		// Prefer absolute Nextcloud URL helper when available
		// eslint-disable-next-line no-unused-vars
		// @ts-ignore
		const ncUrl = (window?.OC?.generateUrl ? window.OC.generateUrl('/apps/my-nextcloud-app/weather') : '/index.php/apps/my-nextcloud-app/weather')
		const url = `${ncUrl}?city=${encodeURIComponent(DEFAULT_CITY)}`
		const res = await fetch(url, { headers: { 'OCS-APIRequest': 'true' } })
		if (!res.ok) throw new Error('weather http ' + res.status)
		const data = await res.json()
		weatherTemp.value = Math.round(data?.main?.temp ?? 0)
		const main = (data?.weather?.[0]?.main || '').toLowerCase()
		weatherIcon.value = main.includes('rain') ? '🌧️' : main.includes('cloud') ? '☁️' : main.includes('snow') ? '❄️' : main.includes('storm') ? '⛈️' : '☀️'
		weatherTitle.value = `${data?.name ?? DEFAULT_CITY}: ${data?.weather?.[0]?.description ?? ''}`
	} catch (e) {
		weatherIcon.value = '⛅'
		weatherTitle.value = 'Weather unavailable'
	} finally {
		weatherLoading.value = false
	}
}
// Disable weather requests to avoid 404 noise
onMounted(() => { weatherLoading.value = false })

// ===== Nextcloud OCS helpers =====
const getRequestToken = () => {
  // Works on Nextcloud pages
  if (window?.OC?.requestToken) return window.OC.requestToken
  const el = document.querySelector('head meta[name="requesttoken"]')
  return el?.getAttribute('content') || ''
}

const ocsHeaders = () => ({
  'OCS-APIRequest': 'true',
  'Accept': 'application/json',
  'requesttoken': getRequestToken(),
})

const needsIndexPhp = () => {
  const p = window?.location?.pathname || ''
  return p === '/index.php' || p.startsWith('/index.php/') || p.includes('/index.php/')
}

const ocsUrl = (path) => {
  // If pretty URLs are disabled, OCS endpoints require /index.php prefix.
  let p = path
  if (p.startsWith('/ocs/') || p.startsWith('/ocs/v')) {
    if (needsIndexPhp() && !p.startsWith('/index.php/')) p = `/index.php${p}`
  }
  const base = (window?.OC?.generateUrl ? window.OC.generateUrl(p) : p)
  return base.includes('?') ? `${base}&format=json` : `${base}?format=json`
}

// ===== Talk integration (basic) =====
const talkRoomToken = ref(localStorage.getItem('talk_room_token') || '')
const talkMessages = ref([])
let lastMessageId = 0

const ensureRoom = async () => {
  // do not auto-create; rely on existing conversations
  return talkRoomToken.value
}

const fetchRooms = async () => {
  if (TALK_DISABLED) { rooms.value = []; return }
  try {
    // Prefer v1 per compatibility; fallback to v4
    let res = await fetch(ocsUrl('/ocs/v2.php/apps/spreed/api/v1/room'), { headers: { ...ocsHeaders() } })
    let json = await res.json().catch(() => ({}))
    if (!res.ok || !json?.ocs) {
      res = await fetch(ocsUrl('/ocs/v2.php/apps/spreed/api/v4/room'), { headers: { ...ocsHeaders() } })
      json = await res.json().catch(() => ({}))
    }
    const list = json?.ocs?.data || []
    rooms.value = list.map(r => ({ token: r.token || r.roomToken || r.id, displayName: r.displayName || r.name || r.token }))
    if (!talkRoomToken.value && rooms.value.length) {
      talkRoomToken.value = rooms.value[0].token
      selectedRoomToken.value = talkRoomToken.value
      selectedRoomName.value = rooms.value[0].displayName
      localStorage.setItem('talk_room_token', talkRoomToken.value)
    }
  } catch {}
}

const onSelectRoom = () => {
  const found = rooms.value.find(r => r.token === selectedRoomToken.value)
  if (found) {
    talkRoomToken.value = found.token
    selectedRoomName.value = found.displayName
    localStorage.setItem('talk_room_token', talkRoomToken.value)
    fetchTalk()
  }
}

const fetchTalk = async () => {
  if (TALK_DISABLED) { messages.value = []; return }
  if (!talkRoomToken.value) return
  const tryGet = async (path) => {
    const r = await fetch(ocsUrl(path), { method: 'GET', headers: { ...ocsHeaders() } })
    const j = await r.json().catch(() => ({}))
    return { r, j }
  }
  let { r, j } = await tryGet(`/ocs/v2.php/apps/spreed/api/v4/room/${encodeURIComponent(talkRoomToken.value)}/message`)
  if (!r.ok || !j?.ocs) {
    ({ r, j } = await tryGet(`/ocs/v2.php/apps/spreed/api/v4/room/${encodeURIComponent(talkRoomToken.value)}/messages?limit=50`))
  }
  if (!r.ok || !j?.ocs) {
    ({ r, j } = await tryGet(`/ocs/v2.php/apps/spreed/api/v1/room/${encodeURIComponent(talkRoomToken.value)}/messages?limit=50`))
  }
  if (!r.ok || !j?.ocs) {
    ({ r, j } = await tryGet(`/index.php/apps/spreed/api/v1/room/${encodeURIComponent(talkRoomToken.value)}/messages?limit=50`))
  }
  const items = j?.ocs?.data?.messages || j?.ocs?.data || []
  // Map minimal fields to widget messages
  const mapped = items.map(m => ({
    id: m.id || m.timestamp || Math.random(),
    actorDisplayName: m.actorDisplayName || m.actor?.displayName || 'User',
    actorId: m.actorId || m.actor?.id || m.actor?.uid || '',
    timestamp: m.timestamp || Math.floor(Date.now()/1000),
    message: m.message || m.body || '',
  }))
  // floating notification on new
  if (mapped.length && mapped[mapped.length - 1].id !== lastMessageId) {
    if ((lastMessageId && document.visibilityState === 'hidden') || activeTab.value !== 'talk') {
      showToast(`New message: ${mapped[mapped.length - 1].message.slice(0, 60)}`)
    }
    lastMessageId = mapped[mapped.length - 1].id
  }
  messages.value = mapped
  await nextTick(); if (messagesContainer.value) messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
}
const isSelf = (m) => {
  try { return (window.OC?.currentUser || window.OC?.getCurrentUser?.()) === m.actorId } catch { return false }
}
const formatTime = (ts) => {
  if (!ts) return ''
  const d = new Date(ts * 1000)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const sendTalk = async (text) => {
  if (TALK_DISABLED) { return }
  if (!text) return
  if (!talkRoomToken.value) return
  // helper to try different endpoints across Talk versions
  const tryPost = async (path, payload) => {
    const res = await fetch(ocsUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', ...ocsHeaders() },
      body: new URLSearchParams(payload),
    })
    const json = await res.json().catch(() => ({}))
    return { res, json }
  }
  let { res } = await tryPost(`/ocs/v2.php/apps/spreed/api/v4/room/${encodeURIComponent(talkRoomToken.value)}/message`, { message: text })
  if (!res.ok) {
    // legacy endpoint
    ({ res } = await tryPost(`/ocs/v2.php/apps/spreed/api/v1/chat/${encodeURIComponent(talkRoomToken.value)}`, { message: text }))
  }
  if (!res.ok) { showToast(res.status === 404 ? 'Message queued. Waiting for Talk to accept.' : `Failed to send (${res.status})`); return }
  await fetchTalk()
}

// Override sendMessage to go through Talk
const sendMessage = async () => {
  const trimmed = newMessage.value.trim()
  if (!trimmed) return
  newMessage.value = ''
  // When Talk is disabled, echo locally so the user sees their message
  if (TALK_DISABLED) {
    messages.value.push({
      id: Math.random(),
      actorDisplayName: 'You',
      actorId: 'self',
      timestamp: Math.floor(Date.now()/1000),
      message: trimmed,
    })
  } else {
    await sendTalk(trimmed)
  }
  await nextTick()
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

// Create group via Talk OCS
const toggleCreate = () => { showCreate.value = !showCreate.value }
const submitCreate = async () => {
  const name = newGroupName.value.trim()
  if (!name) { showToast('Enter a group name'); return }
  // try primary payload
  const tryCreate = async (payload) => {
    const res = await fetch(ocsUrl('/ocs/v2.php/apps/spreed/api/v4/room'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', ...ocsHeaders() },
      body: new URLSearchParams(payload),
    })
    const json = await res.json().catch(() => ({}))
    return { res, json }
  }
  let { res, json } = await tryCreate({ roomType: 'group', displayName: name })
  if (!res.ok) {
    // fallback variants for older Talk versions
    ({ res, json } = await tryCreate({ roomType: 'group', name }))
  }
  if (!res.ok) {
    ({ res, json } = await tryCreate({ conversationType: 'group', roomName: name }))
  }
  if (!res.ok) { showToast(res.status === 404 ? 'The request was sent. Waiting to accept.' : `Failed to create group (${res.status})`); return }
  const roomData = json?.ocs?.data || {}
  const roomId = (roomData.token || roomData.roomToken || roomData.id)
  if (!roomId) { showToast('Group API returned no token'); return }
  // Immediately reflect in UI: prepend new room, select it, and load messages
  const newRoom = { token: roomId, displayName: roomData.displayName || name }
  rooms.value = [newRoom, ...rooms.value.filter(r => (r.token !== roomId))]
  talkRoomToken.value = roomId
  selectedRoomToken.value = roomId
  selectedRoomName.value = newRoom.displayName
  localStorage.setItem('talk_room_token', talkRoomToken.value)
  await fetchTalk()
  // Also refresh full list in the background to keep it accurate
  fetchRooms()
  showToast('Group created')
  newGroupName.value = ''
  showCreate.value = false
  lastCreatedRoomId.value = roomId
  showParticipants.value = true
  // Inform global notification service to refresh room subscriptions
  try { (window.SmartTalkBus || new EventTarget()).dispatchEvent(new CustomEvent('smartTalk:roomsChanged')) } catch {}
}

// Start meeting: create ephemeral conversation link and open in new tab
const toggleMeeting = () => {
  showMeeting.value = !showMeeting.value
  try { window.SmartTalkMeetingOpen = !!showMeeting.value } catch {}
  try { (window.SmartTalkBus || new EventTarget()).dispatchEvent(new CustomEvent(showMeeting.value ? 'smartTalk:meetingOpen' : 'smartTalk:meetingClose')) } catch {}
}
const toggleMeetingPicker = () => {
  // default selected to current room, or first available
  if (!meetingRoomToken.value) meetingRoomToken.value = (talkRoomToken.value || rooms.value?.[0]?.token || '')
  showMeetingPicker.value = !showMeetingPicker.value
}
const startMeeting = () => {
  if (!meetingRoomToken.value) { showToast('Select a group'); return }
  showMeetingPicker.value = false
  showMeeting.value = true
  try { window.SmartTalkMeetingOpen = true } catch {}
  try { (window.SmartTalkBus || new EventTarget()).dispatchEvent(new CustomEvent('smartTalk:meetingOpen')) } catch {}
}

// Ensure only Talk app is visible inside iframe by deep-linking to room route
const onMeetingLoaded = () => {
  try {
    const f = meetingFrame.value
    if (!f || !f.contentWindow) return
    const doc = f.contentWindow.document
    const css = `
      header, .app-navigation, .app-menu, .app-settings, .unified-search, .app-sidebar-header { display: none !important; }
      #app, #content, .app-content { top: 0 !important; }
    `
    const style = doc.createElement('style')
    style.type = 'text/css'
    style.appendChild(doc.createTextNode(css))
    doc.head && doc.head.appendChild(style)
  } catch {}
}

// Prefer dedicated call route if available; otherwise embed Talk SPA route with embedded hint
const meetingSrc = computed(() => {
  const token = encodeURIComponent(meetingRoomToken.value || talkRoomToken.value || '')
  if (!token) return ''
  const baseCall = (window?.OC?.generateUrl ? window.OC.generateUrl(`/call/${token}`) : `/call/${token}`)
  const talkSpa = (window?.OC?.generateUrl ? window.OC.generateUrl('/apps/spreed/') : '/apps/spreed/') + `?embedded=1#/room/${token}`
  return baseCall || talkSpa
})

// Floating notification
const showToast = (text) => {
  let el = document.getElementById('nc-inline-toast')
  if (!el) {
    el = document.createElement('div')
    el.id = 'nc-inline-toast'
    Object.assign(el.style, { position: 'fixed', right: '20px', bottom: '20px', background: '#111', color: '#fff', padding: '10px 14px', borderRadius: '10px', zIndex: '10000', boxShadow: '0 8px 24px rgba(0,0,0,.2)' })
    document.body.appendChild(el)
  }
  el.textContent = text
  el.style.opacity = '0.95'
  setTimeout(() => { el.style.opacity = '0' }, 4000)
}

const minimizeWidget = () => {
  minimized.value = !minimized.value
  try {
    const mount = document.getElementById('talk-widget-mount')
    if (!mount) return
    if (minimized.value) {
      mount.style.transform = 'translateY(120%)'
      mount.style.opacity = '0'
      window.SmartTalkOpen = false
    } else {
      mount.style.transform = 'translateY(0)'
      mount.style.opacity = '1'
      window.SmartTalkOpen = true
    }
  } catch {}
}

// Polling
onMounted(() => {
  if (!TALK_DISABLED) {
    fetchRooms(); fetchTalk(); setInterval(fetchTalk, 5000)
  }
  try {
    const bus = (window.SmartTalkBus = (window.SmartTalkBus || new EventTarget()))
    const onOpen = () => {
      minimized.value = false
      if (!TALK_DISABLED) {
        fetchRooms()
        fetchTalk()
      }
    }
    const onClose = () => { /* keep minimized state; UI already hidden by shell */ }
    bus.addEventListener('smartTalk:widgetOpen', onOpen)
    bus.addEventListener('smartTalk:widgetClose', onClose)
  } catch {}
  try { window.SmartTalkDisabled = !!TALK_DISABLED } catch {}
})

const closeWidget = () => { closed.value = true; try { window.SmartTalkOpen = false } catch {} }

onBeforeUnmount(() => { try { window.SmartTalkOpen = false } catch {} })

// AI handled by AiChat component
</script>
<style scoped>
.chat-widget {
  width: 380px;
  border-radius: 16px;
  padding: 14px;
  background: var(--color-main-background);
  color: var(--color-main-text);
  border: 1px solid var(--color-border);
  box-shadow: 0 8px 24px rgba(0,0,0,.15);
  transition: width .2s ease, height .2s ease;
  display: flex;
  flex-direction: column;
  max-height: min(720px, 80vh);
  min-height: 420px;
}
.chat-widget.embedded { width: 100%; }
.chat-widget.minimized { padding-bottom: 10px }
.chat-widget.meeting { width: min(1020px, 95vw); height: min(720px, 88vh); }
.chat-widget.aiExpanded { width: min(440px, 92vw); min-height: 520px; max-height: min(88vh, 720px) }
.widget-body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.ai-panel {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.chat-widget h2 { color: var(--color-main-text); margin: 0; }
.chat-widget p { color: var(--color-text-maxcontrast); margin: 0; }
.header { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:8px; }
.title { display:flex; align-items:center; gap:10px }
.header-controls { display:flex; gap:8px }
.icon-btn { width:36px; height:36px; border-radius:10px; border:1px solid var(--color-border); background: linear-gradient(135deg,#6a5acd,#7c3aed); color:#fff; font-weight:700; cursor:pointer }
.icon-btn:hover { filter: brightness(1.05) }
.messages-area { flex: 1; min-height: 0; overflow-y: auto; padding-right:6px }
.message-row { display:flex; gap:8px; margin:8px 0; align-items:flex-end }
.message-row.self { flex-direction: row-reverse }
.avatar { width:28px; height:28px; border-radius:50%; background: var(--color-primary); color: var(--color-primary-text); display:flex; align-items:center; justify-content:center; font-weight:700 }
.bubble { background: var(--color-background-darker); border: 1px solid var(--color-border); border-radius: 12px; padding:10px; max-width: 280px; box-shadow: 0 2px 8px rgba(0,0,0,.08) }
.bubble { color: var(--color-main-text) }
.message-text { white-space: pre-wrap }
.message-row.self .bubble { background: var(--color-primary); color: var(--color-primary-text); border-color: var(--color-primary) }
.meta { display:flex; justify-content: space-between; font-size: 11px; opacity:.8; margin-bottom:4px }
.weather { font-weight:600 }
.toolbar { display:flex; gap:8px; align-items:center; margin-bottom:8px }
.toolbar-actions { display:flex; gap:8px }
.btn { padding:6px 10px; border-radius:10px; border:1px solid var(--color-border); background: var(--color-background-darker); color: var(--color-main-text); cursor:pointer; transition: transform .2s ease, background .2s ease }
.btn:hover { transform: translateY(-1px); background: var(--color-background-hover) }
.message-input-area { display:flex; gap:8px; margin-top:10px }
.message-input { flex:1; padding:10px; border-radius: 10px; border:1px solid var(--color-border); background: var(--color-background-darker); color: var(--color-main-text) }
.send-button { padding:8px 12px; border-radius:10px; border:none; background: var(--color-primary); color: var(--color-primary-text); cursor:pointer }
.room-select { padding: 8px 12px; border-radius: 10px; border: 1px solid var(--color-border); background: var(--color-background-darker); color: var(--color-main-text); cursor: pointer; font-size: 14px; }
.tabs { display:flex; gap:6px; margin:6px 0 10px }
.tab { padding:8px 12px; border-radius:10px; border:1px solid var(--color-border); background: var(--color-background-darker); color: var(--color-main-text); cursor:pointer }
.tab.active { background: var(--color-primary); color: var(--color-primary-text); border-color: var(--color-primary) }
.skeleton { padding:8px }
.skeleton .line { height:10px; background: var(--color-background-darker); border-radius:6px; margin:6px 0 }
.skeleton .w80 { width:80% }
.skeleton .w60 { width:60% }

/* AI-specific styles */
.ai-welcome { text-align: center; padding: 40px 20px; color: var(--color-text-maxcontrast) }
.ai-welcome .ai-icon { font-size: 48px; margin-bottom: 16px }
.ai-welcome h3 { margin: 0 0 8px; color: var(--color-main-text) }
.ai-welcome p { margin: 0; font-size: 14px }

.ai-loading { text-align: center; padding: 20px; color: var(--color-text-maxcontrast) }
.loading-dots { display: flex; justify-content: center; gap: 4px; margin-bottom: 12px }
.loading-dots span { width: 8px; height: 8px; border-radius: 50%; background: var(--color-primary); animation: loading-bounce 1.4s ease-in-out infinite both }
.loading-dots span:nth-child(1) { animation-delay: -0.32s }
.loading-dots span:nth-child(2) { animation-delay: -0.16s }

.ai-error { text-align: center; padding: 20px; color: var(--color-error) }
.ai-error .error-icon { font-size: 24px; margin-bottom: 8px }
.ai-error p { margin: 0 0 12px; font-size: 14px }

@keyframes loading-bounce {
  0%, 80%, 100% { transform: scale(0) }
  40% { transform: scale(1) }
}

/* Inline panels and overlay */
.panel { display:flex; gap:8px; align-items:center; margin:6px 0 }
.panel-input { flex:1; padding:8px 10px; border-radius:10px; border:1px solid var(--color-border); background: var(--color-background-darker); color: var(--color-main-text) }
.panel-actions { display:flex; gap:8px }
.overlay { position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 10000; display:flex; align-items:center; justify-content:center }
.overlay-inner { width: 100%; height: 100%; background: var(--color-main-background); border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,.25); display:flex; flex-direction: column }
.overlay-bar { display:flex; align-items:center; justify-content: space-between; padding: 8px 10px; border-bottom: 1px solid var(--color-border) }
.overlay-frame { flex:1; border: 0; border-radius: 0 0 12px 12px; width: 100% }
</style>
