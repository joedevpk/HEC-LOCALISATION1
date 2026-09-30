import { useEffect, useMemo, useRef, useState } from 'react';
import { Send, Sparkles, User } from 'lucide-react';
import { useCampus } from '@/context/CampusContext';
import { useNavigate } from '@/lib/router';
import { Button } from '@/components/ui';
import { searchLocations } from '@/lib/nav';
import type { CampusLocation } from '@/lib/types';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  action?: { label: string; locId?: string; path?: string };
}

const suggestions = [
  'Où est la bibliothèque ?',
  'Comment aller à la salle B204 ?',
  'Où se trouve le service de scolarité ?',
  'Quels sont les événements à venir ?',
];

export function AssistantPage() {
  const { campus, locations, events, announcements } = useCampus();
  const go = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, thinking]);

  const findLocation = (q: string): CampusLocation | undefined => {
    const results = searchLocations(locations, q);
    return results[0];
  };

  const answer = (query: string): ChatMessage => {
    const q = query.toLowerCase();

    if (/biblioth|library/.test(q)) {
      const lib = findLocation('bibliothèque');
      if (lib) {
        return {
          role: 'assistant',
          content: `La ${lib.name} se trouve dans le ${lib.building?.name ?? 'campus'}. Elle dispose de ${lib.capacity ?? 'plusieurs'} places et est accessible à tous.`,
          action: { label: 'Voir le lieu', locId: lib.id },
        };
      }
    }

    if (/scolarit|inscription|relev/.test(q)) {
      const sc = findLocation('scolarité');
      if (sc) {
        return {
          role: 'assistant',
          content: `Le ${sc.name} est situé dans le ${sc.building?.name ?? 'bâtiment administratif'}. Vous pouvez vous y inscrire ou demander des attestations.`,
          action: { label: 'Voir le lieu', locId: sc.id },
        };
      }
    }

    if (/salle|room|b\d+|a\d+/.test(q)) {
      const room = findLocation(q);
      if (room) {
        return {
          role: 'assistant',
          content: `La ${room.name} (${room.code}) se trouve dans le ${room.building?.name ?? 'bâtiment'}${room.floor ? `, ${room.floor.name}` : ''}. Capacité : ${room.capacity ?? 'non précisée'} places.`,
          action: { label: 'Me guider', locId: room.id },
        };
      }
    }

    if (/événement|event|forum|conférence/.test(q)) {
      if (events.length) {
        const list = events
          .slice(0, 3)
          .map(
            (e) =>
              `• ${e.title} — ${new Date(e.starts_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} à ${e.location_label}`,
          )
          .join('\n');
        return {
          role: 'assistant',
          content: `Voici les prochains événements du campus :\n${list}`,
        };
      }
      return {
        role: 'assistant',
        content: "Aucun événement n'est programmé pour le moment.",
      };
    }

    if (/annonce|nouvelle|info/.test(q)) {
      if (announcements.length) {
        return {
          role: 'assistant',
          content: `Dernière annonce : ${announcements[0].title}. ${announcements[0].body}`,
        };
      }
    }

    if (/restaurant|cafétéria|manger|resto/.test(q)) {
      const r = findLocation('restaurant');
      if (r) {
        return {
          role: 'assistant',
          content: `Le ${r.name} se trouve dans la Maison de l'Étudiant. Capacité : ${r.capacity ?? '—'} places.`,
          action: { label: 'Voir le lieu', locId: r.id },
        };
      }
    }

    if (/bonjour|salut|hello|merci/.test(q)) {
      return {
        role: 'assistant',
        content: `Bonjour ! Je suis HEC AI. Posez-moi une question sur le campus : un lieu, un itinéraire, un événement…`,
      };
    }

    return {
      role: 'assistant',
      content:
        "Je n'ai pas cette information dans la base de données du campus HEC pour le moment. Essayez : « Où est la bibliothèque ? » ou « Comment aller à la salle B204 ? »",
    };
  };

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setMessages((m) => [...m, { role: 'user', content: trimmed }]);
    setInput('');
    setThinking(true);
    setTimeout(() => {
      const reply = answer(trimmed);
      setMessages((m) => [...m, reply]);
      setThinking(false);
    }, 600);
  };

  const welcome = useMemo(
    () =>
      ({
        role: 'assistant' as const,
        content: `Bonjour ! Je suis HEC AI, votre assistant du campus ${campus?.name ?? 'HEC Kinshasa'}. Comment puis-je vous aider à vous orienter aujourd'hui ?`,
      }) satisfies ChatMessage,
    [campus?.name],
  );

  const allMessages = messages.length === 0 ? [welcome] : messages;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-100 bg-white px-5 py-4 lg:px-8">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-hec-500 to-hec-700 text-white">
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <h1 className="font-display text-lg font-bold text-hec-950">HEC AI</h1>
            <p className="text-xs text-slate-500">
              Assistant intelligent du campus
            </p>
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="no-scrollbar flex-1 overflow-y-auto px-5 py-6 lg:px-8">
        <div className="mx-auto max-w-2xl space-y-4">
          {allMessages.map((m, i) => (
            <MessageBubble key={i} message={m} onAction={(locId) => go('/map', { loc: locId })} />
          ))}
          {thinking && (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-hec-950 text-white">
                <Sparkles className="h-4 w-4" />
              </span>
              <span className="flex gap-1">
                <span className="h-2 w-2 animate-bounce rounded-full bg-slate-300 [animation-delay:-0.3s]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-slate-300 [animation-delay:-0.15s]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-slate-300" />
              </span>
            </div>
          )}

          {messages.length === 0 && (
            <div className="mt-6">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Suggestions
              </p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-full border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-600 hover:border-hec-200 hover:text-hec-600"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-slate-100 bg-white px-5 py-4 lg:px-8">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="mx-auto flex max-w-2xl items-center gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Posez votre question sur le campus…"
            className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-hec-950 placeholder:text-slate-400 focus:border-hec-400 focus:outline-none focus:ring-4 focus:ring-hec-100"
          />
          <Button type="submit" size="md" icon={<Send className="h-4 w-4" />}>
            Envoyer
          </Button>
        </form>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  onAction,
}: {
  message: ChatMessage;
  onAction: (locId: string) => void;
}) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <span
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-white ${
          isUser ? 'bg-slate-400' : 'bg-hec-950'
        }`}
      >
        {isUser ? <User className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
      </span>
      <div className={`max-w-[80%] ${isUser ? 'text-right' : ''}`}>
        <div
          className={`inline-block rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
            isUser
              ? 'bg-hec-500 text-white'
              : 'bg-white border border-slate-100 text-hec-950 shadow-sm'
          }`}
        >
          <p className="whitespace-pre-line">{message.content}</p>
        </div>
        {message.action && message.action.locId && (
          <button
            onClick={() => onAction(message.action!.locId!)}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-hec-50 px-3 py-1.5 text-xs font-semibold text-hec-600 hover:bg-hec-100"
          >
            {message.action.label}
          </button>
        )}
      </div>
    </div>
  );
}
