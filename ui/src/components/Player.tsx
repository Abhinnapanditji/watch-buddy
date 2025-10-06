import React, { useEffect, useRef } from 'react'
import Hls from 'hls.js'

export default function Player({ source, socket, roomId }: any) {
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    const el = videoRef.current!
    if (!el) return

    if (source?.type === 'hls' && source?.url) {
      if (Hls.isSupported()) {
        const hls = new Hls()
        hls.loadSource(source.url)
        hls.attachMedia(el)
      } else {
        el.src = source.url
      }
    } else if (source?.type === 'html' && source?.url) {
      el.src = source.url
    }
  }, [source])

  useEffect(() => {
    const v = videoRef.current!
    if (!v || !socket) return

    const emit = (type: string, targetTime?: number) => {
      socket.emit('video:action', { type, targetTime, clientTimeMs: Date.now(), source })
    }

    const onPlay = () => emit('play', v.currentTime)
    const onPause = () => emit('pause', v.currentTime)
    const onSeeked = () => emit('seek', v.currentTime)

    v.addEventListener('play', onPlay)
    v.addEventListener('pause', onPause)
    v.addEventListener('seeked', onSeeked)

    socket.on('video:action', (msg: any) => {
      if (!v) return
      if (typeof msg.targetTime === 'number') v.currentTime = msg.targetTime
      if (msg.type === 'play') v.play()
      if (msg.type === 'pause') v.pause()
    })

    return () => {
      v.removeEventListener('play', onPlay)
      v.removeEventListener('pause', onPause)
      v.removeEventListener('seeked', onSeeked)
      socket.off('video:action')
    }
  }, [socket, source])

  return <video ref={videoRef} controls style={{width:'100%'}} />
}
