import React, { useEffect, useState } from 'react'

export default function Chat({ socket, roomId, me }: any) {
  const [messages, setMessages] = useState<any[]>([])
  const [text, setText] = useState('')

  useEffect(() => {
    if (!socket) return
    socket.on('chat:message', (msg:any) => setMessages(prev=>[...prev, msg]))
    socket.on('chat:history', (hist:any) => setMessages(hist))
    return () => { socket.off('chat:message'); socket.off('chat:history') }
  }, [socket])

  const send = () => {
    if (!text.trim()) return
    socket.emit('chat:message', { text })
    setText('')
  }

  return (
    <div>
      <div style={{height:400, overflow:'auto', border:'1px solid #ddd', padding:8}}>
        {messages.map(m=> (
          <div key={m.id}><strong>{m.sender?.name||'anon'}</strong>: {m.text}</div>
        ))}
      </div>
      <div>
        <input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{ if (e.key==='Enter') send() }} />
        <button onClick={send}>Send</button>
      </div>
    </div>
  )
}
