import { useEffect, useRef } from 'react'

export default function ChatThread({ messages }) {
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  return (
    <div className="thread" aria-live="polite">
      {messages.map((message) => (
        <article
          key={message.id}
          className={`bubble bubble--${message.role}${message.tone ? ` bubble--${message.tone}` : ''}`}
        >
          <p>{message.text}</p>
          {message.meta ? <span className="meta">{message.meta}</span> : null}
        </article>
      ))}
      <div ref={endRef} />
    </div>
  )
}
