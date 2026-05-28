<template>
    <div class="st-ai-chat" role="region" aria-label="AI chat">
        <div class="st-msgs" ref="list">
            <div v-if="messages.length === 0" class="st-welcome">
                <div class="st-welcome-icon">🤖</div>
                <h3>AI Assistant</h3>
                <p>Ask anything about Nextcloud or Talk. Answers are short and clear (up to 60 words).</p>
            </div>

            <div
                v-for="(m, i) in messages"
                :key="i"
                class="st-msg"
                :class="m.role === 'user' ? 'st-msg--user' : 'st-msg--ai'"
            >
                <div class="st-msg-inner">
                    <div class="st-avatar" aria-hidden="true">{{ m.role === 'user' ? 'You' : 'AI' }}</div>
                    <div class="st-bubble">
                        <div class="st-meta">
                            <span class="st-who">{{ m.role === 'user' ? 'You' : 'AI Assistant' }}</span>
                            <span class="st-time">{{ formatTime(m.ts) }}</span>
                        </div>
                        <div class="st-text">{{ m.text }}</div>
                    </div>
                </div>
            </div>

            <div v-if="loading" class="st-status">AI is thinking…</div>
            <div v-if="error" class="st-error">{{ error }}</div>
        </div>

        <div class="st-compose">
            <input
                v-model="draft"
                class="st-input"
                type="text"
                :disabled="loading"
                :placeholder="placeholder"
                @keyup.enter="send"
            />
            <button class="st-send" type="button" :disabled="loading || !draft.trim()" @click="send">Send</button>
        </div>
    </div>
</template>

<script setup>
import { ref, nextTick } from 'vue'

defineProps({ placeholder: { type: String, default: 'Ask about Nextcloud or Talk…' } })

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
const scroll = async () => {
    await nextTick()
    if (list.value) list.value.scrollTop = list.value.scrollHeight
}

const send = async () => {
    const q = draft.value.trim()
    if (!q) return
    draft.value = ''
    messages.value.push({ role: 'user', text: q, ts: Math.floor(Date.now() / 1000) })
    loading.value = true
    error.value = ''
    await scroll()
    try {
        const res = await fetch(geminiUrl(), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'Accept': 'application/json',
                'OCS-APIRequest': 'true',
                requesttoken: getRequestToken(),
            },
            body: new URLSearchParams({ q }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok || json?.ok === false) {
            throw new Error(json?.error || `AI request failed (${res.status})`)
        }
        const text = (json?.data?.text || '').trim() || 'No response.'
        messages.value.push({ role: 'model', text, ts: Math.floor(Date.now() / 1000) })
    } catch (e) {
        error.value = e?.message || 'AI error'
    } finally {
        loading.value = false
        scroll()
    }
}
</script>

<style scoped>
/* Isolated class names (st-*) so TalkWidget styles never collide */
.st-ai-chat {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 300px;
    max-height: 100%;
    box-sizing: border-box;
}

.st-msgs {
    flex: 1 1 auto;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    padding: 8px 4px 12px;
}

.st-welcome {
    text-align: center;
    color: var(--color-text-maxcontrast, #aaa);
    padding: 32px 16px;
}
.st-welcome-icon { font-size: 40px; margin-bottom: 10px; }
.st-welcome h3 { margin: 0 0 8px; color: var(--color-main-text, #fff); font-size: 16px; }
.st-welcome p { margin: 0; font-size: 13px; line-height: 1.45; }

.st-msg {
    display: flex;
    width: 100%;
    margin-bottom: 14px;
    box-sizing: border-box;
}

.st-msg--ai { justify-content: flex-start; }
.st-msg--user { justify-content: flex-end; }

.st-msg-inner {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    max-width: 100%;
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
}

.st-msg--ai .st-msg-inner {
    max-width: 100%;
}

.st-msg--user .st-msg-inner {
    flex-direction: row-reverse;
}

.st-avatar {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--color-primary, #0082c9);
    color: var(--color-primary-text, #fff);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 700;
}

.st-bubble {
    flex: 1 1 auto;
    min-width: 0;
    width: auto;
    max-width: calc(100% - 42px);
    padding: 12px 14px;
    border-radius: 14px;
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.15));
    background: var(--color-background-darker, #2a2a2a);
    color: var(--color-main-text, #eee);
    box-sizing: border-box;
    overflow: visible;
    height: auto;
    max-height: none;
}

.st-msg--ai .st-bubble {
    border-bottom-left-radius: 4px;
}

.st-msg--user .st-bubble {
    background: var(--color-primary, #0082c9);
    color: var(--color-primary-text, #fff);
    border-color: var(--color-primary, #0082c9);
    border-bottom-right-radius: 4px;
}

.st-meta {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 11px;
    opacity: 0.85;
    margin-bottom: 6px;
}

.st-who { font-weight: 600; }
.st-time { flex-shrink: 0; }

.st-text {
    font-size: 14px;
    line-height: 1.5;
    white-space: pre-wrap;
    overflow-wrap: break-word;
    word-break: normal;
    hyphens: auto;
}

.st-status {
    text-align: center;
    padding: 10px;
    color: var(--color-text-maxcontrast, #aaa);
    font-size: 13px;
}

.st-error {
    text-align: center;
    padding: 10px;
    color: var(--color-error, #e74c3c);
    font-size: 13px;
    line-height: 1.4;
}

.st-compose {
    flex-shrink: 0;
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 12px 4px 4px;
    margin-top: auto;
    border-top: 1px solid var(--color-border, rgba(255, 255, 255, 0.12));
    background: var(--color-main-background, #1a1a1a);
}

.st-input {
    flex: 1;
    min-width: 0;
    padding: 11px 14px;
    border-radius: 12px;
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.2));
    background: var(--color-background-darker, #2a2a2a);
    color: var(--color-main-text, #fff);
    font-size: 14px;
}

.st-input:focus {
    outline: 2px solid var(--color-primary, #0082c9);
    outline-offset: 1px;
}

.st-send {
    flex-shrink: 0;
    padding: 11px 16px;
    border-radius: 12px;
    border: none;
    background: var(--color-primary, #0082c9);
    color: var(--color-primary-text, #fff);
    font-weight: 600;
    cursor: pointer;
}

.st-send:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}
</style>
