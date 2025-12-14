// Global state
let gameState = {};
let rosters = { 
    'home-offense': [], 
    'home-defense': [], 
    'away-offense': [], 
    'away-defense': [] 
};
let fieldLocations = [];
let selectedPlayers = []; // 11 offensive players selected
let selectedDefense = []; // 11 defensive players selected
let lastSelectedPlayers = []; // Last 11 offensive players chosen (for default)
let lastSelectedDefense = []; // Last 11 defensive players chosen (for default)
let playerPositions = {}; // { playerId: { x, y, location } }
let assignments = { offense: {}, defense: {} };
let currentStep = 0; // Start at step 0 (special teams)
let stateMachine = {};
let outcomeFiles = {}; // Cache for loaded outcome files
let baselineRates = null; // Baseline rates from eval-format.json

// Initialize
async function init() {
    try {
        console.log('Initializing application...');
        await loadGameState();
        await loadRosters();
        await loadFieldLocations();
        await loadStateMachine();
        await loadBaselineRates();
        
        console.log('Rosters loaded:', {
            'home-offense': rosters['home-offense'].length,
            'home-defense': rosters['home-defense'].length,
            'away-offense': rosters['away-offense'].length,
            'away-defense': rosters['away-defense'].length
        });
        
        renderStep(0);
        updateGameStateDisplay();
        console.log('Initialization complete');
    } catch (error) {
        console.error('Error during initialization:', error);
    }
}

// Load baseline rates
async function loadBaselineRates() {
    try {
        const response = await fetch('context/eval-format.json');
        baselineRates = await response.json();
    } catch (error) {
        console.error('Error loading baseline rates:', error);
        // Default baseline rates
        baselineRates = {
            "success-rate": 43.0,
            "havoc-rate": 12.0,
            "explosive-rate": 10.0
        };
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
        
        // Load all four rosters
        const homeOffenseResponse = await fetch('rosters/home-offense.json');
        if (!homeOffenseResponse.ok) {
            throw new Error(`Failed to load home offense roster: ${homeOffenseResponse.status}`);
        }
        rosters['home-offense'] = await homeOffenseResponse.json();
        console.log(`Loaded ${rosters['home-offense'].length} home offensive players`);
        
        const homeDefenseResponse = await fetch('rosters/home-defense.json');
        if (!homeDefenseResponse.ok) {
            throw new Error(`Failed to load home defense roster: ${homeDefenseResponse.status}`);
        }
        rosters['home-defense'] = await homeDefenseResponse.json();
        console.log(`Loaded ${rosters['home-defense'].length} home defensive players`);
        
        const awayOffenseResponse = await fetch('rosters/away-offense.json');
        if (!awayOffenseResponse.ok) {
            throw new Error(`Failed to load away offense roster: ${awayOffenseResponse.status}`);
        }
        rosters['away-offense'] = await awayOffenseResponse.json();
        console.log(`Loaded ${rosters['away-offense'].length} away offensive players`);
        
        const awayDefenseResponse = await fetch('rosters/away-defense.json');
        if (!awayDefenseResponse.ok) {
            throw new Error(`Failed to load away defense roster: ${awayDefenseResponse.status}`);
        }
        rosters['away-defense'] = await awayDefenseResponse.json();
        console.log(`Loaded ${rosters['away-defense'].length} away defensive players`);
        
        // Render after a short delay to ensure DOM is ready
        setTimeout(() => {
            updateRostersForPossession();
            renderPersonnelSelection();
            updatePersonnelDisplay();
        }, 100);
    } catch (error) {
        console.error('Error loading rosters:', error);
        const isFileProtocol = window.location.protocol === 'file:';
        const errorMsg = isFileProtocol 
            ? `CORS Error: Cannot load files with file:// protocol.\n\nPlease use a web server:\n- Python: python -m http.server 8000\n- Node: npx serve\n- VS Code: Use Live Server extension\n\nThen open http://localhost:8000`
            : `Failed to load rosters: ${error.message}\n\nPlease check:\n1. All roster files exist (home-offense.json, home-defense.json, away-offense.json, away-defense.json)\n2. You're using a web server (not file://)`;
        alert(errorMsg);
    }
}

