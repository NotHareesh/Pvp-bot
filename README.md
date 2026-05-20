<div align="center">

# ⚔️ Minecraft PvP Combat Bot

A powerful, autonomous Minecraft combat bot built with [Mineflayer](https://github.com/PrismarineJS/mineflayer). Features intelligent PvP combat, base patrol AI, a real-time web dashboard, and a full suite of owner commands — all running headless on Node.js.

[![Node.js](https://img.shields.io/badge/Node.js-22+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Mineflayer](https://img.shields.io/badge/Mineflayer-4.37-blue?style=for-the-badge)](https://github.com/PrismarineJS/mineflayer)
[![License](https://img.shields.io/badge/License-ISC-yellow?style=for-the-badge)](LICENSE)

</div>

---

## ✨ Features

### 🤖 Combat & Defense
- **Self-Defense AI** — Automatically counter-attacks when hit by hostile players or mobs
- **Owner Protection** — Detects when the owner takes damage and engages the attacker
- **Wolf AI (Assist Mode)** — Joins the owner's fights when they swing at a target
- **Area Clear (`!fight`)** — Prioritizes and eliminates all nearby hostile mobs
- **Projectile Defense** — Detects arrows and retaliates against skeletons
- **Critical Hit Jumps** — Randomly performs sprint + jump attacks for critical damage
- **Shield Blocking** — Equips and activates shields during combat

### 🛡️ Base Patrol & Guard
- **Patrol Mode** — Autonomously patrols a configurable radius around a home position, scanning for threats
- **Guard Mode** — Continuously scans for and eliminates hostile mobs near the owner
- **Smart Targeting** — Ignores passive mobs (fish, animals, villagers) and only attacks hostile entities
- **Patrol + Combat Recovery** — Seamlessly resumes patrolling after combat encounters

### 🎒 Inventory & Equipment
- **Auto Armor Equip** — Continuously equips the best available armor
- **Auto Tool Selection** — Equips the best sword/axe based on material tier (Netherite > Diamond > Iron)
- **Totem of Undying** — Auto-equips totems in the off-hand
- **Auto Eat** — Eats food when hunger drops below threshold
- **Auto Store** — Deposits non-essential items into nearby chests when inventory is full
- **Ender Pearl Escape** — Uses ender pearls to flee at critically low health

### 🌐 Web Dashboard
- **Real-Time Stats** — Health, hunger, armor, XP, position, and combat status
- **Live Chat Feed** — View all in-game chat messages in real-time
- **Remote Commands** — Send bot commands directly from the browser
- **Friend Management** — Add/remove friends from the dashboard UI
- **Inventory Viewer** — Monitor bot inventory remotely
- **WebSocket Powered** — Instant updates via Socket.IO

### 🔧 Utility
- **Follow Modes** — Close (2 blocks), Loose (6 blocks), Stay, or Toggle
- **Home System** — Set home position and navigate back with pathfinding
- **Anti-AFK** — Periodic random movements to avoid AFK kicks
- **Auto Swim** — Automatically jumps to stay above water
- **Auto Door Opening** — Opens doors in the bot's path
- **Sleep Command** — Finds and sleeps in nearby beds, resumes patrol on wake
- **God Mode** — Grants max effects and attributes (requires server operator)
- **Friends List** — Persistent friend system; friends are never attacked
- **Console Admin** — Send commands from the terminal without Minecraft
- **Server Command Listener** — Accept commands from server console/command blocks

---

## 📋 Prerequisites

- **Node.js** v18 or higher
- A Minecraft Java Edition server (supports offline/cracked servers)
- **npm** (comes with Node.js)

---

## 🚀 Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/NotHareesh/Pvp-bot.git
cd Pvp-bot
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure the bot

Edit `config.json` with your server details:

```json
{
  "ip": "your-server.aternos.me",
  "port": 12345,
  "name": "BotName",
  "auto-night-skip": "true",
  "login-enabled": "false",
  "register-cmd": "/register password password",
  "login-cmd": "/login password"
}
```

| Field | Description |
|-------|-------------|
| `ip` | Server address |
| `port` | Server port |
| `name` | Bot's in-game username |
| `login-enabled` | Set to `"true"` if the server requires `/login` |
| `register-cmd` | Auto-register command (if needed) |
| `login-cmd` | Auto-login command (if needed) |

### 4. Set the owner

In `index.js`, update the `OWNER` constant to your Minecraft username:

```javascript
const OWNER = 'YourMinecraftUsername'
```

### 5. Start the bot

```bash
npm start
```

The bot will connect to the server and the web dashboard will be available at **`http://localhost:3000`**.

---

## 💬 Commands

All commands are sent via in-game chat and are **owner-only**. They can also be sent from the web dashboard or the terminal console.

### Combat & Guard

| Command | Description |
|---------|-------------|
| `!fight` | Attack all nearby hostile mobs (prioritized by threat level) |
| `!guard on` | Enable guard mode — auto-kill hostiles near owner |
| `!guard off` | Disable guard mode |
| `!stop` | Stop all combat, pathfinding, and movement |
| `!god` | Toggle god mode (requires OP) |

### Movement & Navigation

| Command | Description |
|---------|-------------|
| `!follow close` | Follow owner at 2 blocks distance |
| `!follow loose` | Follow owner at 6 blocks distance |
| `!follow stay` | Stop following, hold position |
| `!follow` | Toggle follow on/off |
| `!come` | Walk to the owner's current position |
| `!jump` | Make the bot jump |

### Home & Patrol

| Command | Description |
|---------|-------------|
| `!sethome` | Save the owner's current position as home |
| `!home` | Navigate to the saved home position |
| `!patrol on` | Start autonomous patrol around home |
| `!patrol off` | Stop patrolling |

### Inventory

| Command | Description |
|---------|-------------|
| `!inv` | Show current inventory |
| `!drop <item>` | Drop a specific item |
| `!drop all` | Drop all items |
| `!store` | Store items in a nearby chest (keeps tools & armor) |

### Social & Utility

| Command | Description |
|---------|-------------|
| `!friend add <name>` | Add a player to the friends list (won't be attacked) |
| `!friend remove <name>` | Remove a player from friends |
| `!friends` | List all friends |
| `!afk on` | Enable anti-AFK mode |
| `!afk off` | Disable anti-AFK mode |
| `!sleep` | Find and sleep in a nearby bed |
| `!help` | Show all commands in-game |

---

## 🖥️ Server Commands

The bot can accept commands from the Minecraft server console. Enable this by setting `ALLOW_SERVER_COMMANDS = true` in `index.js`.

```
# From server console:
/say !guard on
/msg BotName !patrol on
```

To require a prefix (e.g., only respond to `!bot` commands from server), set:
```javascript
const SERVER_CMD_PREFIX = '!bot'  // Server uses: /say !bot guard on
```

---

## 🏗️ Architecture

```
├── index.js           # Main bot logic — combat AI, commands, patrol, dashboard server
├── config.json        # Server connection settings
├── botdata.json       # Persistent data (friends list, home position)
├── public/
│   └── index.html     # Web dashboard (single-page app)
├── package.json       # Dependencies and scripts
└── Procfile           # Process file for deployment platforms
```

### Tech Stack

| Component | Technology |
|-----------|-----------|
| Bot Framework | [Mineflayer](https://github.com/PrismarineJS/mineflayer) |
| Pathfinding | [mineflayer-pathfinder](https://github.com/PrismarineJS/mineflayer-pathfinder) |
| Combat | [mineflayer-pvp](https://github.com/PrismarineJS/mineflayer-pvp) |
| Web Server | [Express](https://expressjs.com/) |
| Real-time | [Socket.IO](https://socket.io/) |
| Runtime | [Node.js](https://nodejs.org/) |

---

## 🧠 Combat AI Behavior

The bot uses a priority-based targeting system:

| Priority | Mob | Threat Level |
|----------|-----|-------------|
| 🔴 100 | Creeper | Highest — explosive |
| 🟠 90 | Skeleton | Ranged attacker |
| 🟠 85 | Witch | Potion attacks |
| 🟡 80 | Ravager | High damage |
| 🟡 75 | Pillager | Ranged attacker |
| 🟢 70 | Enderman | Teleporting |
| 🟢 60 | Spider | Fast melee |
| 🔵 50 | Zombie / Drowned / Husk / Stray | Standard melee |
| ⚪ 40 | Slime | Low threat |

---

## 🔧 Troubleshooting

### Bot joins but doesn't move or take damage
- If your server requires authentication, set `"login-enabled": "true"` in `config.json` and configure the login/register commands.

### Bot attacks passive mobs
- The bot maintains an internal passiveMobs list. If a modded mob is being targeted incorrectly, add it to the `passiveMobs` array in `index.js`.

### Bot disconnects frequently
- The bot auto-reconnects after 5 seconds on disconnect.
- Enable `!afk on` to prevent AFK kicks.

### Dashboard not loading
- Ensure port 3000 is not in use. The port can be changed via the `PORT` environment variable:
  ```bash
  PORT=8080 npm start
  ```

---

## 📄 License

This project is licensed under the **ISC License**.

---

<div align="center">

Made with ❤️ for Minecraft

</div>
