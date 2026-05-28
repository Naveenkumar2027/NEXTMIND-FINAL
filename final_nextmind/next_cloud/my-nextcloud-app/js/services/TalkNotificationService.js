// TalkNotificationService: Connects to real Talk data and dispatches notifications

export function startTalkNotifications() {
  // Temporarily disabled to eliminate spreed-related 404s
  return
  const bus = (window.SmartTalkBus = (window.SmartTalkBus || new EventTarget()))
  const state = {
    // last timestamp per room id
    lastTsByRoom: {},
    lastIdByRoom: {},
    rooms: [],
    running: false,
    ws: null,
    wsOnline: false,
  }

  const getRequestToken = () => {
    try { if (window?.OC?.requestToken) return window.OC.requestToken } catch {}
    const el = document.querySelector('head meta[name="requesttoken"]')
    return el?.getAttribute('content') || ''
  }
  const ocsHeaders = () => ({ 'OCS-APIRequest': 'true', 'Accept': 'application/json', 'requesttoken': getRequestToken() })
  const ocsUrl = (path) => {
    const base = (window?.OC?.generateUrl ? window.OC.generateUrl(path) : path)
    return base.includes('?') ? `${base}&format=json` : `${base}?format=json`
  }
  const genUrlRaw = (path) => (window?.OC?.generateUrl ? window.OC.generateUrl(path) : path)

  const tryFetchJson = async (paths, opts = {}) => {
    for (const p of paths) {
      try {
        const res = await fetch((p.startsWith('/index.php') || p.startsWith('/ocs/')) ? genUrlRaw(p) : ocsUrl(p), opts)
        const json = await res.json().catch(() => ({}))
        if (res.ok && json) return { res, json }
      } catch {}
    }
    return { res: { ok: false, status: 404 }, json: {} }
  }

  const currentUser = () => {
    try {
      const raw = (window.OC?.currentUser || window.OC?.getCurrentUser?.())
      if (!raw) return ''
      if (typeof raw === 'string') return raw
      if (typeof raw === 'object') return (raw.uid || raw.id || raw.user || '')
      return ''
    } catch { return '' }
  }
  const isActiveRoom = () => { try { return !!window.SmartTalkMeetingOpen } catch { return false } }

  // Global suppressor: if meeting overlay is open, drop all events
  const shouldSuppressAll = () => {
    try { return !!window.SmartTalkMeetingOpen } catch { return false }
  }
  const roleForSender = (uid) => {
    if (!uid) return 'default'
    if (uid === 'admin') return 'admin'
    if (/mod/i.test(uid)) return 'moderator'
    if (/dev/i.test(uid)) return 'dev'
    return 'default'
  }

  const fetchRooms = async () => {
    try {
      const { res, json } = await tryFetchJson([
        '/ocs/v2.php/apps/spreed/api/v1/room',
        '/ocs/v2.php/apps/spreed/api/v4/room',
        '/index.php/ocs/v2.php/apps/spreed/api/v1/room',
        '/index.php/ocs/v2.php/apps/spreed/api/v4/room',
      ], { headers: { ...ocsHeaders() } })
      const list = json?.ocs?.data || []
      state.rooms = list.map(r => ({ id: r.token || r.roomToken || r.id, name: r.displayName || r.name || r.token }))
      return state.rooms
    } catch { return [] }
  }

  const fetchNewMessages = async (room) => {
    const lastTs = Number(state.lastTsByRoom[room.id] || 0)
    const { res: r, json: j } = await tryFetchJson([
      `/ocs/v2.php/apps/spreed/api/v1/room/${encodeURIComponent(room.id)}/messages?lookIntoFuture=true&limit=20`,
      `/ocs/v2.php/apps/spreed/api/v4/room/${encodeURIComponent(room.id)}/messages?lookIntoFuture=true&limit=20`,
      `/index.php/ocs/v2.php/apps/spreed/api/v1/room/${encodeURIComponent(room.id)}/messages?lookIntoFuture=true&limit=20`,
      `/index.php/ocs/v2.php/apps/spreed/api/v4/room/${encodeURIComponent(room.id)}/messages?lookIntoFuture=true&limit=20`,
    ], { headers: { ...ocsHeaders() } })
    if (!r.ok || !j?.ocs) return []
    const items = j?.ocs?.data?.messages || j?.ocs?.data || []
    return items.map(m => ({
      id: Number(m.id || m.timestamp || 0),
      senderName: m.actorDisplayName || m.actor?.displayName || 'User',
      senderId: m.actorId || m.actor?.id || m.actor?.uid || '',
      message: m.message || m.body || '',
      ts: m.timestamp || Math.floor(Date.now()/1000),
      system: (m.messageType && m.messageType !== 'comment') || !!m.systemMessage,
    })).sort((a,b) => a.ts - b.ts)
  }

  const processRoom = async (room) => {
    const msgs = await fetchNewMessages(room)
    const lastTs = Number(state.lastTsByRoom[room.id] || 0)
    const lastId = Number(state.lastIdByRoom[room.id] || 0)
    for (const m of msgs) {
      if (m.ts <= lastTs && m.id <= lastId) continue
      if (m.senderId === currentUser()) { state.lastTsByRoom[room.id] = m.ts; continue }
      if (m.system || !m.message) { state.lastTsByRoom[room.id] = m.ts; continue }
      if (isActiveRoom()) { state.lastTsByRoom[room.id] = m.ts; continue }
      state.lastTsByRoom[room.id] = m.ts
      state.lastIdByRoom[room.id] = m.id
      if (shouldSuppressAll()) return
      const ev = new CustomEvent('smartTalk:newMessage', { detail: {
        id: `${room.id}:${m.id}`,
        roomId: room.id,
        groupName: room.name,
        senderName: m.senderName,
        message: m.message,
        role: roleForSender(m.senderId),
      }})
      bus.dispatchEvent(ev)
    }
  }

  const loop = async () => {
    if (state.running) return
    state.running = true
    try {
      if (!state.rooms.length) await fetchRooms()
      // Keep polling all rooms while page is visible; if hidden, still poll a subset for responsiveness
      const pollSubset = (document.visibilityState === 'visible' && !state.wsOnline) ? state.rooms : state.rooms.slice(0, Math.max(3, Math.ceil(state.rooms.length/3)))
      for (const room of pollSubset) { await processRoom(room) }
    } finally {
      state.running = false
      setTimeout(loop, state.wsOnline ? 5000 : 1500)
    }
  }

  // Refresh rooms periodically and when notified (e.g., group created)
  const refreshRooms = async () => { await fetchRooms() }
  window.SmartTalkBus = bus
  bus.addEventListener('smartTalk:roomsChanged', () => { fetchRooms(); /* also nudge loop */ setTimeout(loop, 100) })
  setInterval(refreshRooms, 30000)

  // Initial kick
  fetchRooms().then(() => loop())

  // ===== WebSocket: preferred real-time stream =====
  const connectWS = () => {
    try {
      if (state.ws) { try { state.ws.close() } catch {} }
      const path = genUrlRaw('/ocs/v2.php/apps/spreed/ws')
      // Build absolute URL and switch to ws/wss
      const a = document.createElement('a')
      a.href = path
      const wsUrl = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}${a.pathname}${a.search}`
      const ws = new WebSocket(wsUrl)
      state.ws = ws
      ws.onopen = () => { state.wsOnline = true }
      ws.onclose = () => { state.wsOnline = false; setTimeout(connectWS, 3000) }
      ws.onerror = () => { state.wsOnline = false }
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data)
          // Expected shape: { type: 'message', actorId, roomToken, text, timestamp }
          if (msg?.type !== 'message') return
          if (shouldSuppressAll()) return
          const roomId = msg.roomToken || msg.roomId || msg.token
          const room = (state.rooms.find(r => r.id === roomId) || { id: roomId, name: roomId })
          const ts = Number(msg.timestamp || Date.now() / 1000)
          const lastTs = Number(state.lastTsByRoom[room.id] || 0)
          if (ts <= lastTs) return
          state.lastTsByRoom[room.id] = ts
          // Filters
          if (msg.actorId === currentUser()) return
          if (isActiveRoom(room.id)) return
          const evOut = new CustomEvent('smartTalk:newMessage', { detail: {
            id: `${room.id}:${ts}`,
            roomId: room.id,
            groupName: room.name,
            senderName: msg.actorDisplayName || msg.actorId || 'User',
            message: msg.text || msg.message || '',
            role: roleForSender(msg.actorId),
          }})
          bus.dispatchEvent(evOut)
        } catch {}
      }
    } catch {
      state.wsOnline = false
    }
  }
  // Attempt WS connection; cookies/session handle auth in-browser
  connectWS()
}