// Update which rosters are active based on possession
function updateRostersForPossession() {
    const possession = gameState.possession || 'home';
    // The team with the ball uses their offense, the other team uses their defense
    if (possession === 'home') {
        rosters.offense = rosters['home-offense'];
        rosters.defense = rosters['away-defense'];
    } else {
        rosters.offense = rosters['away-offense'];
        rosters.defense = rosters['home-defense'];
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

// Global helper to get location coordinates
function getLocationCoords(locationName) {
    if (!fieldLocations || !locationName) return null;
    for (const section of fieldLocations) {
        for (const loc of section.Locations) {
            if (loc.Name === locationName) {
                return { x: loc.X, y: loc.Y };
            }
        }
    }
    return null;
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
    
    // Scale canvas to container - zoom IN horizontally: map -19 to +19 to full width (Max split at edges)
    const dpr = window.devicePixelRatio || 1;
    const rawWidth = container.offsetWidth;
    const rawHeight = container.offsetHeight;
    const canvasWidth = rawWidth; // Full width
    const canvasHeight = rawHeight * 0.97; // Crop 3% from bottom
    canvas.width = rawWidth * dpr;
    canvas.height = rawHeight * dpr;
    canvas.style.width = rawWidth + 'px';
    canvas.style.height = rawHeight + 'px';
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
                // Map field coordinates -19.5 to +19.5 to 0 to canvasWidth (Max split at edges) - ZOOM IN
                const x = ((location.X + 19.5) / 39) * canvasWidth;
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
    
    // Reset transform
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    
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
        'LB': { category: 'Zone Short', action: 'Hook' },
        'MLB': { category: 'Zone Short', action: 'Hook' },
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
        'LB': { category: 'Zone Short', action: 'Curtain' },
        'MLB': { category: 'Zone Short', action: 'Curtain' },
        'DE': { category: 'Rush', action: 'Contain' },
        'DT': { category: 'Rush', action: 'Left B gap' }
    },
    'Cover 4 (prevent)': {
        'CB': { category: 'Zone Deep', action: 'Deep far left (4)' },
        'S': { category: 'Zone Deep', action: 'Deep middle 1/3' },
        'LB': { category: 'Zone Short', action: 'Curtain' },
        'MLB': { category: 'Zone Short', action: 'Curtain' },
        'DE': { category: 'Rush', action: 'Contain' },
        'DT': { category: 'Rush', action: 'Left B gap' }
    },
    'Cover 4 (match)': {
        'CB': { category: 'Zone Deep', action: 'Deep seam left (4)' },
        'S': { category: 'Zone Deep', action: 'Deep middle 1/3' },
        'LB': { category: 'Zone Short', action: 'Hook' },
        'MLB': { category: 'Zone Short', action: 'Hook' },
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
    'Zone Short': ['Flat', 'Hook', 'Curtain', 'Robber', 'Spy'],
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
        // Offense Y values are negative (-3 at LOS to -15 deepest), map to bottom half
        // We want: Y=-3 → height/2 (line of scrimmage), Y=-15 → height (bottom)
        const offenseMinY = -15; // Deepest
        const offenseMaxY = -3;  // LOS
        const offenseYRange = offenseMaxY - offenseMinY; // -3 - (-15) = 12
        // Normalize: (y - min) / range gives 0 to 1, where y=-3 gives 0, y=-15 gives 1
        // But we want y=-3 to be at bottomHalfStart and y=-15 to be at height
        const normalizedY = (locCoords.y - offenseMinY) / offenseYRange; // -3 gives 1, -15 gives 0
        const diagramY = bottomHalfStart + (bottomHalfHeight * (1 - normalizedY)); // Flip so -3 is at start, -15 is at end
        
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
                        // Convert Y: Offense goes in bottom half
                        const offenseMinY = -15; // Deepest
                        const offenseMaxY = -3;  // LOS
                        const offenseYRange = offenseMaxY - offenseMinY; // 12
                        const normalizedY = (locCoords.y - offenseMinY) / offenseYRange;
                        const targetY = bottomHalfStart + (bottomHalfHeight * (1 - normalizedY));
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
            } else if (assignment.category === 'Zone Short' || 
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
    
    // Prioritize safeties for deep zones, then CBs
    const safeties = playersByPosition['S'];
    const cbs = playersByPosition['CB'];
    const deepZonePlayers = [...safeties, ...cbs]; // Safeties first
    
    // Assign deep zones to safeties first, then CBs
    deepZones.forEach((zone, index) => {
        if (index < deepZonePlayers.length) {
            const player = deepZonePlayers[index];
            updateAssignment(player, 'defense', 'Zone Deep', zone);
        }
    });
    
    // Track which DBs got deep zones
    const deepZoneAssigned = deepZonePlayers.slice(0, deepZones.length);
    
    // Remaining DBs get man (Cover 0/1) or zone short (Cover 2-4)
    const allDBs = [...safeties, ...cbs];
    const remainingDBs = allDBs.filter(db => !deepZoneAssigned.includes(db));
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
                updateAssignment(lb, 'defense', 'Zone Short', 'Hook');
            }
        });
    } else {
        // Zone short for LBs
        allLBs.forEach((lb) => {
            updateAssignment(lb, 'defense', 'Zone Short', 'Hook');
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
    for (let i = 0; i <= 5; i++) {
        const stepEl = document.getElementById(`step${i}`);
        if (stepEl) {
            stepEl.classList.add('hidden');
        }
        const indicatorEl = document.querySelector(`.step[data-step="${i}"]`);
        if (indicatorEl) {
            indicatorEl.classList.remove('active', 'completed');
        }
    }
    
    // Check if we should show special teams on 4th down
    if (step === 0 && gameState.down === 4) {
        // Show step 0 for special teams
    } else if (step === 0 && gameState.down !== 4) {
        // Skip to step 1 if not 4th down
        renderStep(1);
        return;
    }
    
    // Show current step
    const currentStepEl = document.getElementById(`step${step}`);
    if (currentStepEl) {
        currentStepEl.classList.remove('hidden');
    }
    const currentIndicatorEl = document.querySelector(`.step[data-step="${step}"]`);
    if (currentIndicatorEl) {
        currentIndicatorEl.classList.add('active');
    }
    
    // Mark previous steps as completed
    for (let i = 0; i < step; i++) {
        const prevIndicatorEl = document.querySelector(`.step[data-step="${i}"]`);
        if (prevIndicatorEl) {
            prevIndicatorEl.classList.add('completed');
        }
    }
    
    currentStep = step;
    
    // Render step-specific content
    if (step === 2) {
        renderField();
        renderFormationMenu();
        prePopulateOffensiveLine();
        renderFormationDropdowns();
    } else if (step === 4) {
        renderAssignments();
    } else if (step === 5) {
        renderCoachingPoints();
    }
    
    // Always update personnel display
    updatePersonnelDisplay();
}

function renderFormationDropdowns() {
    const offenseSelect = document.getElementById('offensiveFormationSelect');
    const defenseSelect = document.getElementById('defensiveFormationSelect');
    
    if (offenseSelect) {
        // Only populate if empty
        if (offenseSelect.options.length <= 1) {
            Object.keys(offensiveFormations).forEach(name => {
                const option = document.createElement('option');
                option.value = name;
                option.textContent = name;
                offenseSelect.appendChild(option);
            });
        }
        
        // Add event listener if not already added
        if (!offenseSelect.dataset.listenerAdded) {
            offenseSelect.addEventListener('change', (e) => {
                if (e.target.value) {
                    applyOffensiveFormation(e.target.value);
                }
            });
            offenseSelect.dataset.listenerAdded = 'true';
        }
    }
    
    if (defenseSelect) {
        // Count DTs in selected defense
        const dtCount = selectedDefense.filter(id => {
            const player = getPlayerById(id);
            return player && player.position === 'DT';
        }).length;
        
        // Filter formations based on DT count
        // 1 DT = 3-4 formations, 2 DTs = 4-3 formations
        const filteredFormations = Object.keys(defensiveFormations).filter(name => {
            if (dtCount === 1) {
                return name.startsWith('3-4');
            } else if (dtCount === 2) {
                return name.startsWith('4-3');
            }
            // If no DTs or more than 2, show all (shouldn't happen in normal play)
            return true;
        });
        
        // Clear and repopulate dropdown
        defenseSelect.innerHTML = '<option value="">Select formation...</option>';
        filteredFormations.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            defenseSelect.appendChild(option);
        });
        
        // Add event listener if not already added
        if (!defenseSelect.dataset.listenerAdded) {
            defenseSelect.addEventListener('change', (e) => {
                if (e.target.value) {
                    applyDefensiveFormation(e.target.value);
                }
            });
            defenseSelect.dataset.listenerAdded = 'true';
        }
    }
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
    
    // Map field coordinates -19.5 to +19.5 to 0 to canvasWidth (Max split at edges) - ZOOM IN
    const effectiveHeight = canvasHeight * 0.97;
    // Map -19.5 to +19.5 range (39 units) to full canvas width
    const x = ((location.x + 19.5) / 39) * canvasWidth;
    const y = (effectiveHeight / 2) - (location.y * 15);
    
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
    
    // Pre-populate all offensive players - assign ALL 11
    const qbs = selectedPlayers.filter(id => {
        const p = getPlayerById(id);
        return p && p.position === 'QB';
    });
    const rbs = selectedPlayers.filter(id => {
        const p = getPlayerById(id);
        return p && p.position === 'RB';
    });
    const oline = selectedPlayers.filter(id => {
        const p = getPlayerById(id);
        return p && ['OT', 'OG', 'C'].includes(p.position);
    });
    const tes = selectedPlayers.filter(id => {
        const p = getPlayerById(id);
        return p && p.position === 'TE';
    });
    const wrs = selectedPlayers.filter(id => {
        const p = getPlayerById(id);
        return p && p.position === 'WR';
    });
    
    // Track assignments
    let olIndex = 0;
    let teIndex = 0;
    let wrIndex = 0;
    
    selectedPlayers.forEach((playerId) => {
        if (playerPositions[playerId]) return; // Skip if already placed
        
        const player = getPlayerById(playerId);
        if (!player) return;
        
        let position = null;
        
        // Position players based on their role
        if (player.position === 'QB') {
            position = { name: 'QB (Shotgun)', x: 0, y: -10, section: 'Offensive backfield' };
        } else if (player.position === 'RB') {
            position = { name: 'Behind QB (Shotgun)', x: 0, y: -15, section: 'Offensive backfield' };
        } else if (['OT', 'OG', 'C'].includes(player.position)) {
            const olOrder = ['C', 'OG', 'OG', 'OT', 'OT'];
            const positionIndex = olOrder.indexOf(player.position);
            if (positionIndex >= 0) {
                const samePositionCount = selectedPlayers.filter(id => {
                    const p = getPlayerById(id);
                    return p && p.position === player.position && selectedPlayers.indexOf(id) < selectedPlayers.indexOf(playerId);
                }).length;
                
                let olArrayIndex = -1;
                let foundCount = 0;
                for (let i = 0; i < olOrder.length; i++) {
                    if (olOrder[i] === player.position) {
                        if (foundCount === samePositionCount) {
                            olArrayIndex = i;
                            break;
                        }
                        foundCount++;
                    }
                }
                
                const olPositions = [
                    { name: 'Center', x: 0, y: -3 },
                    { name: 'Left Guard', x: -2, y: -3 },
                    { name: 'Right Guard', x: 2, y: -3 },
                    { name: 'Left Tackle', x: -4, y: -3 },
                    { name: 'Right Tackle', x: 4, y: -3 }
                ];
                
                if (olArrayIndex >= 0 && olArrayIndex < olPositions.length) {
                    position = { ...olPositions[olArrayIndex], section: 'Offensive line of scrimmage' };
                }
            }
        } else if (player.position === 'TE') {
            const tePositions = [
                { name: 'Wing left', x: -6, y: -3 },
                { name: 'Tight left', x: -5, y: -3 },
                { name: 'Tight right', x: 5, y: -3 }
            ];
            if (teIndex < tePositions.length) {
                position = { ...tePositions[teIndex], section: 'Offensive line of scrimmage' };
                teIndex++;
            } else {
                // Extra TE - put in WR spot
                const wrPositions = [
                    { name: 'Slot left', x: -10, y: -3 },
                    { name: 'Slot right', x: 10, y: -3 }
                ];
                position = { ...wrPositions[(teIndex - tePositions.length) % wrPositions.length], section: 'Offensive line of scrimmage' };
            }
        } else if (player.position === 'WR') {
            const wrPositions = [
                { name: 'Max split left', x: -18, y: -3 },
                { name: 'Max split right', x: 18, y: -3 },
                { name: 'Wide left', x: -14, y: -3 },
                { name: 'Wide right', x: 14, y: -3 },
                { name: 'Slot left', x: -10, y: -3 },
                { name: 'Slot right', x: 10, y: -3 }
            ];
            if (wrIndex < wrPositions.length) {
                position = { ...wrPositions[wrIndex], section: 'Offensive line of scrimmage' };
                wrIndex++;
            } else {
                // Extra WR - spread out
                position = { name: 'Seam left', x: -8, y: -3, section: 'Offensive line of scrimmage' };
            }
        }
        
        // Default fallback
        if (!position) {
            position = { name: 'Slot left', x: -10, y: -3, section: 'Offensive line of scrimmage' };
        }
        
        // Map field coordinates -19.5 to +19.5 to 0 to canvasWidth (Max split at edges) - ZOOM IN
        const effectiveHeight = canvasHeight * 0.97;
        // Map -19.5 to +19.5 range (39 units) to full canvas width
        const x = ((position.x + 19.5) / 39) * canvasWidth;
        const y = (effectiveHeight / 2) - (position.y * 15);
        
        playerPositions[playerId] = {
            x: x,
            y: y,
            location: position.name,
            section: position.section,
            isOffsides: false
        };
    });
    
    // Pre-populate all defensive players - assign ALL 11
    const des = selectedDefense.filter(id => {
        const p = getPlayerById(id);
        return p && p.position === 'DE';
    });
    const dts = selectedDefense.filter(id => {
        const p = getPlayerById(id);
        return p && p.position === 'DT';
    });
    const lbs = selectedDefense.filter(id => {
        const p = getPlayerById(id);
        return p && ['LB', 'MLB'].includes(p.position);
    });
    const cbs = selectedDefense.filter(id => {
        const p = getPlayerById(id);
        return p && p.position === 'CB';
    });
    const safeties = selectedDefense.filter(id => {
        const p = getPlayerById(id);
        return p && p.position === 'S';
    });
    
    // Track assignments
    let deIndex = 0;
    let dtIndex = 0;
    let lbIndex = 0;
    let cbIndex = 0;
    let sIndex = 0;
    let extraDBIndex = 0; // For nickel/dime DBs
    
    const nickelDimePositions = [
        { name: 'Slot left', x: -10, y: 5, section: 'Coverage second level' },
        { name: 'Slot right', x: 10, y: 5, section: 'Coverage second level' },
        { name: 'Seam left', x: -8, y: 5, section: 'Coverage second level' },
        { name: 'Seam right', x: 8, y: 5, section: 'Coverage second level' }
    ];
    
    selectedDefense.forEach((playerId) => {
        if (playerPositions[playerId]) return; // Skip if already placed
        
        const player = getPlayerById(playerId);
        if (!player) return;
        
        let position = null;
        
        if (player.position === 'DE') {
            const dePositions = [
                { name: 'Left 5 technique', x: -4.5, y: 2.5 },
                { name: 'Right 5 technique', x: 4.5, y: 2.5 }
            ];
            if (deIndex < dePositions.length) {
                position = { ...dePositions[deIndex], section: 'Defensive line of scrimmage' };
                deIndex++;
            } else {
                // Extra DE
                position = { name: 'Left 4 technique', x: -4, y: 2.5, section: 'Defensive line of scrimmage' };
            }
        } else if (player.position === 'DT') {
            const dtPositions = [
                { name: 'Left 3 technique', x: -3, y: 2.5 },
                { name: 'Right 3 technique', x: 3, y: 2.5 }
            ];
            if (dtIndex < dtPositions.length) {
                position = { ...dtPositions[dtIndex], section: 'Defensive line of scrimmage' };
                dtIndex++;
            } else {
                // Extra DT
                position = { name: '0 technique', x: 0, y: 2.5, section: 'Defensive line of scrimmage' };
            }
        } else if (['LB', 'MLB'].includes(player.position)) {
            const lbPositions = [
                { name: 'Left B gap (shallow)', x: -3, y: 6 },
                { name: 'Right B gap (shallow)', x: 3, y: 6 },
                { name: 'Over Center (shallow)', x: 0, y: 6 }
            ];
            if (lbIndex < lbPositions.length) {
                position = { ...lbPositions[lbIndex], section: 'Defensive backfield' };
                lbIndex++;
            } else {
                // Extra LB
                const extraLB = [
                    { name: 'Left A gap (shallow)', x: -1, y: 6 },
                    { name: 'Right A gap (shallow)', x: 1, y: 6 }
                ];
                position = { ...extraLB[(lbIndex - lbPositions.length) % extraLB.length], section: 'Defensive backfield' };
            }
        } else if (player.position === 'CB') {
            const cbPositions = [
                { name: 'Seam left', x: -12, y: 12 },
                { name: 'Seam right', x: 12, y: 12 }
            ];
            if (cbIndex < cbPositions.length) {
                position = { ...cbPositions[cbIndex], section: 'Max depth' };
                cbIndex++;
            } else {
                // Extra CB (nickel/dime) - assign to slot
                if (extraDBIndex < nickelDimePositions.length) {
                    position = nickelDimePositions[extraDBIndex];
                    extraDBIndex++;
                } else {
                    position = { name: 'Slot left', x: -10, y: 5, section: 'Coverage second level' };
                }
            }
        } else if (player.position === 'S') {
            const sPositions = [
                { name: 'Deep middle 1/3', x: 0, y: 15 },
                { name: 'Deep left', x: -8, y: 12 }
            ];
            if (sIndex < sPositions.length) {
                position = { ...sPositions[sIndex], section: 'Max depth' };
                sIndex++;
            } else {
                // Extra S (big nickel/dime) - assign to slot
                if (extraDBIndex < nickelDimePositions.length) {
                    position = nickelDimePositions[extraDBIndex];
                    extraDBIndex++;
                } else {
                    position = { name: 'Slot right', x: 10, y: 5, section: 'Coverage second level' };
                }
            }
        }
        
        // Default fallback
        if (!position) {
            position = { name: 'Over Center (shallow)', x: 0, y: 6, section: 'Defensive backfield' };
        }
        
        // Map field coordinates -19.5 to +19.5 to 0 to canvasWidth (Max split at edges) - ZOOM IN
        const effectiveHeight = canvasHeight * 0.97;
        // Map -19.5 to +19.5 range (39 units) to full canvas width
        const x = ((position.x + 19.5) / 39) * canvasWidth;
        const y = (effectiveHeight / 2) - (position.y * 15);
        
        playerPositions[playerId] = {
            x: x,
            y: y,
            location: position.name,
            section: position.section,
            isOffsides: false
        };
    });
    
    renderField();
    renderPlayerMarkers();
}

