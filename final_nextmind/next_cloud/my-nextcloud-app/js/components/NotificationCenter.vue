<template>
  <div v-if="!suppress" class="nc-toast-stack" aria-live="polite" aria-atomic="true">
    <transition-group name="toast" tag="div">
      <div
        v-for="n in notifications.slice(0,3)"
        :key="n.id"
        class="nc-toast"
        :class="n.roleClass"
        @mouseenter="pause(n.id)"
        @mouseleave="resume(n.id)"
      >
        <div class="nc-toast-head">
          <div class="nc-avatar" :style="{ background: n.avatarColor }">{{ n.senderInitial }}</div>
          <div class="nc-meta">
            <div class="nc-group">{{ n.groupName }}</div>
            <div class="nc-sender" :title="n.senderName">{{ n.senderName }}</div>
          </div>
          <button class="nc-btn nc-close" @click="dismiss(n.id)" aria-label="Dismiss">×</button>
        </div>
        <div class="nc-preview">{{ n.preview }}</div>
        <div class="nc-reply">
          <input
            :id="`reply-${n.id}`"
            v-model="n.replyText"
            class="nc-input"
            type="text"
            placeholder="Reply…"
            @focus="pause(n.id)"
            @blur="resume(n.id)"
            @keyup.enter="sendReply(n)"
          />
          <button class="nc-btn nc-send" :disabled="n.sending" @click="sendReply(n)">➤</button>
        </div>
        <div v-if="n.error" class="nc-error">{{ n.error }}</div>
      </div>
    </transition-group>
  </div>
  <div id="nc-inline-toast" style="display:none"></div>
  <!-- hidden element reused by TalkWidget's showToast if needed -->
</template>

<script setup>
import { onMounted, onBeforeUnmount, reactive, ref } from 'vue'

const notifications = reactive([])
const suppress = ref(false)

const ROLE_COLORS = {
  admin: '#ef4444',
  moderator: '#3b82f6',
  dev: '#10b981',
  default: 'var(--color-primary)'
}

const computeAvatar = (senderName = '', role = 'default') => {
  const initial = (senderName || '?').charAt(0).toUpperCase()
  const color = ROLE_COLORS[role] || ROLE_COLORS.default
  return { initial, color }
}

const dismiss = (id) => {
  const idx = notifications.findIndex(n => n.id === id)
  if (idx >= 0) notifications.splice(idx, 1)
}

const pause = (id) => {
  const n = notifications.find(x => x.id === id)
  if (n) n.paused = true
}

const resume = (id) => {
  const n = notifications.find(x => x.id === id)
  if (!n) return
  n.paused = false
  tickTimer(n)
}

const tickTimer = (n) => {
  if (n._timer) clearTimeout(n._timer)
  if (n.paused) return
  const remaining = Math.max(0, 3000 - (Date.now() - n.createdAt))
  n._timer = setTimeout(() => dismiss(n.id), remaining || 1)
}

const addNotification = (payload) => {
  try { if (window.SmartTalkMeetingOpen) return } catch {}
  const { id, roomId, groupName, senderName, message, role } = payload
  const { initial, color } = computeAvatar(senderName, role)
  const note = {
    id,
    roomId,
    groupName,
    senderName,
    preview: message,
    replyText: '',
    sending: false,
    error: '',
    createdAt: Date.now(),
    paused: false,
    senderInitial: initial,
    avatarColor: color,
  }
  notifications.unshift(note)
  // Trim to max 5 stored (only 3 visible at a time)
  while (notifications.length > 5) notifications.pop()
  tickTimer(note)
}

