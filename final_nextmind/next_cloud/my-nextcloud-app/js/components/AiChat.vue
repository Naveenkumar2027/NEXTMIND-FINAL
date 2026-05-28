<template>
    <div class="ai-chat" role="region" aria-label="AI chat">
        <div class="messages" ref="list">
            <div v-if="messages.length===0" class="welcome">
                <div class="icon">🤖</div>
                <h3>AI Assistant</h3>
                <p>Ask anything about Nextcloud. I will answer instantly.</p>
            </div>
            <div v-for="(m,i) in messages" :key="i" class="row" :class="[ m.role==='user' ? 'self' : 'ai' ]">
                <div class="avatar">{{ m.role==='user' ? 'You' : 'AI' }}</div>
                <div class="bubble">
                    <div class="meta">
                        <span class="who">{{ m.role==='user' ? 'You' : 'AI Assistant' }}</span>
                        <span class="time">{{ formatTime(m.ts) }}</span>
                    </div>
                    <div class="text">{{ m.text }}</div>
                </div>
            </div>
            <div v-if="loading" class="loading">AI is thinking…</div>
            <div v-if="error" class="error">{{ error }}</div>
        </div>
        <div class="input">
            <input v-model="draft" @keyup.enter="send" :disabled="loading" :placeholder="placeholder" />
            <button class="send" :disabled="loading || !draft.trim()" @click="send">Send</button>
        </div>
    </div>
</template>
<script setup>
import { ref, nextTick } from 'vue'

const props = defineProps({ placeholder: { type: String, default: 'Ask AI anything…' } })

const list = ref(null)
const messages = ref([])
const draft = ref('')
const loading = ref(false)
const error = ref('')

const getRequestToken = () => {
    if (window?.OC?.requestToken) return window.OC.requestToken
    const el = document.querySelector('head meta[name="requesttoken"]')
    return el?.getAttribute('content') || ''
}

const genUrl = (path) => (window?.OC?.generateUrl ? window.OC.generateUrl(path) : path)
const geminiUrl = () => genUrl('/apps/my-nextcloud-app/ai/gemini')

const formatTime = (t) => new Date(t * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const scroll = async () => { await nextTick(); if (list.value) list.value.scrollTop = list.value.scrollHeight }

const send = async () => {
    const q = draft.value.trim(); if (!q) return
    draft.value = ''
    messages.value.push({ role: 'user', text: q, ts: Math.floor(Date.now()/1000) })
    loading.value = true; error.value = ''
    await scroll()
    try {
        const res = await fetch(geminiUrl(), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'Accept': 'application/json',
                'OCS-APIRequest': 'true',
                'requesttoken': getRequestToken(),
            },
            body: new URLSearchParams({ q }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok || json?.ok === false) {
            const msg = json?.error || `AI request failed (${res.status})`
            throw new Error(msg)
        }
        const text = (json?.data?.text || '').trim() || 'No response.'
        messages.value.push({ role: 'model', text, ts: Math.floor(Date.now()/1000) })
    } catch (e) {
        error.value = e?.message || 'AI error'
    } finally {
        loading.value = false
        scroll()
    }
}
</script>
<style scoped>
.ai-chat {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
}
.messages { flex:1; min-height:0; overflow:auto; padding: 0 6px 0 0 }
.welcome { text-align:center; color: var(--color-text-maxcontrast); padding: 40px 20px }
.welcome .icon { font-size:48px; margin-bottom: 12px }
.row { display:flex; gap:8px; margin:8px 0; align-items:flex-end; width:100%; padding-left: 6px; padding-right: 6px }
.row.ai { flex-direction: row; justify-content:flex-start }
.row.self { flex-direction: row-reverse; justify-content:flex-end }
.avatar { width:28px; height:28px; border-radius:50%; background: var(--color-primary); color: var(--color-primary-text); display:flex; align-items:center; justify-content:center; font-weight:700 }
.bubble {
    background: var(--color-main-background, #1f1f1f);
    color: var(--color-main-text, #fff);
    border: 1px solid var(--color-border, rgba(255,255,255,.12));
    border-radius: var(--border-radius-large, 12px);
    padding: 10px;
    /* Prevent clipping: bubble can never exceed available row width */
    max-width: calc(100% - 44px);
    display: inline-block;
    min-width: 0;
    filter: drop-shadow(0 1px 3px var(--color-box-shadow, rgba(0,0,0,.3)));
    margin-top: 0;
}
.row.ai .bubble { margin-right: auto }
.row.self .bubble { margin-left: auto }
.row.self .bubble { background: var(--color-primary); color: var(--color-primary-text); border-color: var(--color-primary) }
.meta { display:flex; justify-content:space-between; font-size:11px; opacity:.8; margin-bottom:4px }
.text { white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word }
.loading { text-align:center; color: var(--color-text-maxcontrast); padding: 8px 0 }
.error { text-align:center; color: var(--color-error); padding: 8px 0 }
.input { display:flex; gap:8px; margin-top:10px; position: sticky; bottom: 0; padding-top: 10px; background: transparent }
.input input { flex:1; padding:10px; border-radius:10px; border:1px solid var(--color-border); background: var(--color-background-darker); color: var(--color-main-text) }
.send { padding:8px 12px; border-radius:10px; border:none; background: var(--color-primary); color: var(--color-primary-text); cursor:pointer }
</style>

