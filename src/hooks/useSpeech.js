import { useCallback, useEffect, useRef, useState } from 'react'

// Converts the displayed Markdown into the words to speak. Only formatting symbols are removed —
// the wording is the same response the user sees on screen.
export function toSpeakableText(md) {
  const lines = String(md || '').replace(/\r\n/g, '\n').split('\n')
  const out = []
  for (let raw of lines) {
    let line = raw.trim()
    if (!line || line.startsWith('```')) continue
    if (/^\|?\s*:?-{2,}/.test(line)) continue
    if (line.startsWith('|')) {
      line = line.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()).filter(Boolean).join(', ')
    }
    line = line
      .replace(/^#{1,6}\s+/, '')
      .replace(/^([-*•]|\d+[.)])\s+/, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\*\*|__|`/g, '')
      .replace(/(^|\s)\*(\S)/g, '$1$2')
      .replace(/(\S)\*(\s|$)/g, '$1$2')
      .replace(/\s+—\s+/g, ', ')
    if (line && !/[.!?:;,]$/.test(line)) line += '.'
    if (line) out.push(line)
  }
  return out.join(' ').replace(/\s+/g, ' ').trim()
}

function chunkSentences(text, max = 220) {
  const sentences = text.match(/[^.!?]+[.!?]+|\S[^.!?]*$/g) || [text]
  const chunks = []
  let cur = ''
  for (const s of sentences) {
    if ((cur + s).length > max && cur) { chunks.push(cur.trim()); cur = '' }
    cur += s
  }
  if (cur.trim()) chunks.push(cur.trim())
  return chunks
}

function pickVoice() {
  const voices = window.speechSynthesis?.getVoices?.() || []
  const en = voices.filter((v) => /^en/i.test(v.lang))
  return en.find((v) => /natural|neural|google|samantha|aria|jenny/i.test(v.name)) || en[0] || null
}

const UNAVAILABLE = 'Voice unavailable — tap replay to try again.'

export default function useSpeech() {
  const [activeId, setActiveId] = useState(null)
  const [status, setStatus] = useState('idle') // idle | loading | playing | paused
  const [progress, setProgress] = useState(0)
  const [engine, setEngine] = useState(null) // 'gemini' | 'browser'
  const [errors, setErrors] = useState({})
  const [pendingUnlock, setPendingUnlock] = useState(null)

  const audioRef = useRef(null)
  const cacheRef = useRef(new Map())
  const serverTtsRef = useRef(null) // null = unknown, false = not configured on server
  const runRef = useRef(0)

  const getAudio = () => {
    if (!audioRef.current) audioRef.current = new Audio()
    return audioRef.current
  }

  const reset = useCallback(() => {
    setActiveId(null)
    setStatus('idle')
    setProgress(0)
  }, [])

  const stop = useCallback(() => {
    runRef.current += 1
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.onended = audio.ontimeupdate = audio.onerror = null
    }
    window.speechSynthesis?.cancel()
    reset()
  }, [reset])

  const setError = (id, msg) => setErrors((prev) => ({ ...prev, [id]: msg }))
  const clearError = (id) => setErrors((prev) => {
    if (!prev[id]) return prev
    const next = { ...prev }
    delete next[id]
    return next
  })

  const playBrowser = useCallback((id, text, run) => new Promise((resolve) => {
    const synth = window.speechSynthesis
    if (!synth || typeof window.SpeechSynthesisUtterance === 'undefined') return resolve(false)
    synth.cancel()
    const chunks = chunkSentences(text)
    const total = text.length || 1
    let spokenBefore = 0
    const voice = pickVoice()
    setEngine('browser')
    setStatus('playing')
    chunks.forEach((chunk, idx) => {
      const u = new SpeechSynthesisUtterance(chunk)
      if (voice) u.voice = voice
      u.rate = 1
      u.pitch = 1
      const offset = spokenBefore
      spokenBefore += chunk.length + 1
      u.onboundary = (e) => { if (runRef.current === run) setProgress(Math.min(1, (offset + e.charIndex) / total)) }
      u.onend = () => {
        if (runRef.current !== run) return
        if (idx === chunks.length - 1) { reset(); resolve(true) }
      }
      u.onerror = (e) => {
        if (runRef.current !== run || e.error === 'interrupted' || e.error === 'canceled') return
        runRef.current += 1
        synth.cancel()
        reset()
        if (e.error === 'not-allowed') setPendingUnlock({ id, text })
        else setError(id, UNAVAILABLE)
        resolve(true)
      }
      synth.speak(u)
    })
  }), [reset])

  const speakText = useCallback(async (id, text) => {
    stop()
    const run = runRef.current
    clearError(id)
    setPendingUnlock(null)
    if (!text) return
    setActiveId(id)
    setStatus('loading')

    // 1. Gemini TTS via the backend (API key never leaves the server)
    if (serverTtsRef.current !== false) {
      try {
        let url = cacheRef.current.get(id)
        if (!url) {
          const res = await fetch('/api/agent/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text.slice(0, 4000) })
          })
          if (res.status === 503) serverTtsRef.current = false
          if (!res.ok) throw new Error(`tts ${res.status}`)
          url = URL.createObjectURL(await res.blob())
          cacheRef.current.set(id, url)
          serverTtsRef.current = true
        }
        if (runRef.current !== run) return
        const audio = getAudio()
        audio.src = url
        audio.ontimeupdate = () => { if (audio.duration) setProgress(audio.currentTime / audio.duration) }
        audio.onended = () => { if (runRef.current === run) reset() }
        audio.onerror = () => { if (runRef.current === run) { reset(); setError(id, UNAVAILABLE) } }
        setEngine('gemini')
        try {
          await audio.play()
          if (runRef.current === run) setStatus('playing')
        } catch (err) {
          if (runRef.current !== run) return
          reset()
          if (err?.name === 'NotAllowedError') setPendingUnlock({ id, text })
          else setError(id, UNAVAILABLE)
        }
        return
      } catch {
        if (runRef.current !== run) return
        // fall through to the browser voice
      }
    }

    // 2. Browser speech synthesis fallback (same text)
    const handled = await playBrowser(id, text, run)
    if (!handled && runRef.current === run) {
      reset()
      setError(id, UNAVAILABLE)
    }
  }, [stop, reset, playBrowser])

  const speak = useCallback((id, markdown) => speakText(id, toSpeakableText(markdown)), [speakText])

  const pause = useCallback(() => {
    if (status !== 'playing') return
    if (engine === 'gemini') audioRef.current?.pause()
    else window.speechSynthesis?.pause()
    setStatus('paused')
  }, [status, engine])

  const resume = useCallback(() => {
    if (status !== 'paused') return
    if (engine === 'gemini') audioRef.current?.play()
    else window.speechSynthesis?.resume()
    setStatus('playing')
  }, [status, engine])

  const unlock = useCallback(() => {
    if (pendingUnlock) speakText(pendingUnlock.id, pendingUnlock.text)
  }, [pendingUnlock, speakText])

  const releaseCache = useCallback(() => {
    cacheRef.current.forEach((url) => URL.revokeObjectURL(url))
    cacheRef.current.clear()
  }, [])

  useEffect(() => {
    const cache = cacheRef.current
    return () => {
      window.speechSynthesis?.cancel()
      audioRef.current?.pause()
      cache.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [])

  return { activeId, status, progress, engine, errors, needsUnlock: Boolean(pendingUnlock), speak, pause, resume, stop, unlock, releaseCache }
}
