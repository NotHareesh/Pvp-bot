// ===========================
        // STATE
        // ===========================
        let botState = {};
        let modes = {};

        // ===========================
        // SOCKET.IO CONNECTION
        // ===========================
        const socket = io({
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionAttempts: Infinity
        });

        socket.on('connect', () => {
            updateConnectionStatus(true);
            addChatMessage('system', 'Dashboard connected to server.');
        });

        socket.on('disconnect', () => {
            updateConnectionStatus(false);
            addChatMessage('system', 'Dashboard disconnected from server.');
        });

        socket.on('connect_error', () => {
            updateConnectionStatus(false);
        });

        // ===========================
        // REAL-TIME DATA HANDLERS
        // ===========================

        // Bot status (every 1s)
        socket.on('botState', (data) => {
            botState = data;
            updateStatusUI(data);
            updateModesUI(data);
        });

        // Inventory (every 5s)
        socket.on('inventory', (items) => {
            updateInventoryUI(items);
        });

        // Chat messages (real-time)
        socket.on('chatMessage', (msg) => {
            addChatMessage(msg.type || 'chat', msg.text);
        });

        // Chat history on first connect
        socket.on('chatHistory', (messages) => {
            messages.forEach(msg => {
                addChatMessage(msg.type || 'chat', msg.text, false);
            });
            scrollChatToBottom();
        });

        // Friends list
        socket.on('friends', (friends) => {
            updateFriendsUI(friends);
        });

        // Command response / toast
        socket.on('toast', (data) => {
            showToast(data.message, data.type || 'info');
        });

        // ===========================
        // UI UPDATERS
        // ===========================

        function updateConnectionStatus(connected) {
            const badge = document.getElementById('connectionBadge');
            const text = document.getElementById('connectionText');
            badge.className = 'connection-badge ' + (connected ? 'online' : 'offline');
            text.textContent = connected ? 'Online' : 'Offline';
        }

        function updateStatusUI(data) {
            // Health
            const healthPct = Math.max(0, Math.min(100, (data.health / 20) * 100));
            document.getElementById('healthBar').style.width = healthPct + '%';
            document.getElementById('healthValue').textContent = `${Math.round(data.health)}/${20}`;

            // Food
            const foodPct = Math.max(0, Math.min(100, (data.food / 20) * 100));
            document.getElementById('foodBar').style.width = foodPct + '%';
            document.getElementById('foodValue').textContent = `${Math.round(data.food)}/${20}`;

            // Armor
            const armorMax = 20;
            const armorPct = Math.max(0, Math.min(100, ((data.armor || 0) / armorMax) * 100));
            document.getElementById('armorBar').style.width = armorPct + '%';
            document.getElementById('armorValue').textContent = `${Math.round(data.armor || 0)}/${armorMax}`;

            // XP
            const xpPct = Math.max(0, Math.min(100, (data.xpProgress || 0) * 100));
            document.getElementById('xpBar').style.width = xpPct + '%';
            document.getElementById('xpValue').textContent = `Level ${data.xpLevel || 0}`;

            // Position
            if (data.position) {
                document.getElementById('positionValue').textContent =
                    `${Math.round(data.position.x)}, ${Math.round(data.position.y)}, ${Math.round(data.position.z)}`;
            }

            // Deaths
            document.getElementById('deathsValue').textContent = data.deaths || 0;

            // Held item
            document.getElementById('heldItemValue').textContent = data.heldItem || 'nothing';

            // Home
            if (data.home) {
                document.getElementById('homeValue').textContent =
                    `${Math.round(data.home.x)}, ${Math.round(data.home.y)}, ${Math.round(data.home.z)}`;
            } else {
                document.getElementById('homeValue').textContent = 'Not set';
            }

            // Server info
            if (data.serverIp) {
                document.getElementById('serverInfo').textContent = data.serverIp;
                document.getElementById('botServer').textContent = data.serverIp;
            }

            // Bot name
            if (data.botName) {
                document.getElementById('botName').textContent = data.botName;
                // Update avatar
                const avatarImg = document.querySelector('.bot-avatar img');
                if (avatarImg) {
                    avatarImg.src = `https://mc-heads.net/head/${data.botName}/100`;
                }
            }
        }

        function updateModesUI(data) {
            modes = data;

            setModeStatus('modeGuard', 'modeGuardStatus', data.guardMode, 'ON', 'OFF');
            setModeStatus('modePatrol', 'modePatrolStatus', data.patrolMode, 'ON', 'OFF');
            setModeStatus('modeFollow', 'modeFollowStatus', data.followMode !== 'stay', data.followMode?.toUpperCase() || 'STAY', 'STAY');
            setModeStatus('modeGod', 'modeGodStatus', data.godMode, 'ON', 'OFF');
            setModeStatus('modeAfk', 'modeAfkStatus', data.antiAfk, 'ON', 'OFF');
            setModeStatus('modeCombat', 'modeCombatStatus', data.inCombat, 'YES', 'NO');

            // Update button active states
            toggleButtonActive('btnGuard', data.guardMode);
            toggleButtonActive('btnPatrol', data.patrolMode);
            toggleButtonActive('btnGod', data.godMode);
            toggleButtonActive('btnAfk', data.antiAfk);

            // Update follow select
            const followSelect = document.getElementById('followModeSelect');
            if (followSelect && data.followMode) {
                followSelect.value = data.followMode;
            }
        }

        function setModeStatus(indicatorId, statusId, isActive, onText, offText) {
            const indicator = document.getElementById(indicatorId);
            const status = document.getElementById(statusId);
            if (!indicator || !status) return;

            indicator.className = 'mode-indicator' + (isActive ? ' active' : '');
            status.className = 'mode-status ' + (isActive ? 'on' : 'off');
            status.textContent = isActive ? onText : offText;
        }

        function toggleButtonActive(btnId, isActive) {
            const btn = document.getElementById(btnId);
            if (!btn) return;
            if (isActive) {
                btn.classList.add('active-mode');
            } else {
                btn.classList.remove('active-mode');
            }
        }

        function updateInventoryUI(items) {
            const countEl = document.getElementById('invCount');
            if (!countEl) return;
            countEl.textContent = `${items.length} item${items.length !== 1 ? 's' : ''}`;

            const armorGrid = document.getElementById('armorGrid');
            const weaponsGrid = document.getElementById('weaponsGrid');
            const generalGrid = document.getElementById('generalGrid');

            // Item icon mapping
            const iconMap = {
                sword: '🗡️', pickaxe: '⛏️', axe: '🪓', shovel: '🪣',
                helmet: '⛑️', chestplate: '🦺', leggings: '👖', boots: '👢',
                bow: '🏹', arrow: '🏹', shield: '🛡️', totem: '✨',
                apple: '🍎', bread: '🍞', beef: '🥩', porkchop: '🥓',
                pearl: '🟣', diamond: '💎', iron: '🔩', gold: '🥇',
                netherite: '⬛', cobblestone: '🧱', dirt: '🟫', wood: '🪵',
                coal: '⚫', redstone: '🔴', emerald: '💚', lapis: '🔵',
                potion: '🧪', bucket: '🪣', fishing: '🎣', trident: '🔱',
                crossbow: '🏹', firework: '🎆', book: '📖', torch: '🔦'
            };

            function getItemIcon(name) {
                for (const [key, icon] of Object.entries(iconMap)) {
                    if (name.includes(key)) return icon;
                }
                return '📦';
            }

            function createSlotHtml(item, emptyIcon = '') {
                if (!item) {
                    return `<div class="inv-slot empty"><span class="inv-slot-icon" style="opacity:0.2">${emptyIcon}</span></div>`;
                }
                const displayName = item.name.replace(/_/g, ' ');
                return `
                    <div class="inv-slot" title="${displayName} x${item.count}">
                        <span class="inv-slot-icon">${getItemIcon(item.name)}</span>
                        <span class="inv-slot-name">${displayName}</span>
                        ${item.count > 1 ? `<span class="inv-slot-count">${item.count}</span>` : ''}
                    </div>`;
            }

            // 1. Armor (Slots 5, 6, 7, 8 in mineflayer are armor: head, chest, legs, feet)
            // But we might just get a flat items array depending on how backend emits.
            // Let's filter by name to be safe if slots aren't mapped.
            const armorParts = ['helmet', 'chestplate', 'leggings', 'boots'];
            const armorIcons = ['⛑️', '🦺', '👖', '👢'];
            let armorHtml = '';
            
            armorParts.forEach((part, index) => {
                const found = items.find(i => i && i.name && i.name.includes(part));
                armorHtml += createSlotHtml(found, armorIcons[index]);
            });
            if (armorGrid) armorGrid.innerHTML = armorHtml;

            // 2. Weapons & Tools
            const weaponTypes = ['sword', 'axe', 'pickaxe', 'shovel', 'hoe', 'bow', 'crossbow', 'shield', 'trident'];
            const weapons = items.filter(i => i && i.name && weaponTypes.some(t => i.name.includes(t)) && !armorParts.some(p => i.name.includes(p)));
            let weaponsHtml = '';
            weapons.forEach(w => { weaponsHtml += createSlotHtml(w); });
            // Fill empty slots to make a row of 4 if less than 4
            for (let i = weapons.length; i < 4; i++) {
                weaponsHtml += createSlotHtml(null);
            }
            if (weaponsGrid) weaponsGrid.innerHTML = weaponsHtml;

            // 3. General
            const generalItems = items.filter(i => !weapons.includes(i) && !items.find(a => a && a.name && armorParts.some(p => a.name.includes(p)) && a === i));
            let generalHtml = '';
            generalItems.forEach(g => { generalHtml += createSlotHtml(g); });
            // Pad to multiple of 4
            const remainder = generalItems.length % 4;
            const pad = remainder === 0 && generalItems.length > 0 ? 0 : 4 - remainder;
            for (let i = 0; i < pad; i++) {
                generalHtml += createSlotHtml(null);
            }
            // Ensure at least 8 slots shown
            for(let i = generalItems.length + pad; i < 8; i++) {
                generalHtml += createSlotHtml(null);
            }
            if (generalGrid) generalGrid.innerHTML = generalHtml;
        }

        function updateFriendsUI(friends) {
            const list = document.getElementById('friendsList');
            const countEl = document.getElementById('friendCount');
            if (!list) return;

            countEl.textContent = friends.length;

            let html = '';
            friends.forEach(name => {
                const isOwner = name === botState.owner;
                html += `
                    <div class="friend-item">
                        <div class="friend-info">
                            <img class="friend-avatar" src="https://mc-heads.net/avatar/${name}/28" alt="${name}" onerror="this.style.display='none'">
                            <span class="friend-name ${isOwner ? 'owner-tag' : ''}">${name}${isOwner ? ' 👑' : ''}</span>
                        </div>
                        ${!isOwner ? `<button class="friend-remove" onclick="removeFriend('${name}')" title="Remove friend">✕</button>` : ''}
                    </div>`;
            });
            list.innerHTML = html;
        }

        // ===========================
        // CHAT
        // ===========================

        function addChatMessage(type, text, scroll = true) {
            const container = document.getElementById('chatMessages');
            if (!container) return;

            const now = new Date();
            const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

            const div = document.createElement('div');
            div.className = `chat-msg ${type}`;
            div.innerHTML = `<span class="timestamp">[${time}]</span> ${escapeHtml(text)}`;
            container.appendChild(div);

            // Keep max 200 messages
            while (container.children.length > 200) {
                container.removeChild(container.firstChild);
            }

            if (scroll) {
                scrollChatToBottom();
            }
        }

        function scrollChatToBottom() {
            const container = document.getElementById('chatMessages');
            if (container) {
                container.scrollTop = container.scrollHeight;
            }
        }

        function clearChat() {
            const container = document.getElementById('chatMessages');
            if (container) {
                container.innerHTML = '';
                addChatMessage('system', 'Chat cleared.');
            }
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        // ===========================
        // COMMANDS
        // ===========================

        function sendCommand(cmd) {
            socket.emit('command', cmd);
            addChatMessage('command', `» ${cmd}`);
            showToast(`Sent: ${cmd}`, 'success');
        }

        function toggleMode(mode) {
            if (mode === 'guard') {
                sendCommand(modes.guardMode ? '!guard off' : '!guard on');
            } else if (mode === 'patrol') {
                sendCommand(modes.patrolMode ? '!patrol off' : '!patrol on');
            } else if (mode === 'afk') {
                sendCommand(modes.antiAfk ? '!afk off' : '!afk on');
            }
        }

        function setFollowMode() {
            const mode = document.getElementById('followModeSelect').value;
            sendCommand(`!follow ${mode}`);
        }

        function sendChatInput() {
            const input = document.getElementById('chatInput');
            const text = input.value.trim();
            if (!text) return;

            if (text.startsWith('!')) {
                // Bot command
                sendCommand(text);
            } else if (text.startsWith('say ')) {
                // Raw chat message
                socket.emit('chat', text.slice(4));
                addChatMessage('bot-msg', `Bot says: ${text.slice(4)}`);
            } else {
                // Treat as command by default
                sendCommand(text.startsWith('!') ? text : text);
                // If it doesn't start with !, send as raw chat
                socket.emit('chat', text);
                addChatMessage('bot-msg', `Bot says: ${text}`);
            }

            input.value = '';
            input.focus();
        }

        // ===========================
        // FRIENDS
        // ===========================

        function addFriend() {
            const input = document.getElementById('friendAddInput');
            const name = input.value.trim();
            if (!name) return;

            socket.emit('friend-add', name);
            input.value = '';
            showToast(`Adding ${name} as friend...`, 'info');
        }

        function removeFriend(name) {
            if (!confirm(`Remove ${name} from friends?`)) return;
            socket.emit('friend-remove', name);
            showToast(`Removing ${name} from friends...`, 'info');
        }

        // ===========================
        // TOASTS
        // ===========================

        function showToast(message, type = 'info') {
            const container = document.getElementById('toastContainer');
            const toast = document.createElement('div');
            toast.className = `toast ${type}`;

            const icons = { success: '✅', error: '❌', info: 'ℹ️' };
            toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span> ${escapeHtml(message)}`;

            container.appendChild(toast);

            setTimeout(() => {
                if (toast.parentNode) toast.remove();
            }, 3000);
        }

        // ===========================
        // KEYBOARD
        // ===========================

        document.getElementById('chatInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                sendChatInput();
            }
        });

        document.getElementById('friendAddInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                addFriend();
            }
        });

        // ===========================
        // MOBILE SIDEBAR TOGGLES
        // ===========================

        const overlay = document.getElementById('sidebarOverlay');

        document.getElementById('toggleLeftSidebar').addEventListener('click', () => {
            const sidebar = document.getElementById('leftSidebar');
            const rightSidebar = document.getElementById('rightSidebar');
            rightSidebar.classList.remove('open');
            sidebar.classList.toggle('open');
            overlay.classList.toggle('active', sidebar.classList.contains('open'));
        });

        document.getElementById('toggleRightSidebar').addEventListener('click', () => {
            const sidebar = document.getElementById('rightSidebar');
            const leftSidebar = document.getElementById('leftSidebar');
            leftSidebar.classList.remove('open');
            sidebar.classList.toggle('open');
            overlay.classList.toggle('active', sidebar.classList.contains('open'));
        });

        overlay.addEventListener('click', () => {
            document.getElementById('leftSidebar').classList.remove('open');
            document.getElementById('rightSidebar').classList.remove('open');
            overlay.classList.remove('active');
        });
        function transferOwner() {
            const input = document.getElementById('ownerTransferInput');
            const name = input.value.trim();
            if (!name) return;
            if (!confirm(`Transfer ownership to ${name}? You will lose control of the dashboard.`)) return;
            socket.emit('owner-transfer', name);
            input.value = '';
            showToast(`Transferring ownership to ${name}...`, 'info');
        }

