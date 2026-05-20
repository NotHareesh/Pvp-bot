const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const pvp = require('mineflayer-pvp').plugin
const minecraftData = require('minecraft-data')
const fs = require('fs')

// Patrol generation counter — incremented every time patrol starts/stops
// so stale loops can detect they've been superseded and exit cleanly
let patrolGeneration = 0
const express = require('express')
const http = require('http')
const path = require('path')
const { Server: SocketServer } = require('socket.io')
let guardMode = false
let rawdata = fs.readFileSync('config.json')
let data = JSON.parse(rawdata)
let currentTarget = null
let combatInterval = null

let antiAfkInterval = null
let followMode = 'close'
let homePosition = null
let patrolMode = false
let patrolRadius = 20
let isGoingHome = false
const app = express()
const server = http.createServer(app)
const io = new SocketServer(server, {
    cors: { origin: '*' },
    transports: ['websocket', 'polling']
})

// Chat message buffer for dashboard
const chatBuffer = []
const CHAT_BUFFER_MAX = 100

function pushChatBuffer(type, text) {
    chatBuffer.push({ type, text, timestamp: Date.now() })
    while (chatBuffer.length > CHAT_BUFFER_MAX) chatBuffer.shift()
    // Broadcast to all connected dashboards
    io.emit('chatMessage', { type, text })
}

// =========================
// SETTINGS
// =========================
function logToOwner(bot, msg) {

    bot.chat(`/msg ${OWNER} ${msg}`)
}
const OWNER = 'SilverSurfer915'

// Server command settings
// The bot will accept commands from the Minecraft server console/command blocks
// Server can use: /say !command  OR  /msg BotName !command  OR  /tellraw @a {"text":"!command"}
// If SERVER_CMD_PREFIX is set (e.g. '!bot'), server uses: /say !bot stop  (maps to !stop)
// If empty, server just uses normal ! commands: /say !stop
const SERVER_CMD_PREFIX = ''  // Set to '!bot' to require e.g. '/say !bot stop'
const ALLOW_SERVER_COMMANDS = true

// =========================
// PERSISTENT DATA
// =========================

const BOT_DATA_FILE = 'botdata.json'

function loadBotData() {
    try {
        if (fs.existsSync(BOT_DATA_FILE)) {
            const raw = fs.readFileSync(BOT_DATA_FILE)
            return JSON.parse(raw)
        }
    } catch (err) {
        console.log('⚠️ Failed to load botdata.json, using defaults')
    }
    return { friends: [OWNER], home: null }
}

function saveBotData() {
    const saveData = {
        friends: FRIENDS,
        home: homePosition ? { x: homePosition.x, y: homePosition.y, z: homePosition.z } : null
    }
    try {
        fs.writeFileSync(BOT_DATA_FILE, JSON.stringify(saveData, null, 2))
    } catch (err) {
        console.log('⚠️ Failed to save botdata.json')
    }
}

const botData = loadBotData()
const FRIENDS = botData.friends
if (botData.home) {
    homePosition = { x: botData.home.x, y: botData.home.y, z: botData.home.z }
    // Will be converted to a proper Vec3 after bot spawns
}

let death = 0
let lastProtectMessage = 0
let godMode = false

// =========================
// CREATE BOT
// =========================

