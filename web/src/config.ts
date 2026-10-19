// Zugangsdaten zum eigenen Supabase-Projekt (siehe README, Schritt 1).
// Der anon/publishable Key darf öffentlich sein: Die Daten schützt der Haushalts-Code
// zusammen mit Row Level Security.
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL ?? 'https://efeaekxfmlwtsvnjyjvq.supabase.co';
export const SUPABASE_KEY: string = import.meta.env.VITE_SUPABASE_KEY ?? 'sb_publishable_LK-U9XCE8cK81rhG6CFxFQ_QcWU6txh';

export const isConfigured = !SUPABASE_URL.includes('DEIN-PROJEKT') && !SUPABASE_KEY.startsWith('DEIN-');

// Öffentlicher Schlüssel für Push-Nachrichten (der private liegt nur in den Supabase-Secrets)
export const VAPID_PUBLIC_KEY = 'BCnooPOkgjMTb_XjYeLkFvCBukURosTsrV9xzIhejNfF4xKcAo_GwC87IlcQoUo1MLJykBCYXk4ceeP-wlKopnM';
