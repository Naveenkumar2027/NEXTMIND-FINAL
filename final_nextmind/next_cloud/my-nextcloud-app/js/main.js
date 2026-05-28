import { createApp } from 'vue'
import TalkWidget from './components/TalkWidget.vue'
import { createApp as createApp2 } from 'vue'
import NotificationCenter from './components/NotificationCenter.vue'

// Enable Talk/spreed integration (rooms dropdown, messaging)
const TALK_DISABLED = false
// Guard: don’t mount widget or notifications inside Talk meeting iframes
const isInIframe = (window.self !== window.top)
const isTalkContext = () => {
    try {
        const p = (location.pathname || '').toLowerCase()
        return (p.includes('/apps/spreed') || p.includes('/call/'))
    } catch { return false }
}

const mountWidget = () => {
    if (isInIframe && isTalkContext()) return

    const STORAGE_KEY = 'smart_talk_widget_pos_v1'
    const defaultPos = () => {
        // place near bottom-right but using left/top coords
        const w = 48
        const h = 48
        return {
            x: Math.max(12, window.innerWidth - w - 22),
            y: Math.max(12, window.innerHeight - h - 22),
        }
    }
    const loadPos = () => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY)
            if (!raw) return defaultPos()
            const p = JSON.parse(raw)
            if (typeof p?.x !== 'number' || typeof p?.y !== 'number') return defaultPos()
            return p
        } catch {
            return defaultPos()
        }
    }
    const savePos = (pos) => {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pos)) } catch {}
    }
    const clampPos = (pos) => {
        const w = 48
        const h = 48
        const maxX = Math.max(12, window.innerWidth - w - 12)
        const maxY = Math.max(12, window.innerHeight - h - 12)
        return { x: Math.min(maxX, Math.max(12, pos.x)), y: Math.min(maxY, Math.max(12, pos.y)) }
    }

	// Ensure toggle exists
	let toggle = document.getElementById('talk-widget-toggle')
	if (!toggle) {
		toggle = document.createElement('button')
		toggle.id = 'talk-widget-toggle'
		toggle.setAttribute('aria-label', 'Open chat')
		Object.assign(toggle.style, {
			position: 'fixed', left: '22px', top: '22px', width: '48px', height: '48px',
			borderRadius: '50%', border: '1px solid var(--color-border)',
			background: 'var(--color-primary)', color: 'var(--color-primary-text)',
			boxShadow: '0 8px 24px rgba(0,0,0,.2)', cursor: 'pointer', zIndex: 10000,
			display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px'
		})
		toggle.textContent = '💬'
		document.body.appendChild(toggle)
	}
    // If the element already existed (old JS bundle), it may still have old listeners.
    // Replace it with a clone to guarantee a clean slate for dragging + context menu.
    if (toggle && toggle.dataset && toggle.dataset.smartTalkInitialized === '1') {
        // already initialized by this bundle; keep it
    } else if (toggle) {
        const clone = toggle.cloneNode(true)
        clone.id = 'talk-widget-toggle'
        toggle.replaceWith(clone)
        toggle = clone
    }
    toggle.dataset.smartTalkInitialized = '1'

    // Position toggle from saved state
    const applyTogglePos = (pos) => {
        const p = clampPos(pos)
        toggle.style.left = `${p.x}px`
        toggle.style.top = `${p.y}px`
        toggle.style.right = ''
        toggle.style.bottom = ''
        savePos(p)
        return p
    }
    let currentPos = applyTogglePos(loadPos())

	// Ensure mount exists
	let mount = document.getElementById('talk-widget-mount')
	if (!mount) {
		mount = document.createElement('div')
		mount.id = 'talk-widget-mount'
        Object.assign(mount.style, {
            position: 'fixed', left: '22px', top: '22px', zIndex: 9999,
            transform: 'translateY(120%)', opacity: '0', transition: 'transform .25s ease, opacity .25s ease, width .25s ease, height .25s ease'
        })
		document.body.appendChild(mount)
		createApp(TalkWidget).mount('#talk-widget-mount')
	}
    // Same clean-slate logic for mount container (avoid duplicate Vue mounts)
    if (mount && mount.dataset && mount.dataset.smartTalkInitialized === '1') {
        // ok
    } else if (mount) {
        mount.dataset.smartTalkInitialized = '1'
    }

    const positionPanel = () => {
        // Anchor panel near the toggle; prefer above if space, else below.
        const tRect = toggle.getBoundingClientRect()
        const gap = 10
        // Ensure we can measure mount
        const mRect = mount.getBoundingClientRect()
        const panelW = mRect.width || 380
        const panelH = mRect.height || 520
        // Align panel right edge with toggle right edge
        let x = Math.round(tRect.right - panelW)
        // Try above, fallback below
        const aboveY = Math.round(tRect.top - panelH - gap)
        const belowY = Math.round(tRect.bottom + gap)
        let y = aboveY >= 12 ? aboveY : belowY
        // clamp inside viewport
        x = Math.min(window.innerWidth - panelW - 12, Math.max(12, x))
        y = Math.min(window.innerHeight - panelH - 12, Math.max(12, y))
        mount.style.left = `${x}px`
        mount.style.top = `${y}px`
        mount.style.right = ''
        mount.style.bottom = ''
    }

    // Wire toggle behavior to mount
    const openPanel = () => { 
        positionPanel()
        mount.style.transform = 'translateY(0)'; 
        mount.style.opacity = '1'; 
        try { 
            window.SmartTalkOpen = true
            ;(window.SmartTalkBus || new EventTarget()).dispatchEvent(new CustomEvent('smartTalk:widgetOpen'))
        } catch {}
    }
    const closePanel = () => { 
        mount.style.transform = 'translateY(120%)'; 
        mount.style.opacity = '0'; 
        try { 
            window.SmartTalkOpen = false 
            ;(window.SmartTalkBus || new EventTarget()).dispatchEvent(new CustomEvent('smartTalk:widgetClose'))
        } catch {}
    }
	let opened = false
    const toggleOpenClosed = () => {
        opened = !opened
        opened ? openPanel() : closePanel()
    }

    // Keep panel glued to toggle when resizing or dragging
    window.addEventListener('resize', () => {
        currentPos = applyTogglePos(currentPos)
        if (opened) positionPanel()
    })

    // Fetch rooms/messages when opening (covers initial 401-before-login cases)
    try {
        const bus = (window.SmartTalkBus = (window.SmartTalkBus || new EventTarget()))
        bus.addEventListener('smartTalk:widgetOpen', () => {
            try { positionPanel() } catch {}
        })
    } catch {}

    // Dragging (Pointer Events + pointer capture) – reliable on Windows/Chrome/Nextcloud
    let dragging = false
    let dragStart = null
    let downAt = null
    const DRAG_THRESHOLD_PX = 6

    const startDrag = (clientX, clientY) => {
        dragging = true
        const rect = toggle.getBoundingClientRect()
        dragStart = { dx: clientX - rect.left, dy: clientY - rect.top }
        toggle.style.cursor = 'grabbing'
    }
    const moveDrag = (clientX, clientY) => {
        if (!dragging || !dragStart) return
        const pos = { x: Math.round(clientX - dragStart.dx), y: Math.round(clientY - dragStart.dy) }
        currentPos = applyTogglePos(pos)
        if (opened) positionPanel()
    }
    const endDrag = () => {
        dragging = false
        dragStart = null
        toggle.style.cursor = 'pointer'
    }

    // Make it feel draggable
    toggle.style.touchAction = 'none'
    toggle.style.userSelect = 'none'

    toggle.addEventListener('pointerdown', (e) => {
        // only left-click / primary touch/pen
        if (e.button !== 0) return
        closeMenu()
        downAt = { x: e.clientX, y: e.clientY, moved: false }
        try { toggle.setPointerCapture(e.pointerId) } catch {}
        startDrag(e.clientX, e.clientY)
        e.preventDefault()
        e.stopPropagation()
    })

    toggle.addEventListener('pointermove', (e) => {
        if (!dragging) return
        if (downAt && !downAt.moved) {
            const dx = e.clientX - downAt.x
            const dy = e.clientY - downAt.y
            if (Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) downAt.moved = true
        }
        moveDrag(e.clientX, e.clientY)
        e.preventDefault()
    })

    toggle.addEventListener('pointerup', (e) => {
        const wasClick = !!downAt && !downAt.moved
        downAt = null
        endDrag()
        // If the user did not really move, treat as click/toggle.
        if (wasClick) toggleOpenClosed()
        e.preventDefault()
        e.stopPropagation()
    })

    toggle.addEventListener('pointercancel', () => {
        downAt = null
        endDrag()
    })

    // Right-click context menu on the toggle (Windows-style action menu)
    const MENU_ID = 'talk-widget-context-menu'
    const closeMenu = () => {
        const m = document.getElementById(MENU_ID)
        if (m) m.remove()
    }
    const openMenu = (x, y) => {
        closeMenu()
        const menu = document.createElement('div')
        menu.id = MENU_ID
        Object.assign(menu.style, {
            position: 'fixed',
            left: `${Math.max(8, Math.min(window.innerWidth - 220, x))}px`,
            top: `${Math.max(8, Math.min(window.innerHeight - 140, y))}px`,
            width: '220px',
            background: 'var(--color-main-background)',
            color: 'var(--color-main-text)',
            border: '1px solid var(--color-border)',
            borderRadius: '12px',
            boxShadow: '0 14px 40px rgba(0,0,0,.28)',
            zIndex: 10001,
            padding: '6px',
        })

        const item = (label, onClick) => {
            const b = document.createElement('button')
            b.type = 'button'
            b.textContent = label
            Object.assign(b.style, {
                width: '100%',
                textAlign: 'left',
                border: '0',
                background: 'transparent',
                color: 'inherit',
                padding: '10px 10px',
                borderRadius: '10px',
                cursor: 'pointer',
                fontSize: '13px',
            })
            b.onmouseenter = () => { b.style.background = 'var(--color-background-hover)' }
            b.onmouseleave = () => { b.style.background = 'transparent' }
            b.onclick = () => { closeMenu(); onClick() }
            return b
        }

        menu.appendChild(item(opened ? 'Close widget' : 'Open widget', () => toggleOpenClosed()))
        menu.appendChild(item('Reset position', () => {
            currentPos = applyTogglePos(defaultPos())
            if (opened) positionPanel()
        }))
        menu.appendChild(item('Toggle (same as left click)', () => toggleOpenClosed()))

        document.body.appendChild(menu)
        // click outside closes
        setTimeout(() => {
            const onDoc = (ev) => {
                if (!menu.contains(ev.target) && ev.target !== toggle) closeMenu()
            }
            document.addEventListener('mousedown', onDoc, { once: true })
        }, 0)
    }

    toggle.addEventListener('contextmenu', (e) => {
        e.preventDefault()
        e.stopPropagation()
        openMenu(e.clientX, e.clientY)
    })
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', mountWidget)
} else {
	mountWidget()
}

document.addEventListener('DOMContentLoaded', function() {
	console.log('My Nextcloud App loaded!')
    if (!(isInIframe && isTalkContext())) {
        if (!TALK_DISABLED) {
            // Mount global Notification Center once
            if (!document.getElementById('smart-talk-notifications')) {
                const el = document.createElement('div')
                el.id = 'smart-talk-notifications'
                Object.assign(el.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: 100000 })
                document.body.appendChild(el)
                const app = createApp2(NotificationCenter)
                app.mount('#smart-talk-notifications')
                if (!window.SmartTalkBus) window.SmartTalkBus = new EventTarget()
                const stack = document.querySelector('#smart-talk-notifications .nc-toast-stack')
                if (stack) stack.style.pointerEvents = 'auto'
            }
            // Start global notification service only when enabled
            if (!window.__smartTalkServiceStarted) { /* disabled */ }
        }
    }
})