// Formation definitions
const offensiveFormations = {
    'Gun Spread': {
        QB: { name: 'QB (Shotgun)', x: 0, y: -10 },
        RB: { name: 'Behind QB (Shotgun)', x: 0, y: -13 },
        WR: [
            { name: 'Max split left', x: -18, y: -3 },
            { name: 'Max split right', x: 18, y: -3 },
            { name: 'Slot left', x: -10, y: -3 }
        ],
        TE: [],
        OL: [
            { name: 'Left Tackle', x: -4, y: -3 },
            { name: 'Left Guard', x: -2, y: -3 },
            { name: 'Center', x: 0, y: -3 },
            { name: 'Right Guard', x: 2, y: -3 },
            { name: 'Right Tackle', x: 4, y: -3 }
        ]
    },
    'Gun Trips': {
        QB: { name: 'QB (Shotgun)', x: 0, y: -10 },
        RB: { name: 'Behind QB (Shotgun)', x: 0, y: -13 },
        WR: [
            { name: 'Max split right', x: 18, y: -3 },
            { name: 'Trips left', x: -12, y: -5 },
            { name: 'Wide left', x: -14, y: -3 },
            { name: 'Slot left', x: -10, y: -3 }
        ],
        TE: [],
        OL: [
            { name: 'Left Tackle', x: -4, y: -3 },
            { name: 'Left Guard', x: -2, y: -3 },
            { name: 'Center', x: 0, y: -3 },
            { name: 'Right Guard', x: 2, y: -3 },
            { name: 'Right Tackle', x: 4, y: -3 }
        ]
    },
    'Gun Bunch': {
        QB: { name: 'QB (Shotgun)', x: 0, y: -10 },
        RB: { name: 'Behind QB (Shotgun)', x: 0, y: -13 },
        WR: [
            { name: 'Max split left', x: -18, y: -3 },
            { name: 'Seam left', x: -8, y: -3 },
            { name: 'Slot left', x: -10, y: -3 }
        ],
        TE: [
            { name: 'Wing left', x: -8, y: -3 }
        ],
        OL: [
            { name: 'Left Tackle', x: -4, y: -3 },
            { name: 'Left Guard', x: -2, y: -3 },
            { name: 'Center', x: 0, y: -3 },
            { name: 'Right Guard', x: 2, y: -3 },
            { name: 'Right Tackle', x: 4, y: -3 }
        ]
    },
    'Gun Empty': {
        QB: { name: 'QB (Shotgun)', x: 0, y: -10 },
        RB: null,
        WR: [
            { name: 'Max split left', x: -18, y: -3 },
            { name: 'Wide left', x: -14, y: -3 },
            { name: 'Wide right', x: 14, y: -3 },
            { name: 'Max split right', x: 18, y: -3 },
            { name: 'Slot left', x: -10, y: -3 }
        ],
        TE: [],
        OL: [
            { name: 'Left Tackle', x: -4, y: -3 },
            { name: 'Left Guard', x: -2, y: -3 },
            { name: 'Center', x: 0, y: -3 },
            { name: 'Right Guard', x: 2, y: -3 },
            { name: 'Right Tackle', x: 4, y: -3 }
        ]
    },
    'Pistol': {
        QB: { name: 'QB (Pistol)', x: 0, y: -8 },
        RB: { name: 'Behind QB (Shotgun)', x: 0, y: -13 },
        WR: [
            { name: 'Max split left', x: -18, y: -3 },
            { name: 'Max split right', x: 18, y: -3 },
            { name: 'Slot left', x: -10, y: -3 }
        ],
        TE: [],
        OL: [
            { name: 'Left Tackle', x: -4, y: -3 },
            { name: 'Left Guard', x: -2, y: -3 },
            { name: 'Center', x: 0, y: -3 },
            { name: 'Right Guard', x: 2, y: -3 },
            { name: 'Right Tackle', x: 4, y: -3 }
        ]
    },
    'I-Formation': {
        QB: { name: 'QB (Under center)', x: 0, y: -5 },
        RB: { name: 'Behind QB (I-formation)', x: 0, y: -9 },
        WR: [
            { name: 'Max split left', x: -18, y: -3 },
            { name: 'Max split right', x: 19, y: -3 }
        ],
        TE: [
            { name: 'Tight left', x: -5, y: -3 }
        ],
        OL: [
            { name: 'Left Tackle', x: -4, y: -3 },
            { name: 'Left Guard', x: -2, y: -3 },
            { name: 'Center', x: 0, y: -3 },
            { name: 'Right Guard', x: 2, y: -3 },
            { name: 'Right Tackle', x: 4, y: -3 }
        ]
    },
    'Pro Set': {
        QB: { name: 'QB (Under center)', x: 0, y: -5 },
        RB: { name: 'T-left (Shotgun)', x: -3, y: -13 },
        WR: [
            { name: 'Max split left', x: -18, y: -3 },
            { name: 'Max split right', x: 19, y: -3 }
        ],
        TE: [
            { name: 'Tight left', x: -5, y: -3 }
        ],
        OL: [
            { name: 'Left Tackle', x: -4, y: -3 },
            { name: 'Left Guard', x: -2, y: -3 },
            { name: 'Center', x: 0, y: -3 },
            { name: 'Right Guard', x: 2, y: -3 },
            { name: 'Right Tackle', x: 4, y: -3 }
        ]
    },
    'Wing T': {
        QB: { name: 'QB (Under center)', x: 0, y: -5 },
        RB: { name: 'Behind QB (I-formation)', x: 0, y: -9 },
        WR: [
            { name: 'Max split left', x: -18, y: -3 },
            { name: 'Max split right', x: 19, y: -3 }
        ],
        TE: [
            { name: 'Wing left', x: -6, y: -3 },
            { name: 'Tight right', x: 5, y: -3 }
        ],
        OL: [
            { name: 'Left Tackle', x: -4, y: -3 },
            { name: 'Left Guard', x: -2, y: -3 },
            { name: 'Center', x: 0, y: -3 },
            { name: 'Right Guard', x: 2, y: -3 },
            { name: 'Right Tackle', x: 4, y: -3 }
        ]
    },
    'Ace': {
        QB: { name: 'QB (Under center)', x: 0, y: -5 },
        RB: { name: 'T-right (Shotgun)', x: 3, y: -13 },
        WR: [
            { name: 'Max split left', x: -18, y: -3 },
            { name: 'Max split right', x: 18, y: -3 },
            { name: 'Slot left', x: -10, y: -3 }
        ],
        TE: [
            { name: 'Tight right', x: 5, y: -3 }
        ],
        OL: [
            { name: 'Left Tackle', x: -4, y: -3 },
            { name: 'Left Guard', x: -2, y: -3 },
            { name: 'Center', x: 0, y: -3 },
            { name: 'Right Guard', x: 2, y: -3 },
            { name: 'Right Tackle', x: 4, y: -3 }
        ]
    },
    'Wildcat': {
        QB: null,
        RB: { name: 'QB (Shotgun)', x: 0, y: -10 },
        WR: [
            { name: 'Max split left', x: -18, y: -3 },
            { name: 'Max split right', x: 18, y: -3 },
            { name: 'Slot left', x: -10, y: -3 }
        ],
        TE: [
            { name: 'Tight right', x: 5, y: -3 }
        ],
        OL: [
            { name: 'Left Tackle', x: -4, y: -3 },
            { name: 'Left Guard', x: -2, y: -3 },
            { name: 'Center', x: 0, y: -3 },
            { name: 'Right Guard', x: 2, y: -3 },
            { name: 'Right Tackle', x: 4, y: -3 }
        ]
    }
};