function createBot() {

    const bot = mineflayer.createBot({
        host: data.ip,
        port: data.port,
        username: data.name,
        auth: 'offline'
    })

    let defaultMove = null

    // =========================
    // LOAD PLUGINS
    // =========================

    bot.loadPlugin(pathfinder)
    bot.loadPlugin(pvp)

    // =========================
    // HELPERS (ACCESSIBLE TO ALL LISTENERS)
    // =========================

    // Passive / non-hostile mobs that should never be auto-targeted
    const passiveMobs = [
        'cod', 'salmon', 'tropical_fish', 'pufferfish',   // fish
        'squid', 'glow_squid', 'dolphin', 'axolotl',     // water mobs
        'turtle', 'tadpole', 'frog',                      // amphibians
        'cow', 'pig', 'sheep', 'chicken', 'rabbit',       // farm animals
        'horse', 'donkey', 'mule', 'llama',               // rideable
        'cat', 'ocelot', 'wolf', 'fox', 'parrot',         // tameable
        'bat', 'bee', 'goat', 'mooshroom',                // misc passive
        'villager', 'wandering_trader', 'iron_golem',     // NPCs
        'snow_golem', 'allay', 'sniffer', 'camel',
        'armor_stand', 'item_frame', 'glow_item_frame',   // decorative entities
        'painting', 'boat', 'minecart',
    ]

    // Hostile mob priority
    const priorities = {
        creeper: 100,
        skeleton: 90,
        witch: 85,
        ravager: 80,
        pillager: 75,
        enderman: 70,
        spider: 60,
        zombie: 50,
        drowned: 50,
        husk: 50,
        stray: 50,
        slime: 40
    }

    function getPlayerEntity(name) {
        if (!name) return null
        const lowerName = name.toLowerCase()
        const player = Object.values(bot.players).find(p => p.username && p.username.toLowerCase() === lowerName)
        return player ? player.entity : null
    }

    function isValidEnemy(entity, allowPassive = false) {

        if (!entity) return false

        if (!entity.isValid) return false

        if (!entity.position) return false

        // Ignore self
        if (entity === bot.entity) return false

        // Ignore friends
        if (
            entity.username &&
            FRIENDS.includes(entity.username)
        ) return false

        // Ignore projectiles/items
        if (
            entity.type === 'object' ||
            entity.type === 'other' ||
            entity.name === 'wind_charge' ||
            entity.name === 'arrow' ||
            entity.name === 'fireball' ||
            entity.name === 'small_fireball'
        ) return false

        // Ignore passive / non-hostile mobs (fish, animals, villagers, etc.)
        if (!allowPassive && passiveMobs.includes(entity.name)) return false

        return true
    }

    function attackTarget(target, allowPassive = false) {

        if (!isValidEnemy(target, allowPassive)) return

        currentTarget = target

        console.log(
            `⚔️ Attacking ${target.name || target.username}`
        )

        // Stop any active navigation/patrol so mineflayer-pvp has full pathfinding control
        try {
            bot.pathfinder.setGoal(null)
        } catch (err) {
            // Ignore pathfinder errors
        }

        // Sprint attacks
        bot.setControlState('sprint', true)

        // Random crit jumps
        if (Math.random() > 0.6) {

            bot.setControlState('jump', true)

            setTimeout(() => {

                bot.setControlState('jump', false)

            }, 250)
        }

        try {

            bot.pvp.attack(target)

        } catch (err) {

            console.log('❌ Attack failed')
        }
    }

    // =========================
    // LOGIN
    // =========================

    bot.on('login', () => {
        console.log('🤖 Bot logged in!')
    })

    // =========================
    // SPAWN
    // =========================

    bot.once('spawn', () => {

        console.log('✅ Bot spawned!')

        const mcData = minecraftData(bot.version)

        // Convert loaded home position to Vec3
        if (homePosition && typeof homePosition.x === 'number') {
            const { Vec3 } = require('vec3')
            homePosition = new Vec3(homePosition.x, homePosition.y, homePosition.z)
            console.log(`🏠 Loaded home: X:${Math.round(homePosition.x)} Y:${Math.round(homePosition.y)} Z:${Math.round(homePosition.z)}`)
        }

        defaultMove = new Movements(bot, mcData)
        // =========================
        // AUTO STORE
        // =========================

        setInterval(async () => {

            // Only store if inventory crowded
            if (bot.inventory.emptySlotCount() > 5) return

            try {

                const chestBlock = bot.findBlock({

                    matching: block =>
                        block.name.includes('chest'),

                    maxDistance: 16
                })

                if (!chestBlock) return

                console.log('📦 Storing inventory')

                const chest = await bot.openContainer(chestBlock)

                const items = bot.inventory.items()

                for (const item of items) {

                    // Keep tools
                    if (
                        item.name.includes('sword') ||
                        item.name.includes('pickaxe') ||
                        item.name.includes('axe') ||
                        item.name.includes('helmet') ||
                        item.name.includes('chestplate') ||
                        item.name.includes('leggings') ||
                        item.name.includes('boots') ||
                        item.name.includes('totem')
                    ) continue

                    try {

                        await chest.deposit(
                            item.type,
                            null,
                            item.count
                        )

                    } catch { }
                }

                chest.close()

                console.log('✅ Stored items')

            } catch { }

        }, 15000)
        // =========================
        // PATHFINDER SETTINGS
        // =========================

        defaultMove.canDig = false

        defaultMove.allowParkour = true

        defaultMove.canOpenDoors = true

        defaultMove.allowSprinting = true
        defaultMove.canSprint = true

        // Allow block placing for scaffolding
        defaultMove.placeCost = 1

        // Digging disabled by default (only enabled during mining)
        defaultMove.digCost = 100

        // Safer movement
        defaultMove.maxDropDown = 3

        defaultMove.infiniteLiquidDropdownDistance = false

        // Allowed scaffold blocks
        defaultMove.scafoldingBlocks = [
            mcData.itemsByName.dirt.id
        ]

        bot.pathfinder.setMovements(defaultMove)

        // Disable digging in PVP's own movements too
        bot.pvp.movements.canDig = false

        // Restore our movements after combat ends and resume patrol if active
        bot.on('stoppedAttacking', () => {
            defaultMove.canDig = false
            bot.pathfinder.setMovements(defaultMove)
            currentTarget = null

            // If patrol mode is active, resume patrolling after a short delay
            if (patrolMode && homePosition) {
                setTimeout(() => {
                    if (!patrolMode || bot.pvp.target) return
                    // Navigate back toward home area, patrol loop will pick up from goal_reached
                    const angle = Math.random() * Math.PI * 2
                    const dist = 4 + Math.random() * 8
                    const targetX = homePosition.x + Math.cos(angle) * dist
                    const targetZ = homePosition.z + Math.sin(angle) * dist
                    try {
                        const goal = new goals.GoalNear(targetX, homePosition.y, targetZ, 2)
                        bot.pathfinder.setGoal(goal, false)
                    } catch (err) {
                        console.log('⚠️ Failed to resume patrol after combat')
                    }
                }, 1500)
            }
        })

        bot.chat('🤖 AI Combat Bot Online')
        pushChatBuffer('bot-msg', '🤖 AI Combat Bot Online')

        // ===========================
        // DASHBOARD CHAT FEED
        // ===========================
        // Forward all Minecraft chat messages to the web dashboard
        bot.on('message', (jsonMsg, position) => {
            const text = jsonMsg.toString().trim()
            if (!text) return

            // Classify message type for dashboard styling
            let type = 'chat'
            if (text.includes('[Server]') || text.includes('[CONSOLE]')) {
                type = 'server'
            } else if (text.includes(bot.username)) {
                type = 'bot-msg'
            }

            pushChatBuffer(type, text)
        })

        // =========================
        // AUTO EQUIP ARMOR
        // =========================

        setInterval(() => {

            const helmet = bot.inventory.items().find(item =>
                item.name.includes('helmet')
            )

            const chestplate = bot.inventory.items().find(item =>
                item.name.includes('chestplate')
            )

            const leggings = bot.inventory.items().find(item =>
                item.name.includes('leggings')
            )

            const boots = bot.inventory.items().find(item =>
                item.name.includes('boots')
            )

            if (helmet) {
                bot.equip(helmet, 'head').catch(() => { })
            }

            if (chestplate) {
                bot.equip(chestplate, 'torso').catch(() => { })
            }

            if (leggings) {
                bot.equip(leggings, 'legs').catch(() => { })
            }

            if (boots) {
                bot.equip(boots, 'feet').catch(() => { })
            }

        }, 5000)


        // =========================
        // AUTO EQUIP BEST TOOLS
        // =========================

        setInterval(async () => {

            try {

                // Sword priority
                const sword =
                    bot.inventory.items().find(i =>
                        i.name.includes('netherite_sword')
                    ) ||
                    bot.inventory.items().find(i =>
                        i.name.includes('diamond_sword')
                    ) ||
                    bot.inventory.items().find(i =>
                        i.name.includes('iron_sword')
                    )

                // Pickaxe priority
                const pickaxe =
                    bot.inventory.items().find(i =>
                        i.name.includes('netherite_pickaxe')
                    ) ||
                    bot.inventory.items().find(i =>
                        i.name.includes('diamond_pickaxe')
                    ) ||
                    bot.inventory.items().find(i =>
                        i.name.includes('iron_pickaxe')
                    )

                // Axe priority
                const axe =
                    bot.inventory.items().find(i =>
                        i.name.includes('netherite_axe')
                    ) ||
                    bot.inventory.items().find(i =>
                        i.name.includes('diamond_axe')
                    ) ||
                    bot.inventory.items().find(i =>
                        i.name.includes('iron_axe')
                    )

                // Combat = sword
                if (bot.pvp.target && sword) {
                    if (!bot.heldItem || bot.heldItem.name !== sword.name) {
                        await bot.equip(sword, 'hand')
                    }
                    return
                }



                // Default fallback: sword first, then axe
                if (sword) {
                    if (!bot.heldItem || bot.heldItem.name !== sword.name) {
                        await bot.equip(sword, 'hand')
                    }
                } else if (axe) {
                    if (!bot.heldItem || bot.heldItem.name !== axe.name) {
                        await bot.equip(axe, 'hand')
                    }
                }

            } catch { }

        }, 2000)
        // =========================
        // TOTEM AUTO EQUIP
        // =========================

        setInterval(() => {

            const totem = bot.inventory.items().find(item =>
                item.name.includes('totem')
            )

            if (!totem) return

            bot.equip(totem, 'off-hand').catch(() => { })

        }, 3000)

        // =========================
        // LOW HEALTH PEARL ESCAPE
        // =========================

        let lastPearl = 0
        let escaping = false

        bot.on('physicsTick', async () => {

            // Already escaping
            if (escaping) return

            // Only pearl at VERY low HP
            if (bot.health > 4) return

            const now = Date.now()

            // 15 second cooldown
            if (now - lastPearl < 15000) return

            const pearl = bot.inventory.items().find(item =>
                item.name.includes('ender_pearl')
            )

            if (!pearl) return

            try {

                escaping = true
                lastPearl = now

                console.log('🟣 Pearl escape used')

                // STOP combat
                bot.pvp.stop()

                currentTarget = null

                // Equip pearl
                await bot.equip(pearl, 'hand')

                // Look SLIGHTLY upward
                // NOT TOO HIGH
                await bot.look(
                    bot.entity.yaw,
                    -0.3,
                    true
                )

                // Throw pearl
                bot.activateItem()

                // Run away after pearl
                bot.setControlState('forward', true)
                bot.setControlState('sprint', true)

                setTimeout(() => {

                    bot.setControlState('forward', false)

                    escaping = false

                }, 4000)

            } catch (err) {

                escaping = false

                console.log('❌ Pearl escape failed')
            }
        })

        // =========================
        // AUTO SWIM
        // =========================

        let wasInWater = false

        bot.on('physicsTick', () => {
            if (!bot.entity || !bot.entity.position) return

            const feetBlock = bot.blockAt(bot.entity.position)
            const headBlock = bot.blockAt(bot.entity.position.offset(0, 1, 0))
            const isFeetWater = feetBlock && (feetBlock.name.includes('water') || feetBlock.name.includes('bubble_column'))
            const isHeadWater = headBlock && (headBlock.name.includes('water') || headBlock.name.includes('bubble_column'))

            const inWater = !!(isFeetWater || isHeadWater)

            if (inWater) {
                bot.setControlState('jump', true)
                wasInWater = true
            } else if (wasInWater) {
                bot.setControlState('jump', false)
                wasInWater = false
            }
        })

        // =========================
        // AUTO OPEN DOORS
        // =========================

        let lastDoorOpen = 0

        bot.on('physicsTick', () => {
            if (!bot.entity) return

            const now = Date.now()
            if (now - lastDoorOpen < 1000) return // 1s cooldown

            // Check blocks at feet and head level in the direction the bot is moving
            const pos = bot.entity.position
            const yaw = bot.entity.yaw

            // Check 1 block ahead in the direction the bot is facing
            const dx = -Math.sin(yaw)
            const dz = -Math.cos(yaw)
            const frontPos = pos.offset(dx, 0, dz)

            for (const checkPos of [frontPos, frontPos.offset(0, 1, 0)]) {
                const block = bot.blockAt(checkPos)
                if (!block) continue

                if (block.name.includes('door') && !block.name.includes('trapdoor')) {
                    // Check if door is closed (open property = false or 'false')
                    const isOpen = block.getProperties?.()?.open
                    if (isOpen === false || isOpen === 'false') {
                        bot.activateBlock(block).catch(() => {})
                        lastDoorOpen = now
                        break
                    }
                }
            }
        })

        // (Helper functions isValidEnemy and attackTarget moved to top-level of createBot for proper scoping)

        // =========================
        // SELF DEFENSE
        // =========================

        let lastSelfDefenseTime = 0

        bot.on('entityHurt', entity => {

            // Bot got hit
            if (entity !== bot.entity) return

            // Debounce: only react once every 2 seconds to avoid spam
            const now = Date.now()
            if (now - lastSelfDefenseTime < 2000) return
            lastSelfDefenseTime = now

            // Already fighting something, don't switch targets
            if (bot.pvp.target) return

            console.log('⚠️ I got attacked!')

            const attacker = bot.nearestEntity(e => {

                if (!isValidEnemy(e)) return false

                return (
                    e.position.distanceTo(bot.entity.position) <= 6
                )
            })

            if (!attacker) return

            console.log(
                `⚔️ Counter attacking ${attacker.name || attacker.username}`
            )

            attackTarget(attacker)
        })

        // =========================
        // PROTECT OWNER
        // =========================

        let lastProtectDefenseTime = 0

        bot.on('entityHurt', entity => {

            const owner = bot.players[OWNER]?.entity

            if (!owner) return

            // Owner got hit
            if (entity !== owner) return

            // Debounce: only react once every 2 seconds
            const now = Date.now()
            if (now - lastProtectDefenseTime < 2000) return
            lastProtectDefenseTime = now

            // If patrolMode is active and owner is far away, ignore!
            if (patrolMode && homePosition && owner.position.distanceTo(homePosition) > 20) return

            // Already fighting something, don't switch targets
            if (bot.pvp.target) return

            const attacker = bot.nearestEntity(e => {

                if (!isValidEnemy(e)) return false

                return (
                    e.position.distanceTo(owner.position) <= 6
                )
            })

            if (!attacker) return

            if (now - lastProtectMessage > 5000) {

                logToOwner(bot, `🛡️ Protecting you!`)

                lastProtectMessage = now
            }

            attackTarget(attacker)
        })

        // =========================
        // WOLF AI
        // ASSIST OWNER ATTACKS
        // =========================

        let lastWolfAssistTime = 0
        let lastWolfAssistMsg = 0

        bot.on('entitySwingArm', entity => {

            // Only owner
            if (!entity) return

            if (entity.username !== OWNER) return

            // Debounce: only react once every 2 seconds
            const now = Date.now()
            if (now - lastWolfAssistTime < 2000) return
            lastWolfAssistTime = now

            // If patrolMode is active and owner is far away, ignore!
            if (patrolMode && homePosition && entity.position.distanceTo(homePosition) > 20) return

            // Already fighting something, don't switch targets
            if (bot.pvp.target) return

            // Find nearest entity near owner
            const target = bot.nearestEntity(e => {

                if (!isValidEnemy(e, true)) return false

                // Must be VERY close to owner
                return (
                    e.position.distanceTo(entity.position) <= 4
                )
            })

            if (!target) return

            // Throttle chat messages to once every 10 seconds
            if (now - lastWolfAssistMsg > 10000) {
                logToOwner(
                    bot,
                    `🐺 Assisting against ${target.name || target.username}`
                )
                lastWolfAssistMsg = now
            }
            attackTarget(target, true)
        })
        // =========================
        // SHIELD AI
        // =========================

        setInterval(async () => {

            // Need active combat with a valid, nearby target
            const pvpTarget = bot.pvp.target
            if (!pvpTarget) return
            if (!pvpTarget.isValid || !pvpTarget.position) return
            if (pvpTarget.position.distanceTo(bot.entity.position) > 6) return

            const shield = bot.inventory.items().find(item =>
                item.name.includes('shield')
            )

            if (!shield) return

            try {

                // Equip shield
                await bot.equip(shield, 'off-hand')

                // Random blocking
                if (Math.random() > 0.5) {

                    console.log('🛡️ Blocking')

                    bot.activateItem()

                    setTimeout(() => {

                        bot.deactivateItem()

                    }, 700)
                }

            } catch (err) {

                console.log('❌ Shield failed')
            }

        }, 2000)
        // =========================
        // RESET TARGET
        // =========================

        bot.on('entityDead', entity => {

            if (entity === currentTarget) {

                currentTarget = null

                bot.pvp.stop()
            }
        })
        // =========================
        // GUARD AI
        // =========================

        const hostileMobs = [
            'zombie',
            'skeleton',
            'creeper',
            'spider',
            'enderman',
            'witch',
            'pillager',
            'ravager',
            'slime',
            'drowned',
            'husk',
            'stray'
        ]

        setInterval(() => {

            // If bot is already in PvP combat, actively targeting something, or going home, do nothing
            if (bot.pvp.target || currentTarget || isGoingHome || combatInterval) return

            // Guard base if patrolMode is active
            if (patrolMode && homePosition) {
                // Find highest priority hostile within patrolRadius of home position
                const hostiles = Object.values(bot.entities).filter(e => {
                    if (!e || !e.isValid || !e.position) return false
                    if (!priorities[e.name]) return false
                    
                    const distToHome = e.position.distanceTo(homePosition)
                    return distToHome <= patrolRadius
                })

                if (hostiles.length > 0) {
                    hostiles.sort((a, b) => {
                        const priorityDiff = priorities[b.name] - priorities[a.name]
                        if (priorityDiff !== 0) return priorityDiff
                        return a.position.distanceTo(bot.entity.position) - b.position.distanceTo(bot.entity.position)
                    })

                    const target = hostiles[0]
                    console.log(`🛡️ Patrol guard attacking ${target.name} near base!`)
                    attackTarget(target)
                    return
                }
            }

            // Normal Guard Mode (guards owner)
            if (guardMode) {
                const owner = bot.players[OWNER]?.entity
                if (!owner) return

                // If patrolMode is active and owner is far away, don't leave home to guard owner!
                if (patrolMode && homePosition && owner.position.distanceTo(homePosition) > 20) return

                const target = bot.nearestEntity(e => {
                    if (!e || !e.isValid || !e.position) return false
                    if (!hostileMobs.includes(e.name)) return false
                    if (Math.abs(e.position.y - owner.position.y) > 3) return false
                    return e.position.distanceTo(owner.position) <= 30
                })

                if (target) {
                    console.log(`🛡️ Guard attacking ${target.name} near owner!`)
                    attackTarget(target)
                }
            }

        }, 1500)
        // =========================
        // FOLLOW OWNER
        // =========================

        setInterval(() => {

            const owner = bot.players[OWNER]?.entity

            if (!owner) return

            // 'stay' mode disables automatic following, also don't follow while patrolling or going home
            if (followMode === 'stay' || patrolMode || isGoingHome) return

            const distance = bot.entity.position.distanceTo(owner.position)

            const followDist = followMode === 'loose' ? 6 : 2

            // Stay close to owner
            if (distance > (followDist + 2) && !bot.pvp.target) {

                const goal = new goals.GoalFollow(owner, followDist)

                bot.pathfinder.setGoal(goal, true)
            }

        }, 3000)
    })

    // =========================
    // SERVER COMMAND LISTENER
    // =========================
    // Detects commands from the Minecraft server console,
    // command blocks, and server plugins.
    // Server can send commands via:
    //   /say !stop           → bot receives "[Server] !stop"
    //   /msg BotName !stop   → bot receives private message
    //   Command blocks       → bot receives the output
    //
    // Supported server name patterns:
    //   [Server], Server, CONSOLE, [CONSOLE], RCON, [Rcon]

    if (ALLOW_SERVER_COMMANDS) {
        bot.on('message', (jsonMsg, position) => {
            const fullText = jsonMsg.toString().trim()
            if (!fullText) return

            // Skip messages from the bot itself
            if (fullText.includes(bot.username + ':') || fullText.startsWith(`<${bot.username}>`)) return

            // Detect server-originated messages
            // Common patterns: "[Server] !command", "[CONSOLE] !command", etc.
            const serverPatterns = [
                /^\[Server\]\s+(.+)$/i,
                /^\[CONSOLE\]\s+(.+)$/i,
                /^\[Rcon\]\s+(.+)$/i,
                /^Server:\s+(.+)$/i,
                /^CONSOLE:\s+(.+)$/i,
            ]

            let serverMessage = null

            for (const pattern of serverPatterns) {
                const match = fullText.match(pattern)
                if (match) {
                    serverMessage = match[1].trim()
                    break
                }
            }

            // Also detect whisper/msg from server to bot
            // Pattern: "Server whispers to you: !command" or "Server whispers: !command"
            if (!serverMessage) {
                const whisperPatterns = [
                    /^(?:Server|CONSOLE)\s+whispers?\s+(?:to you:\s*)?(.+)$/i,
                    /^\[Server\]\s*→\s*(?:you:\s*)?(.+)$/i,
                ]
                for (const pattern of whisperPatterns) {
                    const match = fullText.match(pattern)
                    if (match) {
                        serverMessage = match[1].trim()
                        break
                    }
                }
            }

            if (!serverMessage) return

            // Handle SERVER_CMD_PREFIX if configured
            let command = serverMessage
            if (SERVER_CMD_PREFIX) {
                if (serverMessage.toLowerCase().startsWith(SERVER_CMD_PREFIX.toLowerCase())) {
                    // Strip the prefix and add '!' if needed
                    command = serverMessage.slice(SERVER_CMD_PREFIX.length).trim()
                    if (!command.startsWith('!')) {
                        command = '!' + command
                    }
                } else {
                    // Message doesn't match our prefix, ignore
                    return
                }
            }

            // Only process messages that look like commands
            if (!command.startsWith('!')) return

            console.log(`🖥️ Server command received: ${command}`)
            // Emit as if owner typed it, so the chat handler processes it
            bot.emit('chat', OWNER, command)
        })

        console.log('🖥️ Server command listener enabled')
    }

    // =========================
    // CHAT COMMANDS
    // =========================

    bot.on('chat', async (username, message) => {

        if (username === bot.username) return

        // OWNER ONLY
        if (username !== OWNER) return

        console.log(`📩 ${username}: ${message}`)

        // =========================
        // GUARD MODE ON
        // =========================

        if (message === '!guard on') {

            guardMode = true

            bot.chat('🛡️ Guard mode enabled.')
        }

        // =========================
        // GUARD MODE OFF
        // =========================

        if (message === '!guard off') {

            guardMode = false

            currentTarget = null

            bot.pvp.stop()

            bot.chat('❌ Guard mode disabled.')
        }
        // STOP
        // =========================

        if (message === '!stop') {

            currentTarget = null
            followMode = 'stay'
            patrolMode = false
            isGoingHome = false
            if (combatInterval) {
                clearInterval(combatInterval)
                combatInterval = null
            }

            bot.pathfinder.setGoal(null)
            bot.pvp.stop()

            bot.chat('🛑 Combat/movement stopped.')
        }

        // =========================
        // FOLLOW
        // =========================

        if (message.startsWith('!follow')) {

            isGoingHome = false
            patrolMode = false

            const target = bot.players[username]?.entity

            if (!target) {

                bot.chat('❌ Cannot find you.')

                return
            }

            const arg = message.split(' ')[1]

            // Toggle follow mode if no argument or argument is "toggle"
            if (!arg || arg === 'toggle') {
                if (followMode !== 'stay') {
                    followMode = 'stay'
                    bot.pathfinder.setGoal(null)
                    bot.chat('🛑 Standing ground (follow disabled).')
                } else {
                    followMode = 'close'
                    const goal = new goals.GoalFollow(target, 2)
                    bot.pathfinder.setGoal(goal, true)
                    bot.chat(`👣 Following ${username} (close mode, 2 blocks).`)
                }
                return
            }

            if (arg === 'stay' || arg === 'off') {

                followMode = 'stay'

                bot.pathfinder.setGoal(null)

                bot.chat('🛑 Standing ground (follow disabled).')

                return
            }

            if (arg === 'loose') {

                followMode = 'loose'

                const goal = new goals.GoalFollow(target, 6)

                bot.pathfinder.setGoal(goal, true)

                bot.chat(`👣 Following ${username} (loose mode, 6 blocks).`)

            } else if (arg === 'close' || arg === 'on') {

                followMode = 'close'

                const goal = new goals.GoalFollow(target, 2)

                bot.pathfinder.setGoal(goal, true)

                bot.chat(`👣 Following ${username} (close mode, 2 blocks).`)
            } else {
                bot.chat('❌ Invalid follow mode. Use close, loose, stay, on, off, or toggle.')
            }
        }

        // =========================
        // ANTI-AFK TOGGLE
        // =========================

        if (message === '!afk on') {

            if (antiAfkInterval) {

                bot.chat('ℹ️ Anti-AFK is already active.')

                return
            }

            bot.chat('🔄 Anti-AFK mode enabled.')

            antiAfkInterval = setInterval(() => {

                // Jump or look randomly
                if (Math.random() > 0.5) {

                    bot.setControlState('jump', true)

                    setTimeout(() => bot.setControlState('jump', false), 250)

                } else {

                    const yaw = bot.entity.yaw + (Math.random() - 0.5) * 2

                    const pitch = (Math.random() - 0.5) * 0.5

                    bot.look(yaw, pitch, true)
                }

            }, 20000)
        }

        if (message === '!afk off') {

            if (!antiAfkInterval) {

                bot.chat('ℹ️ Anti-AFK is not active.')

                return
            }

            clearInterval(antiAfkInterval)

            antiAfkInterval = null

            bot.chat('🛑 Anti-AFK mode disabled.')
        }

        // =========================
        // SET HOME POSITION
        // =========================

        if (message === '!sethome') {

            const owner = bot.players[username]?.entity

            if (owner) {
                homePosition = owner.position.clone()
                bot.chat(`🏠 Home position set to your position: X: ${Math.round(homePosition.x)}, Y: ${Math.round(homePosition.y)}, Z: ${Math.round(homePosition.z)}`)
            } else {
                homePosition = bot.entity.position.clone()
                bot.chat(`🏠 Home position set to my position: X: ${Math.round(homePosition.x)}, Y: ${Math.round(homePosition.y)}, Z: ${Math.round(homePosition.z)}`)
            }
            saveBotData()
        }

        // =========================
        // GO HOME
        // =========================

        if (message === '!home') {

            if (!homePosition) {

                bot.chat('❌ No home position set. Use !sethome first.')

                return
            }

            bot.chat('🏃 Heading home...')
            isGoingHome = true

            // Restore safe movements (no digging)
            if (defaultMove) {
                defaultMove.canDig = false
                bot.pathfinder.setMovements(defaultMove)
            }

            const homeGoal = new goals.GoalNear(homePosition.x, homePosition.y, homePosition.z, 1)
            bot.pathfinder.setGoal(homeGoal, true)

            const initialDist = bot.entity.position.distanceTo(homePosition)

            const checkInterval = setInterval(() => {
                if (!isGoingHome) {
                    clearInterval(checkInterval)
                    return
                }
                const dist = bot.entity.position.distanceTo(homePosition)
                if (dist <= 2.0) { // Close enough to home
                    clearInterval(checkInterval)
                    if (isGoingHome) {
                        bot.chat('🏠 Arrived home!')
                        isGoingHome = false
                        followMode = 'stay'
                        bot.pathfinder.setGoal(null)
                    }
                }
            }, 500)

            // Dynamic timeout based on distance (min 1 minute, ~1 sec per block)
            const timeoutMs = Math.max(60000, initialDist * 1000)

            setTimeout(() => {
                if (isGoingHome) {
                    clearInterval(checkInterval)
                    bot.chat('❌ Failed to navigate home (timeout).')
                    isGoingHome = false
                    followMode = 'stay'
                    bot.pathfinder.setGoal(null)
                }
            }, timeoutMs)
        }

        // =========================
        // PATROL MODE TOGGLE
        // =========================

        if (message.startsWith('!patrol on')) {

            const parts = message.split(' ')
            if (parts.length >= 3) {
                const r = parseInt(parts[2], 10)
                if (!isNaN(r) && r > 0) {
                    patrolRadius = r
                }
            }

            if (!homePosition) {

                bot.chat('❌ Set home position first using !sethome.')

                return
            }

            if (patrolMode) {

                bot.chat('ℹ️ Patrol mode is already active.')

                return
            }

            patrolMode = true
            followMode = 'stay'
            isGoingHome = false

            if (defaultMove) {
                defaultMove.canDig = false
                bot.pathfinder.setMovements(defaultMove)
            }

            bot.chat('🛡️ Base patrol mode active. Guarding surrounding area.')

            // Increment generation so any previous patrol loop exits
            patrolGeneration++
            const myGeneration = patrolGeneration

            const minRadius = 4

            function setNextPatrolPoint() {
                // If this patrol instance has been superseded or patrol turned off, stop
                if (!patrolMode || myGeneration !== patrolGeneration || !homePosition) return

                // Don't navigate while in combat
                if (bot.pvp.target || combatInterval) {
                    setTimeout(setNextPatrolPoint, 3000)
                    return
                }

                // Pick a random point within patrol radius (XZ only, let pathfinder handle Y)
                const angle = Math.random() * Math.PI * 2
                const dist = minRadius + Math.random() * (patrolRadius - minRadius)
                const targetX = homePosition.x + Math.cos(angle) * dist
                const targetZ = homePosition.z + Math.sin(angle) * dist

                try {
                    const goal = new goals.GoalNear(targetX, homePosition.y, targetZ, 2)
                    bot.pathfinder.setGoal(goal, false)
                } catch (err) {
                    console.log('⚠️ Patrol pathfinding error, retrying...')
                    setTimeout(setNextPatrolPoint, 3000)
                }
            }

            // When pathfinder reaches the patrol point, scan and then pick the next one
            function onGoalReached() {
                if (!patrolMode || myGeneration !== patrolGeneration) {
                    bot.removeListener('goal_reached', onGoalReached)
                    return
                }

                // Look around at the patrol point (scan for threats), then move to next
                let scansLeft = 2 + Math.floor(Math.random() * 3) // 2-4 scans
                const scanInterval = setInterval(() => {
                    if (!patrolMode || myGeneration !== patrolGeneration || bot.pvp.target) {
                        clearInterval(scanInterval)
                        if (patrolMode && myGeneration === patrolGeneration) {
                            setTimeout(setNextPatrolPoint, 1000)
                        }
                        return
                    }

                    scansLeft--
                    const lookYaw = bot.entity.yaw + (Math.random() - 0.5) * 3
                    const lookPitch = (Math.random() - 0.5) * 0.5
                    bot.look(lookYaw, lookPitch, false)

                    if (scansLeft <= 0) {
                        clearInterval(scanInterval)
                        setTimeout(setNextPatrolPoint, 500)
                    }
                }, 1200)
            }

            // Clean up any previous listener before adding a new one
            bot.removeAllListeners('goal_reached')
            bot.on('goal_reached', onGoalReached)

            // Also handle pathfinding failure (path_reset fires when pathfinder gives up)
            function onPathUpdate(result) {
                if (!patrolMode || myGeneration !== patrolGeneration) {
                    bot.removeListener('path_update', onPathUpdate)
                    return
                }
                if (result.status === 'noPath' || result.status === 'timeout') {
                    console.log(`⚠️ Patrol path ${result.status}, picking new point...`)
                    setTimeout(setNextPatrolPoint, 2000)
                }
            }
            bot.removeAllListeners('path_update')
            bot.on('path_update', onPathUpdate)

            // Start the first patrol point
            setNextPatrolPoint()
        }

        if (message === '!patrol off') {

            if (!patrolMode) {

                bot.chat('ℹ️ Patrol mode is not active.')

                return
            }

            patrolMode = false
            patrolGeneration++ // Invalidate the active patrol loop

            bot.pathfinder.setGoal(null)

            bot.chat('🛑 Patrol mode disabled.')
        }

        // =========================
        // COME
        // =========================

        if (message === '!come') {

            const target = bot.players[username]?.entity

            if (!target) {
                bot.chat('❌ Cannot find you.')
                return
            }

            isGoingHome = false
            patrolMode = false
            followMode = 'stay'

            const goal = new goals.GoalNear(
                target.position.x,
                target.position.y,
                target.position.z,
                1
            )

            bot.pathfinder.setGoal(goal)

            bot.chat('🏃 Coming!')
        }

        // =========================
        // JUMP
        // =========================

        if (message === '!jump') {

            bot.setControlState('jump', true)

            setTimeout(() => {
                bot.setControlState('jump', false)
            }, 500)

            bot.chat('🦘 Jumped!')
        }

        // =========================
        // ADD FRIEND
        // =========================

        if (message.startsWith('!friend add ')) {

            const newFriend = message.split(' ')[2]

            if (!newFriend) {

                bot.chat('❌ Specify username.')

                return
            }

            // Already friend
            if (FRIENDS.includes(newFriend)) {

                bot.chat(`✅ ${newFriend} already friend.`)

                return
            }

            FRIENDS.push(newFriend)

            bot.chat(`🤝 Added ${newFriend} as friend.`)

            console.log(`🤝 Friend added: ${newFriend}`)
            saveBotData()
        }
        // =========================
        // REMOVE FRIEND
        // =========================

        if (message.startsWith('!friend remove ')) {

            const friendName = message.split(' ')[2]

            if (!friendName) {

                bot.chat('❌ Specify username.')

                return
            }

            const index = FRIENDS.indexOf(friendName)

            if (index === -1) {

                bot.chat(`❌ ${friendName} is not a friend.`)

                return
            }

            if (friendName === OWNER) {

                bot.chat('❌ Cannot remove owner.')

                return
            }

            FRIENDS.splice(index, 1)

            bot.chat(`🤝 Removed ${friendName} from friends.`)

            console.log(`🤝 Friend removed: ${friendName}`)
            saveBotData()
        }

        // =========================
        // LIST FRIENDS
        // =========================

        if (message === '!friends' || message === '!friend list') {

            bot.chat(`/msg ${OWNER} Friends: ${FRIENDS.join(', ')}`)
        }

        // =========================
        // INVENTORY
        // =========================

        if (message === '!inventory' || message === '!inv') {

            const items = bot.inventory.items()

            if (items.length === 0) {

                bot.chat('📦 Inventory is empty.')

                return
            }

            const held = bot.heldItem ? bot.heldItem.name : 'nothing'
            const list = items.map(i => `${i.name} x${i.count}`).join(', ')

            bot.chat(`/msg ${OWNER} Holding: ${held}.`)

            // Split into chunks of ~200 chars to avoid chat limits
            const chunks = list.match(/.{1,200}(?:, |$)/g) || [list]
            
            for (const chunk of chunks) {
                bot.chat(`/msg ${OWNER} Inv: ${chunk}`)
            }
        }

        // =========================
        // DROP ITEM
        // =========================

        if (message.startsWith('!drop ')) {

            const itemName = message.split(' ')[1]

            if (!itemName) {

                bot.chat('❌ Specify item name or "all".')

                return
            }

            try {

                if (itemName === 'all') {

                    const items = bot.inventory.items()

                    if (items.length === 0) {

                        bot.chat('❌ Inventory empty.')

                        return
                    }

                    bot.chat('📦 Dropping all items.')

                    for (const item of items) {

                        await bot.tossStack(item)
                    }

                    return
                }

                const item = bot.inventory.items().find(i =>
                    i.name.includes(itemName)
                )

                if (!item) {

                    bot.chat(`❌ No ${itemName} in inventory.`)

                    return
                }

                bot.chat(`📦 Dropping ${item.name}`)

                await bot.tossStack(item)

            } catch (err) {

                console.log(err)

                bot.chat('❌ Failed to drop item.')
            }
        }

        // =========================
        // MANUAL STORE COMMAND
        // =========================

        if (message === '!store') {

            try {

                const chestBlock = bot.findBlock({

                    matching: block =>
                        block.name.includes('chest'),

                    maxDistance: 16
                })

                if (!chestBlock) {

                    bot.chat('❌ No chest nearby (16 block radius).')

                    return
                }

                if (chestBlock.position.distanceTo(bot.entity.position) > 3) {
                    bot.chat('🚶 Walking to chest...')
                    await bot.pathfinder.goto(new goals.GoalNear(chestBlock.position.x, chestBlock.position.y, chestBlock.position.z, 2))
                }

                bot.chat('📦 Accessing chest to store inventory.')

                const chest = await bot.openContainer(chestBlock)

                const items = bot.inventory.items()

                let storedCount = 0

                for (const item of items) {

                    // Keep tools
                    if (
                        item.name.includes('sword') ||
                        item.name.includes('pickaxe') ||
                        item.name.includes('axe') ||
                        item.name.includes('helmet') ||
                        item.name.includes('chestplate') ||
                        item.name.includes('leggings') ||
                        item.name.includes('boots') ||
                        item.name.includes('totem') ||
                        item.name.includes('shield') ||
                        item.name.includes('bow') ||
                        item.name.includes('arrow')
                    ) continue

                    try {

                        await chest.deposit(
                            item.type,
                            null,
                            item.count
                        )

                        storedCount++

                    } catch { }
                }

                chest.close()

                if (storedCount > 0) {

                    bot.chat('✅ Successfully stored items in chest.')

                } else {

                    bot.chat('ℹ️ No inventory items to store (kept tools).')
                }

            } catch (err) {

                console.log(err)

                bot.chat('❌ Failed to store items.')
            }
        }

        // =========================
        // HELP COMMAND
        // =========================

        if (message === '!help') {

            bot.chat('/msg SilverSurfer915 ===== 🤖 BOT COMMANDS =====')

            bot.chat('/msg SilverSurfer915 !follow <close|loose|stay|on|off> → Follow settings/Toggle')

            bot.chat('/msg SilverSurfer915 !come → Come to owner')

            bot.chat('/msg SilverSurfer915 !stop → Stop combat/pathfinding')

            bot.chat('/msg SilverSurfer915 !fight → Attack nearest target near owner')

            bot.chat('/msg SilverSurfer915 !jump → Make bot jump')

            bot.chat('/msg SilverSurfer915 !god → Toggle god mode')

            bot.chat('/msg SilverSurfer915 !inv → Show inventory')

            bot.chat('/msg SilverSurfer915 !drop <item|all> → Drop item(s)')

            bot.chat('/msg SilverSurfer915 !store → Store inventory in chest')

            bot.chat('/msg SilverSurfer915 !afk <on|off> → Toggle Anti-AFK')

            bot.chat('/msg SilverSurfer915 !sethome → Save current position as home')

            bot.chat('/msg SilverSurfer915 !home → Travel to home position')

            bot.chat('/msg SilverSurfer915 !patrol <on|off> → Patrol surroundings')

            bot.chat('/msg SilverSurfer915 !sleep → Sleep in nearby bed')

            bot.chat('/msg SilverSurfer915 !friend <add|remove|list> → Manage friends')

            bot.chat('/msg SilverSurfer915 =========================')
        }

        // =========================
        // SLEEP COMMAND
        // =========================

        if (message === '!sleep') {

            const bedBlock = bot.findBlock({
                matching: block => block.name.includes('bed'),
                maxDistance: 32
            })

            if (!bedBlock) {
                bot.chat('❌ No bed nearby.')
                return
            }

            // Save state before sleeping
            const wasPatrolling = patrolMode
            const wasFollowing = followMode !== 'stay'

            try {
                bot.chat('🛏️ Walking to bed...')

                // Stop patrol while going to bed
                patrolMode = false
                bot.pathfinder.setGoal(null)

                // Walk to the bed first
                await bot.pathfinder.goto(
                    new goals.GoalNear(bedBlock.position.x, bedBlock.position.y, bedBlock.position.z, 2)
                )

                await bot.sleep(bedBlock)
                bot.chat('😴 Sleeping...')

                // Auto-resume when woken up
                bot.once('wake', () => {
                    bot.chat('☀️ Woke up!')
                    if (wasPatrolling && homePosition) {
                        // Re-trigger patrol by simulating the command
                        bot.chat('🛡️ Resuming patrol...')
                        bot.emit('chat', OWNER, '!patrol on')
                    } else if (wasFollowing) {
                        followMode = 'close'
                    }
                })

            } catch (err) {
                const msg = err.message || String(err)
                // Restore state if sleep failed
                if (wasPatrolling) {
                    bot.emit('chat', OWNER, '!patrol on')
                }
                if (msg.includes('day')) {
                    bot.chat('❌ Can only sleep at night.')
                } else if (msg.includes('monsters')) {
                    bot.chat('❌ Monsters nearby, cannot sleep.')
                } else if (msg.includes('too far')) {
                    bot.chat('❌ Could not reach bed.')
                } else {
                    bot.chat(`❌ Cannot sleep: ${msg}`)
                }
            }
        }
        // =========================
        // FIGHT COMMAND
        // AREA CLEAR MODE
        // =========================

        if (message === '!fight') {

            const owner = bot.players[OWNER]?.entity

            if (!owner) {

                bot.chat('❌ Cannot find owner.')

                return
            }

            bot.chat('⚔️ Area clear mode enabled.')

            // Get all nearby hostile mobs
            const hostiles = Object.values(bot.entities).filter(e => {

                if (!e) return false

                if (!e.isValid) return false

                if (!e.position) return false

                // Ignore passive mobs
                if (!priorities[e.name]) return false

                // Same-ish Y level
                if (
                    Math.abs(
                        e.position.y - owner.position.y
                    ) > 3
                ) return false

                // 30 block radius
                return (
                    e.position.distanceTo(owner.position) <= 30
                )
            })

            if (hostiles.length === 0) {

                bot.chat('❌ No hostile mobs nearby.')

                return
            }

            // Sort by priority first
            // then nearest distance
            hostiles.sort((a, b) => {

                const priorityDiff =
                    priorities[b.name] - priorities[a.name]

                if (priorityDiff !== 0) {

                    return priorityDiff
                }

                return (
                    a.position.distanceTo(bot.entity.position) -
                    b.position.distanceTo(bot.entity.position)
                )
            })

            // Attack first target
            const target = hostiles[0]

            if (!target) return

            try {

                currentTarget = target

                bot.chat(
                    `⚔️ Engaging ${target.name}`
                )

                attackTarget(target)

                // Auto continue clearing
                if (combatInterval) clearInterval(combatInterval)
                combatInterval = setInterval(() => {

                    // Stop if manually stopped
                    if (!currentTarget) {

                        clearInterval(combatInterval)
                        combatInterval = null

                        return
                    }

                    // Find next hostile
                    const nextTarget = Object.values(bot.entities).find(e => {

                        if (!e) return false

                        if (!e.isValid) return false

                        if (!e.position) return false

                        if (!priorities[e.name]) return false

                        if (
                            Math.abs(
                                e.position.y - owner.position.y
                            ) > 3
                        ) return false

                        return (
                            e.position.distanceTo(owner.position) <= 30
                        )
                    })

                    if (!nextTarget) {

                        bot.chat('✅ Area cleared.')

                        currentTarget = null

                        bot.pvp.stop()

                        clearInterval(combatInterval)
                        combatInterval = null

                        return
                    }

                    // Already attacking
                    if (bot.pvp.target === nextTarget) return

                    currentTarget = nextTarget

                    attackTarget(nextTarget)

                }, 2000)

            } catch (err) {

                console.log('❌ Fight command failed')

                console.log(err)
            }
        }
        // Projectile defense moved outside chat listener to prevent multiple registrations and memory leaks
        // =========================
        // GOD MODE TOGGLE
        // =========================

        if (message === '!god') {

            godMode = !godMode

            // ENABLE
            if (godMode) {

                bot.chat('/effect give @s resistance infinite 255 true')
                bot.chat('/effect give @s regeneration infinite 255 true')
                bot.chat('/effect give @s saturation infinite 255 true')
                bot.chat('/effect give @s strength infinite 255 true')
                bot.chat('/effect give @s speed infinite 5 true')

                bot.chat('/attribute @s attack_damage base set 1000')
                bot.chat('/attribute @s attack_speed base set 20')
                bot.chat('/attribute @s movement_speed base set 0.5')
                bot.chat('/attribute @s max_health base set 1000')

                bot.chat('😈 GOD MODE ENABLED')
            }

            // DISABLE
            else {

                bot.chat('/effect clear @s')

                bot.chat('/attribute @s attack_damage base set 1')
                bot.chat('/attribute @s attack_speed base set 4')
                bot.chat('/attribute @s movement_speed base set 0.1')
                bot.chat('/attribute @s max_health base set 20')

                bot.chat('😇 GOD MODE DISABLED')
            }
        }
    })

    // =========================
    // PROJECTILE DEFENSE
    // =========================

    bot.on('entitySpawn', entity => {


        if (!entity) return

        // Detect arrows
        if (entity.name !== 'arrow') return

        const owner = bot.players[OWNER]?.entity

        if (!owner) return

        // If patrolMode is active and owner is far away, ignore!
        if (patrolMode && homePosition && owner.position.distanceTo(homePosition) > 20) return

        // Arrow near owner
        const nearOwner =
            entity.position.distanceTo(owner.position) <= 5


        if (!nearOwner) return

        // Find nearby skeleton
        const skeleton = bot.nearestEntity(e => {

            if (!e) return false

            if (e.name !== 'skeleton') return false

            if (!e.position) return false

            return (
                e.position.distanceTo(entity.position) <= 20
            )
        })

        if (!skeleton) return

        console.log('🏹 Skeleton detected')

        attackTarget(skeleton)
    })

    // =========================
    // DEATH
    // =========================

    bot.on('death', () => {

        death++
        currentTarget = null

        console.log(`💀 Bot died ${death} times`)
    })

    // =========================
    // AUTO EAT
    // =========================

    let isEating = false
    setInterval(async () => {
        if (isEating) return
        if (!bot.inventory) return
        if (bot.food >= 10) return

        const food = bot.inventory.items().find(item =>
            item.name.includes('bread') ||
            item.name.includes('cooked_beef') ||
            item.name.includes('cooked_porkchop') ||
            item.name.includes('golden_apple') ||
            item.name.includes('apple')
        )

        if (!food) return

        try {
            isEating = true
            await bot.equip(food, 'hand')
            await bot.consume()
        } catch { }
        isEating = false
    }, 3000)

    // =========================
    // EVENTS
    // =========================

    bot.on('kicked', reason => {
        console.log('❌ Kicked:', reason)
    })

    bot.on('error', err => {
        console.log('❌ Error:', err)
    })

    bot.on('end', () => {

        console.log('🔄 Disconnected. Reconnecting in 5 seconds...')

        setTimeout(() => { activeBot = createBot() }, 5000)
    })

    return bot
}

