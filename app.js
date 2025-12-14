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
        consecutiveUnsuccessfulPlays: 0,
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
        console.log('Defensive roster sample:', rosters.defense.slice(0, 3));
        
        // Render after a short delay to ensure DOM is ready
        setTimeout(() => {
            if (rosters.defense && rosters.defense.length > 0) {
                renderPersonnelSelection();
                updatePersonnelDisplay();
            } else {
                console.error('Defensive roster is empty after loading!');
                alert('Warning: Defensive roster is empty. Please check rosters/defense.json');
            }
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
        // Smart default: 11 Personnel (1 QB, 1 RB, 1 TE, 3 WR, 5 OL)
        selectedPlayers = [];
        
        // 1 QB
        const qbIndex = rosters.offense.findIndex(p => p.position === 'QB');
        if (qbIndex >= 0) selectedPlayers.push(`offense-${qbIndex}`);
        
        // 1 RB
        const rbIndex = rosters.offense.findIndex(p => p.position === 'RB');
        if (rbIndex >= 0) selectedPlayers.push(`offense-${rbIndex}`);
        
        // 1 TE
        const teIndex = rosters.offense.findIndex(p => p.position === 'TE');
        if (teIndex >= 0) selectedPlayers.push(`offense-${teIndex}`);
        
        // 3 WRs
        const wrIndices = rosters.offense
            .map((p, i) => ({ player: p, index: i }))
            .filter(item => item.player.position === 'WR')
            .slice(0, 3);
        wrIndices.forEach(item => selectedPlayers.push(`offense-${item.index}`));
        
        // 5 OL - ensure Center is included first, then 2 Guards, 2 Tackles
        const centerIndex = rosters.offense.findIndex(p => p.position === 'C');
        if (centerIndex >= 0) selectedPlayers.push(`offense-${centerIndex}`);
        
        const guards = rosters.offense
            .map((p, i) => ({ player: p, index: i }))
            .filter(item => item.player.position === 'OG')
            .slice(0, 2);
        guards.forEach(item => selectedPlayers.push(`offense-${item.index}`));
        
        const tackles = rosters.offense
            .map((p, i) => ({ player: p, index: i }))
            .filter(item => item.player.position === 'OT')
            .slice(0, 2);
        tackles.forEach(item => selectedPlayers.push(`offense-${item.index}`));
    }
    
    // Default to last 11 defensive players, or smart defaults if none
    if (selectedDefense.length === 0 && lastSelectedDefense.length > 0) {
        selectedDefense = [...lastSelectedDefense];
    } else if (selectedDefense.length === 0) {
        // Smart default: Nickel (2 DE, 2 DT, 2 LB, 3 CB, 2 S)
        selectedDefense = [];
        
        // Ensure exactly 2 DE, then 2 DT, 2 LB, 3 CB, 2 S
        rosters.defense.forEach((p, i) => {
            const playerId = `defense-${i}`;
            const position = p.position;
            
            // Count how many of each position we've already selected
            const selectedCounts = {
                DE: selectedDefense.filter(id => {
                    const idx = parseInt(id.split('-')[1]);
                    return rosters.defense[idx]?.position === 'DE';
                }).length,
                DT: selectedDefense.filter(id => {
                    const idx = parseInt(id.split('-')[1]);
                    return rosters.defense[idx]?.position === 'DT';
                }).length,
                LB: selectedDefense.filter(id => {
                    const idx = parseInt(id.split('-')[1]);
                    return ['LB', 'MLB'].includes(rosters.defense[idx]?.position);
                }).length,
                CB: selectedDefense.filter(id => {
                    const idx = parseInt(id.split('-')[1]);
                    return rosters.defense[idx]?.position === 'CB';
                }).length,
                S: selectedDefense.filter(id => {
                    const idx = parseInt(id.split('-')[1]);
                    return rosters.defense[idx]?.position === 'S';
                }).length
            };
            
            // Add player if we need more of their position
            if (position === 'DE' && selectedCounts.DE < 2) {
                selectedDefense.push(playerId);
            } else if (position === 'DT' && selectedCounts.DT < 2) {
                selectedDefense.push(playerId);
            } else if (['LB', 'MLB'].includes(position) && selectedCounts.LB < 2) {
                selectedDefense.push(playerId);
            } else if (position === 'CB' && selectedCounts.CB < 3) {
                selectedDefense.push(playerId);
            } else if (position === 'S' && selectedCounts.S < 2) {
                selectedDefense.push(playerId);
            }
        });
    }
    
    // Render offensive roster
    rosters.offense.forEach((player, index) => {
        const card = createPlayerCard(player, 'offense', index);
        offenseList.appendChild(card);
    });
    
    // Render defensive roster
    if (rosters.defense && rosters.defense.length > 0) {
        rosters.defense.forEach((player, index) => {
            const card = createPlayerCard(player, 'defense', index);
            defenseList.appendChild(card);
        });
    } else {
        console.error('Defensive roster is empty when rendering!');
        defenseList.innerHTML = '<p style="color: red;">Error: Defensive roster not loaded. Please refresh the page.</p>';
    }
    
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
    const canvasWidth = container.offsetWidth;
    const canvasHeight = container.offsetHeight;
    canvas.width = canvasWidth * dpr;
    canvas.height = canvasHeight * dpr;
    canvas.style.width = canvasWidth + 'px';
    canvas.style.height = canvasHeight + 'px';
    ctx.scale(dpr, dpr);
    
    // Draw field
    ctx.fillStyle = '#2d5016';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    
    // NO YARD LINES - removed entirely
    
    const centerY = canvasHeight / 2;
    
    // Draw hash marks (vertical lines along the length of the field)
    // Hash marks at standard NFL positions (70 feet 9 inches from each sideline)
    for (let i = 0; i <= 20; i++) {
        const y = (i / 20) * canvasHeight;
        // Left hash marks (at ~15% and ~35% of field width)
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillRect(canvasWidth * 0.15 - 1, y, 2, 8);
        ctx.fillRect(canvasWidth * 0.35 - 1, y, 2, 8);
        // Right hash marks (at ~65% and ~85% of field width)
        ctx.fillRect(canvasWidth * 0.65 - 1, y, 2, 8);
        ctx.fillRect(canvasWidth * 0.85 - 1, y, 2, 8);
    }
    
    // NO FIELD NUMBERS - removed entirely
    
    // Draw line of scrimmage
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(canvasWidth, centerY);
    ctx.stroke();
    
    // Draw drop zones for field locations
    
    fieldLocations.forEach(section => {
        section.Locations.forEach(location => {
            if (location.X !== undefined && location.Y !== undefined) {
                const x = ((location.X + 25) / 50) * canvasWidth; // Normalize -25 to +25 to 0 to width
                // Consistent Y coordinate scaling
                const y = centerY - (location.Y * 15);
                
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

// Playcall definitions
const offensivePlaycalls = {
    'IZR left': {
        'QB': { category: 'Run', action: 'Handoff' },
        'RB': { category: 'Run', action: 'IZR' },
        'OT': { category: 'Run Block', action: 'Zone inside left' },
        'OG': { category: 'Run Block', action: 'Zone inside left' },
        'C': { category: 'Run Block', action: 'Zone inside left' },
        'WR': { category: 'Block', action: 'Block' },
        'TE': { category: 'Block', action: 'Block' }
    },
    'IZR right': {
        'QB': { category: 'Run', action: 'Handoff' },
        'RB': { category: 'Run', action: 'IZR' },
        'OT': { category: 'Run Block', action: 'Zone inside right' },
        'OG': { category: 'Run Block', action: 'Zone inside right' },
        'C': { category: 'Run Block', action: 'Zone inside right' },
        'WR': { category: 'Block', action: 'Block' },
        'TE': { category: 'Block', action: 'Block' }
    },
    'OZR left': {
        'QB': { category: 'Run', action: 'Handoff' },
        'RB': { category: 'Run', action: 'OZR' },
        'OT': { category: 'Run Block', action: 'Zone outside left' },
        'OG': { category: 'Run Block', action: 'Zone outside left' },
        'C': { category: 'Run Block', action: 'Zone outside left' },
        'WR': { category: 'Block', action: 'Block' },
        'TE': { category: 'Block', action: 'Block' }
    },
    'OZR right': {
        'QB': { category: 'Run', action: 'Handoff' },
        'RB': { category: 'Run', action: 'OZR' },
        'OT': { category: 'Run Block', action: 'Zone outside right' },
        'OG': { category: 'Run Block', action: 'Zone outside right' },
        'C': { category: 'Run Block', action: 'Zone outside right' },
        'WR': { category: 'Block', action: 'Block' },
        'TE': { category: 'Block', action: 'Block' }
    },
    'Power left': {
        'QB': { category: 'Run', action: 'Handoff' },
        'RB': { category: 'Run', action: 'Left B gap' },
        'OT': { category: 'Run Block', action: 'Pull' },
        'OG': { category: 'Run Block', action: 'Zone inside left' },
        'C': { category: 'Run Block', action: 'Zone inside left' },
        'WR': { category: 'Block', action: 'Block' },
        'TE': { category: 'Block', action: 'Block' }
    },
    'Power right': {
        'QB': { category: 'Run', action: 'Handoff' },
        'RB': { category: 'Run', action: 'Right B gap' },
        'OT': { category: 'Run Block', action: 'Pull' },
        'OG': { category: 'Run Block', action: 'Zone inside right' },
        'C': { category: 'Run Block', action: 'Zone inside right' },
        'WR': { category: 'Block', action: 'Block' },
        'TE': { category: 'Block', action: 'Block' }
    },
    'Counter left': {
        'QB': { category: 'Run', action: 'Handoff' },
        'RB': { category: 'Run', action: 'Left C gap' },
        'OT': { category: 'Run Block', action: 'Zone inside left' },
        'OG': { category: 'Run Block', action: 'Zone inside left' }, // Only backside guard pulls, frontside stays
        'C': { category: 'Run Block', action: 'Zone inside left' },
        'WR': { category: 'Block', action: 'Block' },
        'TE': { category: 'Block', action: 'Block' }
    },
    'Counter right': {
        'QB': { category: 'Run', action: 'Handoff' },
        'RB': { category: 'Run', action: 'Right C gap' },
        'OT': { category: 'Run Block', action: 'Zone inside right' },
        'OG': { category: 'Run Block', action: 'Zone inside right' }, // Only backside guard pulls, frontside stays
        'C': { category: 'Run Block', action: 'Zone inside right' },
        'WR': { category: 'Block', action: 'Block' },
        'TE': { category: 'Block', action: 'Block' }
    },
    'Duo': {
        'QB': { category: 'Run', action: 'Handoff' },
        'RB': { category: 'Run', action: 'Left A gap' },
        'OT': { category: 'Run Block', action: 'Combo' },
        'OG': { category: 'Run Block', action: 'Combo' },
        'C': { category: 'Run Block', action: 'Zone inside left' },
        'WR': { category: 'Block', action: 'Block' },
        'TE': { category: 'Block', action: 'Block' }
    },
    'Iso': {
        'QB': { category: 'Run', action: 'Handoff' },
        'RB': { category: 'Run', action: 'Left A gap' },
        'OT': { category: 'Run Block', action: 'Zone inside left' },
        'OG': { category: 'Run Block', action: 'Zone inside left' },
        'C': { category: 'Run Block', action: 'Zone inside left' },
        'WR': { category: 'Block', action: 'Block' },
        'TE': { category: 'Block', action: 'Block' }
    },
    'Shallow Cross': {
        'QB': { category: 'Pass', action: '3 step drop' },
        'RB': { category: 'Protect', action: 'Block right' },
        'WR': { category: 'Route', action: 'Slant' },
        'TE': { category: 'Route', action: 'Dig' },
        'OT': { category: 'Pass Block', action: 'Outside priority' },
        'OG': { category: 'Pass Block', action: 'Inside priority' },
        'C': { category: 'Pass Block', action: 'Inside priority' }
    },
    'Dagger': {
        'QB': { category: 'Pass', action: '5 step drop' },
        'RB': { category: 'Protect', action: 'Block left' },
        'WR': { category: 'Route', action: 'Dig' },
        'TE': { category: 'Route', action: 'Post' },
        'OT': { category: 'Pass Block', action: 'Outside priority' },
        'OG': { category: 'Pass Block', action: 'Inside priority' },
        'C': { category: 'Pass Block', action: 'Inside priority' }
    },
    'Flood': {
        'QB': { category: 'Pass', action: '5 step drop' },
        'RB': { category: 'Protect', action: 'Block right' },
        'WR': { category: 'Route', action: 'Corner' },
        'TE': { category: 'Route', action: 'Flat' },
        'OT': { category: 'Pass Block', action: 'Outside priority' },
        'OG': { category: 'Pass Block', action: 'Inside priority' },
        'C': { category: 'Pass Block', action: 'Inside priority' }
    },
    'Levels': {
        'QB': { category: 'Pass', action: '3 step drop' },
        'RB': { category: 'Route', action: 'Checkdown' },
        'WR': { category: 'Route', action: 'Dig' },
        'TE': { category: 'Route', action: 'Curl' },
        'OT': { category: 'Pass Block', action: 'Inside priority' },
        'OG': { category: 'Pass Block', action: 'Inside priority' },
        'C': { category: 'Pass Block', action: 'Inside priority' }
    },
    'Sail': {
        'QB': { category: 'Pass', action: '5 step drop' },
        'RB': { category: 'Route', action: 'Flat' },
        'WR': { category: 'Route', action: 'Corner' },
        'TE': { category: 'Route', action: 'Out' },
        'OT': { category: 'Pass Block', action: 'Outside priority' },
        'OG': { category: 'Pass Block', action: 'Inside priority' },
        'C': { category: 'Pass Block', action: 'Inside priority' }
    },
    'Four Verticals': {
        'QB': { category: 'Pass', action: '7 step drop' },
        'RB': { category: 'Protect', action: 'Block left' },
        'WR': { category: 'Route', action: 'Seam/Go' },
        'TE': { category: 'Route', action: 'Seam/Go' },
        'OT': { category: 'Pass Block', action: 'Outside priority' },
        'OG': { category: 'Pass Block', action: 'Inside priority' },
        'C': { category: 'Pass Block', action: 'Inside priority' }
    },
    'Curl flats': {
        'QB': { category: 'Pass', action: '3 step drop' },
        'RB': { category: 'Route', action: 'Flat' },
        'WR': { category: 'Route', action: 'Curl' },
        'TE': { category: 'Route', action: 'Curl' },
        'OT': { category: 'Pass Block', action: 'Inside priority' },
        'OG': { category: 'Pass Block', action: 'Inside priority' },
        'C': { category: 'Pass Block', action: 'Inside priority' }
    },
    'Mesh': {
        'QB': { category: 'Pass', action: '3 step drop' },
        'RB': { category: 'Route', action: 'Checkdown' },
        'WR': { category: 'Route', action: 'Slant' },
        'TE': { category: 'Route', action: 'Slant' },
        'OT': { category: 'Pass Block', action: 'Inside priority' },
        'OG': { category: 'Pass Block', action: 'Inside priority' },
        'C': { category: 'Pass Block', action: 'Inside priority' }
    },
    'Drive': {
        'QB': { category: 'Pass', action: '3 step drop' },
        'RB': { category: 'Route', action: 'Flat' },
        'WR': { category: 'Route', action: 'Dig' },
        'TE': { category: 'Route', action: 'Dig' },
        'OT': { category: 'Pass Block', action: 'Inside priority' },
        'OG': { category: 'Pass Block', action: 'Inside priority' },
        'C': { category: 'Pass Block', action: 'Inside priority' }
    },
    'Ohio': {
        'QB': { category: 'Pass', action: '5 step drop' },
        'RB': { category: 'Route', action: 'Wheel' },
        'WR': { category: 'Route', action: 'Post' },
        'TE': { category: 'Route', action: 'Corner' },
        'OT': { category: 'Pass Block', action: 'Outside priority' },
        'OG': { category: 'Pass Block', action: 'Inside priority' },
        'C': { category: 'Pass Block', action: 'Inside priority' }
    }
};

const defensivePlaycalls = {
    'Cover 2': {
        'CB': { category: 'Zone Deep', action: 'Deep left (2)' },
        'S': { category: 'Zone Deep', action: 'Deep middle 1/3' },
        'LB': { category: 'Zone', action: 'Hook' },
        'MLB': { category: 'Zone', action: 'Hook' },
        'DE': { category: 'Rush', action: 'Contain' },
        'DT': { category: 'Rush', action: 'Left B gap' }
    },
    'Cover 1 (man)': {
        'CB': { category: 'Man Coverage', action: 'Outside release man' },
        'S': { category: 'Zone Deep', action: 'Deep middle 1/3' },
        'LB': { category: 'Man Coverage', action: 'Inside release man' },
        'MLB': { category: 'Man Coverage', action: 'Inside release man' },
        'DE': { category: 'Rush', action: 'Contain' },
        'DT': { category: 'Rush', action: 'Left B gap' }
    },
    'Cover 1 robber': {
        'CB': { category: 'Man Coverage', action: 'Outside release man' },
        'S': { category: 'Zone Short', action: 'Robber' },
        'LB': { category: 'Man Coverage', action: 'Inside release man' },
        'MLB': { category: 'Man Coverage', action: 'Inside release man' },
        'DE': { category: 'Rush', action: 'Contain' },
        'DT': { category: 'Rush', action: 'Left B gap' }
    },
    'Cover 3': {
        'CB': { category: 'Zone Deep', action: 'Deep left (3)' },
        'S': { category: 'Zone Deep', action: 'Deep middle 1/3' },
        'LB': { category: 'Zone', action: 'Curtain' },
        'MLB': { category: 'Zone', action: 'Curtain' },
        'DE': { category: 'Rush', action: 'Contain' },
        'DT': { category: 'Rush', action: 'Left B gap' }
    },
    'Cover 4 (prevent)': {
        'CB': { category: 'Zone Deep', action: 'Deep far left (4)' },
        'S': { category: 'Zone Deep', action: 'Deep middle 1/3' },
        'LB': { category: 'Zone', action: 'Curtain' },
        'MLB': { category: 'Zone', action: 'Curtain' },
        'DE': { category: 'Rush', action: 'Contain' },
        'DT': { category: 'Rush', action: 'Left B gap' }
    },
    'Cover 4 (match)': {
        'CB': { category: 'Zone Deep', action: 'Deep seam left (4)' },
        'S': { category: 'Zone Deep', action: 'Deep middle 1/3' },
        'LB': { category: 'Zone', action: 'Hook' },
        'MLB': { category: 'Zone', action: 'Hook' },
        'DE': { category: 'Rush', action: 'Contain' },
        'DT': { category: 'Rush', action: 'Left B gap' }
    },
    'Cover 0 (LB blitz)': {
        'CB': { category: 'Man Coverage', action: 'Outside release man' },
        'S': { category: 'Man Coverage', action: 'Inside release man' },
        'LB': { category: 'Blitz', action: 'Left A gap' },
        'MLB': { category: 'Blitz', action: 'Right A gap' },
        'DE': { category: 'Rush', action: 'Contain' },
        'DT': { category: 'Rush', action: 'Left B gap' }
    },
    'Cover 0 (CB blitz)': {
        'CB': { category: 'Blitz', action: 'Left C gap' },
        'S': { category: 'Man Coverage', action: 'Inside release man' },
        'LB': { category: 'Man Coverage', action: 'Inside release man' },
        'MLB': { category: 'Man Coverage', action: 'Inside release man' },
        'DE': { category: 'Rush', action: 'Contain' },
        'DT': { category: 'Rush', action: 'Left B gap' }
    }
};

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
        'Route': ['Slant', 'Dig', 'Out', 'Curl', 'Comeback', 'Corner', 'Post', 'Fade', 'Seam/Go', 'Chip+Delay', 'Flat']
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

// All defensive assignment options available to all positions
const allDefensiveCategories = {
    'Man Coverage': ['Inside release man', 'Outside release man'],
    'Zone Deep': ['Deep middle 1/3', 'Deep left (2)', 'Deep right (2)', 'Deep left (3)', 'Deep right (3)', 'Deep far left (4)', 'Deep far right (4)', 'Deep seam left (4)', 'Deep seam right (4)'],
    'Zone Short': ['Flat', 'Hook', 'Curtain', 'Robber'],
    'Zone': ['Hook', 'Curtain', 'Robber', 'Spy'],
    'Blitz': ['Left A gap', 'Right A gap', 'Left B gap', 'Right B gap', 'Left C gap', 'Right C gap', 'Contain'],
    'Rush': ['Left A gap', 'Right A gap', 'Left B gap', 'Right B gap', 'Left C gap', 'Right C gap', 'Contain'],
    'Spy': ['Spy']
};

// All defensive positions get all options
const defensiveAssignments = {
    'CB': allDefensiveCategories,
    'S': allDefensiveCategories,
    'LB': allDefensiveCategories,
    'MLB': allDefensiveCategories,
    'DE': allDefensiveCategories,
    'DT': allDefensiveCategories
};

function renderAssignments() {
    const offenseSkillAssignments = document.getElementById('offenseSkillAssignments');
    const offenseLineAssignments = document.getElementById('offenseLineAssignments');
    const defenseLineAssignments = document.getElementById('defenseLineAssignments');
    const defenseLBAssignments = document.getElementById('defenseLBAssignments');
    const defenseSecondaryAssignments = document.getElementById('defenseSecondaryAssignments');
    const offensivePlaycallSelect = document.getElementById('offensivePlaycall');
    const defensivePlaycallSelect = document.getElementById('defensivePlaycall');
    
    // Populate playcall dropdowns
    if (offensivePlaycallSelect) {
        offensivePlaycallSelect.innerHTML = '<option value="">Select a playcall...</option>';
        Object.keys(offensivePlaycalls).forEach(playcall => {
            const option = document.createElement('option');
            option.value = playcall;
            option.textContent = playcall;
            offensivePlaycallSelect.appendChild(option);
        });
        
        offensivePlaycallSelect.onchange = (e) => {
            if (e.target.value) {
                applyOffensivePlaycall(e.target.value);
            }
        };
    }
    
    if (defensivePlaycallSelect) {
        defensivePlaycallSelect.innerHTML = '<option value="">Select a playcall...</option>';
        Object.keys(defensivePlaycalls).forEach(playcall => {
            const option = document.createElement('option');
            option.value = playcall;
            option.textContent = playcall;
            defensivePlaycallSelect.appendChild(option);
        });
        
        defensivePlaycallSelect.onchange = (e) => {
            if (e.target.value) {
                applyDefensivePlaycall(e.target.value);
            }
        };
    }
    
    // Clear all assignment containers
    if (offenseSkillAssignments) offenseSkillAssignments.innerHTML = '';
    if (offenseLineAssignments) offenseLineAssignments.innerHTML = '';
    if (defenseLineAssignments) defenseLineAssignments.innerHTML = '';
    if (defenseLBAssignments) defenseLBAssignments.innerHTML = '';
    if (defenseSecondaryAssignments) defenseSecondaryAssignments.innerHTML = '';
    
    // Store assignment items for later updates
    window.assignmentItems = { offense: {}, defense: {} };
    
    // Group and render offensive players
    selectedPlayers.forEach((playerId) => {
        const player = getPlayerById(playerId);
        if (!player) return;
        
        const location = playerPositions[playerId]?.location || 'Not placed';
        const item = createAssignmentItem(player, 'offense', location);
        
        // Group by position: QB + eligibles (QB, RB, WR, TE) vs linemen (OT, OG, C)
        if (['QB', 'RB', 'WR', 'TE'].includes(player.position)) {
            if (offenseSkillAssignments) {
                offenseSkillAssignments.appendChild(item);
            }
        } else if (['OT', 'OG', 'C'].includes(player.position)) {
            if (offenseLineAssignments) {
                offenseLineAssignments.appendChild(item);
            }
        }
        
        window.assignmentItems.offense[player.name] = { item, playerId, player };
    });
    
    // Group and render defensive players
    console.log('Rendering defensive assignments, selectedDefense count:', selectedDefense.length);
    selectedDefense.forEach((playerId) => {
        const player = getPlayerById(playerId);
        if (!player) {
            console.warn('Player not found for ID:', playerId);
            return;
        }
        
        const location = playerPositions[playerId]?.location || 'Not placed';
        const item = createAssignmentItem(player, 'defense', location);
        
        // Group by position: DL (DE, DT), LBs (LB, MLB), Secondary (CB, S)
        if (['DE', 'DT'].includes(player.position)) {
            if (defenseLineAssignments) {
                defenseLineAssignments.appendChild(item);
                console.log('Added DL player:', player.name, 'to defenseLineAssignments');
            } else {
                console.error('defenseLineAssignments container not found!');
            }
        } else if (['LB', 'MLB'].includes(player.position)) {
            if (defenseLBAssignments) {
                defenseLBAssignments.appendChild(item);
                console.log('Added LB player:', player.name, 'to defenseLBAssignments');
            } else {
                console.error('defenseLBAssignments container not found!');
            }
        } else if (['CB', 'S'].includes(player.position)) {
            if (defenseSecondaryAssignments) {
                defenseSecondaryAssignments.appendChild(item);
                console.log('Added secondary player:', player.name, 'to defenseSecondaryAssignments');
            } else {
                console.error('defenseSecondaryAssignments container not found!');
            }
        } else {
            console.warn('Unknown defensive position:', player.position, 'for player:', player.name);
        }
        
        window.assignmentItems.defense[player.name] = { item, playerId, player };
    });
    
    console.log('Defensive assignment items created:', Object.keys(window.assignmentItems.defense).length);
    
    // Render playcall diagrams
    renderPlaycallDiagram();
    renderDefensePlaycallDiagram();
}

function renderPlaycallDiagram() {
    const canvas = document.getElementById('playcallDiagram');
    if (!canvas) return;
    
    const container = canvas.parentElement;
    if (!container) return;
    
    const width = container.offsetWidth || 200;
    const height = 150;
    
    // Set canvas size
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    
    // Draw field background
    ctx.fillStyle = '#2d5016';
    ctx.fillRect(0, 0, width, height);
    
    const centerY = height / 2;
    const scaleX = width / 50; // Scale from -25 to +25
    const scaleY = height / 30; // Scale for Y coordinates (roughly -15 to +15)
    
    // Draw hash marks (scaled)
    for (let i = 0; i <= 20; i++) {
        const y = (i / 20) * height;
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(width * 0.15 - 0.5, y, 1, 3);
        ctx.fillRect(width * 0.35 - 0.5, y, 1, 3);
        ctx.fillRect(width * 0.65 - 0.5, y, 1, 3);
        ctx.fillRect(width * 0.85 - 0.5, y, 1, 3);
    }
    
    // Draw line of scrimmage
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();
    
    // Helper to get original location coordinates from fieldLocations
    function getLocationCoords(locationName) {
        for (const section of fieldLocations) {
            for (const loc of section.Locations) {
                if (loc.Name === locationName) {
                    return { x: loc.X, y: loc.Y };
                }
            }
        }
        return null;
    }
    
    // Render offensive players only (hide defense) - bottom half
    const bottomHalfStart = height / 2;
    const bottomHalfHeight = height / 2;
    
    selectedPlayers.forEach((playerId) => {
        const player = getPlayerById(playerId);
        if (!player) return;
        
        const pos = playerPositions[playerId];
        if (!pos) {
            console.warn(`No position for player ${player.name}`);
            return;
        }
        
        // Get original location coordinates
        const locCoords = getLocationCoords(pos.location);
        if (!locCoords) {
            console.warn(`Could not find location coordinates for: ${pos.location}`);
            return;
        }
        
        // Convert X from original coordinates (-25 to +25) to diagram (0 to width)
        const diagramX = ((locCoords.x + 25) / 50) * width;
        
        // Convert Y: Offense goes in bottom half
        // Offense Y values are negative (-3 to -15), map to bottom half (75-150)
        const offenseYRange = -15 - (-3); // -12
        const diagramY = bottomHalfStart + bottomHalfHeight * ((-locCoords.y - 3) / -offenseYRange);
        
        // Check if coordinates are valid
        if (isNaN(diagramX) || isNaN(diagramY) || !isFinite(diagramX) || !isFinite(diagramY)) {
            console.error(`Invalid coordinates for ${player.name}:`, { diagramX, diagramY, locCoords });
            return;
        }
        
        // Get assignment
        const assignment = assignments.offense[player.name];
        
        // Determine color based on assignment
        let color = '#757575'; // Grey default
        if (assignment && assignment.action) {
            if (assignment.category === 'Route') {
                color = '#FFEB3B'; // Yellow for routes
            } else if (assignment.action.includes('Block') || assignment.action.includes('Protect')) {
                color = '#888888'; // Grey for blocks
            } else if (assignment.action.includes('Run') || assignment.action.includes('Boot') || assignment.action.includes('Handoff') || assignment.action.includes('draw')) {
                color = '#f44336'; // Red for runs/boots
            }
        }
        
        // Draw player circle
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(diagramX, diagramY, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 0.5;
        ctx.stroke();
        
        // Draw assignment arrow if exists
        if (assignment && assignment.action) {
            // Pass diagram X to determine left/right side of field
            drawOffensiveAssignmentArrow(ctx, diagramX, diagramY, assignment, color, width, height, diagramX, width);
        }
    });
}

function drawOffensiveAssignmentArrow(ctx, x, y, assignment, color, width, height, diagramX, diagramWidth) {
    // Routes are yellow, everything else uses the passed color
    const isRoute = assignment.category === 'Route';
    const routeColor = isRoute ? '#FFEB3B' : color;
    ctx.strokeStyle = routeColor;
    ctx.fillStyle = routeColor;
    ctx.lineWidth = 2;
    
    // Determine which side of field player is on using diagram coordinates
    const diagramCenter = diagramWidth / 2;
    const isOnLeftSide = diagramX < diagramCenter;
    
    // Direction multipliers for field mirroring
    // Left side: "out" = negative X (toward left sideline), "in" = positive X (toward center)
    // Right side: "out" = positive X (toward right sideline), "in" = negative X (toward center)
    const outDir = isOnLeftSide ? -1 : 1;
    const inDir = isOnLeftSide ? 1 : -1;
    
    // Base route length
    const routeLength = 45;
    
    if (isRoute) {
        // Route definitions: { stemLength, turnAngle, continueLength }
        // Angles: 0° = straight up, 90° = horizontal out, -90° = horizontal in, 135° = back out, -135° = back in
        // All angles are from the forward (up) direction, positive = toward sideline, negative = toward center
        let routeDef = null;
        
        if (assignment.action.includes('Screen')) {
            // Screen: stem=0, horizontal toward center
            routeDef = { stemLength: 0, turnAngle: 0, continueLength: routeLength * 0.15, direction: 'in' };
        } else if (assignment.action.includes('Flat')) {
            // Flat: stem forward, then 90° turn out to sideline
            routeDef = { stemLength: routeLength * 0.25, turnAngle: 90, continueLength: routeLength * 0.6, direction: 'out' };
        } else if (assignment.action.includes('Slant')) {
            // Slant: stem forward, then 45° turn IN toward center
            routeDef = { stemLength: routeLength * 0.25, turnAngle: -45, continueLength: routeLength * 0.5, direction: 'in' };
        } else if (assignment.action.includes('Comeback')) {
            // Comeback: stem forward, then 135° turn back out to sideline
            routeDef = { stemLength: routeLength * 0.5, turnAngle: 135, continueLength: routeLength * 0.4, direction: 'out' };
        } else if (assignment.action.includes('Curl')) {
            // Curl: stem forward, then -135° turn back in toward center
            routeDef = { stemLength: routeLength * 0.5, turnAngle: -135, continueLength: routeLength * 0.4, direction: 'in' };
        } else if (assignment.action.includes('Out')) {
            // Out: stem forward, then 90° turn out to sideline
            routeDef = { stemLength: routeLength * 0.3, turnAngle: 90, continueLength: routeLength * 0.7, direction: 'out' };
        } else if (assignment.action.includes('Dig')) {
            // Dig: stem forward, then 90° turn IN toward center
            routeDef = { stemLength: routeLength * 0.4, turnAngle: -90, continueLength: routeLength * 0.5, direction: 'in' };
        } else if (assignment.action.includes('Corner')) {
            // Corner: stem forward, then 45° turn out to sideline
            routeDef = { stemLength: routeLength * 0.3, turnAngle: 45, continueLength: routeLength * 0.5, direction: 'out' };
        } else if (assignment.action.includes('Post')) {
            // Post: stem forward, then 45° turn IN toward center
            routeDef = { stemLength: routeLength * 0.4, turnAngle: -45, continueLength: routeLength * 0.5, direction: 'in' };
        } else if (assignment.action.includes('Go') || assignment.action.includes('Seam')) {
            // Go/Seam: stem forward, no turn (straight up)
            routeDef = { stemLength: routeLength, turnAngle: 0, continueLength: 0, direction: 'none' };
        } else if (assignment.action.includes('Fade')) {
            // Fade: stem forward, then 10° angle out to sideline
            routeDef = { stemLength: routeLength, turnAngle: 10, continueLength: 0, direction: 'out' };
        } else if (assignment.action.includes('Chip') || assignment.action.includes('Delay')) {
            // Chip+Delay: shorter route, stem forward, then turn in
            routeDef = { stemLength: routeLength * 0.3, turnAngle: -45, continueLength: routeLength * 0.3, direction: 'in' };
        } else {
            // Default: straight up
            routeDef = { stemLength: routeLength, turnAngle: 0, continueLength: 0, direction: 'none' };
        }
        
        // Draw route: start -> stem end -> turn -> final end
        let stemEndX = x;
        let stemEndY = y - routeDef.stemLength; // Forward is negative Y
        
        // If stem length is 0 (Screen), start at current position
        if (routeDef.stemLength === 0) {
            stemEndX = x;
            stemEndY = y;
        }
        
        let endX = stemEndX;
        let endY = stemEndY;
        
        // Apply turn and continue
        if (routeDef.turnAngle !== 0 && routeDef.continueLength > 0) {
            // Convert angle to radians (positive = toward sideline, negative = toward center)
            const angleRad = (routeDef.turnAngle * Math.PI) / 180;
            
            // Calculate direction based on field side and route direction
            let horizontalDir = 0;
            if (routeDef.direction === 'out') {
                horizontalDir = outDir;
            } else if (routeDef.direction === 'in') {
                horizontalDir = inDir;
            }
            
            // Calculate the turn direction
            // For positive angles (out): use outDir
            // For negative angles (in): use inDir
            const turnDir = routeDef.turnAngle > 0 ? outDir : inDir;
            
            // Calculate end position after turn
            // X component: horizontal movement based on angle
            // Y component: vertical movement based on angle
            const dx = turnDir * routeDef.continueLength * Math.sin(Math.abs(angleRad));
            const dy = -routeDef.continueLength * Math.cos(Math.abs(angleRad)); // Negative because up is negative Y
            
            endX = stemEndX + dx;
            endY = stemEndY + dy;
        } else if (routeDef.turnAngle !== 0 && routeDef.continueLength === 0) {
            // Fade: angle applied during stem
            const angleRad = (routeDef.turnAngle * Math.PI) / 180;
            const dx = outDir * routeDef.stemLength * Math.sin(angleRad);
            const dy = -routeDef.stemLength * Math.cos(angleRad);
            endX = x + dx;
            endY = y + dy;
            stemEndX = x; // No separate stem for fade
            stemEndY = y;
        } else if (routeDef.stemLength === 0) {
            // Screen: horizontal toward center
            endX = x + (inDir * routeDef.continueLength);
            endY = y;
        }
        
        // Draw route path
        ctx.beginPath();
        ctx.moveTo(x, y);
        
        if (routeDef.stemLength > 0 && routeDef.turnAngle === 0 && routeDef.continueLength === 0) {
            // Straight route (Go/Seam)
            ctx.lineTo(endX, endY);
        } else if (routeDef.stemLength === 0) {
            // Screen (no stem)
            ctx.lineTo(endX, endY);
        } else {
            // Route with stem and turn
            ctx.lineTo(stemEndX, stemEndY);
            ctx.lineTo(endX, endY);
        }
        
        ctx.stroke();
        
        // Draw arrowhead at end
        const finalAngle = Math.atan2(endY - (routeDef.stemLength > 0 && routeDef.turnAngle !== 0 ? stemEndY : y), 
                                      endX - (routeDef.stemLength > 0 && routeDef.turnAngle !== 0 ? stemEndX : x));
        const arrowHeadLength = 6;
        const arrowHeadAngle = Math.PI / 6;
        
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(
            endX - arrowHeadLength * Math.cos(finalAngle - arrowHeadAngle),
            endY - arrowHeadLength * Math.sin(finalAngle - arrowHeadAngle)
        );
        ctx.lineTo(
            endX - arrowHeadLength * Math.cos(finalAngle + arrowHeadAngle),
            endY - arrowHeadLength * Math.sin(finalAngle + arrowHeadAngle)
        );
        ctx.closePath();
        ctx.fill();
    } else {
        // Non-route assignments (blocks, runs) - simple arrows
        let arrowLength = 15;
        let endX = x;
        let endY = y;
        
        if (assignment.action.includes('left') || assignment.action.includes('Left')) {
            endX = x - arrowLength;
        } else if (assignment.action.includes('right') || assignment.action.includes('Right')) {
            endX = x + arrowLength;
        }
        
        if (assignment.action.includes('gap')) {
            if (assignment.action.includes('A gap')) {
                endY = y - arrowLength * 0.5;
            } else if (assignment.action.includes('B gap') || assignment.action.includes('C gap')) {
                endY = y - arrowLength * 0.3;
            }
        } else {
            // Default: forward
            endY = y - arrowLength * 0.5;
        }
        
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(endX, endY);
        ctx.stroke();
        
        if (endX !== x || endY !== y) {
            const angle = Math.atan2(endY - y, endX - x);
            const arrowHeadLength = 5;
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
        }
    }
}

function drawDefensiveAssignmentArrow(ctx, x, y, assignment, color, isDashed, width, height) {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    
    if (isDashed) {
        ctx.setLineDash([3, 3]);
    } else {
        ctx.setLineDash([]);
    }
    
    // Helper to get original location coordinates from fieldLocations
    function getLocationCoordsForManCoverage(locationName) {
        for (const section of fieldLocations) {
            for (const loc of section.Locations) {
                if (loc.Name === locationName) {
                    return { x: loc.X, y: loc.Y };
                }
            }
        }
        return null;
    }
    
    // For man coverage, draw line to target offensive player
    if (assignment.category === 'Man Coverage' && assignment.manCoverageTarget) {
        let targetPos = null;
        const bottomHalfStart = height / 2;
        const bottomHalfHeight = height / 2;
        
        selectedPlayers.forEach((playerId) => {
            const p = getPlayerById(playerId);
            if (p && p.name === assignment.manCoverageTarget) {
                const pos = playerPositions[playerId];
                if (pos) {
                    const locCoords = getLocationCoordsForManCoverage(pos.location);
                    if (locCoords) {
                        const targetX = ((locCoords.x + 25) / 50) * width;
                        const offenseYRange = -15 - (-3);
                        const targetY = bottomHalfStart + bottomHalfHeight * ((-locCoords.y - 3) / -offenseYRange);
                        targetPos = { x: targetX, y: targetY };
                    }
                }
            }
        });
        
        if (targetPos) {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(targetPos.x, targetPos.y);
            ctx.stroke();
        }
    } else {
        // Draw arrow based on assignment
        let arrowLength = 18; // Base length
        let endX = x, endY = y;
        
        if (assignment.action.includes('deep') || assignment.action.includes('Deep')) {
            // Deep zones go down (toward offense)
            arrowLength = 22;
            endY = y + arrowLength;
            if (assignment.action.includes('left') || assignment.action.includes('Left')) {
                endX = x - arrowLength * 0.4;
            } else if (assignment.action.includes('right') || assignment.action.includes('Right')) {
                endX = x + arrowLength * 0.4;
            }
        } else if (assignment.action.includes('flat') || assignment.action.includes('Flat') || assignment.action.includes('Hook') || assignment.action.includes('Curtain')) {
            // Short zones
            arrowLength = 15;
            endY = y - arrowLength * 0.5;
            if (assignment.action.includes('left') || assignment.action.includes('Left')) {
                endX = x - arrowLength * 0.7;
            } else if (assignment.action.includes('right') || assignment.action.includes('Right')) {
                endX = x + arrowLength * 0.7;
            }
        } else if (assignment.action.includes('left') || assignment.action.includes('Left')) {
            endX = x - arrowLength;
        } else if (assignment.action.includes('right') || assignment.action.includes('Right')) {
            endX = x + arrowLength;
        } else if (assignment.action.includes('gap')) {
            // Rush/blitz
            arrowLength = 15;
            if (assignment.action.includes('A gap')) {
                endY = y + arrowLength * 0.6;
            } else if (assignment.action.includes('B gap') || assignment.action.includes('C gap')) {
                endY = y + arrowLength * 0.4;
            }
        }
        
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(endX, endY);
        ctx.stroke();
        
        // Draw arrowhead (always draw if there's any movement)
        if (endX !== x || endY !== y) {
            const angle = Math.atan2(endY - y, endX - x);
            const arrowHeadLength = 5;
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
        }
    }
    
    ctx.setLineDash([]);
}

function renderDefensePlaycallDiagram() {
    const canvas = document.getElementById('defensePlaycallDiagram');
    if (!canvas) return;
    
    const container = canvas.parentElement;
    if (!container) return;
    
    const width = container.offsetWidth || 200;
    const height = 150;
    
    // Set canvas size
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    
    // Draw field background
    ctx.fillStyle = '#2d5016';
    ctx.fillRect(0, 0, width, height);
    
    const centerY = height / 2;
    
    // Draw hash marks (scaled)
    for (let i = 0; i <= 20; i++) {
        const y = (i / 20) * height;
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(width * 0.15 - 0.5, y, 1, 3);
        ctx.fillRect(width * 0.35 - 0.5, y, 1, 3);
        ctx.fillRect(width * 0.65 - 0.5, y, 1, 3);
        ctx.fillRect(width * 0.85 - 0.5, y, 1, 3);
    }
    
    // Draw line of scrimmage
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();
    
    // Helper to get original location coordinates from fieldLocations
    function getLocationCoords(locationName) {
        for (const section of fieldLocations) {
            for (const loc of section.Locations) {
                if (loc.Name === locationName) {
                    return { x: loc.X, y: loc.Y };
                }
            }
        }
        return null;
    }
    
    // Render defensive players only (hide offense) - top half
    const topHalfHeight = height / 2;
    
    selectedDefense.forEach((playerId) => {
        const player = getPlayerById(playerId);
        if (!player) return;
        
        const pos = playerPositions[playerId];
        if (!pos) {
            console.warn(`No position for player ${player.name}`);
            return;
        }
        
        // Get original location coordinates
        const locCoords = getLocationCoords(pos.location);
        if (!locCoords) {
            console.warn(`Could not find location coordinates for: ${pos.location}`);
            return;
        }
        
        // Convert X from original coordinates (-25 to +25) to diagram (0 to width)
        const diagramX = ((locCoords.x + 25) / 50) * width;
        
        // Convert Y: Defense goes in top half
        // Defense Y values are positive (3 to 20), map to top half (0-75)
        const defenseYRange = 20 - 3; // 17
        const diagramY = topHalfHeight * ((20 - locCoords.y) / defenseYRange);
        
        // Check if coordinates are valid
        if (isNaN(diagramX) || isNaN(diagramY) || !isFinite(diagramX) || !isFinite(diagramY)) {
            console.error(`Invalid coordinates for ${player.name}:`, { diagramX, diagramY, locCoords });
            return;
        }
        
        // Get assignment - show player even without assignment
        const assignment = assignments.defense[player.name];
        
        // Determine color based on assignment
        let color = '#757575'; // Grey default
        let isDashed = false;
        if (assignment && assignment.action) {
            if (assignment.category === 'Zone Deep' || (assignment.action.includes('Deep') && !assignment.action.includes('Man'))) {
                color = '#2196F3'; // Blue for deep zones
            } else if (assignment.category === 'Zone Short' || assignment.category === 'Zone' || 
                      (assignment.action.includes('Hook') || assignment.action.includes('Curtain'))) {
                color = '#FFEB3B'; // Yellow for short zones
            } else if (assignment.category === 'Man Coverage' || assignment.action.includes('Man')) {
                color = '#f44336'; // Red for man coverage
                isDashed = true;
            } else if (assignment.category === 'Blitz' || assignment.category === 'Rush' || 
                      assignment.action.includes('Blitz') || assignment.action.includes('Rush') || 
                      assignment.action.includes('gap')) {
                color = '#FF9800'; // Orange for blitz/rush
            } else if (assignment.action.includes('Spy')) {
                color = '#FF9800'; // Orange for spy
            }
        }
        
        // Draw player circle (larger for visibility)
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(diagramX, diagramY, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.stroke();
        
        // Draw assignment arrow/line if exists
        if (assignment && assignment.action) {
            drawDefensiveAssignmentArrow(ctx, diagramX, diagramY, assignment, color, isDashed, width, height);
        }
    });
}

function applyOffensivePlaycall(playcallName) {
    const playcall = offensivePlaycalls[playcallName];
    if (!playcall) return;
    
    // Group players by position for better assignment distribution
    const playersByPosition = {};
    selectedPlayers.forEach((playerId) => {
        const player = getPlayerById(playerId);
        if (!player) return;
        if (!playersByPosition[player.position]) {
            playersByPosition[player.position] = [];
        }
        playersByPosition[player.position].push(player);
    });
    
    selectedPlayers.forEach((playerId) => {
        const player = getPlayerById(playerId);
        if (!player) return;
        
        const assignment = playcall[player.position];
        if (assignment) {
            // Update the assignment
            updateAssignment(player, 'offense', assignment.category, assignment.action);
            
            // Update the UI
            if (window.assignmentItems && window.assignmentItems.offense[player.name]) {
                const { item } = window.assignmentItems.offense[player.name];
                const selects = item.querySelectorAll('select');
                const categorySelect = selects[0];
                const actionSelect = selects[1];
                
                if (categorySelect && actionSelect) {
                    categorySelect.value = assignment.category;
                    // Trigger change to populate actions
                    const changeEvent = new Event('change', { bubbles: true });
                    categorySelect.dispatchEvent(changeEvent);
                    
                    // Set action after category populates
                    setTimeout(() => {
                        if (actionSelect.options.length > 0) {
                            // Find matching action or use first available
                            let found = false;
                            for (let i = 0; i < actionSelect.options.length; i++) {
                                if (actionSelect.options[i].value === assignment.action) {
                                    actionSelect.value = assignment.action;
                                    found = true;
                                    break;
                                }
                            }
                            if (!found && actionSelect.options.length > 1) {
                                actionSelect.selectedIndex = 1; // Skip empty option
                            }
                            actionSelect.dispatchEvent(new Event('change', { bubbles: true }));
                            // Update man coverage selector visibility
                            updateManCoverageSelector(item, player, 'offense', assignment.category, assignment.action);
                        }
                    }, 10);
                }
            }
        }
    });
    
    // Update playcall diagram
    renderPlaycallDiagram();
}

function applyDefensivePlaycall(playcallName) {
    // Extract cover number from playcall name (0-4)
    let coverNumber = null;
    if (playcallName.includes('Cover 0')) {
        coverNumber = 0;
    } else if (playcallName.includes('Cover 1')) {
        coverNumber = 1;
    } else if (playcallName.includes('Cover 2')) {
        coverNumber = 2;
    } else if (playcallName.includes('Cover 3')) {
        coverNumber = 3;
    } else if (playcallName.includes('Cover 4')) {
        coverNumber = 4;
    }
    
    if (coverNumber === null) {
        // Fallback to old system for non-cover playcalls
        const playcall = defensivePlaycalls[playcallName];
        if (!playcall) return;
        
        selectedDefense.forEach((playerId) => {
            const player = getPlayerById(playerId);
            if (!player) return;
            
            const assignment = playcall[player.position];
            if (assignment) {
                updateAssignment(player, 'defense', assignment.category, assignment.action);
            }
        });
        updateDefensivePlaycallUI();
        renderDefensePlaycallDiagram();
        return;
    }
    
    // Get all defensive players grouped by position
    const playersByPosition = {
        'CB': [],
        'S': [],
        'LB': [],
        'MLB': [],
        'DE': [],
        'DT': []
    };
    
    selectedDefense.forEach((playerId) => {
        const player = getPlayerById(playerId);
        if (!player) return;
        if (playersByPosition[player.position]) {
            playersByPosition[player.position].push(player);
        }
    });
    
    // Deep zone assignments based on cover number
    const deepZoneAssignments = {
        0: [],
        1: ['Deep middle 1/3'],
        2: ['Deep left (2)', 'Deep right (2)'],
        3: ['Deep left (3)', 'Deep right (3)', 'Deep middle 1/3'],
        4: ['Deep far left (4)', 'Deep far right (4)', 'Deep seam left (4)', 'Deep seam right (4)']
    };
    
    const deepZones = deepZoneAssignments[coverNumber] || [];
    
    // Assign deep zones to DBs (CBs and Ss)
    const allDBs = [...playersByPosition['CB'], ...playersByPosition['S']];
    deepZones.forEach((zone, index) => {
        if (index < allDBs.length) {
            const player = allDBs[index];
            updateAssignment(player, 'defense', 'Zone Deep', zone);
        }
    });
    
    // Remaining DBs get man (Cover 0/1) or zone short (Cover 2-4)
    const remainingDBs = allDBs.slice(deepZones.length);
    const useMan = coverNumber <= 1;
    
    if (useMan) {
        // Man coverage - assign to nearest eligible offensive players
        const eligibleOffense = [];
        selectedPlayers.forEach((playerId) => {
            const player = getPlayerById(playerId);
            if (player && ['WR', 'TE', 'RB'].includes(player.position)) {
                const pos = playerPositions[playerId];
                if (pos) {
                    eligibleOffense.push({ player, pos });
                }
            }
        });
        
        // Sort by position (left to right)
        eligibleOffense.sort((a, b) => a.pos.x - b.pos.x);
        
        remainingDBs.forEach((db, index) => {
            if (index < eligibleOffense.length) {
                const target = eligibleOffense[index % eligibleOffense.length];
                updateAssignment(db, 'defense', 'Man Coverage', 'Outside release man');
                // Store man coverage target
                if (!assignments.defense[db.name]) assignments.defense[db.name] = {};
                assignments.defense[db.name].manCoverageTarget = target.player.name;
            }
        });
    } else {
        // Zone short for remaining DBs
        remainingDBs.forEach((db) => {
            updateAssignment(db, 'defense', 'Zone Short', 'Hook');
        });
    }
    
    // LBs get man (Cover 0/1) or zone short (Cover 2-4)
    const allLBs = [...playersByPosition['LB'], ...playersByPosition['MLB']];
    if (useMan) {
        // Assign LBs to remaining eligible offensive players
        const eligibleOffense = [];
        selectedPlayers.forEach((playerId) => {
            const player = getPlayerById(playerId);
            if (player && ['WR', 'TE', 'RB'].includes(player.position)) {
                const pos = playerPositions[playerId];
                if (pos) {
                    eligibleOffense.push({ player, pos });
                }
            }
        });
        
        eligibleOffense.sort((a, b) => a.pos.x - b.pos.x);
        
        allLBs.forEach((lb, index) => {
            if (index < eligibleOffense.length) {
                const target = eligibleOffense[index % eligibleOffense.length];
                updateAssignment(lb, 'defense', 'Man Coverage', 'Inside release man');
                if (!assignments.defense[lb.name]) assignments.defense[lb.name] = {};
                assignments.defense[lb.name].manCoverageTarget = target.player.name;
            } else {
                updateAssignment(lb, 'defense', 'Zone', 'Hook');
            }
        });
    } else {
        // Zone short for LBs
        allLBs.forEach((lb) => {
            updateAssignment(lb, 'defense', 'Zone', 'Hook');
        });
    }
    
    // DL always rush (unless specified in playcall)
    const allDL = [...playersByPosition['DE'], ...playersByPosition['DT']];
    allDL.forEach((dl) => {
        // Check if playcall specifies a blitz/rush for this position
        const playcall = defensivePlaycalls[playcallName];
        if (playcall && playcall[dl.position]) {
            const assignment = playcall[dl.position];
            updateAssignment(dl, 'defense', assignment.category, assignment.action);
        } else {
            // Default rush
            const defaultGap = getDefaultGapFromLocation(
                playerPositions[selectedDefense.find(id => {
                    const p = getPlayerById(id);
                    return p && p.name === dl.name;
                })]?.location || '', dl);
            if (defaultGap) {
                updateAssignment(dl, 'defense', 'Rush', defaultGap);
            } else {
                updateAssignment(dl, 'defense', 'Rush', 'Left A gap');
            }
        }
    });
    
    updateDefensivePlaycallUI();
    renderDefensePlaycallDiagram();
}

function updateDefensivePlaycallUI() {
    selectedDefense.forEach((playerId) => {
        const player = getPlayerById(playerId);
        if (!player) return;
        
        const assignment = assignments.defense[player.name];
        if (!assignment) return;
        
        if (window.assignmentItems && window.assignmentItems.defense[player.name]) {
            const { item } = window.assignmentItems.defense[player.name];
            const selects = item.querySelectorAll('select');
            const categorySelect = selects[0];
            const actionSelect = selects[1];
            
            if (categorySelect && actionSelect) {
                categorySelect.value = assignment.category;
                const changeEvent = new Event('change', { bubbles: true });
                categorySelect.dispatchEvent(changeEvent);
                
                setTimeout(() => {
                    if (actionSelect.options.length > 0) {
                        let found = false;
                        for (let i = 0; i < actionSelect.options.length; i++) {
                            if (actionSelect.options[i].value === assignment.action) {
                                actionSelect.value = assignment.action;
                                found = true;
                                break;
                            }
                        }
                        if (!found && actionSelect.options.length > 1) {
                            actionSelect.selectedIndex = 1;
                        }
                        actionSelect.dispatchEvent(new Event('change', { bubbles: true }));
                        updateManCoverageSelector(item, player, 'defense', assignment.category, assignment.action);
                    }
                }, 10);
            }
        }
    });
}

function createAssignmentItem(player, side, location) {
    const item = document.createElement('div');
    item.className = 'assignment-item';
    item.style.cssText = 'display: flex; flex-direction: column; gap: 4px; padding: 6px; background: #fff; border-radius: 4px; margin-bottom: 6px;';
    
    const header = document.createElement('div');
    header.style.cssText = 'display: flex; flex-direction: column; margin-bottom: 2px;';
    header.innerHTML = `
        <div>
            <strong style="font-size: 0.85em;">${player.name}</strong> <span style="font-size: 0.75em;">(${player.position})</span>
            <div style="font-size: 0.7em; color: #666;">${location}</div>
        </div>
    `;
    item.appendChild(header);
    
    // Two-stage selection: Category then Action
    const categorySelect = document.createElement('select');
    categorySelect.style.cssText = 'padding: 4px; border-radius: 3px; border: 1px solid #ddd; font-size: 0.8em; margin-bottom: 3px; width: 100%;';
    categorySelect.innerHTML = '<option value="">Category...</option>';
    
    const actionSelect = document.createElement('select');
    actionSelect.style.cssText = 'padding: 4px; border-radius: 3px; border: 1px solid #ddd; font-size: 0.8em; width: 100%;';
    actionSelect.innerHTML = '<option value="">Action...</option>';
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
        
        // For DL players, try to pre-populate gap from technique
        let defaultAction = playerAssignments[defaultCategory][0];
        if (['DE', 'DT'].includes(player.position) && (defaultCategory === 'Rush' || defaultCategory === 'Blitz')) {
            const defaultGap = getDefaultGapFromLocation(location, player);
            if (defaultGap && playerAssignments[defaultCategory].includes(defaultGap)) {
                defaultAction = defaultGap;
            }
        }
        
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
                // Update man coverage selector visibility
                updateManCoverageSelector(item, player, side, category, playerAssignments[category][0]);
            }
        } else {
            updateManCoverageSelector(item, player, side, '', '');
        }
    });
    
    actionSelect.addEventListener('change', (e) => {
        updateAssignment(player, side, categorySelect.value, e.target.value);
        // Show/hide man coverage selector
        updateManCoverageSelector(item, player, side, categorySelect.value, e.target.value);
    });
    
    // Man coverage selector (only for defensive players in man coverage)
    const manCoverageSelect = document.createElement('select');
    manCoverageSelect.style.cssText = 'padding: 4px; border-radius: 3px; border: 1px solid #ddd; font-size: 0.8em; margin-top: 3px; display: none; width: 100%;';
    manCoverageSelect.innerHTML = '<option value="">Covering...</option>';
    // Use a safe ID that escapes special characters
    const safeId = `manCoverage-${player.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
    manCoverageSelect.id = safeId;
    manCoverageSelect.dataset.playerName = player.name;
    
    // Populate with eligible offensive players
    if (side === 'defense') {
        selectedPlayers.forEach((playerId) => {
            const offPlayer = getPlayerById(playerId);
            if (offPlayer && ['WR', 'TE', 'RB'].includes(offPlayer.position)) {
                const option = document.createElement('option');
                option.value = offPlayer.name;
                option.textContent = `${offPlayer.name} (${offPlayer.position})`;
                manCoverageSelect.appendChild(option);
            }
        });
    }
    
    manCoverageSelect.addEventListener('change', (e) => {
        if (e.target.value) {
            // Ensure assignments[side] exists
            if (!assignments[side]) {
                assignments[side] = {};
            }
            const currentAssignment = assignments[side][player.name];
            if (currentAssignment) {
                assignments[side][player.name] = {
                    ...currentAssignment,
                    manCoverageTarget: e.target.value
                };
            } else {
                // Create assignment if it doesn't exist
                assignments[side][player.name] = {
                    category: 'Man Coverage',
                    action: 'Inside release man',
                    manCoverageTarget: e.target.value
                };
            }
            updateAssignment(player, side, 'Man Coverage', assignments[side][player.name].action);
        }
    });
    
    item.appendChild(categorySelect);
    item.appendChild(actionSelect);
    item.appendChild(manCoverageSelect);
    
    return item;
}

function updateManCoverageSelector(item, player, side, category, action) {
    // Find man coverage select by data attribute or ID pattern
    const safeId = `manCoverage-${player.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const manCoverageSelect = item.querySelector(`#${safeId}`) || 
                              item.querySelector(`select[data-player-name="${player.name}"]`);
    if (!manCoverageSelect) return;
    
    // Show selector only for defensive players in man coverage
    if (side === 'defense' && category === 'Man Coverage' && 
        (action === 'Inside release man' || action === 'Outside release man')) {
        manCoverageSelect.style.display = 'block';
        
        // Update options if needed
        if (manCoverageSelect.options.length <= 1) {
            selectedPlayers.forEach((playerId) => {
                const offPlayer = getPlayerById(playerId);
                if (offPlayer && ['WR', 'TE', 'RB'].includes(offPlayer.position)) {
                    const option = document.createElement('option');
                    option.value = offPlayer.name;
                    option.textContent = `${offPlayer.name} (${offPlayer.position})`;
                    manCoverageSelect.appendChild(option);
                }
            });
        }
    } else {
        manCoverageSelect.style.display = 'none';
        manCoverageSelect.value = '';
    }
}

function populateActions(select, actions) {
    actions.forEach(action => {
        const option = document.createElement('option');
        option.value = action;
        option.textContent = action;
        select.appendChild(option);
    });
}

// Map DL techniques to gaps
function getGapFromTechnique(technique, isLeft) {
    // Technique mapping: 0=A, 1=A, 2i=B, 2=B, 3=B, 4i=C, 4=C, 5=C, 6=C, 7=C, 9=C
    const tech = technique.toString().toLowerCase();
    let gap = '';
    
    if (tech === '0' || tech === '1') {
        gap = 'A gap';
    } else if (tech === '2i' || tech === '2' || tech === '3') {
        gap = 'B gap';
    } else if (tech === '4i' || tech === '4' || tech === '5' || tech === '6' || tech === '6i' || tech === '7' || tech === '9') {
        gap = 'C gap';
    }
    
    if (gap && isLeft !== undefined) {
        return `${isLeft ? 'Left' : 'Right'} ${gap}`;
    }
    return gap;
}

// Get default gap assignment from player's technique location
function getDefaultGapFromLocation(location, player) {
    if (!['DE', 'DT'].includes(player.position)) return null;
    
    // Extract technique from location name (e.g., "Left 5 technique", "Right 4i technique", "0 technique")
    let techMatch = location.match(/(?:left|right)\s+(\d+i?)\s+technique/i);
    if (!techMatch) {
        // Try for "0 technique" or just number
        techMatch = location.match(/(\d+i?)\s+technique/i);
    }
    if (!techMatch) {
        // Fallback to old format
        techMatch = location.match(/^(\d+i?)$/);
    }
    if (!techMatch) return null;
    
    const technique = techMatch[1];
    
    // Determine left/right from location name or position
    let isLeft = null;
    if (location.toLowerCase().includes('left')) {
        isLeft = true;
    } else if (location.toLowerCase().includes('right')) {
        isLeft = false;
    } else {
        // Find player position to determine left/right
        let playerPos = null;
        for (const id in playerPositions) {
            const p = getPlayerById(id);
            if (p && p.name === player.name) {
                playerPos = playerPositions[id];
                break;
            }
        }
        if (!playerPos) return null;
        // Get canvas width from the field container
        const container = document.getElementById('fieldContainer');
        const canvasWidth = container ? container.offsetWidth : 1000;
        isLeft = playerPos.x < (canvasWidth / 2);
    }
    
    return getGapFromTechnique(technique, isLeft);
}

function updateAssignment(player, side, category, action) {
    if (!assignments[side]) assignments[side] = {};
    // Preserve man coverage target if it exists
    const existingAssignment = assignments[side][player.name];
    assignments[side][player.name] = {
        category: category,
        action: action,
        manCoverageTarget: existingAssignment?.manCoverageTarget || null
    };
    // Re-render field to show arrows
    renderField();
    renderPlayerMarkers();
    renderAssignmentArrows();
    // Update playcall diagrams
    if (side === 'offense') {
        renderPlaycallDiagram();
    } else if (side === 'defense') {
        renderDefensePlaycallDiagram();
    }
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
    const y = centerY - (location.y * 15); // Consistent multiplier
    
    // Check for offsides: offense must be Y <= -3, defense must be Y >= +3
    const isOffsides = (side === 'offense' && location.y > -3) || 
                      (side === 'defense' && location.y < 3);
    // Check section names more carefully - only flag as wrong side if clearly defensive/offensive
    const isOffensiveSection = location.section && (
        location.section.includes('Offensive') || 
        location.section.includes('offensive') ||
        location.section.toLowerCase().includes('offense')
    );
    const isDefensiveSection = location.section && (
        location.section.includes('Defensive') || 
        location.section.includes('defensive') ||
        location.section.includes('Coverage') || 
        location.section.includes('Press') ||
        location.section.includes('Deep') ||
        location.section.includes('Box safety') ||
        location.section.includes('Max depth')
    );
    // Only flag wrong side if we're confident about the section classification
    const wrongSide = (side === 'offense' && isDefensiveSection && !isOffensiveSection) ||
                     (side === 'defense' && isOffensiveSection && !isDefensiveSection);
    
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
            position = { name: 'QB (Shotgun)', x: 0, y: -10, section: 'Offensive backfield' };
        } else if (player.position === 'RB') {
            position = { name: 'Behind QB (Shotgun)', x: 0, y: -13, section: 'Offensive backfield' };
        } else if (player.position === 'OT') {
            // Find available tackle spot - count how many OTs are already placed
            const placedTackles = selectedPlayers.filter(id => {
                const p = getPlayerById(id);
                return p && p.position === 'OT' && playerPositions[id] && id !== playerId;
            });
            if (placedTackles.length === 0) {
                position = { name: 'Left Tackle', x: -6, y: -3, section: 'Offensive line of scrimmage' };
            } else {
                position = { name: 'Right Tackle', x: 6, y: -3, section: 'Offensive line of scrimmage' };
            }
        } else if (player.position === 'OG') {
            const placedGuards = selectedPlayers.filter(id => {
                const p = getPlayerById(id);
                return p && p.position === 'OG' && playerPositions[id] && id !== playerId;
            });
            if (placedGuards.length === 0) {
                position = { name: 'Left Guard', x: -3, y: -3, section: 'Offensive line of scrimmage' };
            } else {
                position = { name: 'Right Guard', x: 3, y: -3, section: 'Offensive line of scrimmage' };
            }
        } else if (player.position === 'C') {
            position = { name: 'Center', x: 0, y: -3, section: 'Offensive line of scrimmage' };
        } else if (player.position === 'TE') {
            const placedTEs = selectedPlayers.filter(id => {
                const p = getPlayerById(id);
                return p && p.position === 'TE' && playerPositions[id] && id !== playerId;
            });
            if (placedTEs.length === 0) {
                position = { name: 'Tight end outside left', x: -8, y: -3, section: 'Offensive line of scrimmage' };
            } else {
                position = { name: 'Tight end outside right', x: 8, y: -3, section: 'Offensive line of scrimmage' };
            }
        } else if (player.position === 'WR') {
            const placedWRs = selectedPlayers.filter(id => {
                const p = getPlayerById(id);
                return p && p.position === 'WR' && playerPositions[id] && id !== playerId;
            });
            if (placedWRs.length === 0) {
                position = { name: 'Sideline left', x: -19, y: -3, section: 'Offensive line of scrimmage' };
            } else if (placedWRs.length === 1) {
                position = { name: 'Sideline right', x: 19, y: -3, section: 'Offensive line of scrimmage' };
            } else if (placedWRs.length === 2) {
                position = { name: 'Slot left', x: -11, y: -3, section: 'Offensive line of scrimmage' };
            } else {
                position = { name: 'Slot right', x: 11, y: -3, section: 'Offensive line of scrimmage' };
            }
        }
        
        if (position) {
            const x = ((position.x + 25) / 50) * canvasWidth;
            const y = centerY - (position.y * 15);
            
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
                position = { name: 'Left 5 technique', x: -9, y: 2.5, section: 'Defensive line of scrimmage' };
            } else {
                position = { name: 'Right 5 technique', x: 9, y: 2.5, section: 'Defensive line of scrimmage' };
            }
        } else if (player.position === 'DT') {
            const placedDTs = selectedDefense.filter(id => {
                const p = getPlayerById(id);
                return p && p.position === 'DT' && playerPositions[id] && id !== playerId;
            });
            if (placedDTs.length === 0) {
                position = { name: 'Left 3 technique', x: -5, y: 2.5, section: 'Defensive line of scrimmage' };
            } else {
                position = { name: 'Right 3 technique', x: 5, y: 2.5, section: 'Defensive line of scrimmage' };
            }
        } else if (['LB', 'MLB'].includes(player.position)) {
            const placedLBs = selectedDefense.filter(id => {
                const p = getPlayerById(id);
                return p && ['LB', 'MLB'].includes(p.position) && playerPositions[id] && id !== playerId;
            });
            if (placedLBs.length === 0) {
                position = { name: 'Left B gap (shallow)', x: -3, y: 6, section: 'Defensive backfield' };
            } else if (placedLBs.length === 1) {
                position = { name: 'Right B gap (shallow)', x: 3, y: 6, section: 'Defensive backfield' };
            } else {
                position = { name: 'Over Center (shallow)', x: 0, y: 6, section: 'Defensive backfield' };
            }
        } else if (player.position === 'CB') {
            const placedCBs = selectedDefense.filter(id => {
                const p = getPlayerById(id);
                return p && p.position === 'CB' && playerPositions[id] && id !== playerId;
            });
            if (placedCBs.length === 0) {
                position = { name: 'Left cornerback', x: -19, y: 12, section: 'Max depth' };
            } else {
                position = { name: 'Right cornerback', x: 19, y: 12, section: 'Max depth' };
            }
        } else if (player.position === 'S') {
            const placedSs = selectedDefense.filter(id => {
                const p = getPlayerById(id);
                return p && p.position === 'S' && playerPositions[id] && id !== playerId;
            });
            if (placedSs.length === 0) {
                position = { name: 'Deep middle 1/3', x: 0, y: 15, section: 'Max depth' };
            } else {
                position = { name: 'Deep left', x: -8, y: 12, section: 'Max depth' };
            }
        }
        
        if (position) {
            const x = ((position.x + 25) / 50) * canvasWidth;
            const y = centerY - (position.y * 15);
            
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
        
        // Check for offsides: offense must be Y <= -3, defense must be Y >= +3
        const isOffsides = (side === 'offense' && location.originalY > -3) || 
                          (side === 'defense' && location.originalY < 3);
        
        // Check section names more carefully - only flag as wrong side if clearly defensive/offensive
        const isOffensiveSection = location.section && (
            location.section.includes('Offensive') || 
            location.section.includes('offensive') ||
            location.section.toLowerCase().includes('offense')
        );
        const isDefensiveSection = location.section && (
            location.section.includes('Defensive') || 
            location.section.includes('defensive') ||
            location.section.includes('Coverage') || 
            location.section.includes('Press') ||
            location.section.includes('Deep') ||
            location.section.includes('Box safety') ||
            location.section.includes('Max depth')
        );
        // Only flag wrong side if we're confident about the section classification
        const wrongSide = (side === 'offense' && isDefensiveSection && !isOffensiveSection) ||
                         (side === 'defense' && isOffensiveSection && !isDefensiveSection);
        
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
                // MASSIVE vertical separation: Use multiplier of 15
                // Offense: negative Y values render BELOW centerY (centerY - (negative) = centerY + positive)
                // Defense: positive Y values render ABOVE centerY (centerY - (positive) = centerY - positive)
                const yMultiplier = 15;
                const locY = centerY - (loc.Y * yMultiplier);
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
    
    // Scale canvas to container (same as renderField)
    const dpr = window.devicePixelRatio || 1;
    const canvasWidth = container.offsetWidth;
    const canvasHeight = container.offsetHeight;
    canvas.width = canvasWidth * dpr;
    canvas.height = canvasHeight * dpr;
    canvas.style.width = canvasWidth + 'px';
    canvas.style.height = canvasHeight + 'px';
    ctx.scale(dpr, dpr);
    
    // Redraw field first
    ctx.fillStyle = '#2d5016';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    
    // NO YARD LINES - removed entirely
    
    const centerY = canvasHeight / 2;
    
    // Draw hash marks (VERTICAL - along the length of the field)
    // Hash marks at standard NFL positions every yard along the length
    for (let i = 0; i <= 20; i++) {
        const y = (i / 20) * canvasHeight;
        // Left hash marks (at ~15% and ~35% of field width)
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillRect(canvasWidth * 0.15 - 1, y, 2, 8);
        ctx.fillRect(canvasWidth * 0.35 - 1, y, 2, 8);
        // Right hash marks (at ~65% and ~85% of field width)
        ctx.fillRect(canvasWidth * 0.65 - 1, y, 2, 8);
        ctx.fillRect(canvasWidth * 0.85 - 1, y, 2, 8);
    }
    
    // NO FIELD NUMBERS - removed entirely
    
    // Draw line of scrimmage with buffer zones
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(canvasWidth, centerY);
    ctx.stroke();
    
    // Draw neutral zone with DRASTICALLY increased offset
    // Offense: Y <= -10 (much further below line)
    // Defense: Y >= +10 (much further above line)
    const neutralZoneOffset = 100; // Increased from 10 to 100 pixels (10 yards)
    ctx.strokeStyle = 'rgba(255,255,0,0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(0, centerY - neutralZoneOffset); // -10 yard line (offense max)
    ctx.lineTo(canvasWidth, centerY - neutralZoneOffset);
    ctx.moveTo(0, centerY + neutralZoneOffset); // +10 yard line (defense min)
    ctx.lineTo(canvasWidth, centerY + neutralZoneOffset);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Draw drop zones
    fieldLocations.forEach(section => {
        section.Locations.forEach(location => {
            if (location.X !== undefined && location.Y !== undefined) {
                const x = ((location.X + 25) / 50) * canvasWidth;
                // Use same multiplier for drop zones
                const y = centerY - (location.Y * 15);
                
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
                left: ${pos.x - 18}px;
                top: ${pos.y - 20}px;
                width: 36px;
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
            
            // Player name - allow wrapping to show full name
            const nameDiv = document.createElement('div');
            nameDiv.style.cssText = 'font-size: 6px; font-weight: bold; text-align: center; margin-bottom: 1px; width: 100%; line-height: 1.1; word-wrap: break-word; overflow-wrap: break-word;';
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
            staminaContainer.style.cssText = 'width: 24px; height: 2px; background: #ddd; border-radius: 1px; overflow: hidden;';
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
                
                // Position tooltip below marker
                tooltip.style.left = '50%';
                tooltip.style.transform = 'translateX(-50%)';
                tooltip.style.top = '100%';
                tooltip.style.marginTop = '4px';
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
                        const isOffsides = (side === 'offense' && location.originalY > -3) || 
                                          (side === 'defense' && location.originalY < 3);
                        // Check section names more carefully - only flag as wrong side if clearly defensive/offensive
                        const isOffensiveSection = location.section && (
                            location.section.includes('Offensive') || 
                            location.section.includes('offensive') ||
                            location.section.toLowerCase().includes('offense')
                        );
                        const isDefensiveSection = location.section && (
                            location.section.includes('Defensive') || 
                            location.section.includes('defensive') ||
                            location.section.includes('Coverage') || 
                            location.section.includes('Press') ||
                            location.section.includes('Deep') ||
                            location.section.includes('Box safety') ||
                            location.section.includes('Max depth')
                        );
                        // Only flag wrong side if we're confident about the section classification
                        const wrongSide = (side === 'offense' && isDefensiveSection && !isOffensiveSection) ||
                                         (side === 'defense' && isOffensiveSection && !isDefensiveSection);
                        
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
    const selectOffense = document.getElementById('coachingPlayerOffense');
    const selectDefense = document.getElementById('coachingPlayerDefense');
    
    selectOffense.innerHTML = '<option value="">Select an offensive player...</option>';
    selectDefense.innerHTML = '<option value="">Select a defensive player...</option>';
    
    selectedPlayers.forEach(playerId => {
        const player = getPlayerById(playerId);
        if (player) {
            const option = document.createElement('option');
            option.value = playerId;
            option.textContent = `${player.name} (${player.position})`;
            selectOffense.appendChild(option);
        }
    });
    
    selectedDefense.forEach(playerId => {
        const player = getPlayerById(playerId);
        if (player) {
            const option = document.createElement('option');
            option.value = playerId;
            option.textContent = `${player.name} (${player.position})`;
            selectDefense.appendChild(option);
        }
    });
    
    // Add character counters
    const textareaOffense = document.getElementById('coachingPointOffense');
    const textareaDefense = document.getElementById('coachingPointDefense');
    const countOffense = document.getElementById('coachingPointOffenseCount');
    const countDefense = document.getElementById('coachingPointDefenseCount');
    
    textareaOffense.addEventListener('input', () => {
        countOffense.textContent = textareaOffense.value.length;
    });
    
    textareaDefense.addEventListener('input', () => {
        countDefense.textContent = textareaDefense.value.length;
    });
}

// Execute play
async function executePlay() {
    const coachingPlayerIdOffense = document.getElementById('coachingPlayerOffense').value;
    const coachingPointOffense = document.getElementById('coachingPointOffense').value;
    const coachingPlayerIdDefense = document.getElementById('coachingPlayerDefense').value;
    const coachingPointDefense = document.getElementById('coachingPointDefense').value;
    
    // Validate character limits
    if (coachingPointOffense && coachingPointOffense.length > 50) {
        alert('Offensive coaching point must be 50 characters or less.');
        return;
    }
    if (coachingPointDefense && coachingPointDefense.length > 50) {
        alert('Defensive coaching point must be 50 characters or less.');
        return;
    }
    
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
        coachingPointOffense: coachingPlayerIdOffense && coachingPointOffense ? {
            player: getPlayerById(coachingPlayerIdOffense),
            point: coachingPointOffense
        } : null,
        coachingPointDefense: coachingPlayerIdDefense && coachingPointDefense ? {
            player: getPlayerById(coachingPlayerIdDefense),
            point: coachingPointDefense
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
${qb ? `${qb.position}: ${calculateEffectivePercentile(qb).toFixed(0)}th percentile${qb.stamina ? `, ${qb.stamina}% stamina` : ''}: ${playData.coachingPointOffense && playData.coachingPointOffense.player.name === qb.name ? `Coaching point: "${playData.coachingPointOffense.point}"` : 'Standard dropback'}` : 'No QB'}
${rb ? `${rb.position}: ${calculateEffectivePercentile(rb).toFixed(0)}th percentile${rb.stamina ? `, ${rb.stamina}% stamina` : ''}: ${assignments.offense[rb.name] || 'Standard assignment'}` : ''}

Second level summary:
${generateSecondLevelAnalysis(playData)}

Schematic Analysis:
${generateSchematicAnalysis(playData, advantage, passRushAdvantage)}

Key Matchups:
${generateKeyMatchups(playData)}

${playData.coachingPointOffense ? `Offensive Coaching Point: ${playData.coachingPointOffense.player.name} (${playData.coachingPointOffense.player.position}) - "${playData.coachingPointOffense.point}"` : ''}
${playData.coachingPointDefense ? `Defensive Coaching Point: ${playData.coachingPointDefense.player.name} (${playData.coachingPointDefense.player.position}) - "${playData.coachingPointDefense.point}"` : ''}

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
    let stunts = [];
    
    oline.forEach((ol, i) => {
        const dl = dline[i] || dline[0];
        const olPercentile = calculateEffectivePercentile(ol);
        const dlPercentile = dl ? calculateEffectivePercentile(dl) : 50;
        const stamina = ol.stamina ? `, ${ol.stamina}% stamina` : '';
        const assignment = assignments.offense[ol.name] || 'Standard block';
        analysis += `${ol.position}: ${olPercentile.toFixed(0)}th percentile${stamina}: ${assignment}\n`;
        if (dl) {
            const dlAssignment = assignments.defense[dl.name];
            const assignmentText = dlAssignment ? (dlAssignment.action || dlAssignment) : 'Standard rush';
            
            // Find player position to get technique
            let playerPos = null;
            let playerId = null;
            for (const id in playerPositions) {
                const p = getPlayerById(id);
                if (p && p.name === dl.name) {
                    playerPos = playerPositions[id];
                    playerId = id;
                    break;
                }
            }
            
            const technique = playerPos ? playerPos.location : 'Unknown';
            
            // Check for stunt (gap differs from technique default)
            if (dlAssignment && dlAssignment.action && playerPos) {
                const defaultGap = getDefaultGapFromLocation(technique, dl);
                const assignedGap = dlAssignment.action;
                
                if (defaultGap && assignedGap && defaultGap !== assignedGap && assignedGap.includes('gap')) {
                    stunts.push(`${dl.name} (${dl.position}) stunting from ${defaultGap} to ${assignedGap}`);
                }
            }
            
            analysis += `${dl.position} (${technique}): ${dlPercentile.toFixed(0)}th percentile: ${assignmentText}\n`;
        }
    });
    
    if (stunts.length > 0) {
        analysis += '\nStunts:\n';
        stunts.forEach(stunt => {
            analysis += `${stunt}\n`;
        });
    }
    
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
    // Determine play type (pass vs run) from assignments
    const qb = playData.offense.find(p => p.position === 'QB');
    const qbAssignment = qb ? (assignments.offense[qb.name] || '') : '';
    const isPass = qbAssignment && (
        qbAssignment.includes('Boot') || 
        qbAssignment.includes('drop') || 
        qbAssignment.includes('Play action') ||
        qbAssignment.includes('Pass')
    );
    const playType = isPass ? 'pass' : 'run';
    
    // Apply consecutive unsuccessful play boost
    let adjustedEvalData = { ...evalData };
    let penaltyYards = 0;
    if (gameState.consecutiveUnsuccessfulPlays >= 2 && gameState.down >= 3) {
        if (playType === 'pass') {
            // For passes: chance of defensive penalty or completion boost
            const penaltyRoll = Math.floor(Math.random() * 100) + 1;
            if (penaltyRoll <= 10) {
                penaltyYards = 5; // Defensive penalty
            } else if (penaltyRoll <= 18) {
                penaltyYards = 3; // Smaller penalty
            } else {
                // Boost completion chance
                adjustedEvalData['success-rate'] = Math.min(100, (evalData['success-rate'] || 45.0) + 30.0);
            }
        } else {
            // For runs: boost success rate slightly
            const conversionBoost = evalData['conversion-rate-1st-2nd-down-only'] || 31.0;
            adjustedEvalData['success-rate'] = Math.min(100, (evalData['success-rate'] || 45.0) + conversionBoost * 0.2);
        }
    }
    
    // Step 1: Roll 1-100 to determine basic play outcome (using adjusted LLM rates)
    const successRate = adjustedEvalData['success-rate'] || 45.0;
    const havocRate = adjustedEvalData['havoc-rate'] || 11.0;
    const explosiveRate = adjustedEvalData['explosive-rate'] || 13.0;
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
        // Roll 1-100 for YAC check (75% tackle chance for runs, 75% for passes)
        const yacRoll = Math.floor(Math.random() * 100) + 1;
        if (playType === 'pass') {
            if (yacRoll <= 75) {
                outcomeFile = await loadOutcomeFile('outcomes/successful-pass.json');
            } else {
                // YAC - use modified version with lower average for non-explosive
                const yacFile = await loadOutcomeFile('outcomes/yac-catch.json');
                if (yacFile) {
                    outcomeFile = { ...yacFile };
                    outcomeFile['average-yards-gained'] = 4.0;
                    outcomeFile['standard-deviation'] = 1.5;
                } else {
                    outcomeFile = await loadOutcomeFile('outcomes/successful-pass.json');
                }
            }
        } else {
            if (yacRoll <= 70) {
                outcomeFile = await loadOutcomeFile('outcomes/successful-run.json');
            } else {
                // YAC - use modified version with lower average for non-explosive
                const yacFile = await loadOutcomeFile('outcomes/yac-catch.json');
                if (yacFile) {
                    outcomeFile = { ...yacFile };
                    outcomeFile['average-yards-gained'] = 5.0;
                    outcomeFile['standard-deviation'] = 1.6;
                } else {
                    outcomeFile = await loadOutcomeFile('outcomes/successful-run.json');
                }
            }
        }
    } else {
        outcomeType = 'unsuccessful';
        if (playType === 'pass') {
            outcomeFile = await loadOutcomeFile('outcomes/unsuccessful-pass.json');
        } else {
            outcomeFile = await loadOutcomeFile('outcomes/unsuccessful-run.json');
        }
    }
    
    if (!outcomeFile) {
        console.error('Failed to load outcome file');
        return { outcome: 'error', yards: 0, evalData };
    }
    
    // Step 2: For passes, check completion percentage first
    let yards = 0;
    let isComplete = true;
    
    if (playType === 'pass' && outcomeFile['completion-percentage'] !== undefined) {
        // Roll for completion
        const completionRoll = Math.floor(Math.random() * 100) + 1;
        isComplete = completionRoll <= outcomeFile['completion-percentage'];
        
        if (isComplete) {
            // Calculate yards from distribution
            const yardsRoll = Math.floor(Math.random() * 100) + 1;
            yards = calculateYardsFromRoll(yardsRoll, outcomeFile);
        } else {
            // Incomplete pass - 0 yards
            yards = 0;
        }
    } else {
        // For runs or non-pass outcomes, calculate yards normally
        const yardsRoll = Math.floor(Math.random() * 100) + 1;
        yards = calculateYardsFromRoll(yardsRoll, outcomeFile);
    }
    
    // Add penalty yards if applicable
    yards += penaltyYards;
    
    // Step 3: Check for turnover
    const turnoverRoll = Math.floor(Math.random() * 100) + 1;
    const turnover = turnoverRoll <= (outcomeFile['turnover-probability'] || 0);
    
    // Update description for incomplete passes
    let description = outcomeFile.description.replace('{yards}', yards).replace('{yards-after-catch}', yards);
    if (playType === 'pass' && !isComplete) {
        description = 'The pass was incomplete. Yards: 0';
    }
    
    return { 
        outcome: outcomeFile.outcome, 
        outcomeType,
        yards, 
        turnover,
        turnoverType: outcomeFile['turnover-type'],
        description: description,
        isComplete: isComplete,
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
    
    // Track consecutive unsuccessful plays
    if (result.outcomeType === 'unsuccessful' || (result.yards < 3 && result.outcomeType !== 'explosive')) {
        gameState.consecutiveUnsuccessfulPlays = (gameState.consecutiveUnsuccessfulPlays || 0) + 1;
    } else {
        gameState.consecutiveUnsuccessfulPlays = 0;
    }
    
    if (result.yards >= gameState.distance) {
        gameState.down = 1;
        gameState.distance = 10;
        gameState.consecutiveUnsuccessfulPlays = 0; // Reset on first down
    } else {
        gameState.distance -= result.yards;
    }
    
    if (gameState.down > 4) {
        gameState.down = 1;
        gameState.distance = 10;
        gameState.consecutiveUnsuccessfulPlays = 0; // Reset on turnover on downs
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