const defensiveFormations = {
    '4-3 Even (2-high)': {
        DL: [
            { name: 'Left 5 technique', x: -4.5, y: 2.5 },
            { name: 'Left 2i technique', x: -1.5, y: 2.5 },
            { name: 'Right 2i technique', x: 1.5, y: 2.5 },
            { name: 'Right 5 technique', x: 4.5, y: 2.5 }
        ],
        LB: [
            { name: 'Left B gap (shallow)', x: -3, y: 6 },
            { name: 'Over Center (shallow)', x: 0, y: 6 },
            { name: 'Right B gap (shallow)', x: 3, y: 6 }
        ],
        CB: [
            { name: 'Seam left', x: -12, y: 12 },
            { name: 'Seam right', x: 12, y: 12 }
        ],
        S: [
            { name: 'Deep left', x: -8, y: 12 },
            { name: 'Deep right', x: 8, y: 12 }
        ]
    },
    '4-3 Even (1-high)': {
        DL: [
            { name: 'Left 5 technique', x: -4.5, y: 2.5 },
            { name: 'Left 2i technique', x: -1.5, y: 2.5 },
            { name: 'Right 2i technique', x: 1.5, y: 2.5 },
            { name: 'Right 5 technique', x: 4.5, y: 2.5 }
        ],
        LB: [
            { name: 'Left B gap (shallow)', x: -3, y: 6 },
            { name: 'Over Center (shallow)', x: 0, y: 6 },
            { name: 'Right B gap (shallow)', x: 3, y: 6 }
        ],
        CB: [
            { name: 'Seam left', x: -12, y: 12 },
            { name: 'Seam right', x: 12, y: 12 }
        ],
        S: [
            { name: 'Deep middle 1/3', x: 0, y: 15 },
            { name: 'Left B gap (deep)', x: -3, y: 8.5 }
        ]
    },
    '4-3 Bear (2-high)': {
        DL: [
            { name: 'Left 5 technique', x: -4.5, y: 2.5 },
            { name: 'Left 1 technique', x: -1, y: 2.5 },
            { name: 'Right 3 technique', x: 3, y: 2.5 },
            { name: 'Right 5 technique', x: 4.5, y: 2.5 }
        ],
        LB: [
            { name: 'Left B gap (shallow)', x: -3, y: 6 },
            { name: 'Over Center (shallow)', x: 0, y: 6 },
            { name: 'Right B gap (shallow)', x: 3, y: 6 }
        ],
        CB: [
            { name: 'Seam left', x: -12, y: 12 },
            { name: 'Seam right', x: 12, y: 12 }
        ],
        S: [
            { name: 'Deep left', x: -8, y: 12 },
            { name: 'Deep right', x: 8, y: 12 }
        ]
    },
    '4-3 Bear (1-high)': {
        DL: [
            { name: 'Left 5 technique', x: -4.5, y: 2.5 },
            { name: 'Left 1 technique', x: -1, y: 2.5 },
            { name: 'Right 3 technique', x: 3, y: 2.5 },
            { name: 'Right 5 technique', x: 4.5, y: 2.5 }
        ],
        LB: [
            { name: 'Left B gap (shallow)', x: -3, y: 6 },
            { name: 'Over Center (shallow)', x: 0, y: 6 },
            { name: 'Right B gap (shallow)', x: 3, y: 6 }
        ],
        CB: [
            { name: 'Seam left', x: -12, y: 12 },
            { name: 'Seam right', x: 12, y: 12 }
        ],
        S: [
            { name: 'Deep middle 1/3', x: 0, y: 15 },
            { name: 'Left B gap (deep)', x: -3, y: 8.5 }
        ]
    },
    '4-3 Over (2-high)': {
        DL: [
            { name: 'Left 5 technique', x: -4.5, y: 2.5 },
            { name: 'Left 3 technique', x: -3, y: 2.5 },
            { name: 'Right 1 technique', x: 1, y: 2.5 },
            { name: 'Right 5 technique', x: 4.5, y: 2.5 }
        ],
        LB: [
            { name: 'Left B gap (shallow)', x: -3, y: 6 },
            { name: 'Over Center (shallow)', x: 0, y: 6 },
            { name: 'Right B gap (shallow)', x: 3, y: 6 }
        ],
        CB: [
            { name: 'Seam left', x: -12, y: 12 },
            { name: 'Seam right', x: 12, y: 12 }
        ],
        S: [
            { name: 'Deep left', x: -8, y: 12 },
            { name: 'Deep right', x: 8, y: 12 }
        ]
    },
    '4-3 Over (1-high)': {
        DL: [
            { name: 'Left 5 technique', x: -4.5, y: 2.5 },
            { name: 'Left 3 technique', x: -3, y: 2.5 },
            { name: 'Right 1 technique', x: 1, y: 2.5 },
            { name: 'Right 5 technique', x: 4.5, y: 2.5 }
        ],
        LB: [
            { name: 'Left B gap (shallow)', x: -3, y: 6 },
            { name: 'Over Center (shallow)', x: 0, y: 6 },
            { name: 'Right B gap (shallow)', x: 3, y: 6 }
        ],
        CB: [
            { name: 'Seam left', x: -12, y: 12 },
            { name: 'Seam right', x: 12, y: 12 }
        ],
        S: [
            { name: 'Deep middle 1/3', x: 0, y: 15 },
            { name: 'Left B gap (deep)', x: -3, y: 8.5 }
        ]
    },
    '4-3 Under (2-high)': {
        DL: [
            { name: 'Left 4i technique', x: -3.5, y: 2.5 },
            { name: '0 technique', x: 0, y: 2.5 },
            { name: 'Right 3 technique', x: 3, y: 2.5 },
            { name: 'Right 5 technique', x: 4.5, y: 2.5 }
        ],
        LB: [
            { name: 'Left B gap (shallow)', x: -3, y: 6 },
            { name: 'Over Center (shallow)', x: 0, y: 6 },
            { name: 'Right B gap (shallow)', x: 3, y: 6 }
        ],
        CB: [
            { name: 'Seam left', x: -12, y: 12 },
            { name: 'Seam right', x: 12, y: 12 }
        ],
        S: [
            { name: 'Deep left', x: -8, y: 12 },
            { name: 'Deep right', x: 8, y: 12 }
        ]
    },
    '4-3 Under (1-high)': {
        DL: [
            { name: 'Left 4i technique', x: -3.5, y: 2.5 },
            { name: '0 technique', x: 0, y: 2.5 },
            { name: 'Right 3 technique', x: 3, y: 2.5 },
            { name: 'Right 5 technique', x: 4.5, y: 2.5 }
        ],
        LB: [
            { name: 'Left B gap (shallow)', x: -3, y: 6 },
            { name: 'Over Center (shallow)', x: 0, y: 6 },
            { name: 'Right B gap (shallow)', x: 3, y: 6 }
        ],
        CB: [
            { name: 'Seam left', x: -12, y: 12 },
            { name: 'Seam right', x: 12, y: 12 }
        ],
        S: [
            { name: 'Deep middle 1/3', x: 0, y: 15 },
            { name: 'Left B gap (deep)', x: -3, y: 8.5 }
        ]
    },
    '3-4 Under (2-high)': {
        DL: [
            { name: 'Left 4i technique', x: -3.5, y: 2.5 },
            { name: '0 technique', x: 0, y: 2.5 },
            { name: 'Right 5 technique', x: 4.5, y: 2.5 }
        ],
        LB: [
            { name: 'Left C gap (shallow)', x: -4.5, y: 6 },
            { name: 'Left B gap (shallow)', x: -3, y: 6 },
            { name: 'Right B gap (shallow)', x: 3, y: 6 },
            { name: 'Right C gap (shallow)', x: 4.5, y: 6 }
        ],
        CB: [
            { name: 'Seam left', x: -12, y: 12 },
            { name: 'Seam right', x: 12, y: 12 }
        ],
        S: [
            { name: 'Deep left', x: -8, y: 12 },
            { name: 'Deep right', x: 8, y: 12 }
        ]
    },
    '3-4 Under (1-high)': {
        DL: [
            { name: 'Left 4i technique', x: -3.5, y: 2.5 },
            { name: '0 technique', x: 0, y: 2.5 },
            { name: 'Right 5 technique', x: 4.5, y: 2.5 }
        ],
        LB: [
            { name: 'Left C gap (shallow)', x: -4.5, y: 6 },
            { name: 'Left B gap (shallow)', x: -3, y: 6 },
            { name: 'Right B gap (shallow)', x: 3, y: 6 },
            { name: 'Right C gap (shallow)', x: 4.5, y: 6 }
        ],
        CB: [
            { name: 'Seam left', x: -12, y: 12 },
            { name: 'Seam right', x: 12, y: 12 }
        ],
        S: [
            { name: 'Deep middle 1/3', x: 0, y: 15 },
            { name: 'Left B gap (deep)', x: -3, y: 8.5 }
        ]
    },
    '3-4 Okie (2-high)': {
        DL: [
            { name: 'Left 4 technique', x: -8, y: 2.5 },
            { name: '0 technique', x: 0, y: 2.5 },
            { name: 'Right 4 technique', x: 8, y: 2.5 }
        ],
        LB: [
            { name: 'Left C gap (shallow)', x: -4.5, y: 6 },
            { name: 'Left B gap (shallow)', x: -3, y: 6 },
            { name: 'Right B gap (shallow)', x: 3, y: 6 },
            { name: 'Right C gap (shallow)', x: 4.5, y: 6 }
        ],
        CB: [
            { name: 'Seam left', x: -12, y: 12 },
            { name: 'Seam right', x: 12, y: 12 }
        ],
        S: [
            { name: 'Deep left', x: -8, y: 12 },
            { name: 'Deep right', x: 8, y: 12 }
        ]
    },
    '3-4 Okie (1-high)': {
        DL: [
            { name: 'Left 4 technique', x: -8, y: 2.5 },
            { name: '0 technique', x: 0, y: 2.5 },
            { name: 'Right 4 technique', x: 8, y: 2.5 }
        ],
        LB: [
            { name: 'Left C gap (shallow)', x: -4.5, y: 6 },
            { name: 'Left B gap (shallow)', x: -3, y: 6 },
            { name: 'Right B gap (shallow)', x: 3, y: 6 },
            { name: 'Right C gap (shallow)', x: 4.5, y: 6 }
        ],
        CB: [
            { name: 'Seam left', x: -12, y: 12 },
            { name: 'Seam right', x: 12, y: 12 }
        ],
        S: [
            { name: 'Deep middle 1/3', x: 0, y: 15 },
            { name: 'Left B gap (deep)', x: -3, y: 8.5 }
        ]
    },
    '3-4 Bear (2-high)': {
        DL: [
            { name: 'Left 3 technique', x: -3, y: 2.5 },
            { name: '0 technique', x: 0, y: 2.5 },
            { name: 'Right 3 technique', x: 5, y: 2.5 }
        ],
        LB: [
            { name: 'Left C gap (shallow)', x: -4.5, y: 6 },
            { name: 'Left B gap (shallow)', x: -3, y: 6 },
            { name: 'Right B gap (shallow)', x: 3, y: 6 },
            { name: 'Right C gap (shallow)', x: 4.5, y: 6 }
        ],
        CB: [
            { name: 'Seam left', x: -12, y: 12 },
            { name: 'Seam right', x: 12, y: 12 }
        ],
        S: [
            { name: 'Deep left', x: -8, y: 12 },
            { name: 'Deep right', x: 8, y: 12 }
        ]
    },
    '3-4 Bear (1-high)': {
        DL: [
            { name: 'Left 3 technique', x: -3, y: 2.5 },
            { name: '0 technique', x: 0, y: 2.5 },
            { name: 'Right 3 technique', x: 5, y: 2.5 }
        ],
        LB: [
            { name: 'Left C gap (shallow)', x: -4.5, y: 6 },
            { name: 'Left B gap (shallow)', x: -3, y: 6 },
            { name: 'Right B gap (shallow)', x: 3, y: 6 },
            { name: 'Right C gap (shallow)', x: 4.5, y: 6 }
        ],
        CB: [
            { name: 'Seam left', x: -12, y: 12 },
            { name: 'Seam right', x: 12, y: 12 }
        ],
        S: [
            { name: 'Deep middle 1/3', x: 0, y: 15 },
            { name: 'Left B gap (deep)', x: -3, y: 8.5 }
        ]
    },
    '3-4 Tite (2-high)': {
        DL: [
            { name: 'Left 4i technique', x: -3.5, y: 2.5 },
            { name: '0 technique', x: 0, y: 2.5 },
            { name: 'Right 4i technique', x: 6, y: 2.5 }
        ],
        LB: [
            { name: 'Left C gap (shallow)', x: -4.5, y: 6 },
            { name: 'Left B gap (shallow)', x: -3, y: 6 },
            { name: 'Right B gap (shallow)', x: 3, y: 6 },
            { name: 'Right C gap (shallow)', x: 4.5, y: 6 }
        ],
        CB: [
            { name: 'Seam left', x: -12, y: 12 },
            { name: 'Seam right', x: 12, y: 12 }
        ],
        S: [
            { name: 'Deep left', x: -8, y: 12 },
            { name: 'Deep right', x: 8, y: 12 }
        ]
    },
    '3-4 Tite (1-high)': {
        DL: [
            { name: 'Left 4i technique', x: -3.5, y: 2.5 },
            { name: '0 technique', x: 0, y: 2.5 },
            { name: 'Right 4i technique', x: 6, y: 2.5 }
        ],
        LB: [
            { name: 'Left C gap (shallow)', x: -4.5, y: 6 },
            { name: 'Left B gap (shallow)', x: -3, y: 6 },
            { name: 'Right B gap (shallow)', x: 3, y: 6 },
            { name: 'Right C gap (shallow)', x: 4.5, y: 6 }
        ],
        CB: [
            { name: 'Seam left', x: -12, y: 12 },
            { name: 'Seam right', x: 12, y: 12 }
        ],
        S: [
            { name: 'Deep middle 1/3', x: 0, y: 15 },
            { name: 'Left B gap (deep)', x: -3, y: 8.5 }
        ]
    }
};

