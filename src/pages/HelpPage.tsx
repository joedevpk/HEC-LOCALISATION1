import { useMemo, useState } from 'react';
import {
  Search,
  MapPinned,
  Compass,
  Heart,
  Globe,
  ShieldAlert,
  MessageCircleQuestion,
  ChevronDown,
  Mail,
} from 'lucide-react';
import { useNavigate } from '@/lib/router';
import { useCampus } from '@/context/CampusContext';
import { Button, EmptyState } from '@/components/ui';

const faqs = [
  {
    q: 'Comment trouver un bâtiment ?',
    a: "Utilisez la barre de recherche (icône loupe dans le header, ou depuis l'accueil) et tapez le nom du bâtiment, d'une salle ou d'un bureau. Les résultats s'affichent en temps réel ; cliquez sur un résultat pour l'ouvrir sur la carte.",
    icon: MapPinned,
  },
  {
    q: 'Comment utiliser le guidage ?',
    a: "Depuis la fiche d'un lieu sur la carte, appuyez sur « Me guider ». Un itinéraire à pied s'affiche sur la carte du campus jusqu'à votre destination.",
    icon: Compass,
  },
  {
    q: 'Comment ajouter un favori ?',
    a: "Ouvrez un lieu depuis la recherche ou la carte, puis appuyez sur l'icône cœur. Il apparaît ensuite dans « Mes favoris », accessible depuis le tableau de bord ou la navigation.",
    icon: Heart,
  },
  {
    q: 'Comment changer la langue ?',
    a: 'Utilisez le sélecteur de langue (icône globe) dans le header ou la sidebar, ou depuis Paramètres → Langue. Le choix est mémorisé pour vos prochaines visites.',
    icon: Globe,
  },
  {
    q: 'Comment signaler une erreur ?',
    a: "Ouvrez « Signalements » depuis le menu, choisissez le lieu concerné, décrivez le problème (position incorrecte, information erronée, photo, itinéraire…) et envoyez. L'administration traite ensuite votre signalement.",
    icon: ShieldAlert,
  },
];

export function HelpPage() {
  const go = useNavigate();
  const { campus } = useCampus();
  const [query, setQuery] = useState('');
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return faqs;
    return faqs.filter(
      (f) => f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <div className="mx-auto max-w-2xl px-5 py-6 lg:px-8 lg:py-10">
      <div className="text-center">
        <span className="inline-grid h-12 w-12 place-items-center rounded-2xl bg-hec-50 text-hec-600">
          <MessageCircleQuestion className="h-6 w-6" />
        </span>
        <h1 className="mt-3 font-display text-2xl font-bold text-hec-950">
          Centre d'aide
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Trouvez rapidement une réponse à vos questions sur {campus?.name ?? 'HEC Localisation'}.
        </p>
      </div>

      <div className="mt-6 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5">
        <Search className="h-4 w-4 shrink-0 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher dans l'aide…"
          className="min-w-0 flex-1 bg-transparent text-sm text-hec-950 placeholder:text-slate-400 focus:outline-none"
        />
      </div>

      <div className="mt-6">
        {filtered.length === 0 ? (
          <EmptyState
            icon={<Search className="h-5 w-5" />}
            title="Aucun résultat"
            description="Aucune question de la FAQ ne correspond à votre recherche."
          />
        ) : (
          <div className="space-y-2">
            {filtered.map((f, i) => {
              const open = openIndex === i;
              return (
                <div
                  key={f.q}
                  className="overflow-hidden rounded-2xl border border-slate-100 bg-white"
                >
                  <button
                    onClick={() => setOpenIndex(open ? null : i)}
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
                    aria-expanded={open}
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-hec-50 text-hec-600">
                      <f.icon className="h-4 w-4" />
                    </span>
                    <span className="flex-1 text-sm font-semibold text-hec-950">
                      {f.q}
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {open && (
                    <p className="px-4 pb-4 pl-16 text-sm leading-relaxed text-slate-600">
                      {f.a}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-100 bg-white p-5">
          <ShieldAlert className="h-5 w-5 text-hec-500" />
          <p className="mt-2 font-semibold text-hec-950">Signaler un problème</p>
          <p className="mt-1 text-sm text-slate-500">
            Position incorrecte, photo erronée, itinéraire cassé…
          </p>
          <Button size="sm" variant="secondary" className="mt-3" onClick={() => go('/reports')}>
            Signaler un problème
          </Button>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5">
          <Mail className="h-5 w-5 text-hec-500" />
          <p className="mt-2 font-semibold text-hec-950">Contacter l'administration</p>
          <p className="mt-1 text-sm text-slate-500">
            Pour toute autre question sur le campus {campus?.name ?? ''}.
          </p>
          <Button size="sm" variant="secondary" className="mt-3" onClick={() => go('/about')}>
            Voir les contacts
          </Button>
        </div>
      </div>
    </div>
  );
}
