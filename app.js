// Global state
let gameState = {};
let rosters = { offense: [], defense: [] };
let fieldLocations = [];
let selectedPlayers = []; // 11 offensive players selected
let selectedDefense = []; // 11 defensive players selected
let lastSelectedPlayers = []; // Last 11 offensive players chosen (for default)
let lastSelectedDefense = []; // Last 11 defensive players chosen (for default)
let playerPositions = {}; // { playerId: { x, y, location } }
let assignments = { offense: {}, defense: {} };
let currentStep = 1;
let stateMachine = {};
let outcomeFiles = {}; // Cache for loaded outcome files

// Initialize
async function init() {
    try {
        console.log('Initializing application...');
        await loadGameState();
        await loadRosters();
        await loadFieldLocations();
        await loadStateMachine();
        
        console.log('Rosters loaded:', {
            offense: rosters.offense.length,
            defense: rosters.defense.length
        });
        
        renderStep(1);
        updateGameStateDisplay();
        console.log('Initialization complete');
    } catch (error) {
        console.error('Error during initialization:', error);
    }
}

// Load data files
async function loadGameState() {
    try {
        const response = await fetch('gamestate.json');
        gameState = await response.json();
    } catch (error) {
        console.error('Error loading game state:', error);
        gameState = {
            possession: "home",
            quarter: 1,
            down: 1,
            distance: 10,
            "opp-yardline": 65,
            score: { home: 0, away: 0 },
            time: "15:00"
        };
    }
}

async function loadRosters() {
    try {
        console.log('Loading rosters...');
        console.log('Current URL:', window.location.href);
        console.log('Protocol:', window.location.protocol);
        
        const offenseResponse = await fetch('rosters/offense.json');
        if (!offenseResponse.ok) {
            throw new Error(`Failed to load offense roster: ${offenseResponse.status} ${offenseResponse.statusText}`);
        }
        rosters.offense = await offenseResponse.json();
        console.log(`Loaded ${rosters.offense.length} offensive players`);
        
        const defenseResponse = await fetch('rosters/defense.json');
        if (!defenseResponse.ok) {
            throw new Error(`Failed to load defense roster: ${defenseResponse.status} ${defenseResponse.statusText}`);
        }
        rosters.defense = await defenseResponse.json();
        console.log(`Loaded ${rosters.defense.length} defensive players`);
        
        // Render after a short delay to ensure DOM is ready
        setTimeout(() => {
            renderPersonnelSelection();
            updatePersonnelDisplay();
        }, 100);
    } catch (error) {
        console.error('Error loading rosters:', error);
        const isFileProtocol = window.location.protocol === 'file:';
        const errorMsg = isFileProtocol 
            ? `CORS Error: Cannot load files with file:// protocol.\n\nPlease use a web server:\n- Python: python -m http.server 8000\n- Node: npx serve\n- VS Code: Use Live Server extension\n\nThen open http://localhost:8000`
            : `Failed to load rosters: ${error.message}\n\nPlease check:\n1. rosters/offense.json exists\n2. rosters/defense.json exists\n3. You're using a web server (not file://)`;
        alert(errorMsg);
    }
}

async function loadFieldLocations() {
    try {
        const response = await fetch('fieldlocations.json');
        fieldLocations = await response.json();
        renderField();
    } catch (error) {
        console.error('Error loading field locations:', error);
    }
}

async function loadStateMachine() {
    try {
        const response = await fetch('play-state-machine.json');
        stateMachine = await response.json();
    } catch (error) {
        console.error('Error loading state machine:', error);
    }
}

// Render functions
function renderPersonnelSelection() {
    const offenseList = document.getElementById('offenseList');
    const defenseList = document.getElementById('defenseList');
    
    if (!offenseList || !defenseList) {
        console.error('Personnel selection elements not found');
        return;
    }
    
    offenseList.innerHTML = '';
    defenseList.innerHTML = '';
    
    // Default to last 11 selected, or smart defaults if none
    if (selectedPlayers.length === 0 && lastSelectedPlayers.length > 0) {
        selectedPlayers = [...lastSelectedPlayers];
    } else if (selectedPlayers.length === 0) {
        // Smart default: First QB, first 5 linemen
        const qb = rosters.offense.findIndex(p => p.position === 'QB');
        const linemen = rosters.offense
            .map((p, i) => ({ player: p, index: i }))
            .filter(item => ['OT', 'OG', 'C'].includes(item.player.position))
            .slice(0, 5);
        
        selectedPlayers = [];
        if (qb >= 0) selectedPlayers.push(`offense-${qb}`);
        linemen.forEach(item => selectedPlayers.push(`offense-${item.index}`));
        
        // Fill remaining 5 spots with first available players
        let remaining = 11 - selectedPlayers.length;
        for (let i = 0; i < rosters.offense.length && remaining > 0; i++) {
            const playerId = `offense-${i}`;
            if (!selectedPlayers.includes(playerId)) {
                selectedPlayers.push(playerId);
                remaining--;
            }
        }
    }
    
    // Default to last 11 defensive players, or smart defaults if none
    if (selectedDefense.length === 0 && lastSelectedDefense.length > 0) {
        selectedDefense = [...lastSelectedDefense];
    } else if (selectedDefense.length === 0) {
        // Smart default: 2 DE, 2 DT, 2 LB, 2 CB, 2 S
        selectedDefense = [];
        
        const de = rosters.defense.filter((p, i) => p.position === 'DE').slice(0, 2);
        const dt = rosters.defense.filter((p, i) => p.position === 'DT').slice(0, 2);
        const lb = rosters.defense.filter((p, i) => ['LB', 'MLB'].includes(p.position)).slice(0, 2);
        const cb = rosters.defense.filter((p, i) => p.position === 'CB').slice(0, 2);
        const s = rosters.defense.filter((p, i) => p.position === 'S').slice(0, 2);
        
        rosters.defense.forEach((p, i) => {
            const playerId = `defense-${i}`;
            if (de.includes(p) || dt.includes(p) || lb.includes(p) || cb.includes(p) || s.includes(p)) {
                selectedDefense.push(playerId);
            }
        });
        
        // Fill remaining spots if needed
        let remaining = 11 - selectedDefense.length;
        for (let i = 0; i < rosters.defense.length && remaining > 0; i++) {
            const playerId = `defense-${i}`;
            if (!selectedDefense.includes(playerId)) {
                selectedDefense.push(playerId);
                remaining--;
            }
        }
    }
    
    // Render offensive roster
    rosters.offense.forEach((player, index) => {
        const card = createPlayerCard(player, 'offense', index);
        offenseList.appendChild(card);
    });
    
    // Render defensive roster (for reference, but we select 11 total from offense)
    rosters.defense.forEach((player, index) => {
        const card = createPlayerCard(player, 'defense', index);
        defenseList.appendChild(card);
    });
    
    // Update selected state
    updateSelectedPlayersDisplay();
}

function createPlayerCard(player, side, index) {
    const card = document.createElement('div');
    card.className = 'player-card';
    card.dataset.playerId = `${side}-${index}`;
    card.dataset.side = side;
    card.dataset.index = index;
    card.draggable = true;
    
    const effectivePercentile = calculateEffectivePercentile(player);
    const playerId = `${side}-${index}`;
    const isSelected = side === 'offense' ? selectedPlayers.includes(playerId) : selectedDefense.includes(playerId);
    
    if (isSelected) {
        card.classList.add('selected');
    }
    
    // Find strongest trait
    const strongestTrait = getStrongestTrait(player);
    
    card.innerHTML = `
        <div class="player-name">${player.name} #${player.jersey}</div>
        <div class="player-info">${player.position} | ${effectivePercentile.toFixed(0)}% | Stamina: ${player.stamina || 100}%</div>
        <div class="stamina-bar">
            <div class="stamina-fill" style="width: ${player.stamina || 100}%"></div>
        </div>
    `;
    
    // Add tooltip for strongest trait
    card.title = strongestTrait ? `${strongestTrait.name}: +${strongestTrait.bonus}%` : 'No traits';
    
    card.addEventListener('click', () => togglePlayerSelection(card, side, index));
    card.addEventListener('dragstart', (e) => handleDragStart(e, side, index));
    card.addEventListener('mouseenter', (e) => showTraitTooltip(e, player, strongestTrait));
    card.addEventListener('mouseleave', () => hideTraitTooltip());
    
    return card;
}

function getStrongestTrait(player) {
    if (!player['traits-from-baseline-percentile']) return null;
    
    const traits = player['traits-from-baseline-percentile'];
    let strongest = null;
    let maxBonus = -Infinity;
    
    for (const [traitName, bonus] of Object.entries(traits)) {
        if (bonus > maxBonus) {
            maxBonus = bonus;
            strongest = { name: traitName, bonus: bonus };
        }
    }
    
    return strongest;
}

function showTraitTooltip(event, player, strongestTrait) {
    if (!strongestTrait) return;
    
    const tooltip = document.createElement('div');
    tooltip.id = 'trait-tooltip';
    tooltip.style.cssText = `
        position: absolute;
        background: rgba(0, 0, 0, 0.9);
        color: white;
        padding: 8px 12px;
        border-radius: 4px;
        font-size: 0.9em;
        pointer-events: none;
        z-index: 10000;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    `;
    tooltip.textContent = `${strongestTrait.name}: +${strongestTrait.bonus}%`;
    document.body.appendChild(tooltip);
    
    const rect = event.target.getBoundingClientRect();
    tooltip.style.left = (rect.left + rect.width / 2 - tooltip.offsetWidth / 2) + 'px';
    tooltip.style.top = (rect.top - tooltip.offsetHeight - 8) + 'px';
}