function applyOffensiveFormation(formationName) {
    const formation = offensiveFormations[formationName];
    if (!formation) return;
    
    const container = document.getElementById('fieldContainer');
    if (!container) return;
    const canvasWidth = container.offsetWidth;
    const canvasHeight = container.offsetHeight;
    const effectiveHeight = canvasHeight * 0.97;
    
    // Clear existing offensive positions
    selectedPlayers.forEach(playerId => {
        delete playerPositions[playerId];
    });
    
    // Separate players by position for assignment
    const qbs = selectedPlayers.filter(id => {
        const p = getPlayerById(id);
        return p && p.position === 'QB';
    });
    const rbs = selectedPlayers.filter(id => {
        const p = getPlayerById(id);
        return p && p.position === 'RB';
    });
    const oline = selectedPlayers.filter(id => {
        const p = getPlayerById(id);
        return p && ['OT', 'OG', 'C'].includes(p.position);
    });
    const tes = selectedPlayers.filter(id => {
        const p = getPlayerById(id);
        return p && p.position === 'TE';
    });
    const wrs = selectedPlayers.filter(id => {
        const p = getPlayerById(id);
        return p && p.position === 'WR';
    });
    
    // Track assigned positions
    let olIndex = 0;
    let teIndex = 0;
    let wrIndex = 0;
    let rbIndex = 0;
    
    // Apply formation - assign ALL 11 players
    selectedPlayers.forEach((playerId) => {
        const player = getPlayerById(playerId);
        if (!player) return;
        
        let position = null;
        
        // QB always gets QB position if available
        if (player.position === 'QB' && formation.QB) {
            position = formation.QB;
        }
        // RB gets RB position if available, otherwise can go to WR spot
        else if (player.position === 'RB') {
            if (formation.RB && rbIndex === 0) {
                position = formation.RB;
                rbIndex++;
            } else {
                // RB in empty formation - assign to a WR spot
                const allReceiverSpots = [...(formation.WR || []), ...(formation.TE || [])];
                if (wrIndex < allReceiverSpots.length) {
                    position = allReceiverSpots[wrIndex];
                    wrIndex++;
                } else {
                    // Fallback: put RB in a wide position
                    position = { name: 'Wide left', x: -12, y: -3, section: 'Offensive line of scrimmage' };
                }
            }
        }
        // OL gets OL positions
        else if (['OT', 'OG', 'C'].includes(player.position) && formation.OL) {
            if (olIndex < formation.OL.length) {
                position = formation.OL[olIndex];
                olIndex++;
            }
        }
        // TE gets TE positions, or WR if no TE spots
        else if (player.position === 'TE') {
            if (formation.TE && teIndex < formation.TE.length) {
                position = formation.TE[teIndex];
                teIndex++;
            } else {
                // TE can go to WR spot
                if (wrIndex < (formation.WR || []).length) {
                    position = formation.WR[wrIndex];
                    wrIndex++;
                } else {
                    // Fallback position
                    position = { name: 'Slot left', x: -8, y: -3, section: 'Offensive line of scrimmage' };
                }
            }
        }
        // WR gets WR positions
        else if (player.position === 'WR') {
            if (formation.WR && wrIndex < formation.WR.length) {
                position = formation.WR[wrIndex];
                wrIndex++;
            } else {
                // Fallback: spread out wide
                const fallbackSpots = [
                    { name: 'Wide left', x: -12, y: -3 },
                    { name: 'Wide right', x: 12, y: -3 },
                    { name: 'Slot left', x: -10, y: -3 },
                    { name: 'Slot right', x: 10, y: -3 },
                    { name: 'Max split left', x: -18, y: -3 },
                    { name: 'Max split right', x: 19, y: -3 }
                ];
                const fallbackIndex = wrIndex - (formation.WR ? formation.WR.length : 0);
                if (fallbackIndex < fallbackSpots.length) {
                    position = { ...fallbackSpots[fallbackIndex], section: 'Offensive line of scrimmage' };
                }
            }
        }
        
        // If still no position assigned, use a default based on position type
        if (!position) {
            if (player.position === 'QB') {
                position = { name: 'QB (Shotgun)', x: 0, y: -10, section: 'Offensive backfield' };
            } else if (player.position === 'RB') {
                position = { name: 'Wide left', x: -12, y: -3, section: 'Offensive line of scrimmage' };
            } else if (['OT', 'OG', 'C'].includes(player.position)) {
                position = { name: 'Center', x: 0, y: -3, section: 'Offensive line of scrimmage' };
            } else {
                position = { name: 'Slot left', x: -8, y: -3, section: 'Offensive line of scrimmage' };
            }
        }
        
        const x = ((position.x + 19.5) / 39) * canvasWidth;
        const y = (effectiveHeight / 2) - (position.y * 15);
        
        playerPositions[playerId] = {
            x: x,
            y: y,
            location: position.name,
            section: position.section || 'Offensive line of scrimmage',
            isOffsides: false
        };
    });
    
    renderField();
    renderPlayerMarkers();
}

function applyDefensiveFormation(formationName) {
    const formation = defensiveFormations[formationName];
    if (!formation) return;
    
    const container = document.getElementById('fieldContainer');
    if (!container) return;
    const canvasWidth = container.offsetWidth;
    const canvasHeight = container.offsetHeight;
    const effectiveHeight = canvasHeight * 0.97;
    
    // Clear existing defensive positions
    selectedDefense.forEach(playerId => {
        delete playerPositions[playerId];
    });
    
    // Build DL alignment pattern: DE -> DT(s) -> DE
    // First, separate players by position
    const des = selectedDefense.filter(id => {
        const p = getPlayerById(id);
        return p && p.position === 'DE';
    });
    const dts = selectedDefense.filter(id => {
        const p = getPlayerById(id);
        return p && p.position === 'DT';
    });
    const otherLinePlayers = selectedDefense.filter(id => {
        const p = getPlayerById(id);
        return p && !['DE', 'DT', 'LB', 'MLB', 'CB', 'S'].includes(p.position);
    });
    
    // Build alignment order: DE -> DT(s) -> DE, fill with other positions if needed
    const dlAlignment = [];
    if (des.length >= 2 && dts.length >= 1) {
        // Standard: DE, DT(s), DE
        dlAlignment.push(des[0]); // Left DE
        dts.forEach(dt => dlAlignment.push(dt)); // All DTs in middle
        dlAlignment.push(des[1]); // Right DE
        // Add extra DEs if any
        for (let i = 2; i < des.length; i++) {
            dlAlignment.push(des[i]);
        }
    } else if (des.length >= 1 && dts.length >= 1) {
        // One DE: DE, DT(s), then fill
        dlAlignment.push(des[0]);
        dts.forEach(dt => dlAlignment.push(dt));
        // Fill remaining with other positions
        otherLinePlayers.slice(0, formation.DL.length - dlAlignment.length).forEach(id => dlAlignment.push(id));
    } else if (des.length >= 2) {
        // Two DEs but no DTs: DE, fill, DE
        dlAlignment.push(des[0]);
        otherLinePlayers.slice(0, formation.DL.length - 2).forEach(id => dlAlignment.push(id));
        dlAlignment.push(des[1]);
    } else {
        // No standard pattern, just fill in order
        [...des, ...dts, ...otherLinePlayers].slice(0, formation.DL.length).forEach(id => dlAlignment.push(id));
    }
    
    // Separate players by position for assignment
    const lbs = selectedDefense.filter(id => {
        const p = getPlayerById(id);
        return p && ['LB', 'MLB'].includes(p.position);
    });
    const cbs = selectedDefense.filter(id => {
        const p = getPlayerById(id);
        return p && p.position === 'CB';
    });
    const safeties = selectedDefense.filter(id => {
        const p = getPlayerById(id);
        return p && p.position === 'S';
    });
    const allDBs = [...cbs, ...safeties];
    
    // Track assigned positions
    let lbIndex = 0;
    let cbIndex = 0;
    let sIndex = 0;
    let dbIndex = 0; // For extra DBs (nickel/dime)
    
    // Nickel/Dime slot positions for extra DBs
    const nickelDimePositions = [
        { name: 'Slot left', x: -8, y: 5, section: 'Coverage second level' },
        { name: 'Slot right', x: 8, y: 5, section: 'Coverage second level' },
        { name: 'Seam left', x: -7, y: 5, section: 'Coverage second level' },
        { name: 'Seam right', x: 7, y: 5, section: 'Coverage second level' },
        { name: 'Wide left', x: -12, y: 5, section: 'Coverage second level' },
        { name: 'Wide right', x: 12, y: 5, section: 'Coverage second level' }
    ];
    
    // Apply formation - assign ALL 11 players
    selectedDefense.forEach((playerId) => {
        const player = getPlayerById(playerId);
        if (!player) return;
        
        let position = null;
        
        // Check if this player is in the DL alignment
        const dlIndex = dlAlignment.indexOf(playerId);
        if (dlIndex >= 0 && dlIndex < formation.DL.length && formation.DL) {
            position = formation.DL[dlIndex];
        }
        // LBs get LB positions
        else if (['LB', 'MLB'].includes(player.position)) {
            if (formation.LB && lbIndex < formation.LB.length) {
                position = formation.LB[lbIndex];
                lbIndex++;
            } else {
                // Extra LB - put in a gap or shallow zone
                const extraLBPositions = [
                    { name: 'Left A gap (shallow)', x: -1, y: 6, section: 'Defensive backfield' },
                    { name: 'Right A gap (shallow)', x: 1, y: 6, section: 'Defensive backfield' },
                    { name: 'Left C gap (shallow)', x: -4.5, y: 6, section: 'Defensive backfield' },
                    { name: 'Right C gap (shallow)', x: 4.5, y: 6, section: 'Defensive backfield' }
                ];
                const extraIndex = lbIndex - (formation.LB ? formation.LB.length : 0);
                if (extraIndex < extraLBPositions.length) {
                    position = extraLBPositions[extraIndex];
                }
            }
        }
        // CBs get CB positions, then extra go to nickel spots
        else if (player.position === 'CB') {
            if (formation.CB && cbIndex < formation.CB.length) {
                position = formation.CB[cbIndex];
                cbIndex++;
            } else {
                // Extra CB (nickel/dime) - assign to slot positions
                if (dbIndex < nickelDimePositions.length) {
                    position = nickelDimePositions[dbIndex];
                    dbIndex++;
                } else {
                    // Fallback
                    position = { name: 'Slot left', x: -8, y: 5, section: 'Coverage second level' };
                }
            }
        }
        // Safeties get S positions, then extra go to nickel spots
        else if (player.position === 'S') {
            if (formation.S && sIndex < formation.S.length) {
                position = formation.S[sIndex];
                sIndex++;
            } else {
                // Extra S (big nickel/dime) - assign to slot positions
                if (dbIndex < nickelDimePositions.length) {
                    position = nickelDimePositions[dbIndex];
                    dbIndex++;
                } else {
                    // Fallback
                    position = { name: 'Slot right', x: 8, y: 5, section: 'Coverage second level' };
                }
            }
        }
        
        // If still no position assigned, use a default based on position type
        if (!position) {
            if (['DE', 'DT'].includes(player.position)) {
                position = { name: '0 technique', x: 0, y: 2.5, section: 'Defensive line of scrimmage' };
            } else if (['LB', 'MLB'].includes(player.position)) {
                position = { name: 'Over Center (shallow)', x: 0, y: 6, section: 'Defensive backfield' };
            } else if (player.position === 'CB') {
                position = { name: 'Slot left', x: -8, y: 5, section: 'Coverage second level' };
            } else if (player.position === 'S') {
                position = { name: 'Slot right', x: 8, y: 5, section: 'Coverage second level' };
            } else {
                position = { name: 'Over Center (shallow)', x: 0, y: 6, section: 'Defensive backfield' };
            }
        }
        
        const x = ((position.x + 19.5) / 39) * canvasWidth;
        const y = (effectiveHeight / 2) - (position.y * 15);
        
        playerPositions[playerId] = {
            x: x,
            y: y,
            location: position.name,
            section: position.section || 'Defensive line of scrimmage',
            isOffsides: false
        };
    });
    
    renderField();
    renderPlayerMarkers();
}

