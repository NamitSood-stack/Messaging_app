# What this project is

A web-based one-to-one messaging app, similar to WhatsApp Web or iMessage.
It runs in any browser (desktop or phone), so it doesn't depend on any
operating system.

Two people can create accounts, find each other by username and chat in real
time.

## What a user can do

- **Sign up and log in** with a username and password.
- **Search for another user** by username and start a private chat with them.
- **Send and receive messages instantly**, without refreshing the page.
- **See a chat list** with each chat's last message, its time and how many
  messages are unread.
- **Scroll up to load older messages.** History loads in pages of 50.
- **Reload without waiting.** Chats are saved in the browser and show up
  immediately.
- **Use it on a phone.** On a narrow screen it shows one panel at a time,
  like a mobile app.

## How it works

```
 Browser (HTML/CSS/JS)  ── localStorage: saved copy of your chats
   │  REST API (HTTP)        → login, chat list, message history
   │  WebSocket (Socket.IO)  → sending and receiving live messages
   ▼
 Node.js server (Express + Socket.IO)
   │
   ▼
 In-memory store (JavaScript Maps): users, sessions, chats, messages
```

1. **The browser** is a single page written in plain HTML, CSS and JavaScript,
   with no framework and no build step.
2. **The server** is written in Node.js and does two jobs:
   - **REST API (Express):** handles signup, login, user search, the chat list
     and loading old messages.
   - **WebSocket (Socket.IO):** keeps a live connection open to every logged-in
     browser. When someone sends a message, the server stores it and pushes it
     straight to both people in the chat.
3. **Storage** has two layers:
   - **On the server, in memory.** Users, sessions, chats and messages live in
     JavaScript `Map`s. This is fast and needs no setup, but everything is lost
     when the server restarts. A real database (PostgreSQL) is planned for the
     next eval, and that code is already written in `later/postgres/`.
   - **In the browser, in localStorage.** Each user's chat list, recent
     messages (up to 200 per chat) and unread counts are saved, so a reload
     shows them instantly.

### Why the server still stores messages

localStorage only exists inside one browser. Alice's browser can't read
Bob's. So the server has to hold accounts and messages and pass them between
the two people. localStorage is a fast local copy, not the shared storage.

### What happens when you send a message

1. The message appears on your screen right away, marked "sending".
2. The browser sends it to the server with a unique id that the browser
   generates itself.
3. The server checks that you belong to that chat, stores the message and
   pushes it to both users, on every tab or device they have open.
4. Your copy changes from "sending" to sent. If the network failed, the
   message shows "Not sent · tap to retry".

Because each message carries its own id, a retry can never create a
duplicate. The server sees it already has that id and returns the original.

### What happens when the server restarts

All in-memory data is gone, so everyone has to sign up again. The server gets
a new `instanceId` on each start. When a browser sees a new one, it deletes
its old saved chats, so it never shows messages that no longer exist.

## Security basics

- **Passwords** are hashed with `scrypt`, a slow hashing algorithm built for
  passwords. The real password is never stored.
- **Login sessions** use a random token kept in an `httpOnly` cookie, which
  page JavaScript can't read. The server stores only a hash of the token.
- **Every request is checked.** You can only read or send messages in chats
  you belong to.
- **Messages are shown as plain text**, which protects against script
  injection (XSS).
- **Logging out deletes the saved chats** from that browser.

## Built so it can grow

- **Data access sits behind one folder** (`src/db/`). The in-memory version and
  the PostgreSQL version have the same functions, so switching needs no change
  to routes or socket code.
- **Messages are delivered to a per-user "room"** (`user:<id>`). Adding a Redis
  adapter later lets messages reach users connected to different servers.
- **Old messages load by cursor** ("messages older than id X"), which stays
  fast once a real database holds millions of messages.

## Tech stack

| Part | Technology |
| --- | --- |
| Frontend | HTML, CSS, JavaScript, localStorage |
| Backend | Node.js 22, Express 5 |
| Real-time | Socket.IO (WebSockets) |
| Storage | In memory now; PostgreSQL planned (`later/postgres/`) |

## Folder structure

```
src/
  server.js        starts the app
  config.js        settings from environment variables
  db/              data storage (in-memory store)
  services/        password hashing and sessions
  middleware/      login check for API routes
  routes/          REST API endpoints
  sockets/         real-time message handling
public/            the web page (index.html, styles.css, app.js)
later/postgres/    database version, ready for the next eval
```

## How to run it

```bash
npm install
cp .env.example .env
npm start
```

Then open http://localhost:3000 in two different browsers, or one normal
window and one private window. Sign up as two users and chat.
