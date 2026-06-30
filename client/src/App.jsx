import { useEffect, useRef, useState } from 'react';

const WELCOME = {
  role: 'assistant',
  content:
    'Klaar om te bouwen. Vul eerst je bedrijfsprofiel in via "Mijn bedrijf" zodat ik je advies persoonlijk maak — stel daarna je vraag over groei, aanbod, prijzen of sales.',
  sources: [],
};

// Moet overeenkomen met PROFILE_FIELDS in de backend.
const PROFILE_FIELDS = [
  ['naam', 'Bedrijfsnaam', 'Bijv. Acme Coaching'],
  ['aanbod', 'Wat verkoop je? (aanbod / product / dienst)', 'Beschrijf je belangrijkste aanbod'],
  ['doelgroep', 'Wie is je ideale klant?', 'Voor wie is het, welk probleem los je op?'],
  ['prijzen', 'Prijzen / pakketten', 'Bijv. €2000 eenmalig, of €297/maand'],
  ['cijfers', 'Belangrijke cijfers (omzet, marge, klanten, CAC/LTV)', 'Bijv. €15k/maand omzet, 70% marge, 40 klanten'],
  ['doelen', 'Je doelen', 'Bijv. €50k/maand binnen 12 maanden'],
  ['knelpunt', 'Je grootste knelpunt op dit moment', 'Bijv. te weinig leads, lage conversie, geen tijd'],
  ['extra', 'Overige context', 'Alles wat ik nog moet weten'],
];

export default function App() {
  const [messages, setMessages] = useState([WELCOME]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const [profileOpen, setProfileOpen] = useState(false);
  const [profile, setProfile] = useState({});
  const [savingProfile, setSavingProfile] = useState(false);

  const scrollRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }, [input]);

  async function openProfile() {
    setProfileOpen(true);
    try {
      const res = await fetch('/api/profile');
      if (res.ok) setProfile(await res.json());
    } catch {
      /* laat leeg bij fout */
    }
  }

  async function saveProfile() {
    setSavingProfile(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
      if (!res.ok) throw new Error('Opslaan mislukt');
      setProfileOpen(false);
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingProfile(false);
    }
  }

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
        <div className="header-text">
          <h1>Hormozi Mentor</h1>
          <p>No-nonsense business coach · gegrond in jouw knowledge base</p>
        </div>
        <button className="profile-btn" onClick={openProfile}>
          Mijn bedrijf
        </button>
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

      {profileOpen && (
        <div className="modal-overlay" onClick={() => setProfileOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Mijn bedrijf</h2>
              <button className="modal-close" onClick={() => setProfileOpen(false)}>
                ×
              </button>
            </div>
            <p className="modal-intro">
              Hoe meer je invult, hoe persoonlijker je mentor. Deze info wordt bij elk antwoord
              meegestuurd.
            </p>
            <div className="modal-body">
              {PROFILE_FIELDS.map(([key, label, placeholder]) => (
                <label key={key} className="field">
                  <span>{label}</span>
                  <textarea
                    value={profile[key] || ''}
                    placeholder={placeholder}
                    onChange={(e) => setProfile((p) => ({ ...p, [key]: e.target.value }))}
                    rows={2}
                  />
                </label>
              ))}
            </div>
            <div className="modal-footer">
              <button className="secondary" onClick={() => setProfileOpen(false)}>
                Annuleren
              </button>
              <button onClick={saveProfile} disabled={savingProfile}>
                {savingProfile ? 'Opslaan...' : 'Opslaan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
