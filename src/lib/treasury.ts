import { supabase } from './supabase';
import type { TreasuryLedgerEffect, TreasurySummary } from '../types/database';

export type TreasurySnapshot = {
  summary: TreasurySummary;
  entries: TreasuryLedgerEffect[];
};

const EMPTY_SUMMARY: TreasurySummary = {
  total_credit_cents: 0,
  total_debit_cents: 0,
  balance_cents: 0,
  entry_count: 0,
  last_entry_at: null,
};

export async function fetchTreasurySnapshot(limit?: number): Promise<TreasurySnapshot> {
  const ledgerQuery = supabase
    .from('treasury_ledger_effects')
    .select('*')
    .order('created_at', { ascending: false });

  const [summaryResult, entriesResult] = await Promise.all([
    supabase.from('treasury_summary').select('*').maybeSingle(),
    typeof limit === 'number' ? ledgerQuery.limit(limit) : ledgerQuery,
  ]);

  // Throw rather than fall back to zeros. Swallowing these made a failed read
  // indistinguishable from an empty treasury, so react-query never entered an
  // error state and the page told the league it held $0.00 and had never
  // recorded a transaction. For a ledger, a wrong number stated confidently is
  // worse than an error.
  if (summaryResult.error) throw summaryResult.error;
  if (entriesResult.error) throw entriesResult.error;

  return {
    summary: (summaryResult.data as TreasurySummary | null) ?? EMPTY_SUMMARY,
    entries: (entriesResult.data as TreasuryLedgerEffect[] | null) ?? [],
  };
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export type LedgerSign = '+' | '−' | '';

export function ledgerSignFor(effectCents: number): LedgerSign {
  if (effectCents > 0) return '+';
  if (effectCents < 0) return '−';
  return '';
}
