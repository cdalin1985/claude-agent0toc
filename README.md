# Top of the Capital 🎱

**A competitive pool league tracker for Helena, Montana.**

TOC is a live-ranked challenge league where 70 players fight for the top spot, one rack at a time. No brackets, no seasons — just a living leaderboard that shifts every time someone wins.

---

## How It Works

Every player holds a numbered rank. You challenge someone within 5 spots of you. You play. The winner moves up, the loser shifts down, and the whole table rebalances automatically — in real time.

- **Challenge anyone ±5 ranks from you** — pick 8-ball, 9-ball, or 10-ball, set the race length, agree on a venue
- **Both players submit the score independently** — no he-said-she-said, the system only confirms when both sides agree
- **Rankings cascade instantly** — beat someone ranked above you and you take their spot; everyone in between drops one
- **Cooldowns keep it fair** — 24 hours between challenges after a match so people can't be sandbagged repeatedly
- **Points accumulate all season** — 2 for a win, 1 for showing up, so consistency matters even if you don't always win

---

## The League

70 real players. Real Fargo ratings. Real stakes.

Based out of **Eagles 4040** and **Valley Hub** in Helena, MT. If you shoot pool in Helena and you're not on this list, you probably know someone who is.

---

## The App

Built to feel like something more than a spreadsheet. Dark glass UI, animated rankings, live challenge notifications, and a leaderboard that updates the moment a match is confirmed.

- **Magic link login** — no passwords, just your email
- **Claim your profile** — find your name, tap it, it's yours
- **Real-time updates** — rankings shift live as matches are confirmed
- **Works on your phone** — installable PWA, designed mobile-first

---

## Want In?

Contact the league admin or show up to open table night at Eagles 4040. If you can run a rack, there's a spot for you.

---

## Tech Stack

For the developers who stumbled here:

- **React 18 + TypeScript + Vite** — frontend
- **Tailwind CSS v4** — styling
- **Framer Motion** — animations
- **Supabase** — Postgres, Auth, Realtime, Edge Functions
- **TanStack Query + Zustand** — data fetching and state

All mutations (challenges, results, ranking updates) go through Supabase Edge Functions. The client never writes directly to ranked tables.

---

*Helena, Montana · Est. 2025*
