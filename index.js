const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const pvp = require('mineflayer-pvp').plugin
const minecraftData = require('minecraft-data')
const fs = require('fs')
const express = require('express')
let guardMode = false
let rawdata = fs.readFileSync('config.json')
let data = JSON.parse(rawdata)
let currentTarget = null
let isMining = false
let antiAfkInterval = null
let followMode = 'close'
let homePosition = null
let patrolMode = false
const app = express()

// =========================
// SETTINGS
// =========================
function logToOwner(bot, msg) {

    bot.chat(`/msg ${OWNER} ${msg}`)
}
const OWNER = 'SilverSurfer915'

const FRIENDS = [
    OWNER
]

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

    // =========================
    // LOAD PLUGINS
    // =========================

    bot.loadPlugin(pathfinder)
    bot.loadPlugin(pvp)

    // =========================
    // HELPERS (ACCESSIBLE TO ALL LISTENERS)
    // =========================

    function isValidEnemy(entity) {

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

        return true
    }

    function attackTarget(target) {

        if (!isValidEnemy(target)) return

        currentTarget = target

        console.log(
            `⚔️ Attacking ${target.name || target.username}`
        )

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

        const defaultMove = new Movements(bot, mcData)
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

        defaultMove.canDig = true

        defaultMove.allowParkour = true

        defaultMove.canOpenDoors = true

        defaultMove.allowSprinting = true
        defaultMove.canSprint = true

        // Allow block placing
        defaultMove.placeCost = 1

        // Avoid digging
        defaultMove.digCost = 99

        // Safer movement
        defaultMove.maxDropDown = 3

        defaultMove.infiniteLiquidDropdownDistance = false

        // Allowed scaffold blocks
        defaultMove.scafoldingBlocks = [
            mcData.itemsByName.dirt.id
        ]

        bot.pathfinder.setMovements(defaultMove)
        bot.chat('🤖 AI Combat Bot Online')

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
        // AUTO EQUIP SWORD
        // =========================

        setInterval(() => {

            const sword = bot.inventory.items().find(item =>
                item.name.includes('netherite_sword') ||
                item.name.includes('diamond_sword') ||
                item.name.includes('iron_sword')
            )

            if (!sword) return

            if (
                bot.heldItem &&
                bot.heldItem.name === sword.name
            ) return

            bot.equip(sword, 'hand').catch(() => { })

        }, 3000)
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

                    await bot.equip(sword, 'hand')

                    return
                }

                // Mining = pickaxe
                if (isMining && pickaxe) {

                    await bot.equip(pickaxe, 'hand')

                    return
                }

                // Default axe fallback
                if (axe) {

                    await bot.equip(axe, 'hand')
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
        // (Helper functions isValidEnemy and attackTarget moved to top-level of createBot for proper scoping)

        // =========================
        // SELF DEFENSE
        // =========================

        bot.on('entityHurt', entity => {

            // Bot got hit
            if (entity !== bot.entity) return

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

        bot.on('entityHurt', entity => {

            const owner = bot.players[OWNER]?.entity

            if (!owner) return

            // Owner got hit
            if (entity !== owner) return

            const attacker = bot.nearestEntity(e => {

                if (!isValidEnemy(e)) return false

                return (
                    e.position.distanceTo(owner.position) <= 6
                )
            })

            if (!attacker) return

            const now = Date.now()

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

        bot.on('entitySwingArm', entity => {

            // Only owner
            if (!entity) return

            if (entity.username !== OWNER) return

            // Find nearest entity near owner
            const target = bot.nearestEntity(e => {

                if (!isValidEnemy(e)) return false

                // Must be VERY close to owner
                return (
                    e.position.distanceTo(entity.position) <= 4
                )
            })

            if (!target) return

            logToOwner(
                bot,
                `🐺 Assisting against ${target.name || target.username}`
            )
            attackTarget(target)
        })
        // =========================
        // SHIELD AI
        // =========================

        setInterval(async () => {

            // Need active combat
            if (!bot.pvp.target) return

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

            // Guard disabled
            if (!guardMode) return

            const owner = bot.players[OWNER]?.entity

            if (!owner) return

            // Already fighting
            if (bot.pvp.target) return

            // Find hostile near owner
            const target = bot.nearestEntity(e => {

                if (!e) return false

                if (!e.isValid) return false

                if (!e.position) return false

                // Only hostile mobs
                if (!hostileMobs.includes(e.name)) return false

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

            if (!target) return

            console.log(
                `🛡️ Guard attacking ${target.name}`
            )

            attackTarget(target)

        }, 1500)
        // =========================
        // FOLLOW OWNER
        // =========================

        setInterval(() => {

            const owner = bot.players[OWNER]?.entity

            if (!owner) return

            // 'stay' mode disables automatic following
            if (followMode === 'stay') return

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

            bot.pathfinder.setGoal(null)
            bot.pvp.stop()
            isMining = false
            bot.chat('🛑 Combat stopped.')
        }
        // =========================
        // AUTO MINE
        // =========================

        if (message.startsWith('!mine ')) {

            const blockName = message.split(' ')[1]

            if (!blockName) {

                bot.chat('❌ Specify block.')

                return
            }

            const mcData = minecraftData(bot.version)

            const blockType = mcData.blocksByName[blockName]

            if (!blockType) {

                bot.chat('❌ Invalid block.')

                return
            }

            isMining = true

            bot.chat(`⛏️ Mining ${blockName} until stopped.`)

            const mineLoop = async () => {

                while (isMining) {

                    try {

                        const block = bot.findBlock({
                            matching: blockType.id,
                            maxDistance: 64
                        })

                        if (!block) {

                            bot.chat(`❌ No ${blockName} nearby.`)

                            isMining = false

                            return
                        }

                        await bot.pathfinder.goto(
                            new goals.GoalNear(
                                block.position.x,
                                block.position.y,
                                block.position.z,
                                1
                            )
                        )

                        await bot.dig(block)

                    } catch (err) {

                        console.log(err)
                    }
                }
            }

            mineLoop()
        }
        // =========================
        // FOLLOW
        // =========================

        if (message.startsWith('!follow')) {

            const target = bot.players[username]?.entity

            if (!target) {

                bot.chat('❌ Cannot find you.')

                return
            }

            const arg = message.split(' ')[1]

            if (arg === 'stay') {

                followMode = 'stay'

                bot.pathfinder.setGoal(null)

                bot.chat('🛑 Standing ground (stay mode).')

                return
            }

            if (arg === 'loose') {

                followMode = 'loose'

                const goal = new goals.GoalFollow(target, 6)

                bot.pathfinder.setGoal(goal, true)

                bot.chat(`👣 Following ${username} (loose mode, 6 blocks).`)

            } else {

                followMode = 'close'

                const goal = new goals.GoalFollow(target, 2)

                bot.pathfinder.setGoal(goal, true)

                bot.chat(`👣 Following ${username} (close mode, 2 blocks).`)
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

            homePosition = bot.entity.position.clone()

            bot.chat(`🏠 Home position set to: X: ${Math.round(homePosition.x)}, Y: ${Math.round(homePosition.y)}, Z: ${Math.round(homePosition.z)}`)
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

            bot.pathfinder.setGoal(new goals.GoalNear(homePosition.x, homePosition.y, homePosition.z, 1))
        }

        // =========================
        // PATROL MODE TOGGLE
        // =========================

        if (message === '!patrol on') {

            if (!homePosition) {

                bot.chat('❌ Set home position first using !sethome.')

                return
            }

            if (patrolMode) {

                bot.chat('ℹ️ Patrol mode is already active.')

                return
            }

            patrolMode = true

            bot.chat('🛡️ Base patrol mode active. Guarding surrounding area.')

            const patrolLoop = async () => {

                const offset = [
                    { x: 10, z: 0 },
                    { x: 0, z: 10 },
                    { x: -10, z: 0 },
                    { x: 0, z: -10 }
                ]

                let postIndex = 0

                while (patrolMode) {

                    if (!homePosition) {

                        patrolMode = false

                        return
                    }

                    // Only patrol if not in combat, not mining, and still patrolling
                    if (!bot.pvp.target && !isMining && patrolMode) {

                        const nextPost = offset[postIndex]

                        const targetX = homePosition.x + nextPost.x

                        const targetY = homePosition.y

                        const targetZ = homePosition.z + nextPost.z

                        try {

                            console.log(`🛡️ Patrolling to guard post ${postIndex + 1}...`)

                            await bot.pathfinder.goto(
                                new goals.GoalNear(targetX, targetY, targetZ, 1)
                            )

                            // Wait at post for 5 seconds
                            for (let i = 0; i < 5; i++) {

                                if (!patrolMode || bot.pvp.target || isMining) break

                                await new Promise(resolve => setTimeout(resolve, 1000))
                            }

                            postIndex = (postIndex + 1) % offset.length

                        } catch (err) {

                            postIndex = (postIndex + 1) % offset.length

                            await new Promise(resolve => setTimeout(resolve, 2000))
                        }

                    } else {

                        await new Promise(resolve => setTimeout(resolve, 2000))
                    }
                }
            }

            patrolLoop()
        }

        if (message === '!patrol off') {

            if (!patrolMode) {

                bot.chat('ℹ️ Patrol mode is not active.')

                return
            }

            patrolMode = false

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
        }

        // =========================
        // LIST FRIENDS
        // =========================

        if (message === '!friends' || message === '!friend list') {

            bot.chat(`/msg ${OWNER} Friends: ${FRIENDS.join(', ')}`)
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
                        item.name.includes('totem')
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

            bot.chat('/msg SilverSurfer915 !follow <close|loose|stay> → Follow settings')

            bot.chat('/msg SilverSurfer915 !come → Come to owner')

            bot.chat('/msg SilverSurfer915 !stop → Stop combat/pathfinding')

            bot.chat('/msg SilverSurfer915 !fight → Attack nearest target near owner')

            bot.chat('/msg SilverSurfer915 !jump → Make bot jump')

            bot.chat('/msg SilverSurfer915 !god → Toggle god mode')

            bot.chat('/msg SilverSurfer915 !mine <block> → Mine block')

            bot.chat('/msg SilverSurfer915 !drop <item|all> → Drop item(s)')

            bot.chat('/msg SilverSurfer915 !store → Store inventory in chest')

            bot.chat('/msg SilverSurfer915 !afk <on|off> → Toggle Anti-AFK')

            bot.chat('/msg SilverSurfer915 !sethome → Save current position as home')

            bot.chat('/msg SilverSurfer915 !home → Travel to home position')

            bot.chat('/msg SilverSurfer915 !patrol <on|off> → Patrol surroundings')

            bot.chat('/msg SilverSurfer915 =========================')
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
                const combatInterval = setInterval(() => {

                    // Stop if manually stopped
                    if (!currentTarget) {

                        clearInterval(combatInterval)

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

    bot.on('physicsTick', () => {

        if (bot.food < 10) {

            const food = bot.inventory.items().find(item =>
                item.name.includes('bread') ||
                item.name.includes('beef') ||
                item.name.includes('porkchop') ||
                item.name.includes('apple')
            )

            if (food) {

                bot.equip(food, 'hand')
                    .then(() => bot.consume())
                    .catch(() => { })
            }
        }
    })

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

        setTimeout(createBot, 5000)
    })

    return bot
}

// =========================
// START BOT
// =========================

createBot()

// =========================
// WEB SERVER
// =========================

app.get('/', (req, res) => {

    res.send(`
    <h1>🤖 AI Combat Bot</h1>
    <p>Status: Online</p>
    <p>Owner: ${OWNER}</p>
    <p>Deaths: ${death}</p>
    <p>Server: ${data.ip}</p>
    `)
})

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
    console.log(`🌐 Web server running on port ${PORT}`)
})