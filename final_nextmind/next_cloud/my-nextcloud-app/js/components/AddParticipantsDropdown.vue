<template>
    <div class="add-participants" role="region" aria-label="Add participants">
        <div class="header">Add participants</div>
        <div class="search">
            <input v-model="query" class="search-input" type="text" placeholder="Search users..." aria-label="Search users" />
        </div>
        <div class="list" role="listbox" aria-multiselectable="true">
            <label v-for="u in filtered" :key="u" class="item" :aria-selected="selected.has(u)">
                <input type="checkbox" class="hidden-checkbox" :value="u" @change="toggle(u, $event)" :checked="selected.has(u)" />
                <span class="check" aria-hidden="true">{{ selected.has(u) ? '✔' : '' }}</span>
                <span class="name">{{ u }}</span>
            </label>
        </div>
        <div class="actions">
            <button class="btn" :disabled="loading || selected.size===0" @click="add">Add to group</button>
            <span v-if="loading" class="status">Adding…</span>
            <span v-if="error" class="status error">{{ error }}</span>
            <span v-if="success" class="status success">Added successfully</span>
        </div>
    </div>
</template>
<script setup>
import { ref, computed } from 'vue'
const props = defineProps({ roomId: { type: String, required: true }, participants: { type: Array, required: true } })
// Read global flag from widget to avoid Talk calls when disabled
const TALK_DISABLED = (window?.SmartTalkDisabled === true) || false
const emit = defineEmits(['done'])

const query = ref('')
const selected = ref(new Set())
const loading = ref(false)
const error = ref('')
const success = ref(false)

const filtered = computed(() => (props.participants || []).filter(u => u.toLowerCase().includes(query.value.toLowerCase())))

const toggle = (u, e) => {
    const s = new Set(selected.value)
    if (e.target.checked) s.add(u); else s.delete(u)
    selected.value = s
}

const getRequestToken = () => {
  if (window?.OC?.requestToken) return window.OC.requestToken
  const el = document.querySelector('head meta[name="requesttoken"]')
  return el?.getAttribute('content') || ''
}
const ocsHeaders = () => ({ 'OCS-APIRequest': 'true', 'Accept': 'application/json', 'requesttoken': getRequestToken() })
const needsIndexPhp = () => {
  const p = window?.location?.pathname || ''
  return p === '/index.php' || p.startsWith('/index.php/') || p.includes('/index.php/')
}

const ocsUrl = (path) => {
  let p = path
  if ((p.startsWith('/ocs/') || p.startsWith('/ocs/v')) && needsIndexPhp() && !p.startsWith('/index.php/')) {
    p = `/index.php${p}`
  }
  return (window?.OC?.generateUrl ? window.OC.generateUrl(p) : p)
}

const add = async () => {
    if (selected.value.size === 0) return
    loading.value = true; error.value=''; success.value=false
    try {
        const users = Array.from(selected.value)
        if (TALK_DISABLED) {
            // Do not call server; show friendly message for demo
            success.value = true
            emit('done', { added: users, simulated: true })
            return
        }
        // helper to try multiple API shapes across Talk versions
        const tryPost = async (path, builder) => {
            const payload = builder()
            const res = await fetch(`${ocsUrl(path)}?format=json`, {
                method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', ...ocsHeaders() }, body: payload,
            })
            const json = await res.json().catch(() => ({}))
            return { res, json }
        }

        // Preferred: v1 endpoint, userid[]
        let { res, json } = await tryPost(`/ocs/v2.php/apps/spreed/api/v1/room/${encodeURIComponent(props.roomId)}/participants`, () => {
            const p = new URLSearchParams(); users.forEach(u => p.append('userid[]', u)); return p
        })
        // Fallbacks
        if (!res.ok) ({ res, json } = await tryPost(`/ocs/v2.php/apps/spreed/api/v1/room/${encodeURIComponent(props.roomId)}/participants`, () => {
            const p = new URLSearchParams(); users.forEach(u => p.append('participant', u)); return p
        }))
        if (!res.ok) ({ res, json } = await tryPost(`/ocs/v2.php/apps/spreed/api/v4/room/${encodeURIComponent(props.roomId)}/participants`, () => {
            const p = new URLSearchParams(); users.forEach(u => p.append('participant', u)); return p
        }))
        if (!res.ok) ({ res, json } = await tryPost(`/index.php/apps/spreed/api/v1/room/${encodeURIComponent(props.roomId)}/participants`, () => {
            const p = new URLSearchParams(); users.forEach(u => p.append('userid[]', u)); return p
        }))

        // Validate OCS success
        const status = json?.ocs?.meta?.statuscode
        if (status !== 100) throw new Error(json?.ocs?.meta?.message || `Failed (${res.status})`)
        console.log('Add participants response:', json?.ocs?.meta)

        // 4) non-OCS v4 endpoint
        if (!res.ok) {
            ({ res, json } = await tryPost(`/index.php/apps/spreed/api/v4/room/${encodeURIComponent(props.roomId)}/participants`, () => {
                const p = new URLSearchParams(); users.forEach(u => p.append('participant', u)); return p
            }))
        }
        // 5) non-OCS v1 endpoint
        if (!res.ok) {
            ({ res, json } = await tryPost(`/index.php/apps/spreed/api/v1/room/${encodeURIComponent(props.roomId)}/participants`, () => {
                const p = new URLSearchParams(); users.forEach(u => p.append('participant', u)); return p
            }))
        }

        if (!res.ok || !json?.ocs) throw new Error(`Failed (${res.status})`)
        success.value = true
        emit('done', { added: users })
    } catch (e) {
        error.value = e?.message || 'Failed to add'
    } finally {
        loading.value = false
    }
}
</script>
<style scoped>
.add-participants { border:1px solid var(--color-border); background: var(--color-background-darker); border-radius:12px; padding:10px; margin-top:8px; box-shadow: 0 2px 8px rgba(0,0,0,.08) }
.header { font-weight:600; margin-bottom:8px }
.search-input { width:100%; padding:8px 10px; border-radius:10px; border:1px solid var(--color-border); background: var(--color-main-background); color: var(--color-main-text) }
.list { display:grid; grid-template-columns: repeat(auto-fill,minmax(120px,1fr)); gap:6px; margin:8px 0 }
.item { display:flex; align-items:center; gap:8px; border:1px solid var(--color-border); background: var(--color-main-background); color: var(--color-main-text); padding:8px 10px; border-radius:10px; cursor:pointer }
.item:hover { background: var(--color-background-hover) }
.hidden-checkbox { position:absolute; opacity:0; pointer-events:none }
.check { width:18px; height:18px; border-radius:6px; border:1px solid var(--color-border); display:flex; align-items:center; justify-content:center; background: var(--color-background-darker) }
.item[aria-selected="true"] .check { background: var(--color-primary); color: var(--color-primary-text); border-color: var(--color-primary) }
.actions { display:flex; align-items:center; gap:10px }
.btn { padding:8px 12px; border-radius:10px; border: none; background: var(--color-primary); color: var(--color-primary-text); cursor:pointer }
.btn:disabled { opacity:.6; cursor:not-allowed }
.status { font-size:12px; opacity:.9 }
.status.error { color: var(--color-error, #d33) }
.status.success { color: var(--color-success, #2a8f2a) }
</style>