function nextStep() {
    if (currentStep < 5) {
        // Validate current step
        if (currentStep === 0) {
            // Special teams - can proceed to personnel
            renderStep(1);
            return;
        }
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
    if (currentStep > 0) {
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
        
        // Location coordinates are already in canvas space (no offset needed)
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

function findNearestLocation(x, y, rawCanvasWidth, rawCanvasHeight) {
    let nearest = null;
    let minDist = Infinity;
    // Zoom IN: map -19 to +19 to full width (Max split at edges), 3% bottom crop
    const canvasWidth = rawCanvasWidth; // Full width
    const canvasHeight = rawCanvasHeight * 0.97;
    // No crop offset needed - coordinates are already in canvas space
    const adjustedX = x;
    const centerY = canvasHeight / 2;
    
    fieldLocations.forEach(section => {
        section.Locations.forEach(loc => {
            if (loc.X !== undefined && loc.Y !== undefined) {
                // MASSIVE vertical separation: Use multiplier of 15
                // Offense: negative Y values render BELOW centerY (centerY - (negative) = centerY + positive)
                // Defense: positive Y values render ABOVE centerY (centerY - (positive) = centerY - positive)
                const yMultiplier = 15;
                const locY = centerY - (loc.Y * yMultiplier);
                // Map field coordinates -19.5 to +19.5 to 0 to canvasWidth (Max split at edges) - ZOOM IN
                const locX = ((loc.X + 19.5) / 39) * canvasWidth;
                
                // Check if location is on correct side based on section
                const isOffensiveSection = section.Section.includes('Offensive') || 
                                          section.Section.includes('offensive');
                const isDefensiveSection = section.Section.includes('Defensive') || 
                                          section.Section.includes('defensive') ||
                                          section.Section.includes('Coverage') ||
                                          section.Section.includes('Press') ||
                                          section.Section.includes('Deep');
                
                // Only consider locations on the correct side
                const dist = Math.sqrt(Math.pow(adjustedX - locX, 2) + Math.pow(y - locY, 2));
                
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
    
    // Scale canvas to container - zoom IN horizontally: map -19 to +19 to full width (Max split at edges)
    const dpr = window.devicePixelRatio || 1;
    const rawWidth = container.offsetWidth;
    const rawHeight = container.offsetHeight;
    const canvasWidth = rawWidth; // Full width
    const canvasHeight = rawHeight * 0.97; // Crop 3% from bottom
    canvas.width = rawWidth * dpr;
    canvas.height = rawHeight * dpr;
    canvas.style.width = rawWidth + 'px';
    canvas.style.height = rawHeight + 'px';
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
                // Map field coordinates -19.5 to +19.5 to 0 to canvasWidth (Max split at edges) - ZOOM IN
                const x = ((location.X + 19.5) / 39) * canvasWidth;
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
            // Positions are already in canvas coordinates
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
                    const location = findNearestLocation(x, y, rawWidth, rawHeight);
                    
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
                        
                        // Location coordinates are already in canvas space (no offset needed)
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
    const rawWidth = container.offsetWidth;
    const rawHeight = container.offsetHeight;
    const canvasWidth = rawWidth; // Full width - zoomed in
    const canvasHeight = rawHeight * 0.97; // Crop 3% from bottom
    const centerY = canvasHeight / 2;
    
    // No translation needed - coordinates are already in canvas space
    ctx.save();
    
    // Draw arrows for offensive assignments
    selectedPlayers.forEach(playerId => {
        const player = getPlayerById(playerId);
        if (!player) return;
        
        const pos = playerPositions[playerId];
        if (!pos) return;
        
        const assignment = assignments.offense[player.name];
        if (!assignment || !assignment.action) return;
        
        // Positions are already in canvas coordinates
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
        
        // Positions are already in canvas coordinates
        drawAssignmentArrow(ctx, pos.x, pos.y, assignment.action, player.position, false, canvasWidth, centerY);
    });
    
    ctx.restore();
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
    
    // Extract rationale from LLM output (everything before the JSON)
    const lines = llmOutput.split('\n');
    let rationale = '';
    let jsonStartIndex = -1;
    
    // Find where JSON starts (last line with {)
    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (line.startsWith('{') && line.includes('success-rate')) {
            jsonStartIndex = i;
            break;
        }
    }
    
    // Extract everything before the JSON as rationale
    if (jsonStartIndex > 0) {
        rationale = lines.slice(0, jsonStartIndex).join('\n').trim();
    } else {
        // If no JSON found, use everything except the last line
        rationale = lines.slice(0, -1).join('\n').trim();
    }
    
    // Display results
    document.getElementById('llmOutput').textContent = llmOutput;
    
    // Display rationale
    const rationaleEl = document.getElementById('playRationale');
    if (rationaleEl) {
        rationaleEl.value = rationale || 'No rationale provided.';
    }
    
    // Display outcome type
    const outcomeTypeNames = {
        'havoc': 'Havoc Play',
        'explosive': 'Explosive Play',
        'success': 'Successful Play',
        'unsuccessful': 'Unsuccessful Play'
    };
    const outcomeTypeName = outcomeTypeNames[result.outcomeType] || result.outcomeType;
    const outcomeTypeEl = document.getElementById('outcomeType');
    if (outcomeTypeEl) {
        outcomeTypeEl.textContent = `Outcome Type: ${outcomeTypeName}`;
    }
    
    let outcomeText = result.description || result.outcome;
    if (result.turnover) {
        outcomeText += ` TURNOVER (${result.turnoverType})!`;
    }
    document.getElementById('outcomeText').textContent = outcomeText;
    document.getElementById('yardsGained').textContent = `Yards: ${result.yards > 0 ? '+' : ''}${result.yards}`;
    
    // Display rate comparison
    const rateDetailsEl = document.getElementById('rateDetails');
    if (rateDetailsEl && result.evalData && baselineRates) {
        const llmRates = result.evalData;
        const successDiff = (llmRates['success-rate'] || 0) - (baselineRates['success-rate'] || 0);
        const havocDiff = (llmRates['havoc-rate'] || 0) - (baselineRates['havoc-rate'] || 0);
        const explosiveDiff = (llmRates['explosive-rate'] || 0) - (baselineRates['explosive-rate'] || 0);
        
        // Calculate unsuccessful rate (100 - success - havoc - explosive)
        const llmUnsuccessful = 100 - (llmRates['success-rate'] || 0) - (llmRates['havoc-rate'] || 0) - (llmRates['explosive-rate'] || 0);
        const baselineUnsuccessful = 100 - (baselineRates['success-rate'] || 0) - (baselineRates['havoc-rate'] || 0) - (baselineRates['explosive-rate'] || 0);
        const unsuccessfulDiff = llmUnsuccessful - baselineUnsuccessful;
        
        const formatDiff = (diff) => {
            if (diff > 0) return `+${diff.toFixed(1)}%`;
            return `${diff.toFixed(1)}%`;
        };
        
        const formatColor = (diff, isPositiveForOffense = true) => {
            // For offense: positive diff is good (green), negative is bad (red)
            // For defense: negative diff is good (green), positive is bad (red)
            if (isPositiveForOffense) {
                return diff > 0 ? 'color: #4CAF50;' : diff < 0 ? 'color: #f44336;' : '';
            } else {
                return diff < 0 ? 'color: #4CAF50;' : diff > 0 ? 'color: #f44336;' : '';
            }
        };
        
        let rateDetails = `Baseline Rates: Success ${baselineRates['success-rate']}%, Havoc ${baselineRates['havoc-rate']}%, Explosive ${baselineRates['explosive-rate']}%, Unsuccessful ${baselineUnsuccessful.toFixed(1)}%<br><br>`;
        rateDetails += `Your Play's Rates: Success ${(llmRates['success-rate'] || 0).toFixed(1)}%, Havoc ${(llmRates['havoc-rate'] || 0).toFixed(1)}%, Explosive ${(llmRates['explosive-rate'] || 0).toFixed(1)}%, Unsuccessful ${llmUnsuccessful.toFixed(1)}%<br><br>`;
        rateDetails += `<strong>Changes from Baseline:</strong><br>`;
        rateDetails += `<span style="${formatColor(successDiff, true)}">Success: ${formatDiff(successDiff)}</span><br>`;
        rateDetails += `<span style="${formatColor(havocDiff, false)}">Havoc: ${formatDiff(havocDiff)}</span><br>`;
        rateDetails += `<span style="${formatColor(explosiveDiff, true)}">Explosive: ${formatDiff(explosiveDiff)}</span><br>`;
        rateDetails += `<span style="${formatColor(unsuccessfulDiff, false)}">Unsuccessful: ${formatDiff(unsuccessfulDiff)}</span><br>`;
        rateDetails += `<br><em>Rolled: ${outcomeTypeName}</em>`;
        
        rateDetailsEl.innerHTML = rateDetails;
    } else if (rateDetailsEl) {
        rateDetailsEl.textContent = 'Rate comparison unavailable';
    }
    
    // Show results step
    document.getElementById('results').classList.remove('hidden');
    document.getElementById('step5').classList.add('hidden');
}

async function callLLM(playData) {
    // Get API keys from config (populated from .env)
    const openaiKey = typeof API_CONFIG !== 'undefined' ? API_CONFIG.OPENAI_API_KEY : '';
    const claudeKey = typeof API_CONFIG !== 'undefined' ? API_CONFIG.CLAUDE_API_KEY : '';
    
    if (!openaiKey && !claudeKey) {
        console.warn('No API keys found in config.js. Using mock output.');
        // Fall through to mock output
    }
    
    // Build prompt with fixed instructions first (for caching), then data, then output format
    const fixedInstructions = `You are a SHARP and OPINIONATED football play analysis engine that KNOWS BALL. Analyze the SCHEME of this play - the spatial relationships, blocking assignments, coverage vs routes, and schematic design.

SCHEME ANALYSIS (70% WEIGHT):
VISUALIZE THE PLAY SPATIALLY using the X/Y coordinates. X: negative = left side, positive = right side. Y: negative = offensive side (behind LOS), positive = defensive side (past LOS).

CRITICAL SPATIAL CHECKS:
- If defensive LINEMEN (DE, DT) have alignments like "Wide left", "Slot", "Seam" - these are skill positions, not DL positions = offsides/misalignment.
- If ALL defenders (including DL, LB, secondary) are bunched on one side (check X coordinates) and the offense attacks the other side = MASSIVE OFFENSIVE ADVANTAGE.
- If offensive players are aligned properly but defenders are on the wrong side of the field relative to where the play is going = defense out of position.
- Count blockers vs defenders at the point of attack using coordinates (compare X values).
- Check if QB bootleg direction has blockers (look at X coordinates of OL/TE vs bootleg direction).
- Secondary players (CB, S) can align wide/slot/seam - that's normal. The issue is if they're ALL on one side or out of position.

Ask yourself:
- Does the blocking scheme match the play design? (e.g., zone blocking for outside zone, gap blocking for power)
- Are there unblocked defenders in the path of the ball carrier or QB?
- Does the QB have protection on bootlegs/rollouts? Are there blockers where he's going?
- Are receivers running routes into coverage? Are there open windows?
- Are there schematic mismatches? (e.g., WR at guard position, OL split wide, unbalanced formations)
- Does the defensive alignment match the offensive strength? Are defenders properly positioned?
- Are there numerical advantages at the point of attack?
- If the offense attacks right and all defenders are on the left = MASSIVE OFFENSIVE ADVANTAGE
- If the offense has a convoy of blockers and the defense is out of position = HIGH SUCCESS/EXPLOSIVE, LOW HAVOC

EXAMPLES OF DEFENSIVE SCHEME ADVANTAGES (High Havoc, Low Success):
- Naked bootleg with no blockers = 80%+ havoc rate, 3% success
- WR at guard position with no blocking = schematic failure
- Entire OL split left, QB bootlegs right = unblocked DE = 80% havoc, 3% success
- 5-man protection vs 6 rushers = pressure/havoc
- Route concepts that don't attack coverage weaknesses = low success

Passing plays have both slightly higher havoc rates and significantly higher explosive rates than running plays. The havoc will also be worse, but that's handled programmatically after your response.

EXAMPLES OF OFFENSIVE SCHEME ADVANTAGES (High Success/Explosive, Low Havoc):
- Convoy of blockers with ball carrier, defense all on opposite side = 15%+ success, 80%+ explosive, 5% havoc
- Offense attacks right, all defenders aligned left = massive advantage for offense
- Offense attacks a sideline with a deep route, the defense has only a middle defender in deep cover 1 and a mediocre corner in man: high likelihood to win with a good pass: 30% success, 40% explosive, 10% havoc 
- Numerical advantage running at point of attack (6 blockers vs 3 defenders) = 30% success, 40% explosive, 3% havoc 
- Routes attacking coverage voids = high success
- Proper blocking scheme with defenders out of position = high success/explosive
- Out-breaking routes against middle-field defense and inside leverage: 30% success, 35% explosive, 15% havoc

PERSONNEL (10% WEIGHT): Effective percentile ratings matter, but scheme trumps talent.

POSITIONAL MATCHUPS (20% WEIGHT): Individual matchups matter (CB has to tackle RB, LB has to cover WR, etc.), but only if the scheme allows them to matter.

RETURN ONLY NUMERIC VALUES. If the OFFENSIVE scheme is dominant (defense out of position, numerical advantages, proper blocking), return: success-rate 70-90%, explosive-rate 10-20%, havoc-rate 3-10%. If the DEFENSIVE scheme is dominant (unblocked defenders, coverage matches routes, obvious pressure), return: havoc-rate 30-70%, success-rate 3-15%, explosive-rate 2-5%.

FIRST: Provide a brief rationale (2-3 sentences) describing:
- Point of attack: Where is the play designed to go? (left/right, gap, route concept)
- Key matchups (1-3): Identify the most important individual matchups that will determine success
- Conflict defender: Which defender is in conflict (must choose between run/pass responsibility)?

THEN: Your JSON response (NUMBERS ONLY) as the last line:
{"success-rate": [NUMBER], "havoc-rate": [NUMBER], "explosive-rate": [NUMBER], "offense-advantage": [NUMBER -10 to 10], "risk-leverage": [NUMBER 0 to 10]}

OFFENSE-ADVANTAGE (-10 to 10): Represents the schematic advantage for the offense. -10 means defense has massive advantage (5% success+explosive), +10 means offense has massive advantage (95% success+explosive). This corresponds to about a 5-95 percent difference in the sum of success+explosive play rate.

RISK-LEVERAGE (0 to 10): Specifies the amount of havoc+explosives vs standard results. 0 = mostly standard plays, 10 = extreme outcomes (mostly havoc or explosive plays).`;

    // Variable data (user message content)
    let userMessageContent = `Game Situation: ${gameState.down}${getDownSuffix(gameState.down)} and ${gameState.distance} at the ${gameState["opp-yardline"]} yard line. Q${gameState.quarter} ${gameState.time}. Score: ${gameState.score.home} - ${gameState.score.away}

OFFENSIVE PERSONNEL AND ALIGNMENTS:
${playData.offense.map(p => {
        // Find player position from playerPositions
        let playerId = null;
        for (const id of selectedPlayers) {
            const player = getPlayerById(id);
            if (player && player.name === p.name) {
                playerId = id;
                break;
            }
        }
        const pos = playerId ? (playerPositions[playerId] || {}) : {};
        const effectivePercentile = calculateEffectivePercentile(p);
        const assignment = assignments.offense[p.name] || {};
        const assignmentText = assignment.action || assignment.category || 'None';
        const manTarget = (assignment.category === 'Man Coverage' && assignment.manCoverageTarget) ? ` (Man coverage on: ${assignment.manCoverageTarget})` : '';
        const locCoords = pos.location ? getLocationCoords(pos.location) : null;
        const coords = locCoords ? ` [X:${locCoords.x.toFixed(1)}, Y:${locCoords.y.toFixed(1)}]` : '';
        return `${p.name} - Position: ${p.position}, Alignment: ${pos.location || 'Not placed'}${coords}, Effective Rating: ${effectivePercentile.toFixed(0)}th percentile, Assignment: ${assignmentText}${manTarget}`;
    }).join('\n')}

DEFENSIVE PERSONNEL AND ALIGNMENTS:
${playData.defense.map(p => {
        // Find player position from playerPositions
        let playerId = null;
        for (const id of selectedDefense) {
            const player = getPlayerById(id);
            if (player && player.name === p.name) {
                playerId = id;
                break;
            }
        }
        const pos = playerId ? (playerPositions[playerId] || {}) : {};
        const effectivePercentile = calculateEffectivePercentile(p);
        const assignment = assignments.defense[p.name] || {};
        const assignmentText = assignment.action || assignment.category || 'None';
        const manTarget = (assignment.category === 'Man Coverage' && assignment.manCoverageTarget) ? ` (Man coverage on: ${assignment.manCoverageTarget})` : '';
        const locCoords = pos.location ? getLocationCoords(pos.location) : null;
        const coords = locCoords ? ` [X:${locCoords.x.toFixed(1)}, Y:${locCoords.y.toFixed(1)}]` : '';
        // Check if defensive lineman is in an offensive skill position (actual offsides/misalignment)
        const isDLInOffensivePosition = (p.position === 'DE' || p.position === 'DT') && pos.location && (pos.location.includes('Wide') || pos.location.includes('Slot') || pos.location.includes('Seam') || pos.location.includes('Wing') || pos.location.includes('Tight') || pos.location.includes('Split') || pos.location.includes('Trips') || pos.location.includes('Max split'));
        const warning = isDLInOffensivePosition ? ' ⚠️ DEFENSIVE LINEMAN IN OFFENSIVE SKILL POSITION!' : '';
        return `${p.name} - Position: ${p.position}, Alignment: ${pos.location || 'Not placed'}${coords}${warning}, Effective Rating: ${effectivePercentile.toFixed(0)}th percentile, Assignment: ${assignmentText}${manTarget}`;
    }).join('\n')}

${playData.coachingPointOffense ? `OFFENSIVE COACHING POINT: ${playData.coachingPointOffense.player.name} (${playData.coachingPointOffense.player.position}) - "${playData.coachingPointOffense.point}"` : ''}
${playData.coachingPointDefense ? `DEFENSIVE COACHING POINT: ${playData.coachingPointDefense.player.name} (${playData.coachingPointDefense.player.position}) - "${playData.coachingPointDefense.point}"` : ''}`;
    
    // Log the intended LLM output
    console.log('=== SYSTEM PROMPT ===');
    console.log(fixedInstructions);
    console.log('=== USER MESSAGE ===');
    console.log(userMessageContent);
    console.log('=== END PROMPT ===');
    
    // If we have API keys, make actual API calls
    if (openaiKey) {
        try {
            console.log('Calling OpenAI API...');
            const openaiResponse = await callOpenAI(fixedInstructions, userMessageContent, openaiKey);
            if (openaiResponse) {
                console.log('=== OPENAI RESPONSE ===');
                console.log(openaiResponse);
                console.log('=== END OPENAI RESPONSE ===');
                return openaiResponse;
            }
        } catch (error) {
            console.error('Error calling OpenAI API:', error);
            console.log('Falling back to mock output');
        }
    }
    
    // Fallback: return mock output with rationale and JSON
    return `Point of attack: Right side B gap. Key matchups: Left guard vs defensive tackle, slot receiver vs nickel corner. Conflict defender: Weakside linebacker must choose between run fit and pass coverage.

{"success-rate": 45.0, "havoc-rate": 12.0, "explosive-rate": 10.0, "offense-advantage": 0.0, "risk-leverage": 5.0}`;
}

async function callOpenAI(systemPrompt, userPrompt, apiKey) {
    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4',
                messages: [
                    {
                        role: 'system',
                        content: systemPrompt
                    },
                    {
                        role: 'user',
                        content: userPrompt
                    }
                ],
                temperature: 0.2,
                max_tokens: 4000
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(`OpenAI API error: ${response.status} - ${JSON.stringify(errorData)}`);
        }
        
        const data = await response.json();
        return data.choices[0].message.content;
    } catch (error) {
        console.error('OpenAI API call failed:', error);
        return null;
    }
}

async function callClaude(prompt, apiKey) {
    try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: 4000,
                temperature: 0.2,
                system: 'You are a SHARP and OPINIONATED football play analysis engine that KNOWS BALL. Analyze the SCHEME of the play - spatial relationships, blocking assignments, coverage vs routes. Return ONLY NUMERIC VALUES (0-100) in JSON. NO TEXT VALUES. Scheme analysis is 70% of your evaluation. If the scheme is broken (e.g., unblocked defenders, impossible alignments), return extreme numbers. The last line must be JSON: {"success-rate": [NUMBER], "havoc-rate": [NUMBER], "explosive-rate": [NUMBER]}',
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ]
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(`Claude API error: ${response.status} - ${JSON.stringify(errorData)}`);
        }
        
        const data = await response.json();
        return data.content[0].text;
    } catch (error) {
        console.error('Claude API call failed:', error);
        return null;
    }
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


function parseLLMOutput(output) {
    // Extract JSON from last line
    const lines = output.split('\n');
    let lastLine = lines[lines.length - 1].trim();
    
    // Try to find JSON in the output - might be wrapped in code blocks or have extra text
    if (!lastLine.startsWith('{')) {
        // Search backwards for JSON
        for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i].trim();
            if (line.startsWith('{') && line.includes('success-rate')) {
                lastLine = line;
                break;
            }
        }
    }
    
    // Remove markdown code blocks if present
    lastLine = lastLine.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
    
    try {
        const parsed = JSON.parse(lastLine);
        
        // VALIDATE: All values must be numbers
        const validated = {
            "success-rate": typeof parsed["success-rate"] === 'number' ? parsed["success-rate"] : parseFloat(parsed["success-rate"]) || 45.0,
            "havoc-rate": typeof parsed["havoc-rate"] === 'number' ? parsed["havoc-rate"] : parseFloat(parsed["havoc-rate"]) || 11.0,
            "explosive-rate": typeof parsed["explosive-rate"] === 'number' ? parsed["explosive-rate"] : parseFloat(parsed["explosive-rate"]) || 10.0,
            "offense-advantage": typeof parsed["offense-advantage"] === 'number' ? parsed["offense-advantage"] : parseFloat(parsed["offense-advantage"]) || 0.0,
            "risk-leverage": typeof parsed["risk-leverage"] === 'number' ? parsed["risk-leverage"] : parseFloat(parsed["risk-leverage"]) || 5.0
        };
        
        // Clamp values
        validated["success-rate"] = Math.max(0, Math.min(100, validated["success-rate"]));
        validated["havoc-rate"] = Math.max(0, Math.min(100, validated["havoc-rate"]));
        validated["explosive-rate"] = Math.max(0, Math.min(100, validated["explosive-rate"]));
        validated["offense-advantage"] = Math.max(-10, Math.min(10, validated["offense-advantage"]));
        validated["risk-leverage"] = Math.max(0, Math.min(10, validated["risk-leverage"]));
        
        // Warn if we had to convert non-numeric values
        if (typeof parsed["success-rate"] !== 'number' || typeof parsed["havoc-rate"] !== 'number' || typeof parsed["explosive-rate"] !== 'number') {
            console.warn('LLM returned non-numeric values! Original:', parsed, 'Converted to:', validated);
        }
        
        return validated;
    } catch (error) {
        console.error('Error parsing LLM output:', error);
        console.error('Last line was:', lastLine);
        console.error('Full output:', output);
        // Return default values
        return {
            "success-rate": 45.0,
            "havoc-rate": 11.0,
            "explosive-rate": 10.0,
            "offense-advantage": 0.0,
            "risk-leverage": 5.0
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
        // Roll 1-100 for specific havoc outcome based on play type
        const havocOutcomeRoll = Math.floor(Math.random() * 100) + 1;
        
        if (playType === 'pass') {
            // Pass havoc outcomes: 50% sack, 10% fumble, 20% interception, 20% other
            if (havocOutcomeRoll <= 50) {
                outcomeFile = await loadOutcomeFile('outcomes/havoc-sack.json');
            } else if (havocOutcomeRoll <= 60) {
                outcomeFile = await loadOutcomeFile('outcomes/havoc-fumble.json');
            } else if (havocOutcomeRoll <= 80) {
                outcomeFile = await loadOutcomeFile('outcomes/havoc-interception.json');
            } else {
                // 20% - incomplete pass (use unsuccessful-pass but with havoc context)
                const incompleteFile = await loadOutcomeFile('outcomes/unsuccessful-pass.json');
                if (incompleteFile) {
                    outcomeFile = { ...incompleteFile };
                    outcomeFile.description = 'The pass was incomplete under pressure. Yards: {yards}';
                } else {
                    outcomeFile = await loadOutcomeFile('outcomes/havoc-sack.json');
                }
            }
        } else {
            // Run havoc outcomes: 50% TFL, 15% fumble, 35% other
            if (havocOutcomeRoll <= 50) {
                outcomeFile = await loadOutcomeFile('outcomes/havoc-tackle-for-loss.json');
            } else if (havocOutcomeRoll <= 65) {
                outcomeFile = await loadOutcomeFile('outcomes/havoc-fumble.json');
            } else {
                // 35% - minimal gain (use unsuccessful-run but with havoc context)
                const minimalFile = await loadOutcomeFile('outcomes/unsuccessful-run.json');
                if (minimalFile) {
                    outcomeFile = { ...minimalFile };
                    outcomeFile.description = 'The ball carrier was stopped at the line of scrimmage for a gain of {yards} yards.';
                } else {
                    outcomeFile = await loadOutcomeFile('outcomes/havoc-tackle-for-loss.json');
                }
            }
        }
    } else if (outcomeRoll <= ranges.explosive) {
        outcomeType = 'explosive';
        // Roll 1-100 for YAC check (40% tackle chance)
        const yacRoll = Math.floor(Math.random() * 100) + 1;
        if (yacRoll <= 40) {
            // Tackled, use explosive outcome
            if (playType === 'pass') {
                // Explosive pass - use successful-pass with higher average
                const passFile = await loadOutcomeFile('outcomes/successful-pass.json');
                if (passFile) {
                    outcomeFile = { ...passFile };
                    outcomeFile['average-yards-gained'] = 12.0;
                    outcomeFile['standard-deviation'] = 2.5;
                    outcomeFile.description = 'The quarterback completed a deep pass for {yards} yards.';
                } else {
                    outcomeFile = await loadOutcomeFile('outcomes/successful-pass.json');
                }
            } else {
                outcomeFile = await loadOutcomeFile('outcomes/explosive-run.json');
            }
        } else {
            // YAC - roll again for YAC yards
            if (playType === 'pass') {
                outcomeFile = await loadOutcomeFile('outcomes/yac-catch.json');
            } else {
                // Run YAC - use explosive-run with modified description
                const runFile = await loadOutcomeFile('outcomes/explosive-run.json');
                if (runFile) {
                    outcomeFile = { ...runFile };
                    outcomeFile.description = 'The ball carrier broke free for a long gain of {yards} yards.';
                } else {
                    outcomeFile = await loadOutcomeFile('outcomes/explosive-run.json');
                }
            }
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
            // Run play
            if (yacRoll <= 70) {
                outcomeFile = await loadOutcomeFile('outcomes/successful-run.json');
            } else {
                // YAC for run - use successful-run with modified description
                const runFile = await loadOutcomeFile('outcomes/successful-run.json');
                if (runFile) {
                    outcomeFile = { ...runFile };
                    outcomeFile['average-yards-gained'] = 5.0;
                    outcomeFile['standard-deviation'] = 1.6;
                    outcomeFile.description = 'The ball carrier broke a tackle and gained {yards} yards.';
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
    // Handle special teams results (punt, field goal)
    if (result.specialTeams) {
        if (result.specialTeams === 'punt') {
            // Punt: change possession, set opponent yardline
            changePossession();
            gameState["opp-yardline"] = result.newYardline;
            gameState.down = 1;
            gameState.distance = 10;
            gameState.consecutiveUnsuccessfulPlays = 0;
            updateRostersForPossession();
        } else if (result.specialTeams === 'field-goal-success') {
            // Field goal made: add 3 points, change possession
            const possession = gameState.possession || 'home';
            gameState.score[possession] += 3;
            changePossession();
            gameState["opp-yardline"] = 65; // Opponent gets ball at 65 after score
            gameState.down = 1;
            gameState.distance = 10;
            gameState.consecutiveUnsuccessfulPlays = 0;
            updateRostersForPossession();
        } else if (result.specialTeams === 'field-goal-miss') {
            // Field goal missed: change possession
            changePossession();
            gameState["opp-yardline"] = result.newYardline;
            gameState.down = 1;
            gameState.distance = 10;
            gameState.consecutiveUnsuccessfulPlays = 0;
            updateRostersForPossession();
        }
        updateGameStateDisplay();
        saveGameState();
        return;
    }
    
    // Handle touchdowns
    if (result.touchdown) {
        const possession = gameState.possession || 'home';
        gameState.score[possession] += 6;
        changePossession();
        gameState["opp-yardline"] = 65; // Opponent gets ball at 65 after score
        gameState.down = 1;
        gameState.distance = 10;
        gameState.consecutiveUnsuccessfulPlays = 0;
        updateRostersForPossession();
        updateGameStateDisplay();
        saveGameState();
        return;
    }
    
    // Update yardline first
    gameState["opp-yardline"] -= result.yards;
    
    // Handle touchdown by reaching endzone
    if (gameState["opp-yardline"] <= 0) {
        gameState["opp-yardline"] = 0;
        const possession = gameState.possession || 'home';
        gameState.score[possession] += 6;
        changePossession();
        gameState["opp-yardline"] = 65; // Opponent gets ball at 65 after score
        gameState.down = 1;
        gameState.distance = 10;
        gameState.consecutiveUnsuccessfulPlays = 0;
        updateRostersForPossession();
        updateGameStateDisplay();
        saveGameState();
        return;
    }
    
    // Check for first down FIRST, before incrementing down
    if (result.yards >= gameState.distance) {
        // First down achieved
        gameState.down = 1;
        gameState.distance = 10;
        gameState.consecutiveUnsuccessfulPlays = 0;
    } else {
        // Did not get first down - update down and distance
        gameState.down += 1;
        gameState.distance -= result.yards;
        
        // Handle turnover on downs
        if (gameState.down > 4) {
            changePossession();
            gameState.down = 1;
            gameState.distance = 10;
            gameState.consecutiveUnsuccessfulPlays = 0;
            // Opponent gets ball at current yardline (100 - current yardline)
            gameState["opp-yardline"] = 100 - gameState["opp-yardline"];
            updateRostersForPossession();
        }
    }
    
    // Handle turnovers (interceptions, fumbles)
    if (result.turnover) {
        changePossession();
        gameState.down = 1;
        gameState.distance = 10;
        gameState.consecutiveUnsuccessfulPlays = 0;
        // Opponent gets ball at current yardline
        gameState["opp-yardline"] = 100 - gameState["opp-yardline"];
        updateRostersForPossession();
    }
    
    // Track consecutive unsuccessful plays
    if (result.outcomeType === 'unsuccessful' || (result.yards < gameState.distance && result.outcomeType !== 'explosive' && result.outcomeType !== 'successful')) {
        gameState.consecutiveUnsuccessfulPlays = (gameState.consecutiveUnsuccessfulPlays || 0) + 1;
    } else {
        gameState.consecutiveUnsuccessfulPlays = 0;
    }
    
    updateGameStateDisplay();
    saveGameState();
}

function changePossession() {
    gameState.possession = gameState.possession === 'home' ? 'away' : 'home';
}

async function executePunt() {
    // Roll for punt distance (40-65 yards)
    const distance = Math.floor(Math.random() * 26) + 40; // 40 to 65
    
    // Calculate new yardline
    let newYardline;
    if (gameState["opp-yardline"] - distance < 0) {
        // Touchback
        newYardline = 80;
    } else {
        // 100 - (current yardline - distance)
        newYardline = 100 - (gameState["opp-yardline"] - distance);
    }
    
    const result = {
        specialTeams: 'punt',
        yards: distance,
        newYardline: newYardline,
        description: `Punt traveled ${distance} yards. ${newYardline === 80 ? 'Touchback.' : `Opponent starts at ${newYardline} yard line.`}`
    };
    
    // Show result
    showSpecialTeamsResult(result);
    updateGameState(result);
    resetPlay();
}

async function executeFieldGoal() {
    const currentYardline = gameState["opp-yardline"];
    // 95% success minus 1.81% per yardline
    const successChance = 95 - (currentYardline * 1.81);
    const roll = Math.random() * 100;
    
    let result;
    if (roll <= successChance) {
        // Field goal made
        result = {
            specialTeams: 'field-goal-success',
            points: 3,
            description: `Field goal is GOOD! 3 points awarded.`
        };
    } else {
        // Field goal missed
        const newYardline = 100 - currentYardline;
        result = {
            specialTeams: 'field-goal-miss',
            newYardline: newYardline,
            description: `Field goal is NO GOOD. Turnover on downs. Opponent starts at ${newYardline} yard line.`
        };
    }
    
    // Show result
    showSpecialTeamsResult(result);
    updateGameState(result);
    resetPlay();
}

function showSpecialTeamsResult(result) {
    // Show results in the results section
    document.getElementById('results').classList.remove('hidden');
    document.getElementById('llmOutput').textContent = '';
    document.getElementById('playRationale').value = '';
    document.getElementById('outcomeType').textContent = result.specialTeams === 'punt' ? 'Punt' : 
        (result.specialTeams === 'field-goal-success' ? 'Field Goal - GOOD' : 'Field Goal - NO GOOD');
    document.getElementById('outcomeText').textContent = result.description;
    document.getElementById('yardsGained').textContent = result.yards ? `Distance: ${result.yards} yards` : '';
    document.getElementById('rateComparison').style.display = 'none';
}

function updateFatigue(playData) {
    // Get all players who were on the field
    const playersOnField = new Set();
    [...playData.offense, ...playData.defense].forEach(player => {
        playersOnField.add(player.name);
    });
    
    // Update stamina for all players in all rosters
    Object.keys(rosters).forEach(rosterKey => {
        if (rosterKey !== 'offense' && rosterKey !== 'defense') {
            rosters[rosterKey].forEach(player => {
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
        }
    });
    
    // Also update active rosters
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
    // Show step 0 if 4th down, otherwise step 1
    if (gameState.down === 4) {
        renderStep(0);
    } else {
        renderStep(1);
        renderPersonnelSelection();
    }
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

function toggleOffenseAssignments() {
    const hide = document.getElementById('hideOffenseAssignments').checked;
    const offenseGroups = ['offenseSkillAssignments', 'offenseLineAssignments'];
    offenseGroups.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.style.display = hide ? 'none' : '';
        }
    });
    // Also hide offensive playcall dropdown
    const playcallSelect = document.getElementById('offensivePlaycall');
    if (playcallSelect) {
        playcallSelect.parentElement.style.display = hide ? 'none' : '';
    }
    // Hide offensive playcall diagram
    const diagram = document.getElementById('playcallDiagram');
    if (diagram) {
        diagram.parentElement.style.display = hide ? 'none' : '';
    }
}

function toggleDefenseAssignments() {
    const hide = document.getElementById('hideDefenseAssignments').checked;
    const defenseGroups = ['defenseLineAssignments', 'defenseLBAssignments', 'defenseSecondaryAssignments'];
    defenseGroups.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.style.display = hide ? 'none' : '';
        }
    });
    // Also hide defensive playcall dropdown
    const playcallSelect = document.getElementById('defensivePlaycall');
    if (playcallSelect) {
        playcallSelect.parentElement.style.display = hide ? 'none' : '';
    }
    // Hide defensive playcall diagram
    const diagram = document.getElementById('defensePlaycallDiagram');
    if (diagram) {
        diagram.parentElement.style.display = hide ? 'none' : '';
    }
}

function toggleOffenseCoaching() {
    const hide = document.getElementById('hideOffenseCoaching').checked;
    const coachingDiv = document.getElementById('coachingPlayerOffense').parentElement;
    if (coachingDiv) {
        coachingDiv.style.display = hide ? 'none' : '';
    }
}

function toggleDefenseCoaching() {
    const hide = document.getElementById('hideDefenseCoaching').checked;
    const coachingDiv = document.getElementById('coachingPlayerDefense').parentElement;
    if (coachingDiv) {
        coachingDiv.style.display = hide ? 'none' : '';
    }
}

// Initialize on load
init();

