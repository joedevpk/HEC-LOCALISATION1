import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { supabase } from '@/lib/supabase';
import { translate } from '@/lib/i18n';
import {
  defaultSettings,
  type Language,
  type ThemeMode,
  type UserSettings,
} from '@/lib/settings-types';
import { useAuth } from '@/context/AuthContext';

interface SettingsState {
  settings: UserSettings;
  loading: boolean;
  t: (key: string) => string;
  setLanguage: (lang: Language) => void;
  setTheme: (theme: ThemeMode) => void;
  updateSettings: (patch: Partial<UserSettings>) => void;
}

const SettingsContext = createContext<SettingsState | undefined>(undefined);

const LS_KEY = 'hec-settings';

function loadLocal(): UserSettings {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...defaultSettings, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return defaultSettings;
}

function applyTheme(theme: ThemeMode) {
  const root = document.documentElement;
  const dark =
    theme === 'dark' ||
    (theme === 'system' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);
  root.classList.toggle('dark', dark);
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [settings, setSettings] = useState<UserSettings>(loadLocal);
  const [loading, setLoading] = useState(true);

  const persistLocal = useCallback((s: UserSettings) => {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  }, []);

  const persistRemote = useCallback(
    async (s: UserSettings) => {
      if (!session) return;
      const { error } = await supabase.from('user_settings').upsert({
        user_id: session.user.id,
        ...s,
      });
      if (error) console.warn('settings persist failed', error.message);
    },
    [session],
  );

  const update = useCallback(
    (patch: Partial<UserSettings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        persistLocal(next);
        persistRemote(next);
        return next;
      });
    },
    [persistLocal, persistRemote],
  );

  // Load from DB when session changes
  useEffect(() => {
    let active = true;
    if (session) {
      (async () => {
        try {
          const { data } = await supabase
            .from('user_settings')
            .select('*')
            .eq('user_id', session.user.id)
            .maybeSingle();
          if (!active || !data) return;
          const remote = data as UserSettings;
          setSettings((prev) => {
            const merged = { ...prev, ...remote };
            persistLocal(merged);
            return merged;
          });
        } finally {
          if (active) setLoading(false);
        }
      })();
    } else {
      setLoading(false);
    }
    return () => {
      active = false;
    };
  }, [session, persistLocal]);

  // Apply theme whenever it changes
  useEffect(() => {
    applyTheme(settings.theme);
  }, [settings.theme]);

  // Listen for system theme changes when in system mode
  useEffect(() => {
    if (settings.theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('system');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [settings.theme]);

  // Apply text size
  useEffect(() => {
    const root = document.documentElement;
    const sizes: Record<string, string> = {
      small: '14px',
      normal: '16px',
      large: '18px',
    };
    root.style.fontSize = sizes[settings.text_size] ?? sizes.normal;
  }, [settings.text_size]);

  // Apply high contrast
  useEffect(() => {
    document.documentElement.classList.toggle('high-contrast', settings.high_contrast);
  }, [settings.high_contrast]);

  const t = useCallback(
    (key: string) => translate(settings.language, key),
    [settings.language],
  );

  return (
    <SettingsContext.Provider
      value={{
        settings,
        loading,
        t,
        setLanguage: (lang) => update({ language: lang }),
        setTheme: (theme) => update({ theme }),
        updateSettings: update,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsState {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
