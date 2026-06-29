import { useEffect, useRef, useState } from 'react';

const WELCOME = {
  role: 'assistant',
  content:
    'Klaar om te bouwen. Stel je vraag over groei, aanbod, prijzen of sales — ik antwoord op basis van jouw knowledge base.',
  sources: [],
};

export default function App() {
  const [messages, setMessages] = useState([WELCOME]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const scrollRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  // Auto-resize van de textarea.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }, [input]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg = { role: 'user', content: text };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Stuur alleen de echte conversatie mee (zonder welkomstbericht).
        body: JSON.stringify({
          messages: history
            .filter((m) => m !== WELCOME)
            .map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Serverfout (${res.status})`);
      }

      let sources = [];
      try {
        sources = JSON.parse(decodeURIComponent(res.headers.get('X-Sources') || '%5B%5D'));
      } catch {
        sources = [];
      }

      // Voeg een lege assistant-bubble toe en vul die tijdens het streamen.
      setMessages((prev) => [...prev, { role: 'assistant', content: '', sources }]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: 'assistant', content: acc, sources };
          return next;
        });
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `⚠️ ${err.message}`, sources: [], error: true },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div className="app">
      <header className="header">
        <div className="logo">HM</div>
        <div>
          <h1>Hormozi Mentor</h1>
          <p>No-nonsense business coach · gegrond in jouw knowledge base</p>
        </div>
      </header>

      <main className="chat" ref={scrollRef}>
        {messages.map((m, i) => (
          <div key={i} className={`row ${m.role}`}>
            <div className={`bubble ${m.role} ${m.error ? 'error' : ''}`}>
              <div className="content">{m.content}</div>
              {m.role === 'assistant' && m.sources && m.sources.length > 0 && (
                <div className="sources">
                  <span className="sources-label">Bronnen:</span>
                  {m.sources.map((s) => (
                    <span key={s} className="source-chip">
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="row assistant">
            <div className="bubble assistant">
              <div className="typing">
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="composer">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Stel je vraag... (Enter om te versturen, Shift+Enter voor nieuwe regel)"
          rows={1}
        />
        <button onClick={sendMessage} disabled={loading || !input.trim()}>
          Stuur
        </button>
      </footer>
    </div>
  );
}
