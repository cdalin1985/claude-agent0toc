export const COACH_COPY = {
  'challenge.range': {
    title: 'Who can I challenge?',
    body: 'Non-top-10 players can challenge up to 5 spots above (10 for your first ever). Top-10 players can go ±5. Rank #1 can challenge anyone.',
  },
  'decline.forfeit': {
    title: 'Declining = forfeit',
    body: 'Declining a challenge counts as a loss — the challenger wins by forfeit and may take your spot. You get a cooldown. An admin can reverse it only if rank/stats haven\'t changed.',
  },
  'scorekeeper': {
    title: 'One scoreboard',
    body: 'Only one player keeps the live score to prevent disputes. Whoever starts the match becomes the scorekeeper for both players.',
  },
  'cooldown': {
    title: '24-hour cooldown',
    body: 'After a loss, you must wait 24 hours before challenging up again. Defend your spot or wait it out. Wins let you challenge up immediately.',
  },
  'race.min': {
    title: 'Race to at least 6',
    body: 'The minimum race length is 6 games. There\'s no maximum as long as both players agree. The challenger picks the game and race length.',
  },
  'rank1.obligation': {
    title: 'Rank #1 obligation',
    body: 'The #1 player must play at least 2 top-5 opponents within 30 days of reaching #1, or be moved down to #10.',
  },
  'match.fee': {
    title: '$5 match fee',
    body: 'Each player owes $5 per match. Pay cash in the venue envelope or digitally (PayPal/Cash App/Venmo). The app logs the fee to the public treasury.',
  },
  'weekly.limit': {
    title: '2 challenges per week',
    body: 'You can issue a maximum of 2 challenges in any rolling 7-day window, and only one active outgoing challenge at a time.',
  },
  'confirm.result': {
    title: 'Both confirm the result',
    body: 'Each player submits the winner and score. When both match, the match auto-confirms and the ladder updates. Mismatches become disputes an admin resolves.',
  },
} as const;

export type CoachTipId = keyof typeof COACH_COPY;