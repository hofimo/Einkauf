import { SUPABASE_KEY, SUPABASE_URL, isConfigured } from '../config';
import type { Table, Tables } from './types';

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
  /** 4xx (außer Timeout/Rate-Limit) werden nicht wiederholt. */
  get permanent(): boolean {
    return this.status >= 400 && this.status < 500 && this.status !== 408 && this.status !== 429;
  }
}

/** Minimaler Client für die PostgREST-Schnittstelle von Supabase. */
export class Api {
  readonly householdId: string;
  constructor(householdId: string) {
    this.householdId = householdId.toLowerCase();
  }

  static get available(): boolean {
    return isConfigured;
  }

  headers(extra: Record<string, string> = {}): Record<string, string> {
    const h: Record<string, string> = {
      apikey: SUPABASE_KEY,
      'x-household-id': this.householdId,
      'Content-Type': 'application/json',
      ...extra,
    };
    // Alte anon-Keys sind JWTs und gehören zusätzlich in den Authorization-Header.
    if (SUPABASE_KEY.startsWith('eyJ')) h.Authorization = `Bearer ${SUPABASE_KEY}`;
    return h;
  }

  private async send(path: string, init: RequestInit = {}, prefer?: string): Promise<Response> {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...init,
      headers: this.headers(prefer ? { Prefer: prefer } : {}),
    });
    if (!res.ok) throw new ApiError(res.status, `Serverfehler ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res;
  }

  async fetchAll<T extends Table>(table: T): Promise<Tables[T][]> {
    const res = await this.send(`${table}?select=*&household_id=eq.${this.householdId}&order=created_at.asc`);
    return res.json();
  }

  async upsert(table: Table, row: object): Promise<void> {
    await this.send(table, { method: 'POST', body: JSON.stringify(row) }, 'resolution=merge-duplicates,return=minimal');
  }

  async delete(table: Table, id: string): Promise<void> {
    await this.send(`${table}?id=eq.${id}`, { method: 'DELETE' }, 'return=minimal');
  }
}