function hideTraitTooltip() {
    const tooltip = document.getElementById('trait-tooltip');
    if (tooltip) {
        tooltip.remove();
    }
}

function updateSelectedPlayersDisplay() {
    // Update all player cards to show selected state
    document.querySelectorAll('.player-card').forEach(card => {
        const playerId = card.dataset.playerId;
        const side = card.dataset.side;
        
        if (side === 'offense' && selectedPlayers.includes(playerId)) {
            card.classList.add('selected');
        } else if (side === 'defense' && selectedDefense.includes(playerId)) {
            card.classList.add('selected');
        } else {
            card.classList.remove('selected');
        }
    });
    
    // Update counters
    const offenseCounter = document.getElementById('offenseCount');
    if (offenseCounter) {
        offenseCounter.textContent = `Offense: ${selectedPlayers.length}/11`;
    }
    
    const defenseCounter = document.getElementById('defenseCount');
    if (defenseCounter) {
        defenseCounter.textContent = `Defense: ${selectedDefense.length}/11`;
    }
}

function updatePersonnelDisplay() {
    const personnelDisplay = document.getElementById('personnelDisplay');
    if (!personnelDisplay) return;
    
    // Detect offensive personnel
    const offensePersonnel = detectOffensivePersonnel();
    const defensePersonnel = detectDefensivePersonnel();
    
    personnelDisplay.innerHTML = `
        <div style="display: flex; gap: 30px; align-items: center;">
            <div>
                <strong>Offensive Personnel:</strong> ${offensePersonnel}
            </div>
            <div>
                <strong>Defensive Personnel:</strong> ${defensePersonnel}
            </div>
        </div>
    `;
}

function detectOffensivePersonnel() {
    if (selectedPlayers.length === 0) return 'No players selected';
    
    const players = selectedPlayers.map(id => getPlayerById(id)).filter(p => p);
    const qb = players.filter(p => p.position === 'QB').length;
    const rb = players.filter(p => p.position === 'RB').length;
    const te = players.filter(p => p.position === 'TE').length;
    const wr = players.filter(p => p.position === 'WR').length;
    const ol = players.filter(p => ['OT', 'OG', 'C'].includes(p.position)).length;
    
    // Check for extra linemen (>5)
    const hasExtraLinemen = ol > 5;
    const asterisk = hasExtraLinemen ? '*' : '';
    
    // Wildcat if no QB
    if (qb === 0) {
        return hasExtraLinemen ? `WILDCAT* (${ol} linemen)` : 'WILDCAT';
    }
    
    // Personnel format: (RB)(TE)(WR) with asterisk for extra linemen
    // Support: 00, 01, 10, 11, 12, 13, 21, 22 + asterisk versions
    
    if (rb === 0 && te === 0 && wr === 5) {
        return `00${asterisk} Personnel (0 RB, 0 TE, 5 WR${hasExtraLinemen ? `, ${ol} linemen` : ''})`;
    } else if (rb === 0 && te === 1 && wr === 4) {
        return `01${asterisk} Personnel (0 RB, 1 TE, 4 WR${hasExtraLinemen ? `, ${ol} linemen` : ''})`;
    } else if (rb === 1 && te === 0 && wr === 4) {
        return `10${asterisk} Personnel (1 RB, 0 TE, 4 WR${hasExtraLinemen ? `, ${ol} linemen` : ''})`;
    } else if (rb === 1 && te === 1 && wr === 3) {
        return `11${asterisk} Personnel (1 RB, 1 TE, 3 WR${hasExtraLinemen ? `, ${ol} linemen` : ''})`;
    } else if (rb === 1 && te === 2 && wr === 2) {
        return `12${asterisk} Personnel (1 RB, 2 TE, 2 WR${hasExtraLinemen ? `, ${ol} linemen` : ''})`;
    } else if (rb === 1 && te === 3) {
        return `13${asterisk} Personnel (1 RB, 3 TE${hasExtraLinemen ? `, ${ol} linemen` : ''})`;
    } else if (rb === 2 && te === 1 && wr === 2) {
        return `21${asterisk} Personnel (2 RB, 1 TE, 2 WR${hasExtraLinemen ? `, ${ol} linemen` : ''})`;
    } else if (rb === 2 && te === 2 && wr === 1) {
        return `22${asterisk} Personnel (2 RB, 2 TE, 1 WR${hasExtraLinemen ? `, ${ol} linemen` : ''})`;
    } else {
        // Custom format - show all positions
        const parts = [];
        if (rb > 0) parts.push(`${rb} RB`);
        if (te > 0) parts.push(`${te} TE`);
        if (wr > 0) parts.push(`${wr} WR`);
        if (hasExtraLinemen) parts.push(`${ol} OL`);
        return `${rb}${te}${wr}${asterisk} Personnel (${parts.join(', ')})`;
    }
}

function detectDefensivePersonnel() {
    if (selectedDefense.length === 0) return 'No players selected';
    
    const players = selectedDefense.map(id => getPlayerById(id)).filter(p => p);
    const cb = players.filter(p => p.position === 'CB').length;
    const s = players.filter(p => p.position === 'S').length;
    const db = cb + s;
    const lb = players.filter(p => p.position === 'LB' || p.position === 'MLB').length;
    const dl = players.filter(p => ['DE', 'DT'].includes(p.position)).length;
    
    // Defensive personnel based on number and type of DBs
    if (db === 4) {
        return 'Base (4 DB)';
    } else if (db === 5) {
        // Distinguish between Nickel (3CB/2S) and Big Nickel (3S/2CB)
        if (s === 3 && cb === 2) {
            return 'Big Nickel (3 S, 2 CB)';
        } else if (cb === 3 && s === 2) {
            return 'Nickel (3 CB, 2 S)';
        } else {
            return `Nickel (5 DB: ${cb} CB, ${s} S)`;
        }
    } else if (db === 6) {
        return 'Dime (6 DB)';
    } else if (db === 7) {
        return 'Quarter (7 DB)';
    } else if (db >= 8) {
        return 'Quarter+ (8+ DB)';
    } else if (db === 3) {
        return '3 DB (Rare)';
    } else {
        return `${db} DB (${cb} CB, ${s} S), ${lb} LB, ${dl} DL`;
    }
}

