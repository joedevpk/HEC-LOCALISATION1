// Supabase Edge Function « route-walking » — proxy OpenRouteService (profil foot-walking).
// La clé ORS vit UNIQUEMENT dans les secrets Supabase (ORS_API_KEY) : elle n'apparaît jamais
// dans le JavaScript du navigateur, dans une réponse, ni dans un journal.
// Logique HTTP / CORS : handler.ts. Logique pure : core.ts.
import { createHandler } from './handler.ts';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

Deno.serve(createHandler({ env: Deno.env, fetchImpl: (input, init) => fetch(input, init) }));