// =========================
// START BOT
// =========================

let activeBot = createBot()

// =========================
// CONSOLE ADMIN
// =========================

const readline = require('readline')
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> '
})

rl.prompt()

rl.on('line', (line) => {
    const input = line.trim()
    if (!input) {
        rl.prompt()
        return
    }

    if (input.startsWith('!')) {
        // Bot command — emit as if owner typed it in chat
        console.log(`🖥️ Console command: ${input}`)
        activeBot.emit('chat', OWNER, input)
    } else if (input.startsWith('say ')) {
        // Send raw chat message as the bot
        const msg = input.slice(4)
        activeBot.chat(msg)
        console.log(`💬 Bot said: ${msg}`)
    } else {
        // Default: treat as bot command
        console.log(`🖥️ Console command: ${input}`)
        activeBot.emit('chat', OWNER, input)
    }

    rl.prompt()
})

// =========================
// WEB SERVER + SOCKET.IO
// =========================

// Serve dashboard static files
app.use(express.static(path.join(__dirname, 'public')))

// Fallback API endpoint (for health checks / Coolify)
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', botName: data.name, server: data.ip })
})

// ===========================
// SOCKET.IO EVENTS
// ===========================

io.on('connection', (socket) => {
    console.log('🌐 Dashboard client connected')

    // Send chat history to new connections
    socket.emit('chatHistory', chatBuffer)

    // Send initial friends list
    socket.emit('friends', FRIENDS)

    // --- Handle commands from dashboard ---
    socket.on('command', (cmd) => {
        if (!cmd || typeof cmd !== 'string') return
        const trimmed = cmd.trim()
        if (!trimmed) return

        console.log(`🌐 Dashboard command: ${trimmed}`)

        // Emit as if owner typed it in chat
        activeBot.emit('chat', OWNER, trimmed)

        pushChatBuffer('command', `[Dashboard] ${trimmed}`)
    })

    // --- Handle raw chat from dashboard ---
    socket.on('chat', (msg) => {
        if (!msg || typeof msg !== 'string') return
        const trimmed = msg.trim()
        if (!trimmed) return

        console.log(`🌐 Dashboard chat: ${trimmed}`)
        activeBot.chat(trimmed)

        pushChatBuffer('bot-msg', `Bot: ${trimmed}`)
    })

    // --- Handle friend management ---
    socket.on('friend-add', (name) => {
        if (!name || typeof name !== 'string') return
        const trimmed = name.trim()
        if (!trimmed) return

        // Emit as if owner typed the command
        activeBot.emit('chat', OWNER, `!friend add ${trimmed}`)
        socket.emit('toast', { message: `Added ${trimmed} as friend`, type: 'success' })

        // Update friends list after a short delay
        setTimeout(() => io.emit('friends', FRIENDS), 500)
    })

    socket.on('friend-remove', (name) => {
        if (!name || typeof name !== 'string') return
        const trimmed = name.trim()
        if (!trimmed) return

        activeBot.emit('chat', OWNER, `!friend remove ${trimmed}`)
        socket.emit('toast', { message: `Removed ${trimmed} from friends`, type: 'success' })

        setTimeout(() => io.emit('friends', FRIENDS), 500)
    })

    socket.on('disconnect', () => {
        console.log('🌐 Dashboard client disconnected')
    })
})

