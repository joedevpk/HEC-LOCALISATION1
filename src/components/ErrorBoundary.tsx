import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui';
import { logError } from '@/lib/logger';

interface Props {
  children: ReactNode;
  /** Titre affiché dans le repli (ex. "La carte rencontre un problème."). */
  title?: string;
  /** Description secondaire, optionnelle. */
  description?: string;
}

interface State {
  hasError: boolean;
}

/**
 * Isole un composant critique (ÉTAPE 33 du cahier des charges) : une
 * exception dans CampusMap, BuildingPositionPicker ou AdminCampusManager ne
 * doit jamais faire planter toute l'application — seule la zone concernée
 * affiche un repli avec [Réessayer], le reste de l'app (navigation,
 * recherche, autres écrans) continue de fonctionner normalement.
 *
 * React exige une classe pour les error boundaries (pas encore d'équivalent
 * en hooks) — c'est la seule classe du projet, volontairement isolée ici.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logError('ErrorBoundary', error, {
      zone: this.props.title ?? '(zone non nommée)',
      componentStack: (info.componentStack ?? '').split('\n').slice(0, 4).join(' | '),
    });
  }

  private reset = () => this.setState({ hasError: false });

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 rounded-2xl border border-red-100 bg-red-50/60 p-8 text-center">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-red-100 text-red-600">
          <AlertTriangle className="h-5 w-5" />
        </span>
        <p className="text-sm font-semibold text-red-900">
          {this.props.title ?? 'Une erreur est survenue.'}
        </p>
        {this.props.description && (
          <p className="max-w-sm text-sm text-red-700/80">{this.props.description}</p>
        )}
        <Button variant="secondary" onClick={this.reset}>
          Réessayer
        </Button>
      </div>
    );
  }
}