const sendQuickReply = async (roomId, text) => {
  const getRequestToken = () => {
    if (window?.OC?.requestToken) return window.OC.requestToken
    const el = document.querySelector('head meta[name="requesttoken"]')
    return el?.getAttribute('content') || ''
  }
  const ocsHeaders = () => ({
    'OCS-APIRequest': 'true',
    'Accept': 'application/json',
    'requesttoken': getRequestToken(),
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
  })
  const needsIndexPhp = () => {
    const p = window?.location?.pathname || ''
    return p === '/index.php' || p.startsWith('/index.php/') || p.includes('/index.php/')
  }
  const ocsUrl = (path) => {
    let p = path
    if ((p.startsWith('/ocs/') || p.startsWith('/ocs/v')) && needsIndexPhp() && !p.startsWith('/index.php/')) {
      p = `/index.php${p}`
    }
    const base = (window?.OC?.generateUrl ? window.OC.generateUrl(p) : p)
    return base.includes('?') ? `${base}&format=json` : `${base}?format=json`
  }
  const res = await fetch(ocsUrl(`/ocs/v2.php/apps/spreed/api/v1/chat/${encodeURIComponent(roomId)}`), {
    method: 'POST',
    headers: { ...ocsHeaders() },
    body: new URLSearchParams({ message: text })
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.ocs?.meta?.message || `Failed (${res.status})`)
  return true
}

const sendReply = async (n) => {
  const text = (n.replyText || '').trim()
  if (!text) return
  n.sending = true
  n.error = ''
  try {
    await sendQuickReply(n.roomId, text)
    n.sending = false
    n.replyText = ''
    // subtle confirmation: brief color pulse
    const el = document.getElementById(`reply-${n.id}`)
    if (el) {
      el.classList.add('sent')
      setTimeout(() => el.classList.remove('sent'), 350)
    }
    dismiss(n.id)
  } catch (e) {
    n.sending = false
    n.error = e?.message || 'Failed to send'
  }
}

const onBusEvent = (ev) => {
  // payload shape from global poller
  const p = ev.detail || {}
  try { if (window.SmartTalkMeetingOpen) return } catch {}
  // Dedup guard by ID
  if (notifications.some(x => x.id === p.id)) return
  // Skip if active room is selected
  const active = localStorage.getItem('talk_room_token') || ''
  if (active && active === p.roomId) return
  addNotification(p)
}

 onMounted(() => {
  window.SmartTalkBus = (window.SmartTalkBus || new EventTarget())
  window.SmartTalkBus.addEventListener('smartTalk:newMessage', onBusEvent)
  // Expose a manual trigger for quick testing from console:
  // window.SmartTalkNotify({ roomId:'test', groupName:'Test', senderName:'System', message:'Ping' })
  window.SmartTalkNotify = (payload) => onBusEvent({ detail: {
    id: `${payload.roomId || 'test'}:${Date.now()}`,
    roomId: payload.roomId || 'test',
    groupName: payload.groupName || 'Test group',
    senderName: payload.senderName || 'System',
    message: payload.message || 'Hello',
    role: payload.role || 'default',
  }})
  // Periodically clear any existing notes if a meeting opens
  setInterval(() => {
    try {
      suppress.value = !!window.SmartTalkMeetingOpen
      if (suppress.value && notifications.length) {
        notifications.splice(0, notifications.length)
      }
    } catch {}
  }, 500)
  // Listen for explicit events too
  try {
    const bus = window.SmartTalkBus
    const onMeetOpen = () => { suppress.value = true; notifications.splice(0, notifications.length) }
    const onMeetClose = () => { suppress.value = false }
    bus.addEventListener('smartTalk:meetingOpen', onMeetOpen)
    bus.addEventListener('smartTalk:meetingClose', onMeetClose)
    // If the page regains focus, re-enable popups (unless a meeting is open)
    window.addEventListener('visibilitychange', () => { if (!window.SmartTalkMeetingOpen) suppress.value = false })
  } catch {}
 })

onBeforeUnmount(() => {
  window.SmartTalkBus?.removeEventListener?.('smartTalk:newMessage', onBusEvent)
})
</script>

<style scoped>
.nc-toast-stack { position: fixed; top: 16px; right: 16px; z-index: 10000; display: flex; flex-direction: column; gap: 10px; pointer-events: none }
.nc-toast { width: min(380px, 90vw); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); background: rgba(20,20,20,.28); border: 1px solid rgba(255,255,255,.2); color: var(--color-main-text); border-radius: 12px; box-shadow: 0 12px 28px rgba(0,0,0,.25); padding: 10px; pointer-events: auto; transform-origin: top right }
.nc-toast-head { display:flex; align-items:center; gap:10px }
.nc-avatar { width:28px; height:28px; border-radius:50%; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700 }
.nc-meta { display:flex; flex-direction:column; line-height:1.1 }
.nc-group { font-weight:700 }
.nc-sender { font-size:12px; opacity:.9 }
.nc-preview { margin:6px 4px 8px; font-size:14px; color: var(--color-main-text) }
.nc-reply { display:flex; gap:6px }
.nc-input { flex:1; padding:8px 10px; border-radius:10px; border:1px solid var(--color-border); background: var(--color-background-darker); color: var(--color-main-text); outline:none; transition: box-shadow .2s ease, transform .2s ease }
.nc-input:focus { box-shadow: 0 0 0 2px var(--color-primary); transform: translateY(-1px) }
.nc-input.sent { animation: pulse .35s ease }
.nc-btn { padding:6px 10px; border-radius:10px; border:1px solid var(--color-border); background: var(--color-background-darker); color: var(--color-main-text); cursor:pointer }
.nc-btn:hover { filter: brightness(1.05) }
.nc-send { background: var(--color-primary); color: var(--color-primary-text); border-color: var(--color-primary) }
.nc-close { width:28px; height:28px; display:flex; align-items:center; justify-content:center; margin-left:auto }
.nc-error { color:#ff6b6b; font-size:12px; margin-top:6px }

/* Animations (approximate springy feel) */
.toast-enter-from { opacity:0; transform: translateY(-50px) scale(.9) }
.toast-enter-to { opacity:1; transform: translateY(0) scale(1) }
.toast-leave-from { opacity:1; transform: translateY(0) scale(1) }
.toast-leave-to { opacity:0; transform: translateX(100px) scale(.85) }
.toast-enter-active { transition: opacity .38s cubic-bezier(.2,.8,.2,1), transform .5s cubic-bezier(.2,.8,.2,1) }
.toast-leave-active { transition: opacity .32s cubic-bezier(.2,.8,.2,1), transform .45s cubic-bezier(.2,.8,.2,1) }
.nc-toast:hover { transform: translateY(-2px); box-shadow: 0 16px 36px rgba(0,0,0,.3); transition: transform .18s ease, box-shadow .18s ease }

@keyframes pulse {
  0% { box-shadow: 0 0 0 0 rgba(0,0,0,0) }
  50% { box-shadow: 0 0 0 6px rgba(124, 58, 237, .35) }
  100% { box-shadow: 0 0 0 0 rgba(0,0,0,0) }
}

@media (max-width: 640px) {
  .nc-toast-stack { top: 10px; right: 10px; gap: 8px }
  .nc-toast { width: min(94vw, 420px) }
}
</style>

