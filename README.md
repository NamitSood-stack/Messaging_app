# Chat

One-to-one real-time messaging web app (WhatsApp / iMessage style), built with
Node.js, Express and Socket.IO.

For eval 1 the server keeps data **in memory**, and each browser caches its
chats in **localStorage**. No database to install. Restarting the server wipes
all accounts and messages.

## Features

- Sign up / log in / log out (scrypt password hashing, httpOnly session cookie)
- Search users by username and start a 1:1 chat
- Real-time messages over WebSockets, delivered to every open tab/device
- Message history loaded page by page as you scroll up
- Chat list with last message, time and unread count
- Chats cached in localStorage, so they show instantly after a reload
- Messages appear right away when sent, with retry; the server ignores
  duplicate retries
- Responsive layout (two panes on desktop, one pane on phones)

## Requirements

- Node.js 22.9+

## Run it

```bash
npm install
cp .env.example .env
npm run dev        # http://localhost:3000 (restarts on file changes)
```

Note: `npm run dev` restarts the server whenever you save a file, and that
wipes the in-memory data. Use `npm start` for a demo.

To try it, open the app in two browsers (or one normal + one private window),
sign up as two different users, search for the other username and chat.
Another trick: use `http://localhost:3000` in one tab and
`http://127.0.0.1:3000` in another. They count as different sites, so each tab
keeps its own login.

## Project layout

```
src/
  server.js        Express + Socket.IO setup
  config.js        environment variables
  db/              data access: in-memory store for now (store.js + one file per table)
  services/auth.js password hashing and sessions
  middleware/      requireAuth for REST routes
  routes/          REST API
  sockets/         real-time events
public/            frontend (plain HTML/CSS/JS, no build step)
later/postgres/    PostgreSQL version of src/db, migrations and Docker setup, for eval 2
```

## API

| Method | Path | Description |
| --- | --- | --- |
| POST | `/api/signup` | `{ username, password }` → creates user, logs in |
| POST | `/api/login` | `{ username, password }` → logs in |
| POST | `/api/logout` | ends the session |
| GET | `/api/me` | current user |
| GET | `/api/users?search=` | username prefix search |
| GET | `/api/conversations` | your chats, newest first |
| POST | `/api/conversations` | `{ username }` → opens (or creates) the chat |
| GET | `/api/conversations/:id/messages?before=&limit=` | message history page |

Login responses also include `instanceId`, which changes on every server
restart. The browser uses it to throw away cached data from an earlier run.

Socket events:

- client → server `message:send` `{ conversationId, clientMsgId, body }`, ack `{ message }` or `{ error }`
- server → client `message:new` `message`

## Switching to PostgreSQL later

`src/db/*` has the same functions in both versions. To switch, copy
`later/postgres/db/*` over `src/db/` (and drop `store.js`), then:

1. Move `later/postgres/migrations`, `scripts` and `docker-compose.yml` back
   to the project root.
2. Run `npm install pg`.
3. Add `DATABASE_URL` to `src/config.js` and `.env`.
4. Restore the `migrate` / `db:up` scripts in `package.json`.
5. In `routes/auth.js`, check for error code `23505` instead of
   `USERNAME_TAKEN`. Pick a fixed `instanceId`, or remove it.

Routes and sockets don't change.
