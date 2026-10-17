// Zugangsdaten zum eigenen Supabase-Projekt (siehe README, Schritt 1).
// Der anon/publishable Key darf öffentlich sein: Die Daten schützt der Haushalts-Code
// zusammen mit Row Level Security.
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL ?? 'https://DEIN-PROJEKT.supabase.co';
export const SUPABASE_KEY: string = import.meta.env.VITE_SUPABASE_KEY ?? 'DEIN-ANON-ODER-PUBLISHABLE-KEY';

export const isConfigured = !SUPABASE_URL.includes('DEIN-PROJEKT') && !SUPABASE_KEY.startsWith('DEIN-');