function renderField() {
    const canvas = document.getElementById('fieldCanvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const container = document.getElementById('fieldContainer');
    
    // Scale canvas to container
    const dpr = window.devicePixelRatio || 1;
    canvas.width = container.offsetWidth * dpr;
    canvas.height = container.offsetHeight * dpr;
    canvas.style.width = container.offsetWidth + 'px';
    canvas.style.height = container.offsetHeight + 'px';
    ctx.scale(dpr, dpr);
    
    // Draw field
    ctx.fillStyle = '#2d5016';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw yard lines
    const centerY = canvas.height / 2;
    for (let i = 0; i <= 10; i++) {
        const x = (i / 10) * canvas.width;
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    
    // Draw hash marks
    const hashY1 = centerY - 20;
    const hashY2 = centerY + 20;
    for (let i = 0; i <= 10; i++) {
        const x = (i / 10) * canvas.width;
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillRect(x - 1, hashY1, 2, 10);
        ctx.fillRect(x - 1, hashY2, 2, 10);
    }
    
    // Draw line of scrimmage
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(canvas.width, centerY);
    ctx.stroke();
    
    // Draw drop zones for field locations
    const canvasWidth = container.offsetWidth;
    const canvasHeight = container.offsetHeight;
    
    fieldLocations.forEach(section => {
        section.Locations.forEach(location => {
            if (location.X !== undefined && location.Y !== undefined) {
                const x = ((location.X + 25) / 50) * canvasWidth; // Normalize -25 to +25 to 0 to width
                const y = centerY - (location.Y * 10); // Scale Y coordinate
                
                if (x >= 0 && x <= canvasWidth && y >= 0 && y <= canvasHeight) {
                    ctx.fillStyle = 'rgba(255,255,255,0.2)';
                    ctx.beginPath();
                    ctx.arc(x, y, 20, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                }
            }
        });
    });
    
    // Make canvas droppable
    canvas.addEventListener('dragover', handleDragOver);
    canvas.addEventListener('drop', handleDrop);
    
    // Render existing player markers
    renderPlayerMarkers();
    
    // Render assignment arrows
    renderAssignmentArrows();
}

// Assignment categories and actions
const offensiveAssignments = {
    'QB': {
        'Pass': ['Boot right', 'Boot left', 'Play action pass', '3 step drop', '5 step drop', '7 step drop'],
        'Run': ['QB draw', 'Zone read left', 'Zone read right', 'Handoff']
    },
    'RB': {
        'Protect': ['Block left', 'Block right', 'Leak/delay left', 'Leak/delay right'],
        'Run': ['IZR', 'OZR', 'Left A gap', 'Left B gap', 'Right A gap', 'Right B gap', 'Left C gap', 'Right C gap'],
        'Route': ['Wheel', 'Tunnel screen', 'Flat', 'Checkdown']
    },
    'WR': {
        'Block': ['Block', 'Jet Motion', 'Jet motion option'],
        'Route': ['Slant', 'Dig', 'Out', 'Curl', 'Comeback', 'Corner', 'Post', 'Fade', 'Seam/Go', 'Chip+Delay', 'Screen']
    },
    'TE': {
        'Block': ['Block', 'Jet Motion', 'Jet motion option'],
        'Route': ['Slant', 'Dig', 'Out', 'Curl', 'Comeback', 'Corner', 'Post', 'Fade', 'Seam/Go', 'Chip+Delay']
    },
    'OT': {
        'Pass Block': ['Inside priority', 'Outside priority'],
        'Run Block': ['Zone inside left', 'Zone inside right', 'Zone outside left', 'Zone outside right', 'Pull', 'Seal edge', 'Combo']
    },
    'OG': {
        'Pass Block': ['Inside priority', 'Outside priority'],
        'Run Block': ['Zone inside left', 'Zone inside right', 'Zone outside left', 'Zone outside right', 'Pull', 'Seal edge', 'Combo']
    },
    'C': {
        'Pass Block': ['Inside priority', 'Outside priority'],
        'Run Block': ['Zone inside left', 'Zone inside right', 'Zone outside left', 'Zone outside right', 'Pull', 'Seal edge', 'Combo']
    }
};

const defensiveAssignments = {
    'CB': {
        'Man Coverage': ['Inside release man', 'Outside release man'],
        'Zone Deep': ['Deep middle', 'Deep left (2)', 'Deep right (2)', 'Deep left (3)', 'Deep right (3)'],
        'Zone Short': ['Flat', 'Hook', 'Curtain']
    },
    'S': {
        'Man Coverage': ['Inside release man', 'Outside release man'],
        'Zone Deep': ['Deep middle', 'Deep left (2)', 'Deep right (2)', 'Deep left (3)', 'Deep right (3)'],
        'Zone Short': ['Hook', 'Curtain', 'Robber']
    },
    'LB': {
        'Zone': ['Hook', 'Curtain', 'Robber', 'Spy'],
        'Blitz': ['Left A gap', 'Right A gap', 'Left B gap', 'Right B gap', 'Left C gap', 'Right C gap', 'Contain']
    },
    'MLB': {
        'Zone': ['Hook', 'Curtain', 'Robber', 'Spy'],
        'Blitz': ['Left A gap', 'Right A gap', 'Left B gap', 'Right B gap']
    },
    'DE': {
        'Rush': ['Left A gap', 'Right A gap', 'Left B gap', 'Right B gap', 'Left C gap', 'Right C gap', 'Contain'],
        'Spy': ['Spy']
    },
    'DT': {
        'Rush': ['Left A gap', 'Right A gap', 'Left B gap', 'Right B gap'],
        'Spy': ['Spy']
    }
};

function renderAssignments() {
    const offenseAssignments = document.getElementById('offenseAssignments');
    const defenseAssignments = document.getElementById('defenseAssignments');
    
    offenseAssignments.innerHTML = '';
    defenseAssignments.innerHTML = '';
    
    // Show location from previous screen
    selectedPlayers.forEach((playerId) => {
        const player = getPlayerById(playerId);
        if (player) {
            const location = playerPositions[playerId]?.location || 'Not placed';
            const item = createAssignmentItem(player, 'offense', location);
            offenseAssignments.appendChild(item);
        }
    });
    
    selectedDefense.forEach((playerId) => {
        const player = getPlayerById(playerId);
        if (player) {
            const location = playerPositions[playerId]?.location || 'Not placed';
            const item = createAssignmentItem(player, 'defense', location);
            defenseAssignments.appendChild(item);
        }
    });
}

function createAssignmentItem(player, side, location) {
    const item = document.createElement('div');
    item.className = 'assignment-item';
    item.style.cssText = 'display: flex; flex-direction: column; gap: 10px; padding: 15px; background: #fff; border-radius: 8px; margin-bottom: 15px;';
    
    const header = document.createElement('div');
    header.style.cssText = 'display: flex; justify-content: space-between; align-items: center;';
    header.innerHTML = `
        <div>
            <strong>${player.name}</strong> (${player.position})
            <div style="font-size: 0.85em; color: #666;">Location: ${location}</div>
        </div>
    `;
    item.appendChild(header);
    
    // Two-stage selection: Category then Action
    const categorySelect = document.createElement('select');
    categorySelect.style.cssText = 'padding: 8px; border-radius: 5px; border: 1px solid #ddd; font-size: 1em; margin-bottom: 8px;';
    categorySelect.innerHTML = '<option value="">Select category...</option>';
    
    const actionSelect = document.createElement('select');
    actionSelect.style.cssText = 'padding: 8px; border-radius: 5px; border: 1px solid #ddd; font-size: 1em;';
    actionSelect.innerHTML = '<option value="">Select action...</option>';
    actionSelect.disabled = true;
    
    const assignments = side === 'offense' ? offensiveAssignments : defensiveAssignments;
    const playerAssignments = assignments[player.position] || {};
    
    // Populate categories
    Object.keys(playerAssignments).forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        categorySelect.appendChild(option);
    });
    
    // Pre-populate with most likely action
    const defaultCategory = Object.keys(playerAssignments)[0];
    if (defaultCategory) {
        categorySelect.value = defaultCategory;
        populateActions(actionSelect, playerAssignments[defaultCategory]);
        actionSelect.disabled = false;
        
            // Set default action
            const defaultAction = playerAssignments[defaultCategory][0];
            if (defaultAction) {
                actionSelect.value = defaultAction;
                updateAssignment(player, side, defaultCategory, defaultAction);
            }
    }
    
    categorySelect.addEventListener('change', (e) => {
        const category = e.target.value;
        actionSelect.innerHTML = '<option value="">Select action...</option>';
        actionSelect.disabled = !category;
        
        if (category && playerAssignments[category]) {
            populateActions(actionSelect, playerAssignments[category]);
            // Auto-select first action
            if (playerAssignments[category].length > 0) {
                actionSelect.value = playerAssignments[category][0];
                updateAssignment(player, side, category, playerAssignments[category][0]);
            }
        }
    });
    
    actionSelect.addEventListener('change', (e) => {
        updateAssignment(player, side, categorySelect.value, e.target.value);
    });
    
    item.appendChild(categorySelect);
    item.appendChild(actionSelect);
    
    return item;
}

function populateActions(select, actions) {
    actions.forEach(action => {
        const option = document.createElement('option');
        option.value = action;
        option.textContent = action;
        select.appendChild(option);
    });
}

function updateAssignment(player, side, category, action) {
    if (!assignments[side]) assignments[side] = {};
    assignments[side][player.name] = {
        category: category,
        action: action
    };
    // Re-render field to show arrows
    renderField();
    renderPlayerMarkers();
    renderAssignmentArrows();
}

// Step navigation
function renderStep(step) {
    // Hide all steps
    for (let i = 1; i <= 5; i++) {
        document.getElementById(`step${i}`).classList.add('hidden');
        document.querySelector(`.step[data-step="${i}"]`).classList.remove('active', 'completed');
    }
    
    // Show current step
    document.getElementById(`step${step}`).classList.remove('hidden');
    document.querySelector(`.step[data-step="${step}"]`).classList.add('active');
    
    // Mark previous steps as completed
    for (let i = 1; i < step; i++) {
        document.querySelector(`.step[data-step="${i}"]`).classList.add('completed');
    }
    
    currentStep = step;
    
    // Render step-specific content
    if (step === 2) {
        renderField();
        renderFormationMenu();
        prePopulateOffensiveLine();
    } else if (step === 4) {
        renderAssignments();
    } else if (step === 5) {
        renderCoachingPoints();
    }
    
    // Always update personnel display
    updatePersonnelDisplay();
}

function renderFormationMenu() {
    const playerSelect = document.getElementById('formationPlayerSelect');
    const locationSelect = document.getElementById('formationLocationSelect');
    
    if (!playerSelect || !locationSelect) return;
    
    // Populate players
    playerSelect.innerHTML = '<option value="">Select a player...</option>';
    [...selectedPlayers, ...selectedDefense].forEach(playerId => {
        const player = getPlayerById(playerId);
        if (player) {
            const option = document.createElement('option');
            option.value = playerId;
            const [side] = playerId.split('-');
            const location = playerPositions[playerId]?.location || 'Not placed';
            option.textContent = `${player.name} (${player.position}) - ${location}`;
            playerSelect.appendChild(option);
        }
    });
    
    // Populate locations by section
    locationSelect.innerHTML = '<option value="">Select a location...</option>';
    fieldLocations.forEach(section => {
        const optgroup = document.createElement('optgroup');
        optgroup.label = section.Section;
        section.Locations.forEach(location => {
            const locName = location.Name || location;
            const locX = location.X;
            const locY = location.Y;
            
            if (locX !== undefined && locY !== undefined) {
                const option = document.createElement('option');
                option.value = JSON.stringify({ name: locName, x: locX, y: locY, section: section.Section });
                option.textContent = locName;
                optgroup.appendChild(option);
            }
        });
        if (optgroup.children.length > 0) {
            locationSelect.appendChild(optgroup);
        }
    });
}

function placePlayerOnField() {
    const playerSelect = document.getElementById('formationPlayerSelect');
    const locationSelect = document.getElementById('formationLocationSelect');
    
    if (!playerSelect || !locationSelect) return;
    
    const playerId = playerSelect.value;
    const locationStr = locationSelect.value;
    
    if (!playerId || !locationStr) {
        alert('Please select both a player and a location.');
        return;
    }
    
    const location = JSON.parse(locationStr);
    const player = getPlayerById(playerId);
    if (!player) return;
    
    const [side] = playerId.split('-');
    const container = document.getElementById('fieldContainer');
    const canvasWidth = container.offsetWidth;
    const canvasHeight = container.offsetHeight;
    const centerY = canvasHeight / 2;
    
    const x = ((location.x + 25) / 50) * canvasWidth;
    const y = centerY - (location.y * 10);
    
    // Check for offsides
    const isOffsides = (side === 'offense' && location.y > -1) || 
                      (side === 'defense' && location.y < 1);
    const isOffensiveSection = location.section.includes('Offensive') || location.section.includes('offensive');
    const isDefensiveSection = location.section.includes('Defensive') || location.section.includes('defensive') ||
                              location.section.includes('Coverage') || location.section.includes('Press') ||
                              location.section.includes('Deep');
    const wrongSide = (side === 'offense' && !isOffensiveSection && isDefensiveSection) ||
                     (side === 'defense' && !isDefensiveSection && isOffensiveSection);
    
    playerPositions[playerId] = {
        x: x,
        y: y,
        location: location.name,
        section: location.section,
        isOffsides: isOffsides || wrongSide
    };
    
    renderField();
    renderPlayerMarkers();
    renderFormationMenu(); // Refresh menu
}

function clearPlayerPlacement() {
    const playerSelect = document.getElementById('formationPlayerSelect');
    if (playerSelect && playerSelect.value) {
        const playerId = playerSelect.value;
        delete playerPositions[playerId];
        renderField();
        renderPlayerMarkers();
        renderFormationMenu();
    }
}

function prePopulateOffensiveLine() {
    const container = document.getElementById('fieldContainer');
    if (!container) return;
    const canvasWidth = container.offsetWidth;
    const canvasHeight = container.offsetHeight;
    const centerY = canvasHeight / 2;
    
    // Pre-populate all offensive players
    selectedPlayers.forEach((playerId, index) => {
        if (playerPositions[playerId]) return; // Skip if already placed
        
        const player = getPlayerById(playerId);
        if (!player) return;
        
        let position = null;
        
        // Position players based on their role
        if (player.position === 'QB') {
            position = { name: 'QB (Shotgun)', x: 0, y: -5, section: 'Offensive backfield' };
        } else if (player.position === 'RB') {
            position = { name: 'Behind QB (Shotgun)', x: 0, y: -5, section: 'Offensive backfield' };
        } else if (player.position === 'OT') {
            // Find available tackle spot - count how many OTs are already placed
            const placedTackles = selectedPlayers.filter(id => {
                const p = getPlayerById(id);
                return p && p.position === 'OT' && playerPositions[id] && id !== playerId;
            });
            if (placedTackles.length === 0) {
                position = { name: 'Left Tackle', x: -4, y: 0, section: 'Offensive line of scrimmage' };
            } else {
                position = { name: 'Right Tackle', x: 4, y: 0, section: 'Offensive line of scrimmage' };
            }
        } else if (player.position === 'OG') {
            const placedGuards = selectedPlayers.filter(id => {
                const p = getPlayerById(id);
                return p && p.position === 'OG' && playerPositions[id] && id !== playerId;
            });
            if (placedGuards.length === 0) {
                position = { name: 'Left Guard', x: -2, y: 0, section: 'Offensive line of scrimmage' };
            } else {
                position = { name: 'Right Guard', x: 2, y: 0, section: 'Offensive line of scrimmage' };
            }
        } else if (player.position === 'C') {
            position = { name: 'Center', x: 0, y: 0, section: 'Offensive line of scrimmage' };
        } else if (player.position === 'TE') {
            const placedTEs = selectedPlayers.filter(id => {
                const p = getPlayerById(id);
                return p && p.position === 'TE' && playerPositions[id] && id !== playerId;
            });
            if (placedTEs.length === 0) {
                position = { name: 'Tight end outside left', x: -5.5, y: 0, section: 'Offensive line of scrimmage' };
            } else {
                position = { name: 'Tight end outside right', x: 5.5, y: 0, section: 'Offensive line of scrimmage' };
            }
        } else if (player.position === 'WR') {
            const placedWRs = selectedPlayers.filter(id => {
                const p = getPlayerById(id);
                return p && p.position === 'WR' && playerPositions[id] && id !== playerId;
            });
            if (placedWRs.length === 0) {
                position = { name: 'Wide left', x: -20, y: 0, section: 'Offensive line of scrimmage' };
            } else if (placedWRs.length === 1) {
                position = { name: 'Wide right', x: 20, y: 0, section: 'Offensive line of scrimmage' };
            } else if (placedWRs.length === 2) {
                position = { name: 'Slot left', x: -6, y: 0, section: 'Offensive line of scrimmage' };
            } else {
                position = { name: 'Slot right', x: 6, y: 0, section: 'Offensive line of scrimmage' };
            }
        }
        
        if (position) {
            const x = ((position.x + 25) / 50) * canvasWidth;
            const y = centerY - (position.y * 10);
            
            playerPositions[playerId] = {
                x: x,
                y: y,
                location: position.name,
                section: position.section,
                isOffsides: false
            };
        }
    });
    
    // Pre-populate all defensive players
    selectedDefense.forEach((playerId, index) => {
        if (playerPositions[playerId]) return; // Skip if already placed
        
        const player = getPlayerById(playerId);
        if (!player) return;
        
        let position = null;
        
        if (player.position === 'DE') {
            const placedDEs = selectedDefense.filter(id => {
                const p = getPlayerById(id);
                return p && p.position === 'DE' && playerPositions[id] && id !== playerId;
            });
            if (placedDEs.length === 0) {
                position = { name: '-5', x: -5, y: 0, section: 'Defensive line of scrimmage' };
            } else {
                position = { name: '5', x: 5, y: 0, section: 'Defensive line of scrimmage' };
            }
        } else if (player.position === 'DT') {
            const placedDTs = selectedDefense.filter(id => {
                const p = getPlayerById(id);
                return p && p.position === 'DT' && playerPositions[id] && id !== playerId;
            });
            if (placedDTs.length === 0) {
                position = { name: '-3', x: -3.5, y: 0, section: 'Defensive line of scrimmage' };
            } else {
                position = { name: '3', x: 3.5, y: 0, section: 'Defensive line of scrimmage' };
            }
        } else if (['LB', 'MLB'].includes(player.position)) {
            const placedLBs = selectedDefense.filter(id => {
                const p = getPlayerById(id);
                return p && ['LB', 'MLB'].includes(p.position) && playerPositions[id] && id !== playerId;
            });
            if (placedLBs.length === 0) {
                position = { name: 'Left B gap', x: -3, y: 2, section: 'Defensive backfield' };
            } else if (placedLBs.length === 1) {
                position = { name: 'Right B gap', x: 3, y: 2, section: 'Defensive backfield' };
            } else {
                position = { name: 'Over Center', x: 0, y: 2, section: 'Defensive backfield' };
            }
        } else if (player.position === 'CB') {
            const placedCBs = selectedDefense.filter(id => {
                const p = getPlayerById(id);
                return p && p.position === 'CB' && playerPositions[id] && id !== playerId;
            });
            if (placedCBs.length === 0) {
                position = { name: 'Left cornerback', x: -18, y: 12, section: 'Deep level (shaded forward)' };
            } else {
                position = { name: 'Right cornerback', x: 18, y: 12, section: 'Deep level (shaded forward)' };
            }
        } else if (player.position === 'S') {
            const placedSs = selectedDefense.filter(id => {
                const p = getPlayerById(id);
                return p && p.position === 'S' && playerPositions[id] && id !== playerId;
            });
            if (placedSs.length === 0) {
                position = { name: 'Free safety', x: 0, y: 15, section: 'Deep level (shaded forward)' };
            } else {
                position = { name: 'Strong safety left', x: -8, y: 12, section: 'Deep level (shaded forward)' };
            }
        }
        
        if (position) {
            const x = ((position.x + 25) / 50) * canvasWidth;
            const y = centerY - (position.y * 10);
            
            playerPositions[playerId] = {
                x: x,
                y: y,
                location: position.name,
                section: position.section,
                isOffsides: false
            };
        }
    });
    
    renderField();
    renderPlayerMarkers();
}

function nextStep() {
    if (currentStep < 5) {
        // Validate current step
        if (currentStep === 1) {
            if (selectedPlayers.length !== 11) {
                alert('Please select exactly 11 offensive players.');
                return;
            }
            if (selectedDefense.length !== 11) {
                alert('Please select exactly 11 defensive players.');
                return;
            }
            // Save as last selected for next time
            lastSelectedPlayers = [...selectedPlayers];
            lastSelectedDefense = [...selectedDefense];
        }
        renderStep(currentStep + 1);
    }
}

function previousStep() {
    if (currentStep > 1) {
        renderStep(currentStep - 1);
    }
}

// Player selection - select 11 offensive and 11 defensive players
function togglePlayerSelection(card, side, index) {
    const playerId = `${side}-${index}`;
    
    if (side === 'offense') {
        const indexInSelected = selectedPlayers.indexOf(playerId);
        
        if (indexInSelected === -1) {
            // Adding a player
            if (selectedPlayers.length >= 11) {
                alert('You can only select 11 offensive players. Click a selected player to remove them first.');
                return;
            }
            selectedPlayers.push(playerId);
            card.classList.add('selected');
        } else {
            // Removing a player
            selectedPlayers.splice(indexInSelected, 1);
            card.classList.remove('selected');
        }
    } else if (side === 'defense') {
        const indexInSelected = selectedDefense.indexOf(playerId);
        
        if (indexInSelected === -1) {
            // Adding a player
            if (selectedDefense.length >= 11) {
                alert('You can only select 11 defensive players. Click a selected player to remove them first.');
                return;
            }
            selectedDefense.push(playerId);
            card.classList.add('selected');
        } else {
            // Removing a player
            selectedDefense.splice(indexInSelected, 1);
            card.classList.remove('selected');
        }
    }
    
    updateSelectedPlayersDisplay();
    updatePersonnelDisplay();
}

// Drag and drop
let draggedPlayer = null;

function handleDragStart(e, side, index) {
    const playerId = `${side}-${index}`;
    const selected = side === 'offense' ? selectedOffense : selectedDefense;
    
    if (!selected.includes(playerId)) {
        e.preventDefault();
        return;
    }
    
    draggedPlayer = { side, index, playerId };
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

function handleDrop(e) {
    e.preventDefault();
    if (!draggedPlayer) return;
    
    const canvas = document.getElementById('fieldCanvas');
    const container = document.getElementById('fieldContainer');
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const canvasWidth = container.offsetWidth;
    const canvasHeight = container.offsetHeight;
    
    // Find nearest location
    const location = findNearestLocation(x, y, canvasWidth, canvasHeight);
    if (location) {
        const [side] = draggedPlayer.playerId.split('-');
        const player = getPlayerById(draggedPlayer.playerId);
        
        // Check for offsides: offense must be Y <= -1, defense must be Y >= +1
        const isOffsides = (side === 'offense' && location.originalY > -1) || 
                          (side === 'defense' && location.originalY < 1);
        
        // Also check if location matches player side
        const wrongSide = (side === 'offense' && !location.isOffensive && location.isDefensive) ||
                         (side === 'defense' && !location.isDefensive && location.isOffensive);
        
        playerPositions[draggedPlayer.playerId] = {
            x: location.x,
            y: location.y,
            location: location.name,
            section: location.section,
            isOffsides: isOffsides || wrongSide
        };
        
        renderField();
        renderPlayerMarkers();
    }
    
    draggedPlayer = null;
}

function findNearestLocation(x, y, canvasWidth, canvasHeight) {
    let nearest = null;
    let minDist = Infinity;
    const centerY = canvasHeight / 2;
    
    fieldLocations.forEach(section => {
        section.Locations.forEach(loc => {
            if (loc.X !== undefined && loc.Y !== undefined) {
                // Offense: Y must be <= -1 (below line), Defense: Y must be >= +1 (above line)
                const locY = centerY - (loc.Y * 10);
                const locX = ((loc.X + 25) / 50) * canvasWidth;
                
                // Check if location is on correct side based on section
                const isOffensiveSection = section.Section.includes('Offensive') || 
                                          section.Section.includes('offensive');
                const isDefensiveSection = section.Section.includes('Defensive') || 
                                          section.Section.includes('defensive') ||
                                          section.Section.includes('Coverage') ||
                                          section.Section.includes('Press') ||
                                          section.Section.includes('Deep');
                
                // Only consider locations on the correct side
                const dist = Math.sqrt(Math.pow(x - locX, 2) + Math.pow(y - locY, 2));
                
                if (dist < minDist && dist < 40) {
                    minDist = dist;
                    nearest = {
                        name: loc.Name || loc,
                        x: locX,
                        y: locY,
                        section: section.Section,
                        isOffensive: isOffensiveSection,
                        isDefensive: isDefensiveSection,
                        originalY: loc.Y
                    };
                }
            }
        });
    });
    
    return nearest;
}

function renderPlayerMarkers() {
    const canvas = document.getElementById('fieldCanvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const container = document.getElementById('fieldContainer');
    const overlays = document.getElementById('playerOverlays');
    if (!overlays) return;
    
    const canvasWidth = container.offsetWidth;
    const canvasHeight = container.offsetHeight;
    
    // Redraw field first
    ctx.fillStyle = '#2d5016';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    
    // Draw yard lines
    const centerY = canvasHeight / 2;
    for (let i = 0; i <= 10; i++) {
        const x = (i / 10) * canvasWidth;
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvasHeight);
        ctx.stroke();
    }
    
    // Draw hash marks with numbers
    const hashY1 = centerY - 20;
    const hashY2 = centerY + 20;
    for (let i = 0; i <= 10; i++) {
        const x = (i / 10) * canvasWidth;
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillRect(x - 1, hashY1, 2, 10);
        ctx.fillRect(x - 1, hashY2, 2, 10);
        
        // Draw yard numbers (0-50, center is 50)
        if (i % 2 === 0) {
            const yardNumber = Math.abs(50 - (i * 10));
            ctx.fillStyle = 'rgba(255,255,255,0.8)';
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(yardNumber.toString(), x, hashY1 - 5);
            ctx.fillText(yardNumber.toString(), x, hashY2 + 20);
        }
    }
    
    // Draw line of scrimmage with buffer zones
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(canvasWidth, centerY);
    ctx.stroke();
    
    // Draw neutral zone (offense Y <= -1, defense Y >= +1)
    ctx.strokeStyle = 'rgba(255,255,0,0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(0, centerY - 10); // -1 yard line
    ctx.lineTo(canvasWidth, centerY - 10);
    ctx.moveTo(0, centerY + 10); // +1 yard line
    ctx.lineTo(canvasWidth, centerY + 10);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Draw drop zones
    fieldLocations.forEach(section => {
        section.Locations.forEach(location => {
            if (location.X !== undefined && location.Y !== undefined) {
                const x = ((location.X + 25) / 50) * canvasWidth;
                const y = centerY - (location.Y * 10);
                
                if (x >= 0 && x <= canvasWidth && y >= 0 && y <= canvasHeight) {
                    ctx.fillStyle = 'rgba(255,255,255,0.1)';
                    ctx.beginPath();
                    ctx.arc(x, y, 25, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                }
            }
        });
    });
    
    // Clear and render player overlays
    overlays.innerHTML = '';
    
    // Draw player markers as HTML overlays
    Object.keys(playerPositions).forEach(playerId => {
        const pos = playerPositions[playerId];
        const [side] = playerId.split('-');
        const player = getPlayerById(playerId);
        
        if (player && pos) {
            const effectivePercentile = calculateEffectivePercentile(player);
            const positionColor = getPositionColor(player.position);
            const isOffsides = pos.isOffsides;
            
            const marker = document.createElement('div');
            marker.className = 'player-marker';
            // Reduced size: 60% smaller vertically (100px -> 40px), 30% smaller horizontally (80px -> 56px)
            marker.style.cssText = `
                position: absolute;
                left: ${pos.x - 28}px;
                top: ${pos.y - 20}px;
                width: 56px;
                height: 40px;
                pointer-events: auto;
                cursor: move;
                ${isOffsides ? 'border: 2px solid yellow; box-shadow: 0 0 8px yellow;' : 'border: 1.5px solid ' + (side === 'offense' ? '#4CAF50' : '#f44336') + ';'}
                border-radius: 6px;
                background: rgba(255,255,255,0.95);
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 2px;
                box-shadow: 0 1px 4px rgba(0,0,0,0.3);
            `;
            
            // Player name (truncated) - smaller font
            const nameDiv = document.createElement('div');
            nameDiv.style.cssText = 'font-size: 6px; font-weight: bold; text-align: center; margin-bottom: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%; line-height: 1.1;';
            nameDiv.textContent = player.name.split(' ').pop(); // Last name only
            marker.appendChild(nameDiv);
            
            // Position circle with color coding - smaller
            const positionCircle = document.createElement('div');
            positionCircle.style.cssText = `
                width: 18px;
                height: 18px;
                border-radius: 50%;
                background: ${positionColor};
                color: white;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
                font-size: 7px;
                margin-bottom: 1px;
                border: 1px solid white;
                line-height: 1;
            `;
            positionCircle.textContent = player.position;
            marker.appendChild(positionCircle);
            
            // Overall rating - smaller font
            const ratingDiv = document.createElement('div');
            ratingDiv.style.cssText = 'font-size: 8px; font-weight: bold; color: #333; margin-bottom: 1px; line-height: 1;';
            ratingDiv.textContent = effectivePercentile.toFixed(0);
            marker.appendChild(ratingDiv);
            
            // Stamina bar - 80% smaller (6px -> 1.2px, but min 2px for visibility)
            const staminaContainer = document.createElement('div');
            staminaContainer.style.cssText = 'width: 50px; height: 2px; background: #ddd; border-radius: 1px; overflow: hidden;';
            const staminaFill = document.createElement('div');
            const staminaPercent = player.stamina || 100;
            const staminaColor = staminaPercent > 70 ? '#4CAF50' : staminaPercent > 40 ? '#FFA500' : '#f44336';
            staminaFill.style.cssText = `width: ${staminaPercent}%; height: 100%; background: ${staminaColor}; transition: width 0.3s;`;
            staminaContainer.appendChild(staminaFill);
            marker.appendChild(staminaContainer);
            
            overlays.appendChild(marker);
            
            // Add mouseover to show location name - positioned relative to marker
            marker.addEventListener('mouseenter', (e) => {
                // Remove any existing tooltip
                const existing = document.getElementById('location-tooltip');
                if (existing) existing.remove();
                
                const tooltip = document.createElement('div');
                tooltip.id = 'location-tooltip';
                tooltip.style.cssText = `
                    position: absolute;
                    background: rgba(0, 0, 0, 0.9);
                    color: white;
                    padding: 4px 8px;
                    border-radius: 3px;
                    font-size: 11px;
                    pointer-events: none;
                    z-index: 10001;
                    box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                    white-space: nowrap;
                `;
                tooltip.textContent = pos.location || 'No location';
                marker.appendChild(tooltip);
                
                // Position tooltip above marker
                tooltip.style.left = '50%';
                tooltip.style.transform = 'translateX(-50%)';
                tooltip.style.bottom = '100%';
                tooltip.style.marginBottom = '4px';
            });
            
            marker.addEventListener('mouseleave', () => {
                const tooltip = document.getElementById('location-tooltip');
                if (tooltip) tooltip.remove();
            });
            
            // Make draggable
            marker.addEventListener('mousedown', (e) => {
                const startX = e.clientX - pos.x;
                const startY = e.clientY - pos.y;
                
                const onMouseMove = (e) => {
                    const newX = e.clientX - startX;
                    const newY = e.clientY - startY;
                    marker.style.left = (newX - 40) + 'px';
                    marker.style.top = (newY - 50) + 'px';
                };
                
                const onMouseUp = (e) => {
                    const containerRect = container.getBoundingClientRect();
                    const x = e.clientX - containerRect.left;
                    const y = e.clientY - containerRect.top;
                    const location = findNearestLocation(x, y, canvasWidth, canvasHeight);
                    
                    if (location) {
                        const [side] = playerId.split('-');
                        const isOffsides = (side === 'offense' && location.originalY > -1) || 
                                          (side === 'defense' && location.originalY < 1);
                        const wrongSide = (side === 'offense' && !location.isOffensive && location.isDefensive) ||
                                         (side === 'defense' && !location.isDefensive && location.isOffensive);
                        
                        playerPositions[playerId] = {
                            x: location.x,
                            y: location.y,
                            location: location.name,
                            section: location.section,
                            isOffsides: isOffsides || wrongSide
                        };
                        renderField();
                        renderPlayerMarkers();
                    }
                    
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                };
                
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });
        }
    });
}

function getPositionColor(position) {
    const colors = {
        'QB': '#2196F3',
        'RB': '#4CAF50',
        'WR': '#FF9800',
        'TE': '#9C27B0',
        'OT': '#795548',
        'OG': '#795548',
        'C': '#795548',
        'DE': '#f44336',
        'DT': '#f44336',
        'LB': '#E91E63',
        'MLB': '#E91E63',
        'CB': '#00BCD4',
        'S': '#009688'
    };
    return colors[position] || '#757575';
}

function renderAssignmentArrows() {
    const canvas = document.getElementById('fieldCanvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const container = document.getElementById('fieldContainer');
    const canvasWidth = container.offsetWidth;
    const canvasHeight = container.offsetHeight;
    const centerY = canvasHeight / 2;
    
    // Draw arrows for offensive assignments
    selectedPlayers.forEach(playerId => {
        const player = getPlayerById(playerId);
        if (!player) return;
        
        const pos = playerPositions[playerId];
        if (!pos) return;
        
        const assignment = assignments.offense[player.name];
        if (!assignment || !assignment.action) return;
        
        drawAssignmentArrow(ctx, pos.x, pos.y, assignment.action, player.position, true, canvasWidth, centerY);
    });
    
    // Draw arrows for defensive assignments
    selectedDefense.forEach(playerId => {
        const player = getPlayerById(playerId);
        if (!player) return;
        
        const pos = playerPositions[playerId];
        if (!pos) return;
        
        const assignment = assignments.defense[player.name];
        if (!assignment || !assignment.action) return;
        
        drawAssignmentArrow(ctx, pos.x, pos.y, assignment.action, player.position, false, canvasWidth, centerY);
    });
}

function drawAssignmentArrow(ctx, x, y, action, position, isOffense, canvasWidth, centerY) {
    ctx.save();
    
    // Determine arrow color based on assignment type
    let arrowColor = '#FFD700'; // Default gold
    if (action.includes('Block') || action.includes('Protect')) {
        arrowColor = '#4CAF50'; // Green for blocking
    } else if (action.includes('Route') || action.includes('Cover')) {
        arrowColor = '#2196F3'; // Blue for routes/coverage
    } else if (action.includes('Blitz') || action.includes('Rush')) {
        arrowColor = '#f44336'; // Red for blitz/rush
    } else if (action.includes('Run')) {
        arrowColor = '#FF9800'; // Orange for runs
    }
    
    ctx.strokeStyle = arrowColor;
    ctx.fillStyle = arrowColor;
    ctx.lineWidth = 2;
    
    // Determine arrow direction based on action
    let dx = 0, dy = 0;
    const arrowLength = 30;
    
    if (action.includes('left') || action.includes('Left')) {
        dx = -arrowLength;
    } else if (action.includes('right') || action.includes('Right')) {
        dx = arrowLength;
    }
    
    if (action.includes('deep') || action.includes('Deep') || action.includes('Go') || action.includes('Fade') || action.includes('Post')) {
        dy = isOffense ? -arrowLength : arrowLength;
    } else if (action.includes('flat') || action.includes('Flat') || action.includes('Screen')) {
        dy = isOffense ? arrowLength : -arrowLength;
    } else if (action.includes('gap')) {
        // Gap assignments - point toward gap
        if (action.includes('A gap')) {
            dy = isOffense ? -arrowLength * 0.5 : arrowLength * 0.5;
        } else if (action.includes('B gap') || action.includes('C gap')) {
            dy = isOffense ? -arrowLength * 0.3 : arrowLength * 0.3;
        }
    }
    
    // Draw arrow
    const endX = x + dx;
    const endY = y + dy;
    
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    
    // Draw arrowhead
    const angle = Math.atan2(dy, dx);
    const arrowHeadLength = 8;
    const arrowHeadAngle = Math.PI / 6;
    
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(
        endX - arrowHeadLength * Math.cos(angle - arrowHeadAngle),
        endY - arrowHeadLength * Math.sin(angle - arrowHeadAngle)
    );
    ctx.lineTo(
        endX - arrowHeadLength * Math.cos(angle + arrowHeadAngle),
        endY - arrowHeadLength * Math.sin(angle + arrowHeadAngle)
    );
    ctx.closePath();
    ctx.fill();
    
    ctx.restore();
}

// Coaching points
function renderCoachingPoints() {
    const select = document.getElementById('coachingPlayer');
    select.innerHTML = '<option value="">Select a player...</option>';
    
    [...selectedPlayers, ...selectedDefense].forEach(playerId => {
        const player = getPlayerById(playerId);
        if (player) {
            const option = document.createElement('option');
            option.value = playerId;
            option.textContent = `${player.name} (${player.position})`;
            select.appendChild(option);
        }
    });
}

// Execute play
async function executePlay() {
    const coachingPlayerId = document.getElementById('coachingPlayer').value;
    const coachingPoint = document.getElementById('coachingPoint').value;
    
    // Build play data
    const playData = {
        offense: selectedPlayers.map(id => {
            const player = getPlayerById(id);
            return {
                ...player,
                position: playerPositions[id]?.location || 'Unknown',
                assignment: assignments.offense[player.name] || 'None'
            };
        }),
        defense: selectedDefense.map(id => {
            const player = getPlayerById(id);
            return {
                ...player,
                position: playerPositions[id]?.location || 'Unknown',
                assignment: assignments.defense[player.name] || 'None'
            };
        }),
        coachingPoint: coachingPlayerId ? {
            player: getPlayerById(coachingPlayerId),
            point: coachingPoint
        } : null
    };
    
    // Call LLM (placeholder - you'll need to implement actual API call)
    const llmOutput = await callLLM(playData);
    
    // Parse LLM output to get eval format
    const evalData = parseLLMOutput(llmOutput);
    
    // Run state machine
    const result = await runStateMachine(evalData, playData);
    
    // Update game state
    updateGameState(result);
    
    // Update fatigue
    updateFatigue(playData);
    
    // Display results
    document.getElementById('llmOutput').textContent = llmOutput;
    let outcomeText = result.description || result.outcome;
    if (result.turnover) {
        outcomeText += ` TURNOVER (${result.turnoverType})!`;
    }
    document.getElementById('outcomeText').textContent = outcomeText;
    document.getElementById('yardsGained').textContent = `Yards: ${result.yards > 0 ? '+' : ''}${result.yards}`;
    
    // Show results step
    document.getElementById('results').classList.remove('hidden');
    document.getElementById('step5').classList.add('hidden');
}

async function callLLM(playData) {
    // TODO: Implement actual LLM API call using your API key from env file
    // The LLM should analyze the play schematic matchup and return eval-format.json as the last line
    
    // For now, generate and log detailed mock LLM output
    // In production, this would:
    // 1. Build a prompt from playData using the template from context/prompt-pass-schematic-success
    // 2. Call your LLM API with the API key from .env
    // 3. Ensure the response ends with eval-format.json format
    
    const offenseAvgPercentile = playData.offense.reduce((sum, p) => sum + (calculateEffectivePercentile(p) || 50), 0) / playData.offense.length;
    const defenseAvgPercentile = playData.defense.reduce((sum, p) => sum + (calculateEffectivePercentile(p) || 50), 0) / playData.defense.length;
    
    // Analyze player matchups and positions
    const qb = playData.offense.find(p => p.position === 'QB');
    const rb = playData.offense.find(p => p.position === 'RB');
    const oline = playData.offense.filter(p => ['OT', 'OG', 'C'].includes(p.position));
    const receivers = playData.offense.filter(p => ['WR', 'TE'].includes(p.position));
    
    const dline = playData.defense.filter(p => ['DE', 'DT'].includes(p.position));
    const linebackers = playData.defense.filter(p => p.position === 'LB' || p.position === 'MLB');
    const secondary = playData.defense.filter(p => ['CB', 'S'].includes(p.position));
    
    // Calculate schematic advantages
    const advantage = offenseAvgPercentile - defenseAvgPercentile;
    const olineAvg = oline.reduce((sum, p) => sum + calculateEffectivePercentile(p), 0) / oline.length;
    const dlineAvg = dline.reduce((sum, p) => sum + calculateEffectivePercentile(p), 0) / dline.length;
    const passRushAdvantage = dlineAvg - olineAvg;
    
    // Calculate rates based on matchups
    let successRate = 45.0;
    let havocRate = 11.0;
    let explosiveRate = 13.0;
    
    // Adjust based on overall advantage
    successRate = Math.max(30, Math.min(60, 45 + advantage * 0.2));
    havocRate = Math.max(5, Math.min(20, 11 - advantage * 0.1 + passRushAdvantage * 0.15));
    explosiveRate = Math.max(8, Math.min(20, 13 + advantage * 0.15));
    
    // Build detailed LLM output
    const llmOutput = `You are part of a "play success" engine for an NFL game. Reason about schematic advantages at the point of attack and the second level based on the information provided (Considering overloads, player mismatches, stamina, man vs zone, gap schemes vs zone schemes, gap control, RB aimpoint, and the specific key blocks and conflict defenders in the play). All lefts and rights are from the offenses perspective.

Return a quantified evaluation of the offensive vs defensive scheme (play success rate, explosive rate, havoc rate) that will be used to generate a randomized outcome table.

${gameState.down}${getDownSuffix(gameState.down)} and ${gameState.distance}: Q${gameState.quarter} ${gameState.time}. Score differential ${gameState.score.home - gameState.score.away} (for offense)

Formation: ${getFormationDescription(playData.offense)} vs ${getDefenseFormation(playData.defense)}

Point of attack analysis:
${generatePointOfAttackAnalysis(playData)}

Backfield:
${qb ? `${qb.position}: ${calculateEffectivePercentile(qb).toFixed(0)}th percentile${qb.stamina ? `, ${qb.stamina}% stamina` : ''}: ${playData.coachingPoint && playData.coachingPoint.player.name === qb.name ? `Coaching point: "${playData.coachingPoint.point}"` : 'Standard dropback'}` : 'No QB'}
${rb ? `${rb.position}: ${calculateEffectivePercentile(rb).toFixed(0)}th percentile${rb.stamina ? `, ${rb.stamina}% stamina` : ''}: ${assignments.offense[rb.name] || 'Standard assignment'}` : ''}

Second level summary:
${generateSecondLevelAnalysis(playData)}

Schematic Analysis:
${generateSchematicAnalysis(playData, advantage, passRushAdvantage)}

Key Matchups:
${generateKeyMatchups(playData)}

${playData.coachingPoint ? `Coaching Point Applied: ${playData.coachingPoint.player.name} (${playData.coachingPoint.player.position}) - "${playData.coachingPoint.point}"` : ''}

${JSON.stringify({
    "success-rate": parseFloat(successRate.toFixed(1)),
    "conversion-rate-1st-2nd-down-only": parseFloat((successRate * 0.7).toFixed(1)),
    "havoc-rate": parseFloat(havocRate.toFixed(1)),
    "explosive-rate": parseFloat(explosiveRate.toFixed(1))
})}`;

    // Log the intended LLM output
    console.log('=== INTENDED LLM OUTPUT ===');
    console.log(llmOutput);
    console.log('=== END LLM OUTPUT ===');
    
    return llmOutput;
}

function getDownSuffix(down) {
    if (down === 1) return 'st';
    if (down === 2) return 'nd';
    if (down === 3) return 'rd';
    return 'th';
}

function getFormationDescription(offense) {
    const rbCount = offense.filter(p => p.position === 'RB').length;
    const teCount = offense.filter(p => p.position === 'TE').length;
    const wrCount = offense.filter(p => p.position === 'WR').length;
    return `${rbCount + teCount + wrCount} personnel ${wrCount}x${wrCount} formation`;
}

function getDefenseFormation(defense) {
    const dlineCount = defense.filter(p => ['DE', 'DT'].includes(p.position)).length;
    if (dlineCount === 3) return '3 down linemen';
    if (dlineCount === 4) return '4 down linemen';
    return `${dlineCount} down linemen`;
}

function generatePointOfAttackAnalysis(playData) {
    const oline = playData.offense.filter(p => ['OT', 'OG', 'C'].includes(p.position));
    const dline = playData.defense.filter(p => ['DE', 'DT'].includes(p.position));
    
    let analysis = '(from offenses left to right)\n';
    oline.forEach((ol, i) => {
        const dl = dline[i] || dline[0];
        const olPercentile = calculateEffectivePercentile(ol);
        const dlPercentile = dl ? calculateEffectivePercentile(dl) : 50;
        const stamina = ol.stamina ? `, ${ol.stamina}% stamina` : '';
        const assignment = assignments.offense[ol.name] || 'Standard block';
        analysis += `${ol.position}: ${olPercentile.toFixed(0)}th percentile${stamina}: ${assignment}\n`;
        if (dl) {
            analysis += `${dl.position} (${dl.position}): ${dlPercentile.toFixed(0)}th percentile: ${assignments.defense[dl.name] || 'Standard rush'}\n`;
        }
    });
    return analysis;
}

function generateSecondLevelAnalysis(playData) {
    const receivers = playData.offense.filter(p => ['WR', 'TE'].includes(p.position));
    const secondary = playData.defense.filter(p => ['CB', 'S'].includes(p.position));
    const linebackers = playData.defense.filter(p => p.position === 'LB' || p.position === 'MLB');
    
    let analysis = '(from offenses right to left)\n';
    receivers.forEach((rec, i) => {
        const def = secondary[i] || linebackers[i] || secondary[0];
        const recPercentile = calculateEffectivePercentile(rec);
        const defPercentile = def ? calculateEffectivePercentile(def) : 50;
        const stamina = rec.stamina ? `, ${rec.stamina}% stamina` : '';
        const assignment = assignments.offense[rec.name] || 'Route';
        analysis += `${rec.position}: ${recPercentile.toFixed(0)}th percentile${stamina}: ${assignment}\n`;
        if (def) {
            analysis += `${def.position}: ${defPercentile.toFixed(0)}th percentile: ${assignments.defense[def.name] || 'Coverage'}\n`;
        }
    });
    return analysis;
}

function generateSchematicAnalysis(playData, advantage, passRushAdvantage) {
    let analysis = '';
    
    if (advantage > 5) {
        analysis += 'The offense has a significant schematic advantage. Superior player quality across multiple positions creates favorable matchups.\n';
    } else if (advantage > 0) {
        analysis += 'The offense has a slight advantage in this matchup. Key personnel edges may create opportunities.\n';
    } else if (advantage < -5) {
        analysis += 'The defense has a significant schematic advantage. Superior talent and positioning will challenge the offense.\n';
    } else {
        analysis += 'The defense has a slight advantage. Defensive personnel quality may limit offensive success.\n';
    }
    
    if (passRushAdvantage > 10) {
        analysis += 'Strong pass rush advantage favors the defense. Pressure is likely to disrupt timing and create havoc plays.\n';
    } else if (passRushAdvantage < -10) {
        analysis += 'Offensive line advantage should provide clean pocket. Quarterback will have time to progress through reads.\n';
    }
    
    return analysis;
}

function generateKeyMatchups(playData) {
    const keyMatchups = [];
    
    // QB vs Pass Rush
    const qb = playData.offense.find(p => p.position === 'QB');
    const dline = playData.defense.filter(p => ['DE', 'DT'].includes(p.position));
    if (qb && dline.length > 0) {
        const bestRusher = dline.reduce((best, current) => 
            calculateEffectivePercentile(current) > calculateEffectivePercentile(best) ? current : best
        );
        keyMatchups.push(`QB protection vs ${bestRusher.position} pass rush`);
    }
    
    // Best WR vs Best CB
    const receivers = playData.offense.filter(p => p.position === 'WR');
    const corners = playData.defense.filter(p => p.position === 'CB');
    if (receivers.length > 0 && corners.length > 0) {
        const bestWR = receivers.reduce((best, current) => 
            calculateEffectivePercentile(current) > calculateEffectivePercentile(best) ? current : best
        );
        const bestCB = corners.reduce((best, current) => 
            calculateEffectivePercentile(current) > calculateEffectivePercentile(best) ? current : best
        );
        keyMatchups.push(`${bestWR.name} vs ${bestCB.name}`);
    }
    
    return keyMatchups.map(m => `- ${m}`).join('\n');
}

function parseLLMOutput(output) {
    // Extract JSON from last line
    const lines = output.split('\n');
    const lastLine = lines[lines.length - 1].trim();
    
    try {
        return JSON.parse(lastLine);
    } catch (error) {
        console.error('Error parsing LLM output:', error);
        // Return default values
        return {
            "success-rate": 45.0,
            "conversion-rate-1st-2nd-down-only": 31.0,
            "havoc-rate": 11.0,
            "explosive-rate": 13.0
        };
    }
}

async function runStateMachine(evalData, playData) {
    // Step 1: Roll 1-100 to determine basic play outcome (using LLM rates)
    const successRate = evalData['success-rate'] || 45.0;
    const havocRate = evalData['havoc-rate'] || 11.0;
    const explosiveRate = evalData['explosive-rate'] || 13.0;
    const unsuccessfulRate = 100 - successRate - havocRate - explosiveRate;
    
    // Build cumulative probability ranges
    const ranges = {
        havoc: havocRate,
        explosive: havocRate + explosiveRate,
        success: havocRate + explosiveRate + successRate,
        unsuccessful: 100
    };
    
    // Roll 1-100 for outcome type
    const outcomeRoll = Math.floor(Math.random() * 100) + 1;
    let outcomeType = 'unsuccessful';
    let outcomeFile = null;
    
    if (outcomeRoll <= ranges.havoc) {
        outcomeType = 'havoc';
        // Roll 1-100 for specific havoc outcome
        const havocOutcomeRoll = Math.floor(Math.random() * 100) + 1;
        const havocOutcomes = stateMachine['havoc-outcomes'] || {};
        if (havocOutcomeRoll <= havocOutcomes.sack) {
            outcomeFile = await loadOutcomeFile('outcomes/havoc-sack.json');
        } else if (havocOutcomeRoll <= havocOutcomes.sack + havocOutcomes.turnover) {
            outcomeFile = await loadOutcomeFile('outcomes/havoc-turnover.json');
        } else if (havocOutcomeRoll <= havocOutcomes.sack + havocOutcomes.turnover + havocOutcomes['tackle-for-loss']) {
            outcomeFile = await loadOutcomeFile('outcomes/havoc-tackle-for-loss.json');
        } else {
            outcomeFile = await loadOutcomeFile('outcomes/havoc-run.json');
        }
    } else if (outcomeRoll <= ranges.explosive) {
        outcomeType = 'explosive';
        // Roll 1-100 for YAC check (40% tackle chance)
        const yacRoll = Math.floor(Math.random() * 100) + 1;
        if (yacRoll <= 40) {
            // Tackled, use explosive outcome
            outcomeFile = await loadOutcomeFile('outcomes/explosive-run.json');
        } else {
            // YAC - roll again for YAC yards
            outcomeFile = await loadOutcomeFile('outcomes/yac-catch.json');
        }
    } else if (outcomeRoll <= ranges.success) {
        outcomeType = 'success';
        // Roll 1-100 for YAC check (60% tackle chance)
        const yacRoll = Math.floor(Math.random() * 100) + 1;
        if (yacRoll <= 60) {
            // Tackled, use success outcome
            outcomeFile = await loadOutcomeFile('outcomes/successful-run.json');
        } else {
            // YAC - roll again for YAC yards
            outcomeFile = await loadOutcomeFile('outcomes/yac-catch.json');
        }
    } else {
        outcomeType = 'unsuccessful';
        outcomeFile = await loadOutcomeFile('outcomes/unsuccessful-run.json');
    }
    
    if (!outcomeFile) {
        console.error('Failed to load outcome file');
        return { outcome: 'error', yards: 0, evalData };
    }
    
    // Step 2: Roll 1-100 and calculate yards using statistical methods from outcome file
    const yardsRoll = Math.floor(Math.random() * 100) + 1;
    const yards = calculateYardsFromRoll(yardsRoll, outcomeFile);
    
    // Step 3: Check for turnover
    const turnoverRoll = Math.floor(Math.random() * 100) + 1;
    const turnover = turnoverRoll <= (outcomeFile['turnover-probability'] || 0);
    
    return { 
        outcome: outcomeFile.outcome, 
        outcomeType,
        yards, 
        turnover,
        turnoverType: outcomeFile['turnover-type'],
        description: outcomeFile.description.replace('{yards}', yards).replace('{yards-after-catch}', yards),
        evalData 
    };
}

async function loadOutcomeFile(path) {
    if (outcomeFiles[path]) {
        return outcomeFiles[path];
    }
    
    try {
        const response = await fetch(path);
        const data = await response.json();
        outcomeFiles[path] = data;
        return data;
    } catch (error) {
        console.error(`Error loading outcome file ${path}:`, error);
        return null;
    }
}

function calculateYardsFromRoll(roll, outcomeFile) {
    // Use statistical properties to calculate yards from 1-100 roll
    const mean = outcomeFile['average-yards-gained'] || 0;
    const stdDev = outcomeFile['standard-deviation'] || 1;
    const skewness = outcomeFile['skewness'] || 0;
    
    // Convert roll (1-100) to percentile (0-1)
    const percentile = (roll - 1) / 99;
    
    // Use inverse normal distribution (Box-Muller transform for normal, adjust for skewness)
    let z = 0;
    if (skewness === 0) {
        // Normal distribution
        // Convert percentile to z-score using inverse CDF approximation
        z = inverseNormalCDF(percentile);
    } else {
        // Skewed normal distribution
        // Simplified skew normal approximation
        z = inverseNormalCDF(percentile);
        const skewAdjustment = skewness * (z * z - 1) / 6;
        z = z + skewAdjustment;
    }
    
    // Convert z-score to yards
    let yards = mean + (z * stdDev);
    
    // Round to nearest integer
    return Math.round(yards);
}

function inverseNormalCDF(p) {
    // Approximation of inverse cumulative distribution function for standard normal
    // Using Winitzki's approximation
    if (p <= 0 || p >= 1) {
        return p <= 0 ? -10 : 10;
    }
    
    const a = 8 * (Math.PI - 3) / (3 * Math.PI * (4 - Math.PI));
    const sign = p < 0.5 ? -1 : 1;
    const pAdjusted = p < 0.5 ? p : 1 - p;
    
    const ln = Math.log(1 / (pAdjusted * pAdjusted));
    const sqrt = Math.sqrt(ln);
    
    return sign * Math.sqrt(-2 * Math.log(pAdjusted)) * 
           (sqrt - (a * sqrt + 1) / (a * sqrt + 2));
}

function updateGameState(result) {
    gameState.down += 1;
    gameState["opp-yardline"] -= result.yards;
    
    if (gameState["opp-yardline"] < 0) {
        gameState["opp-yardline"] = 0;
        // Touchdown logic would go here
    }
    
    if (result.yards >= gameState.distance) {
        gameState.down = 1;
        gameState.distance = 10;
    } else {
        gameState.distance -= result.yards;
    }
    
    if (gameState.down > 4) {
        gameState.down = 1;
        gameState.distance = 10;
        // Turnover logic
    }
    
    updateGameStateDisplay();
    saveGameState();
}

function updateFatigue(playData) {
    // Get all players who were on the field
    const playersOnField = new Set();
    [...playData.offense, ...playData.defense].forEach(player => {
        playersOnField.add(player.name);
    });
    
    // Update stamina for all players in rosters
    [...rosters.offense, ...rosters.defense].forEach(player => {
        if (player.stamina !== undefined) {
            if (playersOnField.has(player.name)) {
                // Player was on field: reduce stamina by 1-2%
                const reduction = Math.floor(Math.random() * 2) + 1;
                player.stamina = Math.max(0, player.stamina - reduction);
            } else {
                // Player was not on field: increase stamina by 3-5%
                const recovery = Math.floor(Math.random() * 3) + 3;
                player.stamina = Math.min(100, player.stamina + recovery);
            }
        }
    });
    
    // Save updated rosters
    saveRosters();
}

function calculateEffectivePercentile(player) {
    if (!player.stamina || !player.percentile) return player.percentile || 50;
    
    // Logarithmic fatigue curve: 85% stamina = 99% effective, drops off after that
    // Using logarithmic interpolation
    let multiplier = 1.0;
    
    if (player.stamina >= 85) {
        multiplier = 0.99;
    } else if (player.stamina >= 60) {
        // Linear interpolation between 85 (0.99) and 60 (0.80)
        multiplier = 0.99 - ((85 - player.stamina) / 25) * 0.19;
    } else {
        // Logarithmic drop-off below 60
        // Using log base 10: multiplier = a * log(stamina) + b
        // At 60: 0.80, at 0: 0.00
        const a = 0.80 / Math.log10(60);
        multiplier = a * Math.log10(Math.max(player.stamina, 1));
    }
    
    return player.percentile * multiplier;
}

function updateGameStateDisplay() {
    const downNames = ['', '1st', '2nd', '3rd', '4th'];
    document.getElementById('down').textContent = downNames[gameState.down] || '1st';
    document.getElementById('distance').textContent = gameState.distance;
    document.getElementById('yardline').textContent = gameState["opp-yardline"];
    document.getElementById('score').textContent = `${gameState.score.home} - ${gameState.score.away}`;
    document.getElementById('time').textContent = gameState.time;
}

function getPlayerById(playerId) {
    const [side, index] = playerId.split('-');
    return rosters[side][parseInt(index)];
}

function resetPlay() {
    // Keep last selected players for next play
    lastSelectedPlayers = [...selectedPlayers];
    lastSelectedDefense = [...selectedDefense];
    selectedPlayers = [];
    selectedDefense = [];
    playerPositions = {};
    assignments = { offense: {}, defense: {} };
    renderStep(1);
    renderPersonnelSelection();
    document.getElementById('results').classList.add('hidden');
}

async function saveGameState() {
    // In a real app, you'd POST to a server
    console.log('Game state updated:', gameState);
}

async function saveRosters() {
    // In a real app, you'd POST to a server
    console.log('Rosters updated');
}

// Step indicator click handlers
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.step').forEach(step => {
        step.addEventListener('click', (e) => {
            const stepNum = parseInt(e.target.dataset.step);
            if (stepNum <= currentStep || stepNum === currentStep + 1) {
                renderStep(stepNum);
            }
        });
    });
});

// Initialize on load
init();