// ===========================
// PERIODIC STATE BROADCASTS
// ===========================

// Broadcast bot state every 1 second
setInterval(() => {
    if (!activeBot || !activeBot.entity) {
        io.emit('botState', {
            health: 0, food: 0, armor: 0,
            position: null, xpLevel: 0, xpProgress: 0,
            deaths: death, heldItem: 'nothing',
            guardMode, patrolMode, followMode, godMode,
            antiAfk: !!antiAfkInterval, inCombat: false,
            home: homePosition ? { x: homePosition.x, y: homePosition.y, z: homePosition.z } : null,
            serverIp: data.ip, botName: data.name, owner: OWNER,
            isConnected: false
        })
        return
    }

    try {
        const bot = activeBot
        const armorSlots = [5, 6, 7, 8] // head, chest, legs, feet
        let totalArmor = 0
        // Simple armor calculation based on equipped armor pieces
        const armorItems = bot.inventory.slots.filter((s, i) => armorSlots.includes(i) && s)
        // Approximate armor points by counting pieces
        armorItems.forEach(item => {
            if (!item) return
            const name = item.name || ''
            if (name.includes('netherite')) totalArmor += 5
            else if (name.includes('diamond')) totalArmor += 4.5
            else if (name.includes('iron')) totalArmor += 3.5
            else if (name.includes('chainmail')) totalArmor += 3
            else if (name.includes('gold')) totalArmor += 2.5
            else if (name.includes('leather')) totalArmor += 1.5
            else totalArmor += 1
        })

        io.emit('botState', {
            health: bot.health || 0,
            food: bot.food || 0,
            armor: Math.min(totalArmor, 20),
            position: bot.entity.position ? {
                x: bot.entity.position.x,
                y: bot.entity.position.y,
                z: bot.entity.position.z
            } : null,
            xpLevel: bot.experience?.level || 0,
            xpProgress: bot.experience?.progress || 0,
            deaths: death,
            heldItem: bot.heldItem ? bot.heldItem.name.replace(/_/g, ' ') : 'nothing',
            guardMode,
            patrolMode,
            followMode,
            godMode,
            antiAfk: !!antiAfkInterval,
            inCombat: !!bot.pvp?.target,
            home: homePosition ? { x: homePosition.x, y: homePosition.y, z: homePosition.z } : null,
            serverIp: data.ip,
            botName: data.name || bot.username,
            owner: OWNER,
            isConnected: true
        })
    } catch (err) {
        // Ignore state broadcast errors
    }
}, 1000)

// Broadcast inventory every 5 seconds
setInterval(() => {
    if (!activeBot || !activeBot.inventory) {
        io.emit('inventory', [])
        return
    }

    try {
        const items = activeBot.inventory.items().map(item => ({
            name: item.name,
            count: item.count,
            slot: item.slot
        }))
        io.emit('inventory', items)
    } catch (err) {
        // Ignore inventory broadcast errors
    }
}, 5000)

const PORT = process.env.PORT || 3000

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Dashboard running on http://0.0.0.0:${PORT}`)
})