import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { venuesFrom } from '../hooks/useLeagueSettings';
import { GlassCard } from '../components/GlassCard';
import { EKGLine } from '../components/EKGLine';
import type { LeagueSettings } from '../types/database';

function Section({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <GlassCard className="p-5">
      <h2 className="font-[Bebas_Neue] text-2xl text-[#E8E2D6] mb-3 flex items-center gap-2">
        <span className="text-xl">{icon}</span> {title}
      </h2>
      <div className="text-[#C9C3B8] text-sm font-[Barlow] leading-relaxed space-y-2">{children}</div>
    </GlassCard>
  );
}

function Rule({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="text-[#EF4444] shrink-0">▸</span>
      <span>{children}</span>
    </div>
  );
}

export default function RulesPage() {
  const navigate = useNavigate();

  const { data: settings } = useQuery<Partial<LeagueSettings> | null>({
    queryKey: ['league-settings-rules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('league_settings')
        .select('min_race, challenge_range, first_challenge_range, cooldown_hours, challenge_weekly_limit, challenge_expiry_days, match_play_days, venues')
        .single();
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60_000,
  });

  const minRace        = settings?.min_race ?? 6;
  const range          = settings?.challenge_range ?? 5;
  const firstRange     = settings?.first_challenge_range ?? 10;
  const cooldownHours  = settings?.cooldown_hours ?? 24;
  const weeklyLimit    = settings?.challenge_weekly_limit ?? 2;
  const expiryDays     = settings?.challenge_expiry_days ?? 7;
  const playDays       = settings?.match_play_days ?? 10;
  // One definition of the fallback list, shared with every other screen.
  const venues         = venuesFrom(settings as LeagueSettings | null);

  return (
    <div className="min-h-screen px-4 pt-4 pb-8">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-[#9CA3AF] p-2 -ml-2 mb-4">
        <ChevronLeft size={18} /> Back
      </button>

      <div className="text-center mb-6">
        <h1
          className="font-[Bebas_Neue] text-5xl tracking-wide text-[#E8E2D6]"
          style={{ textShadow: '0 0 30px rgba(198,40,40,0.25)' }}
        >
          League Rules
        </h1>
        <EKGLine className="mx-auto mt-1" />
        <p className="text-[#9CA3AF] text-xs font-[Barlow] mt-2">
          Top of the Capital · how the ladder works
        </p>
      </div>

      <div className="space-y-4 max-w-md mx-auto">
        <Section icon="🎱" title="The Ladder">
          <Rule>One unified ranking list across 8-Ball, 9-Ball, and 10-Ball. Every match counts on the same ladder.</Rule>
          <Rule>Win against someone ranked above you and you take their spot — everyone between shifts down one.</Rule>
          <Rule>Beat someone ranked below you and rankings stay as they are.</Rule>
        </Section>

        <Section icon="⚔️" title="Who You Can Challenge">
          <Rule>Your <strong>first challenge ever</strong>: anyone up to <strong>{firstRange} spots above</strong> you.</Rule>
          <Rule>After that (outside the top 10): up to <strong>{range} spots above</strong> you only.</Rule>
          <Rule>Top 10 players: anyone within <strong>{range} spots up or down</strong>.</Rule>
          <Rule>Rank #1 can challenge anyone.</Rule>
          <Rule>Limit of <strong>{weeklyLimit} challenges per rolling 7 days</strong>, and only one active outgoing challenge at a time.</Rule>
          <Rule>If more than one player challenges you, you must play the <strong>first person to challenge you</strong> before any other challenge can be made or accepted.</Rule>
        </Section>

        <Section icon="🎯" title="Before You Play">
          <Rule>All games are <strong>rack your own</strong>.</Rule>
          <Rule>Players <strong>lag or flip for the break</strong>, agreed between both players before the match.</Rule>
          <Rule><strong>Winner breaks</strong>, unless you agree otherwise — including agreeing to alternate.</Rule>
          <Rule>The <strong>challenger</strong> picks the game and the race. The player <strong>being challenged</strong> picks the table. Both agree on time and place.</Rule>
        </Section>

        <Section icon="🎲" title="Approved Games">
          <Rule><strong>8-Ball — BCA rules.</strong> Magic rack allowed if both players agree. Scratch on the break is ball in hand anywhere. Scratch on the 8 is <em>not</em> a loss — ball in hand to your opponent — unless you make the 8 and scratch, which is a loss.</Rule>
          <Rule><strong>9-Ball — modified BCA.</strong> No magic rack. The 9 on the break is good in the <strong>top two pockets only</strong>. You must call the 9. No three-foul rule.</Rule>
          <Rule><strong>10-Ball — call shot.</strong> Magic rack allowed. 1 at the front, 10 in the middle, the rest random. The 10 made early via carom or combo, if called, is <em>not</em> a win — it is spotted and you continue shooting. No three-foul rule.</Rule>
        </Section>

        <Section icon="🕐" title="Timing">
          <Rule>A challenge expires if not answered within <strong>{expiryDays} days</strong>.</Rule>
          <Rule>Once accepted, the match must be played within <strong>{playDays} days</strong>. If it isn't, it's automatically ruled a wash — no penalty for either player, and it doesn't use up a challenge.</Rule>
          <Rule>After you <strong>lose</strong> a match, or after a win that <strong>moves you up</strong> the list, you must wait <strong>{cooldownHours} hours</strong> before challenging up again. You can still challenge down.</Rule>
          <Rule>Successfully defending your spot costs you nothing — you can challenge up immediately.</Rule>
          <Rule>If a challenge ends in a <strong>wash</strong>, the player who issued it waits <strong>{cooldownHours} hours</strong> before challenging up. Whoever was challenged is free straight away.</Rule>
          <Rule>You'll get a reminder before your match starts.</Rule>
        </Section>

        <GlassCard className="p-5 border border-[#EF4444]/40 bg-[#EF4444]/5">
          <h2 className="font-[Bebas_Neue] text-2xl text-[#E8E2D6] mb-3 flex items-center gap-2">
            <span className="text-xl">⚖️</span> Declining = Forfeit
          </h2>
          <div className="text-[#C9C3B8] text-sm font-[Barlow] leading-relaxed space-y-2">
            <Rule><strong>Declining a challenge counts as a forfeit loss.</strong> The challenger gets a win and may take your spot if they're ranked below you.</Rule>
            <Rule>If you just can't find a time that works, use <strong>"Couldn't agree"</strong> instead — that's a wash with no penalty for either player.</Rule>
            <Rule>An admin can reverse an accidental decline only if rankings haven't changed since.</Rule>
          </div>
        </GlassCard>

        <Section icon="🏁" title="Playing the Match">
          <Rule>Races are to a minimum of <strong>{minRace}</strong>. Longer races by mutual agreement.</Rule>
          <Rule>Approved venues: <strong>{venues.join(' and ')}</strong>.</Rule>
          <Rule>Whoever taps <strong>Start Match</strong> first keeps the live score for both of you — one scoreboard, no double entry. The app shows the other player who has it.</Rule>
          <Rule>When it's over, <strong>both players submit the final result</strong> from their own phones. If the submissions match, it confirms automatically.</Rule>
          <Rule>If the submissions don't match, the match is flagged and a league admin will sort it out.</Rule>
        </Section>

        <Section icon="💵" title="Match Fee">
          <Rule>Each player owes a <strong>$5 match fee</strong> per match, paid to the league treasury.</Rule>
          <Rule>Pay by cash envelope (at the venue), PayPal, Cash App, or Venmo — pick your method when you submit your result.</Rule>
          <Rule>Envelopes must be <strong>filled out properly with the proper money</strong> and dropped in the box at either venue. Failure to do so <strong>voids the match</strong>.</Rule>
          <Rule>The treasury ledger is visible to every member under Treasury — full transparency, always.</Rule>
        </Section>

        <Section icon="👑" title="Holding Rank #1">
          <Rule>The #1 player must play at least <strong>2 matches against top-5 opponents every 30 days</strong>.</Rule>
          <Rule>Fail the obligation and you drop to #10. No hiding at the top.</Rule>
          <Rule>#1 may use their remaining challenges on anyone on the list.</Rule>
        </Section>

        <Section icon="😴" title="Going Inactive">
          <Rule>You can go inactive at any time — you keep your spot on the list, marked inactive, and can't be challenged.</Rule>
          <Rule>Inactive more than 30 days: you drop <strong>2 spots for every 30 days</strong> of inactivity.</Rule>
          <Rule>Coming back, you must either defend or wait <strong>7 days</strong> before challenging up — <strong>24 hours</strong> if you're last on the list. You can still be challenged, and still defend, the whole time.</Rule>
          <Rule>Inactive players are reviewed every 30 days. No engagement by <strong>90 days</strong> and you may be removed at the admins' discretion.</Rule>
        </Section>

        <Section icon="📣" title="Posting Callouts &amp; Results">
          <Rule>Callouts are posted on the <strong>Top of the Capital Facebook page</strong> — tag the player when you post the challenge.</Rule>
          <Rule>All callouts <em>and</em> all match results must be posted to Top of the Capital.</Rule>
          <Rule>Once a match time is agreed, the <strong>challenger</strong> posts the date and time.</Rule>
          <Rule>Admins can't update the list unless they're made aware of the results.</Rule>
        </Section>

        <GlassCard className="p-5 border border-[#F59E0B]/40 bg-[#F59E0B]/5">
          <h2 className="font-[Bebas_Neue] text-2xl text-[#E8E2D6] mb-3 flex items-center gap-2">
            <span className="text-xl">🤝</span> On the Honour System
          </h2>
          <div className="text-[#C9C3B8] text-sm font-[Barlow] leading-relaxed space-y-2">
            <Rule>These are league rules an admin applies rather than the app. They still apply — take them to an admin.</Rule>
            <Rule><strong>No-show.</strong> Not letting your opponent know drops you to their spot — the two of you swap places. Tell an admin and they'll record it. It can only ever drop you: if you're already ranked below your opponent, nothing moves.</Rule>
            <Rule><strong>Locking in your challenge.</strong> Defend your spot and you can challenge up immediately, but you must post that challenge with your results to lock it in. Until you do, you're open to challenges from behind.</Rule>
          </div>
        </GlassCard>

        <Section icon="🤝" title="Good to Know">
          <Rule>Questions, mistakes, or disputes? Talk to a league admin — they can fix most things.</Rule>
          <Rule>Exceptions to the 10-day match window must be approved by Top of the Capital.</Rule>
          <Rule>Top of the Capital has the <strong>final say</strong> on all rules.</Rule>
        </Section>
      </div>
    </div>
  );
}
