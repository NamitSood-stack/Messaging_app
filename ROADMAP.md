# Roadmap

## Eval 1: done

A working one-to-one chat app:

- Accounts with signup, login and logout
- User search, and starting a private chat
- Real-time messaging over WebSockets
- Message history stored in server memory, with cursor pagination
- Chats cached in the browser's localStorage, so a reload shows them instantly
- Chat list with last message, time and unread count
- Sending that shows messages right away, with retries that can't create
  duplicates
- Responsive layout with light and dark mode

---

## Eval 2: make it feel like WhatsApp

Goal: the features people expect from a real messenger.

| Feature | What it means | How |
| --- | --- | --- |
| **PostgreSQL database** | Accounts and messages survive server restarts | Already written in `later/postgres/`. Swap it into `src/db/` (steps in README) |
| Delivery and read ticks | ✓ sent, ✓✓ delivered, blue ✓✓ read | Track per message when it was delivered and read, and send socket events back to the sender |
| Saved unread counts | Unread count survives reloads and syncs across devices | Store each user's last-read message per chat in the database |
| Typing indicator | "typing…" under the name | Short-lived socket event, not saved |
| Online / last seen | "online" or "last seen 5 min ago" | Track connections per user and save last seen on disconnect |
| Installable app (PWA) | "Add to home screen" on phones, works like an app | Web app manifest and service worker |
| Push notifications | Alerts when the tab is closed | Web Push API |
| Rate limiting | Stop spam and brute-force login attempts | Request limits per IP and per user |
| Automated tests | Prove the API and sockets work | `node:test` plus a test Postgres database |

## Eval 3: scale and deploy

Goal: prove the app can handle real load. This is the part that makes it a
strong resume project.

| Feature | What it means | How |
| --- | --- | --- |
| Several servers | Run 2 or more app servers at once | Docker Compose with nginx as load balancer |
| Delivery across servers | A user on server A can message a user on server B | Socket.IO Redis adapter |
| Shared presence | Online status stays correct across servers | Redis |
| Load testing | Real numbers for the resume | k6 or Artillery: e.g. 5,000 connections, p95 latency |
| CI pipeline | Tests run on every push | GitHub Actions |
| Live deployment | Public link recruiters can open | Render, Railway or Fly.io, plus managed Postgres |
| Monitoring | See errors and latency | Structured logs and a `/health` endpoint |

## Later / stretch goals

- **Media messages:** images and files, stored in object storage (S3 or
  Cloudflare R2) through upload links that expire.
- **Message actions:** reply/quote, reactions, edit, delete for everyone.
- **Search** within chats (Postgres full-text search).
- **End-to-end encryption:** the server can't read messages. Keys are created
  in the browser, similar to the Signal protocol. This is the biggest standout
  feature.
- **Group chats:** a change to the data model (a conversation members table
  instead of `user_a` and `user_b`).
- **Mobile app:** React Native using the same API, or keep the PWA.

---

## Resume

### Is it worth putting on a resume?

- **After eval 1:** a basic chat app is a common tutorial project. It's fine
  for a class but doesn't stand out yet.
- **After eval 3:** yes. Horizontal scaling, measured load-test numbers,
  message delivery guarantees and a live demo are what interviewers look for
  in backend and full-stack candidates.

### Example resume entry (after eval 3; fill in real numbers)

**Real-Time Messaging App** | Node.js, Socket.IO, PostgreSQL, Redis, Docker
[Live demo](#) · [GitHub](#)

- Built a WhatsApp-style one-to-one messenger with real-time delivery, read
  receipts, typing indicators and presence, used by **N** test users.
- Designed for horizontal scaling: stateless Node servers behind nginx, with
  cross-server delivery through the Socket.IO Redis adapter. Load-tested with
  k6 to **N** concurrent connections at **X ms** p95 latency.
- Made message delivery duplicate-proof using client-generated ids and a
  unique database constraint, so automatic retries never create duplicates.
- Implemented secure session auth (scrypt password hashing, hashed tokens in
  httpOnly cookies) and cursor-paginated history on indexed PostgreSQL tables.
- Set up Docker Compose for local development, SQL migrations and a GitHub
  Actions CI pipeline.

### Talking points for interviews

- **Why WebSockets instead of polling?** Lower latency and less load on the
  server. Explain Socket.IO's reconnection and message buffering.
- **How do you prevent duplicate messages?** Each message has an id from the
  client, the database has a unique constraint on (sender, id), and inserts
  use `ON CONFLICT DO NOTHING`.
- **How does it scale past one server?** Servers keep no state, sessions live
  in the database, each user has a room, and the Redis adapter carries
  messages between servers.
- **Why cursor pagination?** Page-number (`OFFSET`) queries get slower as the
  table grows. "Messages older than id X" stays fast because it uses the
  index.
- **Why hash session tokens?** If the database leaks, the stolen hashes can't
  be used to log in as anyone.

### Before you list it

- [ ] Push to a public GitHub repo with a clean README and screenshots or a GIF
- [ ] Deploy a live demo
- [ ] Add real load-test numbers
- [ ] Add tests and a CI status badge
