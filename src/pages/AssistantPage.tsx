import { useEffect, useMemo, useRef, useState } from 'react';
import { Info, MessageCircle, Navigation, Send, User } from 'lucide-react';
import { useCampus } from '@/context/CampusContext';
import { useNavigate } from '@/lib/router';
import { Button } from '@/components/ui';
import { searchLocations } from '@/lib/nav';
import type { CampusLocation } from '@/lib/types';

/**
 * Assistant de recherche et d'orientation du campus.
 *
 * Ce n'est PAS une intelligence artificielle générative : il n'appelle aucun
 * service externe et ne produit que des réponses construites à partir des
 * données réellement enregistrées (lieux, événements, annonces). Quand une
 * information n'existe pas dans ces données, il le dit au lieu de l'inventer.
 */

interface ChatAction {
  label: string;
  locId: string;
  /** `true` : ouvre directement l'itinéraire vers ce lieu. */
  navigate?: boolean;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  actions?: ChatAction[];
}

// Mots de liaison retirés avant la recherche : « Où est la bibliothèque ? »
// doit chercher « bibliothèque », pas la phrase entière.
const FILLER =
  /\b(ou|où|est|se|trouve|trouver|comment|aller|va|vais|a|à|au|aux|la|le|les|l|un|une|des|de|du|d|dans|pour|vers|je|cherche|chercher|voudrais|veux|souhaite|montre|moi|me|salle|bureau|service|svp|stp|s'il|vous|plait|plaît|where|is|the|how|to|go|find|i|am|looking|for)\b/gi;

function extractQuery(raw: string): string {
  const cleaned = raw
    .replace(/[?!.,;:«»"“”]/g, ' ')
    .replace(/['’]/g, ' ')
    .replace(FILLER, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Si le nettoyage a tout retiré (ex. « salle »), on garde la saisie d'origine.
  return cleaned || raw.trim();
}

function describePlace(loc: CampusLocation): string {
  const where = [loc.building?.name, loc.floor?.name].filter(Boolean).join(', ');
  const parts = [`${loc.name}${loc.code ? ` (${loc.code})` : ''}`];
  if (where) parts.push(`se trouve : ${where}`);
  else parts.push('est enregistré dans la base du campus');
  if (loc.capacity) parts.push(`capacité : ${loc.capacity} places`);
  return parts.join(' — ');
}

export function AssistantPage() {
  const { campus, locations, events, announcements } = useCampus();
  const go = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ top: el.scrollHeight, behavior: reduce ? 'auto' : 'smooth' });
  }, [messages]);

  // Suggestions construites avec de VRAIS lieux du campus (jamais un nom
  // d'exemple qui n'existerait pas dans les données).
  const suggestions = useMemo(() => {
    const list = locations
      .filter((l) => l.name && l.kind !== 'entrance')
      .slice(0, 3)
      .map((l) => `Où est ${l.name} ?`);
    if (events.length > 0) list.push('Quels sont les événements à venir ?');
    return list;
  }, [locations, events.length]);

  const answer = (query: string): ChatMessage => {
    const q = query.toLowerCase();

    if (/^(bonjour|salut|hello|bonsoir|coucou)\b/.test(q.trim())) {
      return {
        role: 'assistant',
        content: 'Bonjour ! Indiquez-moi le nom d’un lieu, d’une salle ou d’un service à retrouver sur le campus.',
      };
    }
    if (/^(merci|thanks)/.test(q.trim())) {
      return { role: 'assistant', content: 'Avec plaisir !' };
    }

    if (/événement|evenement|event|forum|conférence|conference/.test(q)) {
      const upcoming = events.filter((e) => new Date(e.starts_at).getTime() >= Date.now() - 86_400_000);
      if (upcoming.length > 0) {
        const list = upcoming
          .slice(0, 3)
          .map((e) => {
            const date = new Date(e.starts_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
            return `• ${e.title} — ${date}${e.location_label ? `, ${e.location_label}` : ''}`;
          })
          .join('\n');
        return { role: 'assistant', content: `Prochains événements enregistrés :\n${list}` };
      }
      return { role: 'assistant', content: "Aucun événement à venir n'est enregistré pour le moment." };
    }

    if (/annonce|actualité|actualite|nouvelle/.test(q)) {
      if (announcements.length > 0) {
        const a = announcements[0];
        return { role: 'assistant', content: `Dernière annonce : ${a.title}. ${a.body}` };
      }
      return { role: 'assistant', content: "Aucune annonce n'est publiée pour le moment." };
    }

    const results = searchLocations(locations, extractQuery(query)).slice(0, 3);
    if (results.length > 0) {
      const [first, ...others] = results;
      const lines = [`${describePlace(first)}.`];
      if (others.length > 0) {
        lines.push(`Autres résultats possibles : ${others.map((o) => o.name).join(', ')}.`);
      }
      const actions: ChatAction[] = [
        { label: 'Voir sur la carte', locId: first.id },
        { label: 'Me guider', locId: first.id, navigate: true },
        ...others.map((o) => ({ label: o.name, locId: o.id })),
      ];
      return { role: 'assistant', content: lines.join('\n'), actions };
    }

    return {
      role: 'assistant',
      content:
        "Je n'ai pas trouvé ce lieu dans les données du campus. Essayez le nom exact, le code d'une salle ou le nom d'un bâtiment, ou utilisez la recherche de la carte.",
    };
  };

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setMessages((m) => [...m, { role: 'user', content: trimmed }, answer(trimmed)]);
    setInput('');
  };

  const welcome: ChatMessage = {
    role: 'assistant',
    content: `Bonjour ! Je vous aide à retrouver un lieu du campus ${campus?.name ?? 'HEC Kinshasa'} à partir des données enregistrées. Que cherchez-vous ?`,
  };
  const allMessages = messages.length === 0 ? [welcome] : messages;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-slate-100 bg-white px-5 py-4 lg:px-8">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-hec-950 text-white">
            <MessageCircle className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-lg font-bold text-hec-950">Assistant campus</h1>
            <p className="text-xs text-slate-500">Recherche et orientation à partir des données du campus</p>
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-6 lg:px-8">
        <div className="mx-auto max-w-2xl space-y-4">
          {allMessages.map((m, i) => (
            <MessageBubble
              key={i}
              message={m}
              onAction={(a) => go('/map', a.navigate ? { nav: a.locId } : { loc: a.locId })}
            />
          ))}

          {messages.length === 0 && suggestions.length > 0 && (
            <div className="mt-6">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Suggestions</p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="min-h-[44px] rounded-full border border-slate-200 bg-white px-3.5 py-2 text-left text-sm text-slate-600 hover:border-hec-200 hover:text-hec-600"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="flex items-start gap-1.5 pt-2 text-[11px] leading-snug text-slate-500">
            <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
            Cet assistant ne s’appuie pas sur une intelligence artificielle : il recherche dans les lieux,
            événements et annonces enregistrés.
          </p>
        </div>
      </div>

      <div className="border-t border-slate-100 bg-white px-5 py-3 lg:px-8">
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
            placeholder="Ex. : nom d’une salle, d’un service…"
            aria-label="Votre question sur le campus"
            enterKeyHint="send"
            className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-hec-950 placeholder:text-slate-500 focus:border-hec-400 focus:outline-none focus:ring-4 focus:ring-hec-100"
          />
          <Button type="submit" size="md" icon={<Send className="h-4 w-4" />} aria-label="Envoyer">
            <span className="hidden sm:inline">Envoyer</span>
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
  onAction: (action: ChatAction) => void;
}) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <span
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-white ${
          isUser ? 'bg-slate-500' : 'bg-hec-950'
        }`}
      >
        {isUser ? (
          <User className="h-4 w-4" aria-hidden="true" />
        ) : (
          <MessageCircle className="h-4 w-4" aria-hidden="true" />
        )}
      </span>
      <div className={`min-w-0 max-w-[85%] ${isUser ? 'text-right' : ''}`}>
        <div
          className={`inline-block rounded-2xl px-4 py-2.5 text-left text-sm leading-relaxed ${
            isUser ? 'bg-hec-500 text-white' : 'border border-slate-100 bg-white text-hec-950 shadow-sm'
          }`}
        >
          <p className="whitespace-pre-line break-words">{message.content}</p>
        </div>
        {message.actions && message.actions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {message.actions.map((a, i) => (
              <button
                key={`${a.locId}-${i}`}
                onClick={() => onAction(a)}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-hec-50 px-3 py-1.5 text-xs font-semibold text-hec-600 hover:bg-hec-100"
              >
                {a.navigate && <Navigation className="h-3.5 w-3.5" aria-hidden="true" />}
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
