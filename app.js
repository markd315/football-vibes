// Global state
let gameState = {};
let rosters = { 
    'home-offense': [], 
    'home-defense': [], 
    'away-offense': [], 
    'away-defense': [] 
};
let teams = {}; // Team information from teams.json
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
let timingConfig = null; // Timing configuration from timing.json
let fatigueConfig = null; // Fatigue configuration from fatigue.json
let availableTeams = []; // Available teams from rosters folder
let promptCacheEnabled = false; // Whether prompt caching is enabled
let cacheExpiryTime = null; // When the cache expires (Date object)
let cacheTimerInterval = null; // Interval for updating cache timer display
let traitAdjustments = []; // Trait adjustments applied in the current play

// Initialize
async function init() {
    try {
        console.log('Initializing application...');
        await loadGameState();
        await loadAvailableTeams();
        await loadFieldLocations();
        await loadStateMachine();
        await loadBaselineRates();
        await loadTiming();
        await loadFatigue();
        
        populateTeamSelectors();
        console.log('Initialization complete - showing team selection');
    } catch (error) {
        console.error('Error during initialization:', error);
    }
}

// Load available teams by scanning rosters folder
async function loadAvailableTeams() {
    try {
        const response = await fetch('rosters/teams.json?_=' + Date.now()); // Cache bust
        if (response.ok) {
            const teamsData = await response.json();
            console.log('Raw teams.json data:', teamsData);
            availableTeams = [];
            // Load all teams from teams.json
            for (const [id, team] of Object.entries(teamsData)) {
                availableTeams.push({
                    id: id,
                    name: team.name,
                    city: team.city || '',
                    record: team.record || '',
                    offenseFile: team.roster || `${id}-offense.json`,
                    defenseFile: team.defense || `${id}-defense.json`
                });
            }
        } else {
            console.error('Failed to load teams.json:', response.status);
        }
        console.log('Available teams:', availableTeams);
    } catch (error) {
        console.error('Error loading available teams:', error);
        availableTeams = [
            { id: 'rams', name: 'Rams', city: 'Los Angeles', record: '', offenseFile: 'rams-offense.json', defenseFile: 'rams-defense.json' },
            { id: 'jaguars', name: 'Jaguars', city: 'Jacksonville', record: '', offenseFile: 'jaguars-offense.json', defenseFile: 'jaguars-defense.json' }
        ];
    }
}

// Populate team selection dropdowns
function populateTeamSelectors() {
    const homeSelect = document.getElementById('homeTeamSelect');
    const awaySelect = document.getElementById('awayTeamSelect');
    
    availableTeams.forEach(team => {
        const displayName = team.city ? `${team.city} ${team.name}` : team.name;
        const recordStr = team.record ? ` (${team.record})` : '';
        
        homeSelect.innerHTML += `<option value="${team.id}">${displayName}${recordStr}</option>`;
        awaySelect.innerHTML += `<option value="${team.id}">${displayName}${recordStr}</option>`;
    });
    
    homeSelect.addEventListener('change', () => updateTeamPreview('home'));
    awaySelect.addEventListener('change', () => updateTeamPreview('away'));
}

// Update team preview when selection changes
async function updateTeamPreview(side) {
    const select = document.getElementById(`${side}TeamSelect`);
    const preview = document.getElementById(`${side}TeamPreview`);
    const teamId = select.value;
    
    if (!teamId) {
        preview.innerHTML = '';
        checkStartGameButton();
        return;
    }
    
    const team = availableTeams.find(t => t.id === teamId);
    if (!team) return;
    
    // Load roster to show preview
    try {
        const offenseResp = await fetch(`rosters/${team.offenseFile}`);
        const defenseResp = await fetch(`rosters/${team.defenseFile}`);
        
        if (offenseResp.ok && defenseResp.ok) {
            const offense = await offenseResp.json();
            const defense = await defenseResp.json();
            
            const offCat = categorizeOffense(offense);
            const defCat = categorizeDefense(defense);
            const offEval = calcWeightedEval(offCat);
            const defEval = calcWeightedEval(defCat);
            const overall = (offEval + defEval) / 2;
            
            preview.innerHTML = `
                <div style="font-size: 1.2em; font-weight: bold; margin-bottom: 10px;">
                    ${team.city ? team.city + ' ' : ''}${team.name}
                </div>
                <div style="font-size: 1.1em; margin-bottom: 8px;">Overall: <strong>${overall.toFixed(1)}</strong></div>
                <div style="font-size: 0.85em; color: #666;">
                    <div><strong>Offense:</strong> ${offEval.toFixed(1)} weighted</div>
                    <div style="margin-left: 10px; font-size: 0.9em;">
                        Starters: ${tierAvg(offCat.starters).toFixed(0)} | Subs: ${tierAvg(offCat.subs).toFixed(0)} | Backup: ${tierAvg(offCat.backups).toFixed(0)} | Depth: ${tierAvg(offCat.depth).toFixed(0)}
                    </div>
                    <div style="margin-top: 5px;"><strong>Defense:</strong> ${defEval.toFixed(1)} weighted</div>
                    <div style="margin-left: 10px; font-size: 0.9em;">
                        Starters: ${tierAvg(defCat.starters).toFixed(0)} | Subs: ${tierAvg(defCat.subs).toFixed(0)} | Backup: ${tierAvg(defCat.backups).toFixed(0)} | Depth: ${tierAvg(defCat.depth).toFixed(0)}
                    </div>
                </div>
            `;
        }
    } catch (e) {
        preview.innerHTML = '<div style="color: #c00;">Error loading roster</div>';
    }
    
    checkStartGameButton();
}

function calcAvgPercentile(players) {
    if (!players.length) return 0;
    return players.reduce((sum, p) => sum + (p.percentile || 0), 0) / players.length;
}

// Weighted eval calculation matching team-eval.js
const EVAL_WEIGHTS = { starters: 1.0, subs: 0.35, backups: 0.05, depth: 0.01 };

function categorizeOffense(players) {
    const byPos = {};
    players.forEach(p => { byPos[p.position] = byPos[p.position] || []; byPos[p.position].push(p); });
    for (const pos in byPos) byPos[pos].sort((a, b) => b.percentile - a.percentile);
    
    const starters = [], subs = [], backups = [], depth = [];
    if (byPos['QB']?.[0]) starters.push(byPos['QB'][0]);
    if (byPos['RB']?.[0]) starters.push(byPos['RB'][0]);
    for (let i = 0; i < 3 && byPos['WR']?.[i]; i++) starters.push(byPos['WR'][i]);
    if (byPos['TE']?.[0]) starters.push(byPos['TE'][0]);
    for (let i = 0; i < 2 && byPos['OT']?.[i]; i++) starters.push(byPos['OT'][i]);
    for (let i = 0; i < 2 && byPos['OG']?.[i]; i++) starters.push(byPos['OG'][i]);
    if (byPos['C']?.[0]) starters.push(byPos['C'][0]);
    
    if (byPos['RB']?.[1]) subs.push(byPos['RB'][1]);
    if (byPos['WR']?.[3]) subs.push(byPos['WR'][3]);
    if (byPos['WR']?.[4]) subs.push(byPos['WR'][4]);
    if (byPos['TE']?.[1]) subs.push(byPos['TE'][1]);
    
    const used = { QB: 1, RB: 2, WR: 5, TE: 2, OT: 2, OG: 2, C: 1 };
    for (const pos in byPos) {
        const idx = used[pos] || 0;
        if (byPos[pos][idx]) { backups.push(byPos[pos][idx]); used[pos] = idx + 1; }
    }
    for (const pos in byPos) {
        const idx = used[pos] || 0;
        for (let i = idx; i < byPos[pos].length; i++) depth.push(byPos[pos][i]);
    }
    return { starters, subs, backups, depth };
}

function categorizeDefense(players) {
    const byPos = {};
    players.forEach(p => { byPos[p.position] = byPos[p.position] || []; byPos[p.position].push(p); });
    for (const pos in byPos) byPos[pos].sort((a, b) => b.percentile - a.percentile);
    
    const starters = [], subs = [], backups = [], depth = [];
    const allDBs = [...(byPos['CB'] || []), ...(byPos['S'] || [])].sort((a, b) => b.percentile - a.percentile);
    
    for (let i = 0; i < 4 && byPos['DE']?.[i]; i++) starters.push(byPos['DE'][i]);
    for (let i = 0; i < 2 && byPos['DT']?.[i]; i++) starters.push(byPos['DT'][i]);
    if (byPos['MLB']?.[0]) starters.push(byPos['MLB'][0]);
    for (let i = 0; i < 2 && byPos['LB']?.[i]; i++) starters.push(byPos['LB'][i]);
    for (let i = 0; i < 5 && allDBs[i]; i++) starters.push(allDBs[i]);
    
    if (byPos['LB']?.[2]) subs.push(byPos['LB'][2]);
    if (allDBs[5]) subs.push(allDBs[5]);
    
    const used = { DE: 4, DT: 2, MLB: 1, LB: 3 };
    const usedDBs = new Set(allDBs.slice(0, 6).map(p => p.name));
    for (const pos of ['DE', 'DT', 'MLB', 'LB']) {
        const idx = used[pos] || 0;
        if (byPos[pos]?.[idx]) { backups.push(byPos[pos][idx]); used[pos] = idx + 1; }
    }
    for (const pos of ['CB', 'S']) {
        const rem = (byPos[pos] || []).filter(p => !usedDBs.has(p.name));
        if (rem[0]) { backups.push(rem[0]); usedDBs.add(rem[0].name); }
    }
    for (const pos of ['DE', 'DT', 'MLB', 'LB']) {
        const idx = used[pos] || 0;
        for (let i = idx; i < (byPos[pos]?.length || 0); i++) depth.push(byPos[pos][i]);
    }
    for (const pos of ['CB', 'S']) {
        depth.push(...(byPos[pos] || []).filter(p => !usedDBs.has(p.name)));
    }
    return { starters, subs, backups, depth };
}

function calcWeightedEval(categories) {
    let totalWeight = 0, weightedSum = 0;
    for (const [tier, players] of Object.entries(categories)) {
        const w = EVAL_WEIGHTS[tier];
        for (const p of players) { weightedSum += p.percentile * w; totalWeight += w; }
    }
    return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

function tierAvg(players) {
    return players.length ? players.reduce((s, p) => s + p.percentile, 0) / players.length : 0;
}

function checkStartGameButton() {
    const homeTeam = document.getElementById('homeTeamSelect').value;
    const awayTeam = document.getElementById('awayTeamSelect').value;
    const btn = document.getElementById('startGameBtn');
    btn.disabled = !(homeTeam && awayTeam);
}

// Start game after team selection
async function startGame() {
    const homeTeamId = document.getElementById('homeTeamSelect').value;
    const awayTeamId = document.getElementById('awayTeamSelect').value;
    
    const homeTeam = availableTeams.find(t => t.id === homeTeamId);
    const awayTeam = availableTeams.find(t => t.id === awayTeamId);
    
    if (!homeTeam || !awayTeam) return;
    
    // Read cache setting
    promptCacheEnabled = document.getElementById('enableCacheCheckbox').checked;
    console.log('Prompt caching enabled:', promptCacheEnabled);
    
    // Update teams object
    teams = {
        home: { name: homeTeam.name, city: homeTeam.city, record: homeTeam.record },
        away: { name: awayTeam.name, city: awayTeam.city, record: awayTeam.record }
    };
    
    // Load the selected rosters
    await loadSelectedRosters(homeTeam, awayTeam);
    
    console.log('Rosters loaded:', {
        'home-offense': rosters['home-offense'].length,
        'home-defense': rosters['home-defense'].length,
        'away-offense': rosters['away-offense'].length,
        'away-defense': rosters['away-defense'].length
    });
    
    // Hide team selection, show main game
    document.getElementById('teamSelectionScreen').classList.add('hidden');
    document.getElementById('mainGameContainer').classList.remove('hidden');
    
    
    // Initialize personnel for the game
    updateRostersForPossession();
    renderPersonnelSelection();
    updatePersonnelDisplay();
    
    renderStep(0);
    updateGameStateDisplay();
    console.log('Game started successfully');
}

// Update cache timer display (Play Clock)
function updateCacheTimer() {
    const timerEl = document.getElementById('cacheTimer');
    if (!timerEl) return;
    
    if (!cacheExpiryTime) {
        timerEl.textContent = '--:--';
        timerEl.style.color = '#888';
        return;
    }
    
    const now = Date.now();
    const remaining = Math.max(0, cacheExpiryTime - now);
    
    if (remaining === 0) {
        timerEl.textContent = 'EXPIRED';
        timerEl.style.color = '#f44336';
        cacheExpiryTime = null;
        return;
    }
    
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    timerEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    
    // Color based on time remaining
    if (remaining > 180000) {
        timerEl.style.color = '#4CAF50'; // Green > 3 min
    } else if (remaining > 60000) {
        timerEl.style.color = '#FFC107'; // Yellow 1-3 min
    } else {
        timerEl.style.color = '#f44336'; // Red < 1 min
    }
}

// Start cache timer countdown
function startCacheTimer() {
    cacheExpiryTime = Date.now() + (5 * 60 * 1000); // 5 minutes from now
    
    // Clear any existing interval
    if (cacheTimerInterval) {
        clearInterval(cacheTimerInterval);
    }
    
    // Update immediately and then every second
    updateCacheTimer();
    cacheTimerInterval = setInterval(updateCacheTimer, 1000);
}

// Refresh cache timer (called on cache hit)
function refreshCacheTimer() {
    cacheExpiryTime = Date.now() + (5 * 60 * 1000); // Reset to 5 minutes
    updateCacheTimer();
}

async function loadSelectedRosters(homeTeam, awayTeam) {
    // Load home offense
    const homeOffenseResp = await fetch(`rosters/${homeTeam.offenseFile}`);
    rosters['home-offense'] = await homeOffenseResp.json();
    rosters['home-offense'].forEach(p => { if (p.stamina === undefined) p.stamina = 100.0; });
    
    // Load home defense
    const homeDefenseResp = await fetch(`rosters/${homeTeam.defenseFile}`);
    rosters['home-defense'] = await homeDefenseResp.json();
    rosters['home-defense'].forEach(p => { if (p.stamina === undefined) p.stamina = 100.0; });
    
    // Load away offense
    const awayOffenseResp = await fetch(`rosters/${awayTeam.offenseFile}`);
    rosters['away-offense'] = await awayOffenseResp.json();
    rosters['away-offense'].forEach(p => { if (p.stamina === undefined) p.stamina = 100.0; });
    
    // Load away defense
    const awayDefenseResp = await fetch(`rosters/${awayTeam.defenseFile}`);
    rosters['away-defense'] = await awayDefenseResp.json();
    rosters['away-defense'].forEach(p => { if (p.stamina === undefined) p.stamina = 100.0; });
}

// General helper to load JSON config files
async function loadJsonConfig(path, defaultValue = null) {
    try {
        const response = await fetch(path);
        if (!response.ok) {
            throw new Error(`Failed to load ${path}: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`Error loading ${path}:`, error);
        if (defaultValue !== null) {
            console.warn(`Using default value for ${path}`);
            return defaultValue;
        }
        throw error;
    }
}

// Load baseline rates
async function loadBaselineRates() {
    const defaultValue = {
        "success-rate": 43.0,
        "havoc-rate": 12.0,
        "explosive-rate": 10.0
    };
    baselineRates = await loadJsonConfig('context/eval-format.json', defaultValue);
}

// Load timing configuration
async function loadTiming() {
    const defaultValue = {
        "timeout-runoff": 6,
        "winning-team": {
            "run": 44,
            "pass": 28
        },
        "losing-team": {
            "run": 36,
            "pass": 19
        }
    };
    timingConfig = await loadJsonConfig('outcomes/timing.json', defaultValue);
}

// Load fatigue configuration
async function loadFatigue() {
    const defaultValue = {
        "baseline-fatigue": 2.5,
        "baseline-recovery": 2.25,
        "position-modifiers": {
            "always": {
                "DE": 1.0,
                "DT": 1.0
            },
            "run": {
                "LB": 1.0,
                "MLB": 1.0,
                "RB": 1.0,
                "OT": 0.5,
                "OG": 0.5,
                "C": 0.5
            },
            "pass": {
                "WR": 1.0,
                "CB": 1.0,
                "S": 1.0
            }
        },
        "effectiveness-curve": {
            "high-stamina-threshold": 85,
            "high-stamina-multiplier": 0.99,
            "medium-stamina-threshold": 60,
            "medium-stamina-multiplier": 0.80,
            "min-multiplier": 0.20
        }
    };
    fatigueConfig = await loadJsonConfig('fatigue.json', defaultValue);
}

// Load data files
async function loadGameState() {
    const defaultValue = {
        possession: "home",
        quarter: 1,
        down: 1,
        distance: 10,
        "opp-yardline": 65,
        score: { home: 0, away: 0 },
        time: "15:00",
        timeouts: { home: 3, away: 3 },
        timeoutCalled: false
    };
    
    try {
        gameState = await loadJsonConfig('gamestate.json', defaultValue);
        // Initialize timeouts if missing
        if (!gameState.timeouts) {
            gameState.timeouts = { home: 3, away: 3 };
        }
        if (gameState.timeoutCalled === undefined) {
            gameState.timeoutCalled = false;
        }
    } catch (error) {
        gameState = defaultValue;
    }
}

// loadTeams and loadRosters are now handled by team selection screen

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
    fieldLocations = await loadJsonConfig('fieldlocations.json', []);
    renderField();
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

// Helper to resolve location name to full position object (name, x, y, section)
// Does a global sweep to find all matches, then filters by side of Y=0 and section type
function resolveLocationName(locationName, preferDefensive = false, preferredSection = null) {
    if (!fieldLocations || !locationName) return null;
    
    // First, do a global sweep to find ALL matching location names
    const allMatches = [];
    for (const section of fieldLocations) {
        for (const loc of section.Locations) {
            if (loc.Name === locationName) {
                allMatches.push({
                    name: loc.Name,
                    x: loc.X,
                    y: loc.Y,
                    section: section.Section
                });
            }
        }
    }
    
    if (allMatches.length === 0) return null;
    if (allMatches.length === 1) return allMatches[0];
    
    // Multiple matches found - filter by criteria
    let filtered = allMatches;
    
    // Filter by section if specified
    if (preferredSection) {
        const sectionFiltered = filtered.filter(m => 
            m.section.toLowerCase().includes(preferredSection.toLowerCase())
        );
        if (sectionFiltered.length > 0) {
            filtered = sectionFiltered;
        }
    }
    
    // Filter by side of Y=0 line (defensive = Y > 0, offensive = Y < 0)
    if (preferDefensive) {
        // Prefer defensive positions (Y > 0)
        const defensiveMatches = filtered.filter(m => m.y > 0);
        if (defensiveMatches.length > 0) {
            filtered = defensiveMatches;
        }
    } else {
        // Prefer offensive positions (Y < 0)
        const offensiveMatches = filtered.filter(m => m.y < 0);
        if (offensiveMatches.length > 0) {
            filtered = offensiveMatches;
        }
    }
    
    // If still multiple matches, prefer positions closer to Y=0 (line of scrimmage)
    if (filtered.length > 1) {
        filtered.sort((a, b) => Math.abs(a.y) - Math.abs(b.y));
    }
    
    return filtered[0];
}

// Helper to resolve formation position (handles both old format with x/y and new format with just name)
function resolveFormationPosition(pos, preferDefensive = false, preferredSection = null) {
    // If it's already a resolved position with x, y, return as-is
    if (pos.x !== undefined && pos.y !== undefined) {
        return pos;
    }
    // If it's just a string (location name), resolve it
    if (typeof pos === 'string') {
        return resolveLocationName(pos, preferDefensive, preferredSection);
    }
    // If it's an object with just a name, resolve it
    if (pos.name && pos.x === undefined) {
        const resolved = resolveLocationName(pos.name, preferDefensive, preferredSection);
        return resolved ? { ...resolved, ...pos } : pos;
    }
    return pos;
}

async function loadStateMachine() {
    stateMachine = await loadJsonConfig('play-state-machine.json', {});
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
    
    const percentileResult = calculateEffectivePercentile(player);
    const effectivePercentile = typeof percentileResult === 'object' ? percentileResult.effectivePercentile : percentileResult;
    const basePercentile = player.percentile || 50;
    const playerId = `${side}-${index}`;
    const isSelected = side === 'offense' ? selectedPlayers.includes(playerId) : selectedDefense.includes(playerId);
    
    if (isSelected) {
        card.classList.add('selected');
    }
    
    // Find strongest trait
    const strongestTrait = getStrongestTrait(player);
    
    // Format percentile: bold, underline if >85%
    const percentileStyle = effectivePercentile > 85 ? 'font-weight: bold; text-decoration: underline;' : 'font-weight: bold;';
    const percentileDisplay = `<span style="${percentileStyle}">${effectivePercentile.toFixed(0)}%</span>`;
    
    // Format stamina: 0 decimals, bold if <70%
    const staminaValue = player.stamina !== undefined ? player.stamina : 100;
    const staminaRounded = Math.round(staminaValue);
    const staminaStyle = staminaRounded < 70 ? 'font-weight: bold;' : '';
    const staminaDisplay = `<span style="${staminaStyle}">${staminaRounded}%</span>`;
    
    // Calculate bar color based on effective percentile (green to red)
    const effectiveBarColor = getPercentileColor(effectivePercentile);
    
    card.innerHTML = `
        <div class="player-name">${player.name} #${player.jersey}</div>
        <div class="player-info">${player.position} | ${percentileDisplay} | Stamina: ${staminaDisplay}</div>
        <div class="player-bars">
            <div class="effective-bar" style="width: ${effectivePercentile}%; background: ${effectiveBarColor};"></div>
            <div class="stamina-bar-thin" style="width: ${staminaValue}%;"></div>
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

function getPercentileColor(percentile) {
    // Color gradient from red (0%) to yellow (50%) to green (100%)
    const p = Math.max(0, Math.min(100, percentile));
    let r, g;
    if (p < 50) {
        // Red to yellow
        r = 255;
        g = Math.round((p / 50) * 255);
    } else {
        // Yellow to green
        r = Math.round((1 - (p - 50) / 50) * 255);
        g = 255;
    }
    return `rgb(${r}, ${g}, 0)`;
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
    
    // Update timeout counts
    const homeTimeouts = gameState.timeouts?.home || 3;
    const awayTimeouts = gameState.timeouts?.away || 3;
    
    // Get team names from teams.json
    const homeTeamName = teams.home ? `${teams.home.city} ${teams.home.name}`.trim() : 'Home';
    const awayTeamName = teams.away ? `${teams.away.city} ${teams.away.name}`.trim() : 'Away';
    
    personnelDisplay.innerHTML = `
        <div style="display: flex; gap: 30px; align-items: center; justify-content: space-between;">
            <div style="display: flex; gap: 30px;">
                <div>
                    <strong>Offensive Personnel:</strong> ${offensePersonnel}
                </div>
                <div>
                    <strong>Defensive Personnel:</strong> ${defensePersonnel}
                </div>
            </div>
            <div style="display: flex; gap: 15px;">
                <button onclick="callTimeout('home')" class="btn-secondary" id="homeTimeoutBtn" style="padding: 8px 15px; font-size: 0.9em;" ${homeTimeouts === 0 ? 'disabled' : ''}>
                    ${homeTeamName} Timeout (<span id="homeTimeouts">${homeTimeouts}</span>)
                </button>
                <button onclick="callTimeout('away')" class="btn-secondary" id="awayTimeoutBtn" style="padding: 8px 15px; font-size: 0.9em;" ${awayTimeouts === 0 ? 'disabled' : ''}>
                    ${awayTeamName} Timeout (<span id="awayTimeouts">${awayTimeouts}</span>)
                </button>
            </div>
        </div>
    `;
    
    // Refresh formation dropdowns if we're on step 2 (formation building)
    if (currentStep === 2) {
        renderFormationDropdowns();
    }
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

// Helper function to check if a location is a "box location"
// Box locations: tight to tight (X: -5.5 to 5.5), all gaps, all defensive line techniques, QB/RB backfield, Over Center
function isBoxLocation(location, sectionName) {
    // All defensive line techniques (all techs) - entire section (includes 9 tech, 8 tech, etc.)
    if (sectionName === "Defensive line of scrimmage") {
        return true;
    }
    
    // All gap locations (A, B, C, or D gap) - in defensive backfield or box safety sections
    if (location.Name && location.Name.toLowerCase().includes("gap")) {
        return true;
    }
    
    // Over Center positions (shallow and deep)
    if (location.Name && location.Name.toLowerCase().includes("over center")) {
        return true;
    }
    
    // All QB and RB backfield positions (but NOT trips positions - those are coverage, not box)
    if (sectionName === "Offensive backfield") {
        // Exclude trips positions - they are coverage positions, not box positions
        if (location.Name && location.Name.toLowerCase().includes("trips")) {
            return false;
        }
        return true;
    }
    
    // Tight and Wing positions on offensive line of scrimmage (box positions, red, scaled)
    if (sectionName === "Offensive line of scrimmage") {
        // Tight positions: check by name (X = -6/6)
        if (location.Name && location.Name.toLowerCase().includes("tight")) {
            return true;
        }
        // Wing positions: check by name (X = -8/8)
        if (location.Name && location.Name.toLowerCase().includes("wing")) {
            return true;
        }
        // All OL positions (Center, Guards, Tackles) are also box positions
        if (location.Name && (
            location.Name.toLowerCase().includes("center") ||
            location.Name.toLowerCase().includes("guard") ||
            location.Name.toLowerCase().includes("tackle")
        )) {
            return true;
        }
    }
    
    // Wing positions in defensive sections (press, second level, cushion) are also box positions
    if (location.Name && location.Name.toLowerCase().includes("wing")) {
        return true;
    }
    
    // Behind tight end positions (aligned with tight end at X = -6/6)
    if (location.Name && location.Name.toLowerCase().includes("behind tight end")) {
        return true;
    }
    
    return false;
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
                    // Check if this is a box location (tight to tight, gaps, techs)
                    const isBox = isBoxLocation(location, section.Section);
                    if (isBox) {
                        // Dark red for box locations
                        ctx.fillStyle = 'rgba(139,0,0,0.3)'; // Dark red with transparency
                        ctx.strokeStyle = 'rgba(139,0,0,0.8)'; // Dark red stroke
                    } else {
                        // Grey for non-box locations
                        ctx.fillStyle = 'rgba(255,255,255,0.2)';
                        ctx.strokeStyle = '#fff';
                    }
                    ctx.beginPath();
                    ctx.arc(x, y, 20, 0, Math.PI * 2);
                    ctx.fill();
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
        'RB': { category: 'Run', action: 'IZR left' },
        'OT': { category: 'Run Block', action: 'Zone inside left' },
        'OG': { category: 'Run Block', action: 'Zone inside left' },
        'C': { category: 'Run Block', action: 'Zone inside left' },
        'WR': { category: 'Block', action: 'Block' },
        'TE': { category: 'Block', action: 'Block' }
    },
    'IZR right': {
        'QB': { category: 'Run', action: 'Handoff' },
        'RB': { category: 'Run', action: 'IZR right' },
        'OT': { category: 'Run Block', action: 'Zone inside right' },
        'OG': { category: 'Run Block', action: 'Zone inside right' },
        'C': { category: 'Run Block', action: 'Zone inside right' },
        'WR': { category: 'Block', action: 'Block' },
        'TE': { category: 'Block', action: 'Block' }
    },
    'OZR left': {
        'QB': { category: 'Run', action: 'Handoff' },
        'RB': { category: 'Run', action: 'OZR left' },
        'OT': { category: 'Run Block', action: 'Zone outside left' },
        'OG': { category: 'Run Block', action: 'Zone outside left' },
        'C': { category: 'Run Block', action: 'Zone outside left' },
        'WR': { category: 'Block', action: 'Block' },
        'TE': { category: 'Block', action: 'Block' }
    },
    'OZR right': {
        'QB': { category: 'Run', action: 'Handoff' },
        'RB': { category: 'Run', action: 'OZR right' },
        'OT': { category: 'Run Block', action: 'Zone outside right' },
        'OG': { category: 'Run Block', action: 'Zone outside right' },
        'C': { category: 'Run Block', action: 'Zone outside right' },
        'WR': { category: 'Block', action: 'Block' },
        'TE': { category: 'Block', action: 'Block' }
    },
    'Power left': {
        'QB': { category: 'Run', action: 'Handoff' },
        'RB': { category: 'Run', action: 'Left B gap' },
        'OT': { category: 'Run Block', action: 'Gap left B' }, // Weak side tackle doesn't pull
        'OG': { category: 'Run Block', action: 'Gap left A' }, // Weak side guard pulls (handled in applyOffensivePlaycall)
        'C': { category: 'Run Block', action: 'Gap left A' },
        'WR': { category: 'Block', action: 'Block' },
        'TE': { category: 'Run Block', action: 'Gap left C' }
    },
    'Power right': {
        'QB': { category: 'Run', action: 'Handoff' },
        'RB': { category: 'Run', action: 'Right B gap' },
        'OT': { category: 'Run Block', action: 'Gap right B' }, // Weak side tackle doesn't pull
        'OG': { category: 'Run Block', action: 'Gap right A' }, // Weak side guard pulls (handled in applyOffensivePlaycall)
        'C': { category: 'Run Block', action: 'Gap right A' },
        'WR': { category: 'Block', action: 'Block' },
        'TE': { category: 'Run Block', action: 'Gap right C' }
    },
    'Counter left': {
        'QB': { category: 'Run', action: 'Handoff' },
        'RB': { category: 'Run', action: 'Left C gap' },
        'OT': { category: 'Run Block', action: 'Gap left B' }, // Weak side tackle pulls (handled in applyOffensivePlaycall)
        'OG': { category: 'Run Block', action: 'Gap left A' }, // Weak side guard pulls (handled in applyOffensivePlaycall)
        'C': { category: 'Run Block', action: 'Gap left A' },
        'WR': { category: 'Block', action: 'Block' },
        'TE': { category: 'Run Block', action: 'Gap left C' }
    },
    'Counter right': {
        'QB': { category: 'Run', action: 'Handoff' },
        'RB': { category: 'Run', action: 'Right C gap' },
        'OT': { category: 'Run Block', action: 'Gap right B' }, // Weak side tackle pulls (handled in applyOffensivePlaycall)
        'OG': { category: 'Run Block', action: 'Gap right A' }, // Weak side guard pulls (handled in applyOffensivePlaycall)
        'C': { category: 'Run Block', action: 'Gap right A' },
        'WR': { category: 'Block', action: 'Block' },
        'TE': { category: 'Run Block', action: 'Gap right C' }
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
        'WR': { category: 'Route', action: '2 Slant' },
        'TE': { category: 'Route', action: '6 Shallow dig' },
        'OT': { category: 'Pass Block', action: 'Outside priority' },
        'OG': { category: 'Pass Block', action: 'Inside priority' },
        'C': { category: 'Pass Block', action: 'Inside priority' }
    },
    'Dagger': {
        'QB': { category: 'Pass', action: '5 step drop' },
        'RB': { category: 'Protect', action: 'Block left' },
        'WR': { category: 'Route', action: '6 Shallow dig' },
        'TE': { category: 'Route', action: '8 Post' },
        'OT': { category: 'Pass Block', action: 'Outside priority' },
        'OG': { category: 'Pass Block', action: 'Inside priority' },
        'C': { category: 'Pass Block', action: 'Inside priority' }
    },
    'Flood': {
        'QB': { category: 'Pass', action: '5 step drop' },
        'RB': { category: 'Protect', action: 'Block right' },
        'WR': { category: 'Route', action: '7 Corner' },
        'TE': { category: 'Route', action: '1 Flat' },
        'OT': { category: 'Pass Block', action: 'Outside priority' },
        'OG': { category: 'Pass Block', action: 'Inside priority' },
        'C': { category: 'Pass Block', action: 'Inside priority' }
    },
    'Levels': {
        'QB': { category: 'Pass', action: '3 step drop' },
        'RB': { category: 'Route', action: '1 Flat' },
        'WR': { category: 'Route', action: '6 Shallow dig' },
        'TE': { category: 'Route', action: 'Deep dig' },
        'OT': { category: 'Pass Block', action: 'Inside priority' },
        'OG': { category: 'Pass Block', action: 'Inside priority' },
        'C': { category: 'Pass Block', action: 'Inside priority' }
    },
    'Sail': {
        'QB': { category: 'Pass', action: '5 step drop' },
        'RB': { category: 'Route', action: '1 Flat' },
        'WR': { category: 'Route', action: '7 Corner' },
        'TE': { category: 'Route', action: '5 Out' },
        'OT': { category: 'Pass Block', action: 'Outside priority' },
        'OG': { category: 'Pass Block', action: 'Inside priority' },
        'C': { category: 'Pass Block', action: 'Inside priority' }
    },
    'Four Verticals': {
        'QB': { category: 'Pass', action: '7 step drop' },
        'RB': { category: 'Protect', action: 'Block left' },
        'WR': { category: 'Route', action: '9 Go/Fly/Fade' },
        'TE': { category: 'Route', action: '9 Go/Fly/Fade' },
        'OT': { category: 'Pass Block', action: 'Outside priority' },
        'OG': { category: 'Pass Block', action: 'Inside priority' },
        'C': { category: 'Pass Block', action: 'Inside priority' }
    },
    'Curl flats': {
        'QB': { category: 'Pass', action: '3 step drop' },
        'RB': { category: 'Route', action: '1 Flat' },
        'WR': { category: 'Route', action: '4 Curl/Hook' },
        'TE': { category: 'Route', action: '4 Curl/Hook' },
        'OT': { category: 'Pass Block', action: 'Inside priority' },
        'OG': { category: 'Pass Block', action: 'Inside priority' },
        'C': { category: 'Pass Block', action: 'Inside priority' }
    },
    'Mesh': {
        'QB': { category: 'Pass', action: '3 step drop' },
        'RB': { category: 'Route', action: '1 Flat' },
        'WR': { category: 'Route', action: '2 Slant' },
        'TE': { category: 'Route', action: '2 Slant' },
        'OT': { category: 'Pass Block', action: 'Inside priority' },
        'OG': { category: 'Pass Block', action: 'Inside priority' },
        'C': { category: 'Pass Block', action: 'Inside priority' }
    },
    'Drive': {
        'QB': { category: 'Pass', action: '3 step drop' },
        'RB': { category: 'Route', action: '1 Flat' },
        'WR': { category: 'Route', action: '6 Shallow dig' },
        'TE': { category: 'Route', action: '6 Shallow dig' },
        'OT': { category: 'Pass Block', action: 'Inside priority' },
        'OG': { category: 'Pass Block', action: 'Inside priority' },
        'C': { category: 'Pass Block', action: 'Inside priority' }
    },
    'Ohio': {
        'QB': { category: 'Pass', action: '5 step drop' },
        'RB': { category: 'Route', action: 'Wheel' },
        'WR': { category: 'Route', action: '8 Post' },
        'TE': { category: 'Route', action: '7 Corner' },
        'OT': { category: 'Pass Block', action: 'Outside priority' },
        'OG': { category: 'Pass Block', action: 'Inside priority' },
        'C': { category: 'Pass Block', action: 'Inside priority' }
    },
    'QB Sneak': {
        'QB': { category: 'Run', action: 'Sneak' },
        'RB': { category: 'Run', action: 'Left A gap' },
        'OT': { category: 'Run Block', action: 'Zone inside left' },
        'OG': { category: 'Run Block', action: 'Zone inside left' },
        'C': { category: 'Run Block', action: 'Zone inside left' },
        'WR': { category: 'Block', action: 'Block' },
        'TE': { category: 'Block', action: 'Block' }
    },
    'Toss left': {
        'QB': { category: 'Run', action: 'Toss left' },
        'RB': { category: 'Run', action: 'OZR left' },
        'OT': { category: 'Run Block', action: 'Zone outside left' },
        'OG': { category: 'Run Block', action: 'Zone outside left' },
        'C': { category: 'Run Block', action: 'Zone outside left' },
        'WR': { category: 'Block', action: 'Block' },
        'TE': { category: 'Block', action: 'Block' }
    },
    'Toss right': {
        'QB': { category: 'Run', action: 'Toss right' },
        'RB': { category: 'Run', action: 'OZR right' },
        'OT': { category: 'Run Block', action: 'Zone outside right' },
        'OG': { category: 'Run Block', action: 'Zone outside right' },
        'C': { category: 'Run Block', action: 'Zone outside right' },
        'WR': { category: 'Block', action: 'Block' },
        'TE': { category: 'Block', action: 'Block' }
    },
    'Flea flicker': {
        'QB': { category: 'Pass', action: 'Play action pass' },
        'RB': { category: 'Run', action: 'Flea flicker' },
        'WR': { category: 'Route', action: '9 Go/Fly/Fade' },
        'TE': { category: 'Route', action: '9 Go/Fly/Fade' },
        'OT': { category: 'Pass Block', action: 'Outside priority' },
        'OG': { category: 'Pass Block', action: 'Inside priority' },
        'C': { category: 'Pass Block', action: 'Inside priority' }
    },
    'Reverse left': {
        'QB': { category: 'Run', action: 'Handoff' },
        'RB': { category: 'Run', action: 'IZR left' },
        'WR': { category: 'Block', action: 'Jet Motion' },
        'TE': { category: 'Block', action: 'Block' },
        'OT': { category: 'Run Block', action: 'Zone outside left' },
        'OG': { category: 'Run Block', action: 'Zone outside left' },
        'C': { category: 'Run Block', action: 'Zone outside left' }
    },
    'Reverse right': {
        'QB': { category: 'Run', action: 'Handoff' },
        'RB': { category: 'Run', action: 'IZR right' },
        'WR': { category: 'Block', action: 'Jet Motion' },
        'TE': { category: 'Block', action: 'Block' },
        'OT': { category: 'Run Block', action: 'Zone outside right' },
        'OG': { category: 'Run Block', action: 'Zone outside right' },
        'C': { category: 'Run Block', action: 'Zone outside right' }
    },
    'Speed option left': {
        'QB': { category: 'Run', action: 'Speed option left' },
        'RB': { category: 'Run', action: 'OZR left' },
        'WR': { category: 'Block', action: 'Block' },
        'TE': { category: 'Block', action: 'Block' },
        'OT': { category: 'Run Block', action: 'Zone outside left' },
        'OG': { category: 'Run Block', action: 'Zone outside left' },
        'C': { category: 'Run Block', action: 'Zone outside left' }
    },
    'Speed option right': {
        'QB': { category: 'Run', action: 'Speed option right' },
        'RB': { category: 'Run', action: 'OZR right' },
        'WR': { category: 'Block', action: 'Block' },
        'TE': { category: 'Block', action: 'Block' },
        'OT': { category: 'Run Block', action: 'Zone outside right' },
        'OG': { category: 'Run Block', action: 'Zone outside right' },
        'C': { category: 'Run Block', action: 'Zone outside right' }
    },
    'Jet sweep left': {
        'QB': { category: 'Run', action: 'Handoff' },
        'RB': { category: 'Run', action: 'Sweep' },
        'WR': { category: 'Block', action: 'Jet Motion' },
        'TE': { category: 'Block', action: 'Block' },
        'OT': { category: 'Run Block', action: 'Zone outside left' },
        'OG': { category: 'Run Block', action: 'Pull' },
        'C': { category: 'Run Block', action: 'Zone outside left' }
    },
    'Jet sweep right': {
        'QB': { category: 'Run', action: 'Handoff' },
        'RB': { category: 'Run', action: 'Sweep' },
        'WR': { category: 'Block', action: 'Jet Motion' },
        'TE': { category: 'Block', action: 'Block' },
        'OT': { category: 'Run Block', action: 'Zone outside right' },
        'OG': { category: 'Run Block', action: 'Pull' },
        'C': { category: 'Run Block', action: 'Zone outside right' }
    }
};

const defensivePlaycalls = {
    'Cover 2': {
        'CB': { category: 'Zone Short', action: 'Flat L' },
        'S': { category: 'Zone Deep', action: 'Deep left (cov2)' },
        'LB': { category: 'Zone Short', action: 'Curl/Hook L' },
        'MLB': { category: 'Zone Short', action: 'Hole' },
        'Nickel': { category: 'Zone Short', action: 'Curl/Hook L' }
    },
    'Cover 2 man': {
        'CB': { category: 'Man Coverage', action: 'Inside technique man' },
        'S': { category: 'Zone Deep', action: 'Deep left (cov2)' },
        'LB': { category: 'Man Coverage', action: 'Inside technique man' },
        'MLB': { category: 'Man Coverage', action: 'Inside technique man' }
    },
    'Tampa 2': {
        'CB': { category: 'Zone Short', action: 'Flat L' },
        'S': { category: 'Zone Deep', action: 'Deep left (cov2)' },
        'LB': { category: 'Zone Short', action: 'Curl/Hook L' },
        'MLB': { category: 'Zone Short', action: 'Deep hole/Tampa' }
    },
    'Cover 1 (man)': {
        'CB': { category: 'Man Coverage', action: 'Inside technique man' },
        'S': { category: 'Zone Deep', action: 'Deep middle 1/3' },
        'LB': { category: 'Man Coverage', action: 'Inside technique man' },
        'MLB': { category: 'Man Coverage', action: 'Inside technique man' }
    },
    'Cover 1 (force)': {
        'CB': { category: 'Man Coverage', action: 'Outside technique man' },
        'S': { category: 'Zone Deep', action: 'Deep middle 1/3' },
        'LB': { category: 'Man Coverage', action: 'Inside technique man' },
        'MLB': { category: 'Man Coverage', action: 'Inside technique man' }
    },
    'Cover 1 robber': {
        'CB': { category: 'Man Coverage', action: 'Inside technique man' },
        'S': { category: 'Zone Short', action: 'Robber' },
        'LB': { category: 'Man Coverage', action: 'Inside technique man' },
        'MLB': { category: 'Man Coverage', action: 'Inside technique man' }
    },
    'Cover 3': {
        'CB': { category: 'Zone Deep', action: 'Deep left (cov3)' },
        'S': { category: 'Zone Deep', action: 'Deep middle 1/3' },
        'LB': { category: 'Zone Short', action: 'Hook L' },
        'MLB': { category: 'Zone Short', action: 'Hook R' }
    },
    'Cover 4 (spot drop)': {
        'CB': { category: 'Zone Deep', action: 'Deep far left (cov4)' },
        'S': { category: 'Zone Deep', action: 'Deep middle 1/3' },
        'LB': { category: 'Zone Short', action: 'Hook L' },
        'MLB': { category: 'Zone Short', action: 'Hook R' }
    },
    'Cover 0 (LB blitz)': {
        'CB': { category: 'Man Coverage', action: 'Inside technique man' },
        'S': { category: 'Man Coverage', action: 'Inside technique man' },
        'LB': { category: 'Rush', action: 'Left A gap' },
        'MLB': { category: 'Rush', action: 'Right A gap' }
    },
    'Cover 0 (CB blitz)': {
        'CB': { category: 'Rush', action: 'Left C gap' },
        'S': { category: 'Man Coverage', action: 'Inside technique man' },
        'LB': { category: 'Man Coverage', action: 'Inside technique man' },
        'MLB': { category: 'Man Coverage', action: 'Inside technique man' }
    },
    'Quarters Match 3x1': 'bracket-3x1',
    'Quarters Match 2x2': 'bracket-2x2'
};

// Assignment categories and actions
const offensiveAssignments = {
    'QB': {
        'Pass': ['5 step drop', 'Boot right', 'Boot left', 'Play action pass', '3 step drop', '7 step drop'],
        'Run': ['QB draw', 'Zone read left', 'Zone read right', 'Speed option left', 'Speed option right', 'Toss left', 'Toss right', 'Sneak', 'Handoff']
    },
    'RB': {
        'Protect': ['Block left', 'Block right', 'Leak/delay left', 'Leak/delay right'],
        'Run': ['IZR left', 'IZR right', 'OZR left', 'OZR right', 'Left A gap', 'Left B gap', 'Right A gap', 'Right B gap', 'Left C gap', 'Right C gap', 'Flea flicker', 'Sweep'],
        'Route': ['Wheel', 'Tunnel screen', '1 Flat', 'Short hitch', 'Flat left', 'Flat right', 'Angle']
    },
    'WR': {
        'Block': ['Block', 'Jet Motion', 'Jet motion option'],
        'Route': ['1 Flat', 'Short hitch', '2 Slant', 'Slant-and-go', '3 Comeback', '4 Curl/Hook', '5 Out', 'Out-and-up', 'Deep out', '6 Shallow dig', 'Drag', '7 Corner', '8 Post', 'Skinny post', 'Post-corner', '9 Go/Fly/Fade', 'Deep dig', 'Whip route', 'Chip+Delay', 'Screen']
    },
    'TE': {
        'Block': ['Block', 'Jet Motion', 'Jet motion option'],
        'Pass Block': ['Inside priority', 'Outside priority', 'Slide left', 'Slide right'],
        'Run Block': ['Zone inside left', 'Zone inside right', 'Zone outside left', 'Zone outside right', 'Gap left A', 'Gap left B', 'Gap left C', 'Gap right A', 'Gap right B', 'Gap right C', 'Pull', 'Seal edge', 'Combo'],
        'Route': ['1 Flat', 'Short hitch', '2 Slant', 'Slant-and-go', '3 Comeback', '4 Curl/Hook', '5 Out', 'Out-and-up', 'Deep out', '6 Shallow dig', 'Drag', '7 Corner', '8 Post', 'Skinny post', 'Post-corner', '9 Go/Fly/Fade', 'Deep dig', 'Whip route', 'Chip+Delay']
    },
    'OT': {
        'Pass Block': ['Inside priority', 'Outside priority', 'Slide left', 'Slide right'],
        'Run Block': ['Zone inside left', 'Zone inside right', 'Zone outside left', 'Zone outside right', 'Gap left A', 'Gap left B', 'Gap left C', 'Gap right A', 'Gap right B', 'Gap right C', 'Pull', 'Seal edge', 'Combo']
    },
    'OG': {
        'Pass Block': ['Inside priority', 'Outside priority', 'Slide left', 'Slide right'],
        'Run Block': ['Zone inside left', 'Zone inside right', 'Zone outside left', 'Zone outside right', 'Gap left A', 'Gap left B', 'Gap left C', 'Gap right A', 'Gap right B', 'Gap right C', 'Pull', 'Seal edge', 'Combo']
    },
    'C': {
        'Pass Block': ['Inside priority', 'Outside priority', 'Slide left', 'Slide right'],
        'Run Block': ['Zone inside left', 'Zone inside right', 'Zone outside left', 'Zone outside right', 'Gap left A', 'Gap left B', 'Gap left C', 'Gap right A', 'Gap right B', 'Gap right C', 'Pull', 'Seal edge', 'Combo']
    }
};

    // All defensive assignment options available to all positions
const allDefensiveCategories = {
    'Man Coverage': ['Inside technique man', 'Deep technique man', 'Outside technique man', 'Trail technique man', 'Inside match man', 'Outside match man'],
    'Quarters Match': ['LOCK+MEG', 'TRAIL+APEX', 'CAP+DEEP', 'CUT+CROSSER'],
    'Zone Deep': ['Deep middle 1/3', 'Deep left (cov2)', 'Deep right (cov2)', 'Deep left (cov3)', 'Deep right (cov3)', 'Deep far left (cov4)', 'Deep far right (cov4)', 'Deep seam left (cov4)', 'Deep seam right (cov4)', 'Deep left/right seam+fit shallow'],
    'Zone Short': ['Robber', 'Flat/Out L', 'Flat/Out R', 'Curl/Flat L', 'Curl/Flat R', 'Curl/Hook L', 'Curl/Hook R', 'Curl/Hole L', 'Curl/Hole R', 'Flat L', 'Flat R', 'Out L', 'Out R', 'Curl L', 'Curl R', 'Hook L', 'Hook R', 'Hole', 'Deep hole/Tampa', 'Spy'],
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
    // Filter by Y sign: negative for offense (bottom half)
    function getLocationCoords(locationName) {
        for (const section of fieldLocations) {
            for (const loc of section.Locations) {
                if (loc.Name === locationName && loc.Y < 0) {
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
        } else if (assignment.action.includes('Shallow dig') || assignment.action.includes('Deep dig')) {
            // Dig routes: stem forward, then 90° turn IN toward center
            routeDef = { stemLength: routeLength * 0.4, turnAngle: -90, continueLength: routeLength * 0.5, direction: 'in' };
        } else if (assignment.action.includes('Drag')) {
            // Drag: short stem forward, then 90° turn IN toward center (shorter than dig)
            routeDef = { stemLength: routeLength * 0.25, turnAngle: -90, continueLength: routeLength * 0.6, direction: 'in' };
        } else if (assignment.action.includes('Angle')) {
            // Angle route (RB): combo route - stem=0, branch out 45° upfield, then 90° cut the other direction upfield
            routeDef = { 
                stemLength: 0, 
                turnAngle: 45, 
                continueLength: routeLength * 0.3, 
                direction: 'out',
                isCombo: true,
                secondTurn: { turnAngle: -90, continueLength: routeLength * 0.4, direction: 'in' }
            };
        } else if (assignment.action.includes('Post-corner')) {
            // Post-corner: combo route - stem like post, post break, then 90° cut back after initial break
            routeDef = { 
                stemLength: routeLength * 0.4, 
                turnAngle: -45, 
                continueLength: routeLength * 0.3, 
                direction: 'in',
                isCombo: true,
                secondTurn: { turnAngle: 90, continueLength: routeLength * 0.4, direction: 'out' }
            };
        } else if (assignment.action.includes('Slant-and-go')) {
            // Slant-and-go: combo route - breaks 60 and -60
            routeDef = { 
                stemLength: routeLength * 0.25, 
                turnAngle: 60, 
                continueLength: routeLength * 0.3, 
                direction: 'out',
                isCombo: true,
                secondTurn: { turnAngle: -60, continueLength: routeLength * 0.4, direction: 'in' }
            };
        } else if (assignment.action.includes('Whip route')) {
            // Whip route: combo route - breaks 90 and 180
            routeDef = { 
                stemLength: routeLength * 0.3, 
                turnAngle: 90, 
                continueLength: routeLength * 0.25, 
                direction: 'out',
                isCombo: true,
                secondTurn: { turnAngle: 180, continueLength: routeLength * 0.3, direction: 'in' }
            };
        } else if (assignment.action.includes('Out-and-up')) {
            // Out-and-up: combo route - breaks 90 and -90
            routeDef = { 
                stemLength: routeLength * 0.3, 
                turnAngle: 90, 
                continueLength: routeLength * 0.3, 
                direction: 'out',
                isCombo: true,
                secondTurn: { turnAngle: -90, continueLength: routeLength * 0.5, direction: 'in' }
            };
        } else if (assignment.action.includes('Skinny post')) {
            // Skinny post: tighter angle than regular post
            routeDef = { stemLength: routeLength * 0.4, turnAngle: -30, continueLength: routeLength * 0.5, direction: 'in' };
        } else if (assignment.action.includes('Short hitch')) {
            // Short hitch: quick stop route
            routeDef = { stemLength: routeLength * 0.2, turnAngle: -135, continueLength: routeLength * 0.15, direction: 'in' };
        } else if (assignment.action.includes('Wheel')) {
            // Wheel: forward stem, then arc out to sideline (curved route)
            routeDef = { stemLength: routeLength * 0.3, turnAngle: 90, continueLength: routeLength * 0.6, direction: 'out' };
        } else if (assignment.action.includes('Tunnel screen')) {
            // Tunnel screen: immediate horizontal in
            routeDef = { stemLength: 0, turnAngle: 0, continueLength: routeLength * 0.2, direction: 'in' };
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
            
            // Handle combo routes with second turn
            if (routeDef.isCombo && routeDef.secondTurn) {
                const secondTurn = routeDef.secondTurn;
                const secondAngleRad = (secondTurn.turnAngle * Math.PI) / 180;
                
                // Calculate second turn direction (opposite of first turn direction)
                const secondTurnDir = secondTurn.turnAngle > 0 ? outDir : inDir;
                
                // Calculate second turn position
                const secondDx = secondTurnDir * secondTurn.continueLength * Math.sin(Math.abs(secondAngleRad));
                const secondDy = -secondTurn.continueLength * Math.cos(Math.abs(secondAngleRad));
                
                endX = endX + secondDx;
                endY = endY + secondDy;
            }
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
        } else if (routeDef.stemLength === 0 && !routeDef.isCombo) {
            // Screen (no stem, not combo)
            ctx.lineTo(endX, endY);
        } else if (routeDef.isCombo && routeDef.secondTurn) {
            // Combo route: draw stem -> first turn -> second turn
            // Draw stem
            if (routeDef.stemLength > 0) {
                ctx.lineTo(stemEndX, stemEndY);
            } else {
                // No stem, start at current position
                ctx.moveTo(x, y);
            }
            
            // Calculate first turn end position
            const firstAngleRad = (routeDef.turnAngle * Math.PI) / 180;
            const firstTurnDir = routeDef.turnAngle > 0 ? outDir : inDir;
            const firstDx = firstTurnDir * routeDef.continueLength * Math.sin(Math.abs(firstAngleRad));
            const firstDy = -routeDef.continueLength * Math.cos(Math.abs(firstAngleRad));
            const firstTurnEndX = (routeDef.stemLength > 0 ? stemEndX : x) + firstDx;
            const firstTurnEndY = (routeDef.stemLength > 0 ? stemEndY : y) + firstDy;
            
            // Draw first turn
            ctx.lineTo(firstTurnEndX, firstTurnEndY);
            
            // Draw second turn
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
    const centerY = height / 2;
    const topHalfHeight = height / 2;
    
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
    
    // Helper to draw zone area with transparency
    function drawZoneArea(zoneColor, zoneX, zoneY, zoneWidth, zoneHeight) {
        ctx.fillStyle = zoneColor;
        ctx.fillRect(zoneX - zoneWidth/2, zoneY - zoneHeight/2, zoneWidth, zoneHeight);
        // Draw line from player to zone center
        ctx.strokeStyle = zoneColor.replace('0.5)', '1)');
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(zoneX, zoneY);
        ctx.stroke();
    }
    
    // Helper to draw arrow
    function drawArrow(endX, endY, arrowColor, dashed = false) {
        ctx.strokeStyle = arrowColor;
        ctx.fillStyle = arrowColor;
        ctx.lineWidth = 2;
        ctx.setLineDash(dashed ? [3, 3] : []);
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
            ctx.lineTo(endX - arrowHeadLength * Math.cos(angle - arrowHeadAngle), endY - arrowHeadLength * Math.sin(angle - arrowHeadAngle));
            ctx.lineTo(endX - arrowHeadLength * Math.cos(angle + arrowHeadAngle), endY - arrowHeadLength * Math.sin(angle + arrowHeadAngle));
            ctx.closePath();
            ctx.fill();
        }
    }
    
    // Quarters Match assignments (green)
    if (assignment.category === 'Quarters Match') {
        const bracketColor = '#4CAF50'; // Green
        ctx.setLineDash([3, 3]);
        
        if (assignment.action === 'LOCK+MEG' || assignment.action === 'TRAIL+APEX') {
            // Man-like coverage - draw dashed green line toward LOS
            drawArrow(x, centerY - 5, bracketColor, true);
        } else if (assignment.action === 'CAP+DEEP') {
            // Deep zone with flow indicator - green zone area
            const zoneY = 15; // Near top
            const zoneX = x < width/2 ? width * 0.25 : width * 0.75;
            ctx.fillStyle = 'rgba(76, 175, 80, 0.5)';
            ctx.fillRect(zoneX - 25, 5, 50, 30);
            drawArrow(zoneX, 20, bracketColor, false);
            // Small arrow pointing toward center (flow indicator)
            const flowDir = x < width/2 ? 1 : -1;
            ctx.beginPath();
            ctx.moveTo(zoneX, 25);
            ctx.lineTo(zoneX + flowDir * 12, 30);
            ctx.stroke();
        } else if (assignment.action === 'CUT+CROSSER') {
            // Intermediate zone with flow outside - green zone
            const zoneY = centerY - 20;
            ctx.fillStyle = 'rgba(76, 175, 80, 0.5)';
            ctx.fillRect(x - 20, zoneY - 10, 40, 20);
            drawArrow(x, zoneY, bracketColor, false);
            // Arrow flowing outside
            const flowDir = x < width/2 ? -1 : 1;
            ctx.beginPath();
            ctx.moveTo(x, zoneY);
            ctx.lineTo(x + flowDir * 18, zoneY - 5);
            ctx.stroke();
        }
        ctx.setLineDash([]);
        return;
    }
    
    // Deep zones (blue with transparency)
    if (assignment.category === 'Zone Deep' || (assignment.action && assignment.action.includes('Deep') && !assignment.action.includes('Man'))) {
        const zoneColor = 'rgba(33, 150, 243, 0.5)'; // Blue 50% transparent
        let zoneX = x, zoneY = 15, zoneWidth = 40, zoneHeight = 25;
        
        if (assignment.action.includes('left') || assignment.action.includes('Left')) {
            if (assignment.action.includes('far')) {
                zoneX = width * 0.15;
            } else if (assignment.action.includes('seam')) {
                zoneX = width * 0.3;
            } else {
                zoneX = width * 0.25;
            }
        } else if (assignment.action.includes('right') || assignment.action.includes('Right')) {
            if (assignment.action.includes('far')) {
                zoneX = width * 0.85;
            } else if (assignment.action.includes('seam')) {
                zoneX = width * 0.7;
            } else {
                zoneX = width * 0.75;
            }
        } else if (assignment.action.includes('middle') || assignment.action.includes('1/3')) {
            zoneX = width * 0.5;
            zoneWidth = 50;
        }
        
        // Draw zone area
        ctx.fillStyle = zoneColor;
        ctx.fillRect(zoneX - zoneWidth/2, 5, zoneWidth, zoneHeight);
        // Draw line to zone
        ctx.strokeStyle = '#2196F3';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(zoneX, zoneY);
        ctx.stroke();
        return;
    }
    
    // Short zones (yellow with transparency) - FIXED positions regardless of player location
    if (assignment.category === 'Zone Short' || (assignment.action && (assignment.action.includes('Hook') || assignment.action.includes('Flat') || assignment.action.includes('Curl') || assignment.action.includes('Hole')))) {
        const zoneColor = 'rgba(255, 235, 59, 0.5)'; // Yellow 50% transparent
        let zoneX = width * 0.5, zoneY = centerY - 18, zoneWidth = 30, zoneHeight = 18;
        
        // Fixed zone positions based on assignment type
        if (assignment.action.includes('Flat') || assignment.action.includes('Out')) {
            zoneY = centerY - 8;
            zoneWidth = 25;
            if (assignment.action.includes(' L')) zoneX = width * 0.08;
            else if (assignment.action.includes(' R')) zoneX = width * 0.92;
            else zoneX = width * 0.1; // Default left
        } else if (assignment.action.includes('Curl') && assignment.action.includes('Hook')) {
            // Curl/Hook zones
            zoneY = centerY - 20;
            if (assignment.action.includes(' L')) zoneX = width * 0.28;
            else if (assignment.action.includes(' R')) zoneX = width * 0.72;
        } else if (assignment.action.includes('Curl') && assignment.action.includes('Flat')) {
            // Curl/Flat zones
            zoneY = centerY - 12;
            if (assignment.action.includes(' L')) zoneX = width * 0.18;
            else if (assignment.action.includes(' R')) zoneX = width * 0.82;
        } else if (assignment.action.includes('Hook')) {
            // Hook zones (no L/R specified = center hooks)
            zoneY = centerY - 22;
            if (assignment.action.includes(' L')) zoneX = width * 0.35;
            else if (assignment.action.includes(' R')) zoneX = width * 0.65;
            else zoneX = width * 0.5; // Center hook
        } else if (assignment.action.includes('Hole') || assignment.action.includes('Tampa')) {
            zoneX = width * 0.5;
            zoneY = 20;
            zoneWidth = 45;
            zoneHeight = 22;
        } else if (assignment.action.includes('Robber') || assignment.action.includes('Spy')) {
            zoneX = width * 0.5;
            zoneY = centerY - 25;
            zoneWidth = 35;
        }
        
        // Draw zone area
        ctx.fillStyle = zoneColor;
        ctx.fillRect(zoneX - zoneWidth/2, zoneY - zoneHeight/2, zoneWidth, zoneHeight);
        // Draw line from player to zone boundary
        ctx.strokeStyle = '#FFEB3B';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(zoneX, zoneY);
        ctx.stroke();
        return;
    }
    
    // Man coverage - draw line to target
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
                        const offenseMinY = -15;
                        const offenseMaxY = -3;
                        const offenseYRange = offenseMaxY - offenseMinY;
                        const normalizedY = (locCoords.y - offenseMinY) / offenseYRange;
                        const targetY = bottomHalfStart + (bottomHalfHeight * (1 - normalizedY));
                        targetPos = { x: targetX, y: targetY };
                    }
                }
            }
        });
        
        if (targetPos) {
            ctx.strokeStyle = '#f44336';
            ctx.lineWidth = 2;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(targetPos.x, targetPos.y);
            ctx.stroke();
            
            // Draw technique arrow for man coverage
            if (assignment.action) {
                let techDx = 0, techDy = 0;
                const techArrowLength = 8;
                
                if (assignment.action.includes('Deep technique')) {
                    // Deep: arrow downfield (toward endzone for defense)
                    techDy = -techArrowLength;
                } else if (assignment.action.includes('Inside technique')) {
                    // Inside: arrow toward center of field
                    const isOnLeft = x < width / 2;
                    techDx = isOnLeft ? techArrowLength : -techArrowLength;
                } else if (assignment.action.includes('Outside technique')) {
                    // Outside: arrow toward sideline
                    const isOnLeft = x < width / 2;
                    techDx = isOnLeft ? -techArrowLength : techArrowLength;
                } else if (assignment.action.includes('Trail technique')) {
                    // Trail: arrow behind receiver (toward backfield for defense)
                    techDy = techArrowLength;
                }
                
                if (techDx !== 0 || techDy !== 0) {
                    // Draw small red arrow at defender position
                    ctx.strokeStyle = '#8B0000'; // Dark red
                    ctx.fillStyle = '#8B0000';
                    ctx.lineWidth = 1.5;
                    ctx.setLineDash([]);
                    const techEndX = x + techDx;
                    const techEndY = y + techDy;
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.lineTo(techEndX, techEndY);
                    ctx.stroke();
                    
                    // Draw arrowhead
                    const angle = Math.atan2(techDy, techDx);
                    const arrowHeadLength = 4;
                    const arrowHeadAngle = Math.PI / 6;
                    ctx.beginPath();
                    ctx.moveTo(techEndX, techEndY);
                    ctx.lineTo(techEndX - arrowHeadLength * Math.cos(angle - arrowHeadAngle),
                              techEndY - arrowHeadLength * Math.sin(angle - arrowHeadAngle));
                    ctx.moveTo(techEndX, techEndY);
                    ctx.lineTo(techEndX - arrowHeadLength * Math.cos(angle + arrowHeadAngle),
                              techEndY - arrowHeadLength * Math.sin(angle + arrowHeadAngle));
                    ctx.stroke();
                }
            }
        }
        ctx.setLineDash([]);
        return;
    }
    
    // Rush/gap assignments (orange arrow toward LOS)
    if (assignment.category === 'Rush' || (assignment.action && assignment.action.includes('gap'))) {
        ctx.strokeStyle = '#FF9800';
        ctx.fillStyle = '#FF9800';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        
        let endX = x, endY = centerY - 3;
        if (assignment.action.includes('Left')) {
            endX = x - 8;
        } else if (assignment.action.includes('Right')) {
            endX = x + 8;
        }
        
        drawArrow(endX, endY, '#FF9800', false);
        return;
    }
    
    // Default fallback
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
    // Filter by Y sign: positive for defense (top half)
    function getLocationCoords(locationName) {
        for (const section of fieldLocations) {
            for (const loc of section.Locations) {
                if (loc.Name === locationName && loc.Y > 0) {
                    return { x: loc.X, y: loc.Y };
                }
            }
        }
        return null;
    }
    
    // Render defensive players only (hide offense) - top half
    // Also show offensive players as static grey dots in bottom half
    const bottomHalfStart = height / 2;
    const bottomHalfHeight = height / 2;
    
    // Helper to get offensive location coordinates (Y < 0)
    function getOffensiveLocationCoords(locationName) {
        for (const section of fieldLocations) {
            for (const loc of section.Locations) {
                if (loc.Name === locationName && loc.Y < 0) {
                    return { x: loc.X, y: loc.Y };
                }
            }
        }
        return null;
    }
    
    // Draw offensive players as static grey dots in bottom half
    selectedPlayers.forEach((playerId) => {
        const player = getPlayerById(playerId);
        if (!player) return;
        
        const pos = playerPositions[playerId];
        if (!pos) return;
        
        const locCoords = getOffensiveLocationCoords(pos.location);
        if (!locCoords) return;
        
        // Convert X from original coordinates (-25 to +25) to diagram (0 to width)
        const diagramX = ((locCoords.x + 25) / 50) * width;
        
        // Convert Y: Offense goes in bottom half
        const offenseMinY = -15; // Deepest
        const offenseMaxY = -3;  // LOS
        const offenseYRange = offenseMaxY - offenseMinY; // 12
        const normalizedY = (locCoords.y - offenseMinY) / offenseYRange;
        const diagramY = bottomHalfStart + (bottomHalfHeight * (1 - normalizedY));
        
        if (isNaN(diagramX) || isNaN(diagramY) || !isFinite(diagramX) || !isFinite(diagramY)) {
            return;
        }
        
        // Draw static grey dot
        ctx.fillStyle = '#888888';
        ctx.beginPath();
        ctx.arc(diagramX, diagramY, 3, 0, Math.PI * 2);
        ctx.fill();
    });
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
            if (assignment.category === 'Quarters Match') {
                color = '#4CAF50'; // Green for Quarters Match
                isDashed = true;
            } else if (assignment.category === 'Zone Deep' || (assignment.action.includes('Deep') && !assignment.action.includes('Man'))) {
                color = '#2196F3'; // Blue for deep zones
            } else if (assignment.category === 'Zone Short' || 
                      (assignment.action.includes('Hook') || assignment.action.includes('Curtain') || assignment.action.includes('Flat') || assignment.action.includes('Curl'))) {
                color = '#FFEB3B'; // Yellow for short zones
            } else if (assignment.category === 'Man Coverage' || assignment.action.includes('Man')) {
                color = '#f44336'; // Red for man coverage
                isDashed = true;
            } else if (assignment.category === 'Rush' || 
                      assignment.action.includes('Rush') || 
                      assignment.action.includes('gap')) {
                color = '#FF9800'; // Orange for rush
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
        
        let assignment = playcall[player.position];
        if (assignment) {
            // Special handling for Power and Counter plays - weak side pulls
            const pos = playerPositions[playerId];
            if (pos && pos.location && (['Power left', 'Power right', 'Counter left', 'Counter right'].includes(playcallName))) {
                // Determine if player is on left or right side
                const location = pos.location || '';
                const isLeftSide = location.includes('Left');
                const isRightSide = location.includes('Right');
                
                // If location name doesn't specify, check X coordinate
                let playerIsLeft = isLeftSide;
                let playerIsRight = isRightSide;
                
                if (!isLeftSide && !isRightSide && pos.x !== undefined) {
                    // Get canvas width to determine center
                    const container = document.getElementById('fieldContainer');
                    const canvasWidth = container ? container.offsetWidth : 1000;
                    const centerX = canvasWidth / 2;
                    playerIsLeft = pos.x < centerX;
                    playerIsRight = pos.x >= centerX;
                }
                
                // Determine weak side based on play direction
                const isPowerLeft = playcallName === 'Power left';
                const isPowerRight = playcallName === 'Power right';
                const isCounterLeft = playcallName === 'Counter left';
                const isCounterRight = playcallName === 'Counter right';
                
                const weakSideIsRight = isPowerLeft || isCounterLeft;
                const weakSideIsLeft = isPowerRight || isCounterRight;
                
                // Check if this player is on the weak side
                const isWeakSide = (weakSideIsRight && playerIsRight) || (weakSideIsLeft && playerIsLeft);
                
                if (isWeakSide) {
                    if (player.position === 'OG') {
                        // Weak side guard always pulls in Power and Counter
                        assignment = { category: 'Run Block', action: 'Pull' };
                    } else if (player.position === 'OT') {
                        // Weak side tackle only pulls in Counter, not Power
                        if (isCounterLeft || isCounterRight) {
                            assignment = { category: 'Run Block', action: 'Pull' };
                        }
                        // In Power, OT stays with default zone assignment
                    }
                }
            }
            
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
    // Special case: Cover 2 man uses Cover 2 backend but man coverage underneath
    const isCover2Man = playcallName.includes('Cover 2 man');
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
    
    // Handle Quarters Match playcalls specially
    if (playcallName.includes('Quarters Match')) {
        applyBracketPlaycall(playcallName);
        return;
    }
    
    if (coverNumber === null) {
        // Fallback to old system for non-cover playcalls
        const playcall = defensivePlaycalls[playcallName];
        if (!playcall) return;
        
        selectedDefense.forEach((playerId) => {
            const player = getPlayerById(playerId);
            if (!player) return;
            
            const assignment = playcall[player.position];
            if (assignment && typeof assignment === 'object') {
                let action = assignment.action;
                // Adjust L/R zone assignments based on player field position
                if (assignment.category === 'Zone Short' || assignment.category === 'Zone Deep') {
                    const pos = playerPositions[playerId];
                    if (pos && pos.location) {
                        const coords = getLocationCoords(pos.location);
                        if (coords) {
                            const isLeft = coords.x < 0;
                            // Replace L/R in zone name based on actual position
                            if (action.includes(' L') && !isLeft) {
                                action = action.replace(' L', ' R');
                            } else if (action.includes(' R') && isLeft) {
                                action = action.replace(' R', ' L');
                            }
                            // Handle (cov2), (cov3), (cov4) variants
                            if (action.includes('left') && !isLeft) {
                                action = action.replace('left', 'right');
                            } else if (action.includes('right') && isLeft) {
                                action = action.replace('right', 'left');
                            }
                        }
                    }
                }
                updateAssignment(player, 'defense', assignment.category, action);
            } else if (player.position === 'DE' || player.position === 'DT') {
                // DL always rush - get gap from technique alignment
                const location = playerPositions[playerId]?.location || '';
                const defaultGap = getDefaultGapFromLocation(location, player);
                if (defaultGap) {
                    updateAssignment(player, 'defense', 'Rush', defaultGap);
                }
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
        2: ['Deep left (cov2)', 'Deep right (cov2)'],
        3: ['Deep left (cov3)', 'Deep right (cov3)', 'Deep middle 1/3'],
        4: ['Deep far left (cov4)', 'Deep far right (cov4)', 'Deep seam left (cov4)', 'Deep seam right (cov4)']
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
    
    // Remaining DBs get man (Cover 0/1, Cover 2 man) or zone short (Cover 2-4)
    const allDBs = [...safeties, ...cbs];
    const remainingDBs = allDBs.filter(db => !deepZoneAssigned.includes(db));
    const useMan = coverNumber <= 1 || isCover2Man;
    
    // Helper function to calculate distance between two field coordinates
    function calculateDistance(coord1, coord2) {
        const dx = coord1.x - coord2.x;
        const dy = coord1.y - coord2.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    // Helper function to assign man coverage to nearest target
    function assignManCoverage(defender, eligibleOffense, action = 'Inside technique man') {
        const defenderId = selectedDefense.find(id => {
            const p = getPlayerById(id);
            return p && p.name === defender.name;
        });
        if (!defenderId) return false;
        
        const defenderPos = playerPositions[defenderId];
        if (!defenderPos || !defenderPos.location) return false;
        
        const defenderCoords = getLocationCoords(defenderPos.location);
        if (!defenderCoords) return false;
        
        // Find nearest uncovered eligible offensive player
        let nearestTarget = null;
        let nearestDistance = Infinity;
        
        eligibleOffense.forEach((offense) => {
            if (!offense.covered) {
                const distance = calculateDistance(defenderCoords, offense.coords);
                if (distance < nearestDistance) {
                    nearestDistance = distance;
                    nearestTarget = offense;
                }
            }
        });
        
        if (nearestTarget) {
            // Store man coverage target before calling updateAssignment
            if (!assignments.defense[defender.name]) assignments.defense[defender.name] = {};
            assignments.defense[defender.name].manCoverageTarget = nearestTarget.player.name;
            // Now update assignment (which will preserve the manCoverageTarget)
            updateAssignment(defender, 'defense', 'Man Coverage', action);
            nearestTarget.covered = true; // Mark as covered
            return true;
        }
        return false;
    }
    
    if (useMan) {
        // Man coverage - assign to nearest eligible offensive players using coordinate distance
        const eligibleOffense = [];
        selectedPlayers.forEach((playerId) => {
            const player = getPlayerById(playerId);
            if (player && ['WR', 'TE', 'RB'].includes(player.position)) {
                const pos = playerPositions[playerId];
                if (pos && pos.location) {
                    const locCoords = getLocationCoords(pos.location);
                    if (locCoords) {
                        eligibleOffense.push({ 
                            player, 
                            playerId,
                            coords: locCoords,
                            covered: false // Track if already assigned
                        });
                    }
                }
            }
        });
        
        if (coverNumber === 0) {
            // Cover 0: Need exactly 5 man-to-man assignments (3-5 CB, 0-2 LB)
            // Also need 2 LBs to blitz (not in man coverage)
            // So: 5 man coverage (3-5 CB, 0-2 LB) + 2 LB blitz = 7 defensive backs/LBs
            // The remaining 4 are DL who rush
            
            const allLBs = [...playersByPosition['LB'], ...playersByPosition['MLB']];
            const manCoveragePlayers = [];
            let manCoverageCount = 0;
            const targetManCount = 5;
            let lbManCount = 0;
            const maxLBManCount = 2; // Maximum 2 LBs in man coverage
            
            // First, assign CBs to man coverage (prioritize CBs, need 3-5)
            for (const cb of cbs) {
                if (manCoverageCount >= targetManCount) break;
                if (assignManCoverage(cb, eligibleOffense, 'Inside technique man')) {
                    manCoveragePlayers.push(cb);
                    manCoverageCount++;
                }
            }
            
            // Then assign safeties if we need more (but prefer LBs if we haven't used 2 yet)
            // Actually, for Cover 0, safeties typically also play man, so assign them
            for (const s of safeties) {
                if (manCoverageCount >= targetManCount) break;
                if (assignManCoverage(s, eligibleOffense, 'Inside technique man')) {
                    manCoveragePlayers.push(s);
                    manCoverageCount++;
                }
            }
            
            // Finally, assign LBs if we still need more (up to 2 LBs for man coverage)
            // But we need to reserve 2 LBs for blitz, so only use LBs if we have enough
            const availableLBsForMan = allLBs.length - 2; // Reserve 2 for blitz
            for (const lb of allLBs) {
                if (manCoverageCount >= targetManCount || lbManCount >= Math.min(maxLBManCount, availableLBsForMan)) break;
                if (assignManCoverage(lb, eligibleOffense, 'Inside technique man')) {
                    manCoveragePlayers.push(lb);
                    manCoverageCount++;
                    lbManCount++;
                }
            }
            
            // If we still don't have 5, use more LBs (but this means we'll have fewer blitzers)
            if (manCoverageCount < targetManCount) {
                for (const lb of allLBs) {
                    if (manCoverageCount >= targetManCount) break;
                    if (manCoveragePlayers.includes(lb)) continue; // Skip already assigned
                    if (assignManCoverage(lb, eligibleOffense, 'Inside technique man')) {
                        manCoveragePlayers.push(lb);
                        manCoverageCount++;
                        lbManCount++;
                    }
                }
            }
        } else if (isCover2Man) {
            // Cover 2 man: 2 safeties already have deep zones, assign remaining DBs (CBs) to man coverage
            remainingDBs.forEach((db) => {
                assignManCoverage(db, eligibleOffense, 'Inside technique man');
            });
        } else {
            // Cover 1: Assign all remaining DBs to man coverage
            remainingDBs.forEach((db) => {
                assignManCoverage(db, eligibleOffense, 'Inside technique man');
            });
        }
    } else {
        // Zone short for remaining DBs
        // For Cover 2: CBs get hard flat, but nickel CB plays curl/hook like LB
        if (coverNumber === 2) {
            // Separate CBs from other DBs
            const remainingCBs = remainingDBs.filter(db => db.position === 'CB');
            const otherDBs = remainingDBs.filter(db => db.position !== 'CB');
            
            // In Cover 2: 2 outside CBs play flat, nickel CB plays curl/hook
            // Sort CBs by X position to identify outside vs nickel
            const cbsWithPositions = remainingCBs.map(cb => {
                const cbPlayerId = selectedDefense.find(id => {
                    const p = getPlayerById(id);
                    return p && p.name === cb.name;
                });
                if (cbPlayerId) {
                    const cbPos = playerPositions[cbPlayerId];
                    if (cbPos && cbPos.location) {
                        const cbCoords = getLocationCoords(cbPos.location);
                        return { cb, coords: cbCoords, location: cbPos.location };
                    }
                }
                return { cb, coords: null, location: null };
            }).filter(item => item.coords !== null);
            
            // Sort by X coordinate (left to right)
            cbsWithPositions.sort((a, b) => a.coords.x - b.coords.x);
            
            // Identify nickel CB (typically in slot position or middle CB)
            // Nickel is usually the one in slot position or the middle of the 3
            const nickelCB = cbsWithPositions.find(item => 
                item.location && (item.location.includes('Slot') || item.location.includes('Seam'))
            ) || (cbsWithPositions.length === 3 ? cbsWithPositions[1] : null); // Middle CB if 3 total
            
            // Assign outside CBs to flat
            cbsWithPositions.forEach((item, index) => {
                if (item === nickelCB) {
                    // Nickel CB plays curl/hook L (like a linebacker)
                    updateAssignment(item.cb, 'defense', 'Zone Short', 'Curl/Hook L');
                } else {
                    // Outside CBs play flat based on position
                    const flatAction = item.coords.x < 0 ? 'Flat L' : 'Flat R';
                    updateAssignment(item.cb, 'defense', 'Zone Short', flatAction);
                }
            });
            
            // Other DBs (safeties that didn't get deep zones) get hook
            otherDBs.forEach((db) => {
                updateAssignment(db, 'defense', 'Zone Short', 'Hook');
            });
        } else {
            remainingDBs.forEach((db) => {
                updateAssignment(db, 'defense', 'Zone Short', 'Hook');
            });
        }
    }
    
    // LBs get man (Cover 0/1) or zone short (Cover 2-4), or blitz (Cover 0)
    const allLBs = [...playersByPosition['LB'], ...playersByPosition['MLB']];
    
    if (coverNumber === 0) {
        // Cover 0: 2 LBs must blitz (not in man coverage)
        // Find LBs that are NOT in man coverage
        const lbManCoverage = allLBs.filter(lb => {
            const assignment = assignments.defense[lb.name];
            return assignment && assignment.category === 'Man Coverage';
        });
        
        // Assign 2 LBs to blitz (from those not in man coverage)
        const lbBlitzers = allLBs.filter(lb => !lbManCoverage.includes(lb));
        let blitzCount = 0;
        const targetBlitzCount = 2;
        
        // Common blitz gaps
        const blitzGaps = ['Left A gap', 'Right A gap', 'Left B gap', 'Right B gap'];
        
        lbBlitzers.forEach((lb) => {
            if (blitzCount >= targetBlitzCount) return;
            
            const lbPlayerId = selectedDefense.find(id => {
                const p = getPlayerById(id);
                return p && p.name === lb.name;
            });
            if (!lbPlayerId) return;
            
            // Assign blitz gap based on position
            const gap = blitzGaps[blitzCount % blitzGaps.length];
            updateAssignment(lb, 'defense', 'Rush', gap);
            blitzCount++;
        });
        
        // If we don't have enough LBs for blitz, that's a personnel issue
        // But we should still try to assign what we have
    } else if (isCover2Man) {
        // Cover 2 man: LBs play man coverage (5 total: CBs + LBs)
        // Get eligible offensive players for man coverage
        const eligibleOffense = [];
        selectedPlayers.forEach((playerId) => {
            const player = getPlayerById(playerId);
            if (player && ['WR', 'TE', 'RB'].includes(player.position)) {
                const pos = playerPositions[playerId];
                if (pos && pos.location) {
                    const locCoords = getLocationCoords(pos.location);
                    if (locCoords) {
                        // Check if already covered by a DB
                        let covered = false;
                        remainingDBs.forEach((db) => {
                            const assignment = assignments.defense[db.name];
                            if (assignment && assignment.manCoverageTarget === player.name) {
                                covered = true;
                            }
                        });
                        
                        eligibleOffense.push({ 
                            player, 
                            playerId,
                            coords: locCoords,
                            covered: covered
                        });
                    }
                }
            }
        });
        
        // Assign LBs to man coverage
        allLBs.forEach((lb) => {
            assignManCoverage(lb, eligibleOffense, 'Inside technique man');
        });
    } else if (coverNumber === 2) {
        // For Cover 2: LBs/nickels get Curl/Hook, MLB gets Hole
        allLBs.forEach((lb) => {
            if (lb.position === 'MLB') {
                updateAssignment(lb, 'defense', 'Zone Short', 'Hole');
            } else {
                // Assign Curl/Hook based on field position
                const lbPlayerId = selectedDefense.find(id => {
                    const p = getPlayerById(id);
                    return p && p.name === lb.name;
                });
                if (lbPlayerId) {
                    const lbPos = playerPositions[lbPlayerId];
                    if (lbPos && lbPos.location) {
                        const lbCoords = getLocationCoords(lbPos.location);
                        if (lbCoords) {
                            const curlHookAction = lbCoords.x < 0 ? 'Curl/Hook L' : 'Curl/Hook R';
                            updateAssignment(lb, 'defense', 'Zone Short', curlHookAction);
                        } else {
                            updateAssignment(lb, 'defense', 'Zone Short', 'Curl/Hook L');
                        }
                    } else {
                        updateAssignment(lb, 'defense', 'Zone Short', 'Curl/Hook L');
                    }
                }
            }
        });
    } else if (useMan) {
        // Get eligible offensive players (including ones not yet covered by DBs)
        const eligibleOffense = [];
        selectedPlayers.forEach((playerId) => {
            const player = getPlayerById(playerId);
            if (player && ['WR', 'TE', 'RB'].includes(player.position)) {
                const pos = playerPositions[playerId];
                if (pos && pos.location) {
                    const locCoords = getLocationCoords(pos.location);
                    if (locCoords) {
                        // Check if already covered by a DB
                        let covered = false;
                        remainingDBs.forEach((db) => {
                            const assignment = assignments.defense[db.name];
                            if (assignment && assignment.manCoverageTarget === player.name) {
                                covered = true;
                            }
                        });
                        
                        eligibleOffense.push({ 
                            player, 
                            playerId,
                            coords: locCoords,
                            covered: covered
                        });
                    }
                }
            }
        });
        
        // Assign each LB to nearest uncovered eligible offensive player
        allLBs.forEach((lb) => {
            const lbPlayerId = selectedDefense.find(id => {
                const p = getPlayerById(id);
                return p && p.name === lb.name;
            });
            if (!lbPlayerId) return;
            
            const lbPos = playerPositions[lbPlayerId];
            if (!lbPos || !lbPos.location) return;
            
            const lbCoords = getLocationCoords(lbPos.location);
            if (!lbCoords) return;
            
            // Find nearest uncovered eligible offensive player
            let nearestTarget = null;
            let nearestDistance = Infinity;
            
            eligibleOffense.forEach((offense) => {
                if (!offense.covered) {
                    const distance = calculateDistance(lbCoords, offense.coords);
                    if (distance < nearestDistance) {
                        nearestDistance = distance;
                        nearestTarget = offense;
                    }
                }
            });
            
            if (nearestTarget) {
                // Store man coverage target before calling updateAssignment
                if (!assignments.defense[lb.name]) assignments.defense[lb.name] = {};
                assignments.defense[lb.name].manCoverageTarget = nearestTarget.player.name;
                // Now update assignment (which will preserve the manCoverageTarget)
                updateAssignment(lb, 'defense', 'Man Coverage', 'Inside technique man');
                nearestTarget.covered = true; // Mark as covered
            } else {
                // No uncovered eligible players, assign zone
                updateAssignment(lb, 'defense', 'Zone Short', 'Hook');
            }
        });
    } else {
        // Zone short for LBs
        allLBs.forEach((lb) => {
            updateAssignment(lb, 'defense', 'Zone Short', 'Hook');
        });
    }
    
    // DL always rush - get gap from technique alignment (not from playcall)
    // Playcalls only set coverage assignments, not DL rush gaps
    const allDL = [...playersByPosition['DE'], ...playersByPosition['DT']];
    allDL.forEach((dl) => {
        // Always get gap from technique alignment
        const playerId = selectedDefense.find(id => {
            const p = getPlayerById(id);
            return p && p.name === dl.name;
        });
        const location = playerId ? (playerPositions[playerId]?.location || '') : '';
        const defaultGap = getDefaultGapFromLocation(location, dl);
        if (defaultGap) {
            updateAssignment(dl, 'defense', 'Rush', defaultGap);
        } else {
            // If we can't determine gap from location, don't auto-assign - let user choose
            // Don't default to "Left A gap" or "Contain"
            console.warn(`Could not determine default gap for ${dl.name} at location "${location}"`);
        }
    });
    
    // Reposition safeties based on coverage
    const safetyPlayers = playersByPosition['S'];
    if (safetyPlayers.length >= 2) {
        const container = document.getElementById('fieldContainer');
        const canvasWidth = container ? container.offsetWidth : 1000;
        const canvasHeight = container ? container.offsetHeight : 0;
        const effectiveHeight = canvasHeight * 0.97;
        
        if (coverNumber === 2) {
            // Cover 2: deep left/right hashes
            const leftHash = { name: 'Deep left hash', x: -7, y: 12, section: 'Deep coverage' };
            const rightHash = { name: 'Deep right hash', x: 7, y: 12, section: 'Deep coverage' };
            const x1 = ((leftHash.x + 19.5) / 39) * canvasWidth;
            const y1 = (effectiveHeight / 2) - (leftHash.y * 15);
            const x2 = ((rightHash.x + 19.5) / 39) * canvasWidth;
            const y2 = (effectiveHeight / 2) - (rightHash.y * 15);
            
            const safety1Id = selectedDefense.find(id => {
                const p = getPlayerById(id);
                return p && p.name === safetyPlayers[0].name;
            });
            const safety2Id = selectedDefense.find(id => {
                const p = getPlayerById(id);
                return p && p.name === safetyPlayers[1].name;
            });
            
            if (safety1Id) {
                playerPositions[safety1Id] = {
                    x: x1,
                    y: y1,
                    location: leftHash.name,
                    section: leftHash.section,
                    isOffsides: false
                };
            }
            if (safety2Id) {
                playerPositions[safety2Id] = {
                    x: x2,
                    y: y2,
                    location: rightHash.name,
                    section: rightHash.section,
                    isOffsides: false
                };
            }
        } else if (coverNumber === 1) {
            // Cover 1: deep middle 1/3 and right C gap (deep)
            const deepMiddle = { name: 'Deep middle 1/3', x: 0, y: 15, section: 'Deep coverage' };
            const rightCGapDeep = { name: 'Right C gap (deep)', x: 4.5, y: 8.5, section: 'Box safety / Deep LB' };
            const x1 = ((deepMiddle.x + 19.5) / 39) * canvasWidth;
            const y1 = (effectiveHeight / 2) - (deepMiddle.y * 15);
            const x2 = ((rightCGapDeep.x + 19.5) / 39) * canvasWidth;
            const y2 = (effectiveHeight / 2) - (rightCGapDeep.y * 15);
            
            const safety1Id = selectedDefense.find(id => {
                const p = getPlayerById(id);
                return p && p.name === safetyPlayers[0].name;
            });
            const safety2Id = selectedDefense.find(id => {
                const p = getPlayerById(id);
                return p && p.name === safetyPlayers[1].name;
            });
            
            if (safety1Id) {
                playerPositions[safety1Id] = {
                    x: x1,
                    y: y1,
                    location: deepMiddle.name,
                    section: deepMiddle.section,
                    isOffsides: false
                };
            }
            if (safety2Id) {
                playerPositions[safety2Id] = {
                    x: x2,
                    y: y2,
                    location: rightCGapDeep.name,
                    section: rightCGapDeep.section,
                    isOffsides: false
                };
            }
        }
    }
    
    updateDefensivePlaycallUI();
    renderDefensePlaycallDiagram();
    renderField();
    renderPlayerMarkers();
}

function applyBracketPlaycall(playcallName) {
    const is3x1 = playcallName.includes('3x1');
    
    // Get all defensive players with their X positions and Y depth
    const playersWithPos = [];
    selectedDefense.forEach((playerId) => {
        const player = getPlayerById(playerId);
        if (!player) return;
        const pos = playerPositions[playerId];
        if (!pos) return;
        
        // Get coordinates from location
        let xCoord = 0, yCoord = 0;
        for (const section of fieldLocations) {
            for (const loc of section.Locations) {
                if (loc.Name === pos.location && loc.Y > 0) {
                    xCoord = loc.X;
                    yCoord = loc.Y;
                    break;
                }
            }
        }
        
        playersWithPos.push({ player, playerId, xCoord, yCoord, pos });
    });
    
    // Separate by side of field (left = negative X, right = positive X)
    const leftSide = playersWithPos.filter(p => p.xCoord < 0);
    const rightSide = playersWithPos.filter(p => p.xCoord >= 0);
    
    // Assign D-line first
    playersWithPos.forEach(({ player, playerId }) => {
        if (player.position === 'DE' || player.position === 'DT') {
            const location = playerPositions[playerId]?.location || '';
            const defaultGap = getDefaultGapFromLocation(location, player);
            if (defaultGap) {
                updateAssignment(player, 'defense', 'Rush', defaultGap);
            }
        }
    });
    
    // Helper to assign 3-over-2 bracket to a side
    // Uses exactly: 1 CAP (deepest), 1 MEG (widest), 1 TRAIL (innermost nickel/LB)
    function assignBracket3over2(sidePlayers) {
        const coveragePlayers = sidePlayers.filter(p => 
            ['CB', 'S', 'LB', 'MLB'].includes(p.player.position)
        );
        
        if (coveragePlayers.length < 2) return [];
        
        const assigned = [];
        
        // Sort by depth (Y coordinate - higher = deeper)
        const byDepth = [...coveragePlayers].sort((a, b) => b.yCoord - a.yCoord);
        
        // CAP = deepest player (usually safety)
        const capPlayer = byDepth[0];
        updateAssignment(capPlayer.player, 'defense', 'Quarters Match', 'CAP+DEEP');
        assigned.push(capPlayer);
        
        // Remaining for MEG and TRAIL
        const remaining = coveragePlayers.filter(p => p !== capPlayer);
        
        // Sort by width (absolute X, descending = widest first)
        const byWidth = [...remaining].sort((a, b) => Math.abs(b.xCoord) - Math.abs(a.xCoord));
        
        // MEG = widest (usually outside CB)
        const megPlayer = byWidth[0];
        updateAssignment(megPlayer.player, 'defense', 'Quarters Match', 'LOCK+MEG');
        assigned.push(megPlayer);
        
        // TRAIL = innermost, prioritize nickel CBs then LBs - only if we have a 3rd player
        const trailCandidates = remaining.filter(p => p !== megPlayer);
        if (trailCandidates.length > 0) {
            trailCandidates.sort((a, b) => {
                if (a.player.position === 'CB' && b.player.position !== 'CB') return -1;
                if (b.player.position === 'CB' && a.player.position !== 'CB') return 1;
                return Math.abs(a.xCoord) - Math.abs(b.xCoord);
            });
            const trailPlayer = trailCandidates[0];
            updateAssignment(trailPlayer.player, 'defense', 'Quarters Match', 'TRAIL+APEX');
            assigned.push(trailPlayer);
        }
        
        return assigned;
    }
    
    // Helper to assign 4-over-3 bracket (3x1 strong side)
    // Uses: 1 CAP, 1 MEG, 1 TRAIL, 1 CUT+CROSSER
    function assignBracket4over3(sidePlayers, allPlayers) {
        const coveragePlayers = sidePlayers.filter(p => 
            ['CB', 'S', 'LB', 'MLB'].includes(p.player.position)
        );
        
        const assigned = [];
        
        // Sort by depth
        const byDepth = [...coveragePlayers].sort((a, b) => b.yCoord - a.yCoord);
        
        // CAP = deepest
        if (byDepth.length > 0) {
            const capPlayer = byDepth[0];
            updateAssignment(capPlayer.player, 'defense', 'Quarters Match', 'CAP+DEEP');
            assigned.push(capPlayer);
        }
        
        const remaining = coveragePlayers.filter(p => !assigned.includes(p));
        const byWidth = [...remaining].sort((a, b) => Math.abs(b.xCoord) - Math.abs(a.xCoord));
        
        // MEG = widest
        if (byWidth.length > 0) {
            const megPlayer = byWidth[0];
            updateAssignment(megPlayer.player, 'defense', 'Quarters Match', 'LOCK+MEG');
            assigned.push(megPlayer);
        }
        
        // TRAIL = next innermost CB/nickel
        const trailCandidates = remaining.filter(p => !assigned.includes(p));
        trailCandidates.sort((a, b) => {
            if (a.player.position === 'CB' && b.player.position !== 'CB') return -1;
            if (b.player.position === 'CB' && a.player.position !== 'CB') return 1;
            return Math.abs(a.xCoord) - Math.abs(b.xCoord);
        });
        
        if (trailCandidates.length > 0) {
            const trailPlayer = trailCandidates[0];
            updateAssignment(trailPlayer.player, 'defense', 'Quarters Match', 'TRAIL+APEX');
            assigned.push(trailPlayer);
        }
        
        // CUT+CROSSER = find an LB from this side that's not yet assigned
        const cutCandidates = coveragePlayers.filter(p => 
            !assigned.includes(p) && 
            (p.player.position === 'LB' || p.player.position === 'MLB')
        );
        
        if (cutCandidates.length > 0) {
            cutCandidates.sort((a, b) => Math.abs(a.xCoord) - Math.abs(b.xCoord));
            updateAssignment(cutCandidates[0].player, 'defense', 'Quarters Match', 'CUT+CROSSER');
            assigned.push(cutCandidates[0]);
        }
        
        return assigned;
    }
    
    // Helper for weak side in 3x1 - just 2 defenders (CAP + MEG, no TRAIL needed)
    function assignWeakSide2over1(sidePlayers) {
        const coveragePlayers = sidePlayers.filter(p => 
            ['CB', 'S'].includes(p.player.position) // Only DBs on weak side
        );
        
        const assigned = [];
        
        // Sort by depth
        const byDepth = [...coveragePlayers].sort((a, b) => b.yCoord - a.yCoord);
        
        // CAP = deepest (safety)
        if (byDepth.length > 0) {
            const capPlayer = byDepth[0];
            updateAssignment(capPlayer.player, 'defense', 'Quarters Match', 'CAP+DEEP');
            assigned.push(capPlayer);
        }
        
        // MEG = the CB
        const remaining = coveragePlayers.filter(p => !assigned.includes(p));
        if (remaining.length > 0) {
            const megPlayer = remaining[0];
            updateAssignment(megPlayer.player, 'defense', 'Quarters Match', 'LOCK+MEG');
            assigned.push(megPlayer);
        }
        
        return assigned;
    }
    
    let allAssigned = [];
    
    if (is3x1) {
        // 3x1: Strong side (assume right for now) gets 4-over-3, weak side gets 2-over-1
        // TODO: detect which side has more receivers
        const strongAssigned = assignBracket4over3(rightSide, playersWithPos);
        const weakAssigned = assignWeakSide2over1(leftSide);
        allAssigned = [...strongAssigned, ...weakAssigned];
    } else {
        // 2x2: Both sides get 3-over-2
        const leftAssigned = assignBracket3over2(leftSide);
        const rightAssigned = assignBracket3over2(rightSide);
        allAssigned = [...leftAssigned, ...rightAssigned];
    }
    
    // Remaining LB gets blitz assignment (loose backer)
    const allAssignedNames = new Set(allAssigned.map(p => p.player.name));
    playersWithPos.forEach(({ player, playerId }) => {
        if (!allAssignedNames.has(player.name) && 
            (player.position === 'LB' || player.position === 'MLB')) {
            // Loose backer blitzes
            const location = playerPositions[playerId]?.location || '';
            const defaultGap = getDefaultGapFromLocation(location, player);
            if (defaultGap) {
                updateAssignment(player, 'defense', 'Rush', defaultGap);
            } else {
                // Default to A gap blitz
                const side = playersWithPos.find(p => p.player.name === player.name)?.xCoord < 0 ? 'Left' : 'Right';
                updateAssignment(player, 'defense', 'Rush', `${side} A gap`);
            }
        }
    });
    
    updateDefensivePlaycallUI();
    renderDefensePlaycallDiagram();
    renderField();
    renderPlayerMarkers();
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
                        
                        // Also directly set the man coverage selector value if it exists
                        const safeId = `manCoverage-${player.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
                        const manCoverageSelect = item.querySelector(`#${safeId}`) || 
                                                  item.querySelector(`select[data-player-name="${player.name}"]`);
                        if (manCoverageSelect && assignment.manCoverageTarget) {
                            manCoverageSelect.value = assignment.manCoverageTarget;
                        }
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
        if (['DE', 'DT'].includes(player.position) && defaultCategory === 'Rush') {
            const defaultGap = getDefaultGapFromLocation(location, player);
            // Never auto-populate "Contain" - use gap from technique or first gap option
            if (defaultGap && defaultGap !== 'Contain' && playerAssignments[defaultCategory].includes(defaultGap)) {
                defaultAction = defaultGap;
            } else if (defaultAction === 'Contain' && playerAssignments[defaultCategory].length > 1) {
                // Skip "Contain" and use first gap option
                defaultAction = playerAssignments[defaultCategory].find(action => action !== 'Contain') || defaultAction;
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
                    action: 'Inside technique man',
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
        (action === 'Inside technique man' || action === 'Outside technique man' || action === 'Inside match man' || action === 'Outside match man')) {
        manCoverageSelect.style.display = 'block';
        
        // Update options if needed (do this first so we can set the value)
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
        
        // Set the selected value if manCoverageTarget exists (after options are populated)
        const assignment = assignments[side][player.name];
        if (assignment && assignment.manCoverageTarget) {
            // Check if the option exists before setting
            const optionExists = Array.from(manCoverageSelect.options).some(
                opt => opt.value === assignment.manCoverageTarget
            );
            if (optionExists) {
                manCoverageSelect.value = assignment.manCoverageTarget;
            }
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
// Map DL techniques to gaps
// Default behavior: DL rush into the gap indicated by their technique
// 3-tech = B gap, 2/4/6 tech prioritize inside gaps
function getGapFromTechnique(technique, isLeft) {
    // Technique mapping: 0/1=A gap, 2i/2/3=B gap, 4i/4/5/6/6i/7/9=C gap
    const tech = technique.toString().toLowerCase();
    let gap = '';
    
    if (tech === '0' || tech === '1') {
        gap = 'A gap';
    } else if (tech === '2i' || tech === '2' || tech === '3') {
        gap = 'B gap'; // 3-tech = B gap, 2-tech prioritizes inside (B gap)
    } else if (tech === '4i' || tech === '4' || tech === '5' || tech === '6' || tech === '6i' || tech === '7' || tech === '9') {
        gap = 'C gap'; // 4/6 tech prioritize inside (C gap)
    }
    
    if (gap && isLeft !== undefined) {
        return `${isLeft ? 'Left' : 'Right'} ${gap}`;
    }
    return gap;
}

// Get default gap assignment from player's technique location
function getDefaultGapFromLocation(location, player) {
    if (!['DE', 'DT'].includes(player.position)) return null;
    
    // Extract technique and left/right from location name (e.g., "Left 5 technique", "Right 4i technique", "0 technique")
    // First try to match with left/right prefix
    let techMatch = location.match(/(left|right)\s+(\d+i?)\s+technique/i);
    let isLeft = null;
    
    if (techMatch) {
        const isLeft = techMatch[1].toLowerCase() === 'left';
        const technique = techMatch[2];
        const gap = getGapFromTechnique(technique, isLeft);
        console.log(`getDefaultGapFromLocation: location="${location}", technique=${technique}, isLeft=${isLeft}, gap=${gap}`);
        return gap;
    }
    
    // Try without left/right prefix but with technique
    techMatch = location.match(/(\d+i?)\s+technique/i);
    if (techMatch) {
        const technique = techMatch[1];
        // Find player position to determine left/right from X coordinate
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
        return getGapFromTechnique(technique, isLeft);
    }
    
    // Fallback to old format (just number)
    techMatch = location.match(/^(\d+i?)$/);
    if (techMatch) {
        const technique = techMatch[1];
        // Find player position to determine left/right from X coordinate
        let playerPos = null;
        for (const id in playerPositions) {
            const p = getPlayerById(id);
            if (p && p.name === player.name) {
                playerPos = playerPositions[id];
                break;
            }
        }
        if (!playerPos) return null;
        const container = document.getElementById('fieldContainer');
        const canvasWidth = container ? container.offsetWidth : 1000;
        isLeft = playerPos.x < (canvasWidth / 2);
        return getGapFromTechnique(technique, isLeft);
    }
    
    return null;
    
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
        // Count personnel
        const players = selectedPlayers.map(id => getPlayerById(id)).filter(p => p);
        const rbCount = players.filter(p => p.position === 'RB').length;
        const teCount = players.filter(p => p.position === 'TE').length;
        const qbCount = players.filter(p => p.position === 'QB').length;
        
        // Filter formations based on personnel
        const filteredFormations = Object.keys(offensiveFormations).filter(name => {
            const formation = offensiveFormations[name];
            
            // Empty formations require no RB
            if (formation.RB === null && rbCount > 0) {
                return false;
            }
            
            // Formations with RB require at least 1 RB
            if (formation.RB !== null && rbCount === 0) {
                return false;
            }
            
            // Wildcat requires no QB
            if (formation.QB === null && qbCount > 0) {
                return false;
            }
            
            // Formations with QB require at least 1 QB
            if (formation.QB !== null && qbCount === 0) {
                return false;
            }
            
            // Check TE count matches formation requirements
            const formationTECount = formation.TE ? formation.TE.length : 0;
            if (teCount < formationTECount) {
                return false;
            }
            
            return true;
        });
        
        // Clear and repopulate dropdown
        offenseSelect.innerHTML = '<option value="">Select formation...</option>';
        filteredFormations.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            offenseSelect.appendChild(option);
        });
        
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
            position = resolveLocationName('QB (Shotgun)', false) || { name: 'QB (Shotgun)', x: 0, y: -10, section: 'Offensive backfield' };
        } else if (player.position === 'RB') {
            position = resolveLocationName('Behind QB (Shotgun)', false) || { name: 'Behind QB (Shotgun)', x: 0, y: -13, section: 'Offensive backfield' };
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
                
                const olPositionNames = [
                    'Center',
                    'Left Guard',
                    'Right Guard',
                    'Left Tackle',
                    'Right Tackle'
                ];
                
                if (olArrayIndex >= 0 && olArrayIndex < olPositionNames.length) {
                    position = resolveLocationName(olPositionNames[olArrayIndex], false); // Offensive - prefer Y < 0
                    if (position) {
                        position.section = 'Offensive line of scrimmage';
                    }
                }
            }
        } else if (player.position === 'TE') {
            const tePositionNames = [
                'Wing left',
                'Tight left',
                'Tight right'
            ];
            if (teIndex < tePositionNames.length) {
                position = resolveLocationName(tePositionNames[teIndex], false); // Offensive - prefer Y < 0
                if (position) {
                    position.section = 'Offensive line of scrimmage';
                }
                teIndex++;
            } else {
                // Extra TE - put in WR spot
                const wrPositionNames = [
                    'Slot left',
                    'Slot right'
                ];
                const extraIndex = (teIndex - tePositionNames.length) % wrPositionNames.length;
                position = resolveLocationName(wrPositionNames[extraIndex], false); // Offensive - prefer Y < 0
                if (position) {
                    position.section = 'Offensive line of scrimmage';
                }
            }
        } else if (player.position === 'WR') {
            const wrPositionNames = [
                'Max split left',
                'Max split right',
                'Wide left',
                'Wide right',
                'Slot left',
                'Slot right'
            ];
            if (wrIndex < wrPositionNames.length) {
                position = resolveLocationName(wrPositionNames[wrIndex], false); // Offensive - prefer Y < 0
                if (position) {
                    position.section = 'Offensive line of scrimmage';
                }
                wrIndex++;
            } else {
                // Extra WR - spread out
                position = resolveLocationName('Seam left', false) || { name: 'Seam left', x: -10.5, y: -3, section: 'Offensive line of scrimmage' };
            }
        }
        
        // Default fallback
        if (!position) {
            position = resolveLocationName('Slot left', false) || { name: 'Slot left', x: -13, y: -3, section: 'Offensive line of scrimmage' };
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
    
    const nickelDimePositionNames = [
        'Slot left',
        'Slot right',
        'Seam left',
        'Seam right'
    ];
    
    selectedDefense.forEach((playerId) => {
        if (playerPositions[playerId]) return; // Skip if already placed
        
        const player = getPlayerById(playerId);
        if (!player) return;
        
        let position = null;
        
        if (player.position === 'DE') {
            const dePositionNames = [
                'Left 5 technique',
                'Right 5 technique'
            ];
            if (deIndex < dePositionNames.length) {
                position = resolveLocationName(dePositionNames[deIndex], true); // Defensive - prefer Y > 0
                if (position) {
                    position.section = 'Defensive line of scrimmage';
                }
                deIndex++;
            } else {
                // Extra DE
                position = resolveLocationName('Left 4 technique', true) || { name: 'Left 4 technique', x: -4, y: 2.5, section: 'Defensive line of scrimmage' };
            }
        } else if (player.position === 'DT') {
            const dtPositionNames = [
                'Left 3 technique',
                'Right 3 technique'
            ];
            if (dtIndex < dtPositionNames.length) {
                position = resolveLocationName(dtPositionNames[dtIndex], true); // Defensive - prefer Y > 0
                if (position) {
                    position.section = 'Defensive line of scrimmage';
                }
                dtIndex++;
            } else {
                // Extra DT
                position = resolveLocationName('0 technique', true) || { name: '0 technique', x: 0, y: 2.5, section: 'Defensive line of scrimmage' };
            }
        } else if (['LB', 'MLB'].includes(player.position)) {
            const lbPositionNames = [
                'Left B gap (shallow)',
                'Right B gap (shallow)',
                'Over Center (shallow)'
            ];
            if (lbIndex < lbPositionNames.length) {
                position = resolveLocationName(lbPositionNames[lbIndex], true); // Defensive - prefer Y > 0
                if (position) {
                    position.section = 'Defensive backfield';
                }
                lbIndex++;
            } else {
                // Extra LB
                const extraLBNames = [
                    'Left A gap (shallow)',
                    'Right A gap (shallow)'
                ];
                const extraIndex = (lbIndex - lbPositionNames.length) % extraLBNames.length;
                position = resolveLocationName(extraLBNames[extraIndex], true); // Defensive - prefer Y > 0
                if (position) {
                    position.section = 'Defensive backfield';
                }
            }
        } else if (player.position === 'CB') {
            const cbPositionNames = [
                'Seam left',
                'Seam right'
            ];
            if (cbIndex < cbPositionNames.length) {
                position = resolveLocationName(cbPositionNames[cbIndex], true, 'Max depth'); // Defensive - prefer Y > 0, Max depth section
                if (position) {
                    position.section = 'Max depth';
                }
                cbIndex++;
            } else {
                // Extra CB (nickel/dime) - assign to slot
                if (extraDBIndex < nickelDimePositionNames.length) {
                    position = resolveLocationName(nickelDimePositionNames[extraDBIndex], true, 'Coverage'); // Defensive - prefer Y > 0, Coverage section
                    if (!position) {
                        position = { name: nickelDimePositionNames[extraDBIndex], x: -13, y: 5.0, section: 'Coverage second level' };
                    }
                    extraDBIndex++;
                } else {
                    position = resolveLocationName('Slot left', true, 'Coverage') || { name: 'Slot left', x: -13, y: 5.0, section: 'Coverage second level' };
                }
            }
        } else if (player.position === 'S') {
            const sPositionNames = [
                'Deep middle 1/3',
                'Deep left'
            ];
            if (sIndex < sPositionNames.length) {
                position = resolveLocationName(sPositionNames[sIndex], true); // Defensive - prefer Y > 0
                if (position) {
                    position.section = 'Max depth';
                }
                sIndex++;
            } else {
                // Extra S (big nickel/dime) - assign to slot
                if (extraDBIndex < nickelDimePositionNames.length) {
                    position = resolveLocationName(nickelDimePositionNames[extraDBIndex], true, 'Coverage'); // Defensive - prefer Y > 0, Coverage section
                    if (!position) {
                        position = { name: nickelDimePositionNames[extraDBIndex], x: 13, y: 5.0, section: 'Coverage second level' };
                    }
                    extraDBIndex++;
                } else {
                    position = resolveLocationName('Slot right', true, 'Coverage') || { name: 'Slot right', x: 13, y: 5.0, section: 'Coverage second level' };
                }
            }
        }
        
        // Default fallback
        if (!position) {
            position = resolveLocationName('Over Center (shallow)', true) || { name: 'Over Center (shallow)', x: 0, y: 6, section: 'Defensive backfield' };
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
        QB: 'QB (Shotgun)',
        RB: 'Behind QB (Shotgun)',
        WR: [
            'Wide left',
            'Wide right',
            'Slot left'
        ],
        TE: [],
        OL: [
            'Left Tackle',
            'Left Guard',
            'Center',
            'Right Guard',
            'Right Tackle'
        ]
    },
    'Gun Trips': {
        QB: 'QB (Shotgun)',
        RB: 'Behind QB (Shotgun)',
        WR: [
            'Wide right',
            'Flanker left',
            'Wide left',
            'Slot left'
        ],
        TE: [],
        OL: [
            'Left Tackle',
            'Left Guard',
            'Center',
            'Right Guard',
            'Right Tackle'
        ]
    },
    'Gun Bunch': {
        QB: 'QB (Shotgun)',
        RB: 'Behind QB (Shotgun)',
        WR: [
            'Wide right',
            'Seam left',
            'Slot left'
        ],
        TE: [
            'Wing left'
        ],
        OL: [
            'Left Tackle',
            'Left Guard',
            'Center',
            'Right Guard',
            'Right Tackle'
        ]
    },
    'Gun Empty': {
        QB: 'QB (Shotgun)',
        RB: null,
        WR: [
            'Wide left',
            'Wide left',
            'Wide right',
            'Wide right',
            'Slot left'
        ],
        TE: [],
        OL: [
            'Left Tackle',
            'Left Guard',
            'Center',
            'Right Guard',
            'Right Tackle'
        ]
    },
    'Pistol': {
        QB: 'QB (Pistol)',
        RB: 'Behind QB (Shotgun)',
        WR: [
            'Wide left',
            'Wide right',
            'Slot left'
        ],
        TE: [],
        OL: [
            'Left Tackle',
            'Left Guard',
            'Center',
            'Right Guard',
            'Right Tackle'
        ]
    },
    'I-Formation': {
        QB: 'QB (Under center)',
        RB: 'Behind QB (I-formation)',
        WR: [
            'Wide left',
            'Wide right'
        ],
        TE: [
            'Tight left'
        ],
        OL: [
            'Left Tackle',
            'Left Guard',
            'Center',
            'Right Guard',
            'Right Tackle'
        ]
    },
    'Pro Set': {
        QB: 'QB (Under center)',
        RB: 'T-left (Shotgun)',
        WR: [
            'Wide left',
            'Wide right'
        ],
        TE: [
            'Tight left'
        ],
        OL: [
            'Left Tackle',
            'Left Guard',
            'Center',
            'Right Guard',
            'Right Tackle'
        ]
    },
    'Wing T': {
        QB: 'QB (Under center)',
        RB: 'Behind QB (I-formation)',
        WR: [
            'Wide left',
            'Wide right'
        ],
        TE: [
            'Wing left',
            'Tight right'
        ],
        OL: [
            'Left Tackle',
            'Left Guard',
            'Center',
            'Right Guard',
            'Right Tackle'
        ]
    },
    'Gun (2 TE)': {
        QB: 'QB (Shotgun)',
        RB: 'Behind QB (Shotgun)',
        WR: [
            'Wide left',
            'Wide right'
        ],
        TE: [
            'Tight left',
            'Tight right'
        ],
        OL: [
            'Left Tackle',
            'Left Guard',
            'Center',
            'Right Guard',
            'Right Tackle'
        ]
    },
    'Pistol (2 TE)': {
        QB: 'QB (Pistol)',
        RB: 'Behind QB (Shotgun)',
        WR: [
            'Wide left',
            'Wide right'
        ],
        TE: [
            'Tight left',
            'Tight right'
        ],
        OL: [
            'Left Tackle',
            'Left Guard',
            'Center',
            'Right Guard',
            'Right Tackle'
        ]
    },
    'I-Form (2 TE)': {
        QB: 'QB (Under center)',
        RB: 'Behind QB (I-formation)',
        WR: [
            'Wide left',
            'Wide right'
        ],
        TE: [
            'Tight left',
            'Tight right'
        ],
        OL: [
            'Left Tackle',
            'Left Guard',
            'Center',
            'Right Guard',
            'Right Tackle'
        ]
    },
    'I-Form (2 RB, 2 TE)': {
        QB: 'QB (Under center)',
        RB: 'Behind QB (I-formation)',
        WR: [
            'Wide left',
            'Wide right'
        ],
        TE: [
            'Tight left',
            'Tight right'
        ],
        OL: [
            'Left Tackle',
            'Left Guard',
            'Center',
            'Right Guard',
            'Right Tackle'
        ]
    },
    'Gun 3x1 (2 TE)': {
        QB: 'QB (Shotgun)',
        RB: 'Behind QB (Shotgun)',
        WR: [
            'Wide left',
            'Wide right',
            'Slot right'
        ],
        TE: [
            'Tight right',
            'Wing right'
        ],
        OL: [
            'Left Tackle',
            'Left Guard',
            'Center',
            'Right Guard',
            'Right Tackle'
        ]
    },
    'Gun 3x1 (2 TE) Flip': {
        QB: 'QB (Shotgun)',
        RB: 'Behind QB (Shotgun)',
        WR: [
            'Wide right',
            'Wide left',
            'Slot left'
        ],
        TE: [
            'Tight left',
            'Wing left'
        ],
        OL: [
            'Left Tackle',
            'Left Guard',
            'Center',
            'Right Guard',
            'Right Tackle'
        ]
    },
    'Ace': {
        QB: 'QB (Under center)',
        RB: 'T-right (Shotgun)',
        WR: [
            'Wide left',
            'Wide right',
            'Slot left'
        ],
        TE: [
            'Tight right'
        ],
        OL: [
            'Left Tackle',
            'Left Guard',
            'Center',
            'Right Guard',
            'Right Tackle'
        ]
    },
    'Wildcat': {
        QB: null,
        RB: 'QB (Shotgun)',
        WR: [
            'Wide left',
            'Wide right',
            'Slot left'
        ],
        TE: [
            'Tight right'
        ],
        OL: [
            'Left Tackle',
            'Left Guard',
            'Center',
            'Right Guard',
            'Right Tackle'
        ]
    }
};

const defensiveFormations = {
    '4-3 Even (2-high)': {
        DL: [
            'Left 5 technique',
            'Left 2i technique',
            'Right 2i technique',
            'Right 5 technique'
        ],
        LB: [
            'Left B gap (shallow)',
            'Over Center (shallow)',
            'Right B gap (shallow)'
        ],
        CB: [
            'Seam left',
            'Seam right'
        ],
        S: [
            'Deep left',
            'Deep right'
        ]
    },
    '4-3 Even (1-high)': {
        DL: [
            'Left 5 technique',
            'Left 2i technique',
            'Right 2i technique',
            'Right 5 technique'
        ],
        LB: [
            'Left B gap (shallow)',
            'Over Center (shallow)',
            'Right B gap (shallow)'
        ],
        CB: [
            'Seam left',
            'Seam right'
        ],
        S: [
            'Deep middle 1/3',
            'Right B gap (deep)'
        ]
    },
    '4-3 Bear (2-high)': {
        DL: [
            'Left 5 technique',
            'Left 1 technique',
            'Right 3 technique',
            'Right 5 technique'
        ],
        LB: [
            'Left B gap (shallow)',
            'Over Center (shallow)',
            'Right B gap (shallow)'
        ],
        CB: [
            'Seam left',
            'Seam right'
        ],
        S: [
            'Deep left',
            'Deep right'
        ]
    },
    '4-3 Bear (1-high)': {
        DL: [
            'Left 5 technique',
            'Left 1 technique',
            'Right 3 technique',
            'Right 5 technique'
        ],
        LB: [
            'Left B gap (shallow)',
            'Over Center (shallow)',
            'Right B gap (shallow)'
        ],
        CB: [
            'Seam left',
            'Seam right'
        ],
        S: [
            'Deep middle 1/3',
            'Right B gap (deep)'
        ]
    },
    '4-3 Over (2-high)': {
        DL: [
            'Left 5 technique',
            'Left 3 technique',
            'Right 1 technique',
            'Right 5 technique'
        ],
        LB: [
            'Left B gap (shallow)',
            'Over Center (shallow)',
            'Right B gap (shallow)'
        ],
        CB: [
            'Seam left',
            'Seam right'
        ],
        S: [
            'Deep left',
            'Deep right'
        ]
    },
    '4-3 Over (1-high)': {
        DL: [
            'Left 5 technique',
            'Left 3 technique',
            'Right 1 technique',
            'Right 5 technique'
        ],
        LB: [
            'Left B gap (shallow)',
            'Over Center (shallow)',
            'Right B gap (shallow)'
        ],
        CB: [
            'Seam left',
            'Seam right'
        ],
        S: [
            'Deep middle 1/3',
            'Right B gap (deep)'
        ]
    },
    '4-3 Under (2-high)': {
        DL: [
            'Left 4i technique',
            '0 technique',
            'Right 3 technique',
            'Right 5 technique'
        ],
        LB: [
            'Left B gap (shallow)',
            'Over Center (shallow)',
            'Right B gap (shallow)'
        ],
        CB: [
            'Seam left',
            'Seam right'
        ],
        S: [
            'Deep left',
            'Deep right'
        ]
    },
    '4-3 Under (1-high)': {
        DL: [
            'Left 4i technique',
            '0 technique',
            'Right 3 technique',
            'Right 5 technique'
        ],
        LB: [
            'Left B gap (shallow)',
            'Over Center (shallow)',
            'Right B gap (shallow)'
        ],
        CB: [
            'Seam left',
            'Seam right'
        ],
        S: [
            'Deep middle 1/3',
            'Right B gap (deep)'
        ]
    },
    '3-4 Under (2-high)': {
        DL: [
            'Left 4i technique',
            '0 technique',
            'Right 5 technique'
        ],
        LB: [
            'Left C gap (shallow)',
            'Left B gap (shallow)',
            'Right B gap (shallow)',
            'Right C gap (shallow)'
        ],
        CB: [
            'Seam left',
            'Seam right'
        ],
        S: [
            'Deep left',
            'Deep right'
        ]
    },
    '3-4 Under (1-high)': {
        DL: [
            'Left 4i technique',
            '0 technique',
            'Right 5 technique'
        ],
        LB: [
            'Left C gap (shallow)',
            'Left B gap (shallow)',
            'Right B gap (shallow)',
            'Right C gap (shallow)'
        ],
        CB: [
            'Seam left',
            'Seam right'
        ],
        S: [
            'Deep middle 1/3',
            'Right B gap (deep)'
        ]
    },
    '3-4 Okie (2-high)': {
        DL: [
            'Left 7 technique',
            '0 technique',
            'Right 7 technique'
        ],
        LB: [
            'Left C gap (shallow)',
            'Left B gap (shallow)',
            'Right B gap (shallow)',
            'Right C gap (shallow)'
        ],
        CB: [
            'Seam left',
            'Seam right'
        ],
        S: [
            'Deep left',
            'Deep right'
        ]
    },
    '3-4 Okie (1-high)': {
        DL: [
            'Left 7 technique',
            '0 technique',
            'Right 7 technique'
        ],
        LB: [
            'Left C gap (shallow)',
            'Left B gap (shallow)',
            'Right B gap (shallow)',
            'Right C gap (shallow)'
        ],
        CB: [
            'Seam left',
            'Seam right'
        ],
        S: [
            'Deep middle 1/3',
            'Right B gap (deep)'
        ]
    },
    '3-4 Bear (2-high)': {
        DL: [
            'Left 3 technique',
            '0 technique',
            { name: 'Right 3 technique', x: 5, y: 2.5 }
        ],
        LB: [
            'Left C gap (shallow)',
            'Left B gap (shallow)',
            'Right B gap (shallow)',
            'Right C gap (shallow)'
        ],
        CB: [
            'Seam left',
            'Seam right'
        ],
        S: [
            'Deep left',
            'Deep right'
        ]
    },
    '3-4 Bear (1-high)': {
        DL: [
            'Left 3 technique',
            '0 technique',
            { name: 'Right 3 technique', x: 5, y: 2.5 }
        ],
        LB: [
            'Left C gap (shallow)',
            'Left B gap (shallow)',
            'Right B gap (shallow)',
            'Right C gap (shallow)'
        ],
        CB: [
            'Seam left',
            'Seam right'
        ],
        S: [
            'Deep middle 1/3',
            'Right B gap (deep)'
        ]
    },
    '3-4 Tite (2-high)': {
        DL: [
            'Left 4i technique',
            '0 technique',
            'Right 4i technique'
        ],
        LB: [
            'Left C gap (shallow)',
            'Left B gap (shallow)',
            'Right B gap (shallow)',
            'Right C gap (shallow)'
        ],
        CB: [
            'Seam left',
            'Seam right'
        ],
        S: [
            'Deep left',
            'Deep right'
        ]
    },
    '3-4 Tite (1-high)': {
        DL: [
            'Left 4i technique',
            '0 technique',
            'Right 4i technique'
        ],
        LB: [
            'Left C gap (shallow)',
            'Left B gap (shallow)',
            'Right B gap (shallow)',
            'Right C gap (shallow)'
        ],
        CB: [
            'Seam left',
            'Seam right'
        ],
        S: [
            'Deep middle 1/3',
            'Right B gap (deep)'
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
    
    // Clear existing offensive positions ONLY - never touch defensive players
    // Explicitly verify each playerId is in selectedPlayers before deleting
    selectedPlayers.forEach(playerId => {
        // Double-check: only delete if this is actually an offensive player
        if (selectedPlayers.includes(playerId)) {
            delete playerPositions[playerId];
        }
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
    
    // Track assigned positions to prevent stacking
    const usedPositions = new Set(); // Track by position name
    const usedCoordinates = new Set(); // Track by x,y coordinates
    
    // Priority list for WR/receiver positions (excluding Max split) - using location names
    const receiverPriorityList = [
        'Wide left',
        'Wide right',
        'Slot left',
        'Slot right',
        'Flanker left',
        'Flanker right',
        'Seam left',
        'Seam right',
        'Tight right',
        'Tight left',
        'Wing left',
        'Wing right'
    ];
    
    // Helper function to find next available receiver position
    function getNextAvailableReceiverPosition(excludeMaxSplit = true) {
        // First try formation positions (excluding Max split if requested)
        const formationWR = formation.WR || [];
        const formationTE = formation.TE || [];
        const allFormationSpots = [...formationWR, ...formationTE];
        const filteredFormation = excludeMaxSplit 
            ? allFormationSpots.filter(pos => {
                // Handle both string and object formats
                const posName = typeof pos === 'string' ? pos : (pos?.name || '');
                return posName && !posName.toLowerCase().includes('max split');
            })
            : allFormationSpots;
        
        for (const posEntry of filteredFormation) {
            const pos = resolveFormationPosition(posEntry, false); // Offensive - prefer Y < 0
            if (pos && pos.name && !usedPositions.has(pos.name) && !usedCoordinates.has(`${pos.x},${pos.y}`)) {
                return pos;
            }
        }
        
        // Then try priority list
        for (const locName of receiverPriorityList) {
            const pos = resolveLocationName(locName, false); // Offensive - prefer Y < 0
            if (pos && pos.name && !usedPositions.has(pos.name) && !usedCoordinates.has(`${pos.x},${pos.y}`)) {
                return pos;
            }
        }
        
        // Last resort: find any unused position from field locations
        // This should rarely happen, but prevents infinite loops
        return null;
    }
    
    // Track indices for positions that can have multiple players
    let olIndex = 0;
    let teIndex = 0;
    let rbIndex = 0;
    
    // Apply formation - assign ALL 11 players
    selectedPlayers.forEach((playerId) => {
        const player = getPlayerById(playerId);
        if (!player) return;
        
        let position = null;
        
        // QB always gets QB position if available
        if (player.position === 'QB' && formation.QB) {
            position = resolveFormationPosition(formation.QB, false); // Offensive - prefer Y < 0
        }
        // RB gets RB position if available, otherwise can go to receiver spot
        else if (player.position === 'RB') {
            if (formation.RB && rbIndex === 0) {
                position = resolveFormationPosition(formation.RB, false); // Offensive - prefer Y < 0
                rbIndex++;
            } else {
                // RB in empty formation - assign to a receiver spot
                position = getNextAvailableReceiverPosition();
            }
        }
        // OL gets OL positions
        else if (['OT', 'OG', 'C'].includes(player.position) && formation.OL) {
            if (olIndex < formation.OL.length) {
                position = resolveFormationPosition(formation.OL[olIndex], false); // Offensive - prefer Y < 0
                olIndex++;
            }
        }
        // TE gets TE positions, or receiver spot if no TE spots
        else if (player.position === 'TE') {
            if (formation.TE && teIndex < formation.TE.length) {
                position = resolveFormationPosition(formation.TE[teIndex], false); // Offensive - prefer Y < 0
                teIndex++;
            } else {
                // TE can go to receiver spot
                position = getNextAvailableReceiverPosition();
            }
        }
        // WR gets WR positions (filter out Max split)
        else if (player.position === 'WR') {
            position = getNextAvailableReceiverPosition(true); // Exclude Max split
        }
        
        // If still no position assigned, use a default based on position type
        if (!position) {
            if (player.position === 'QB') {
                position = resolveLocationName('QB (Shotgun)', false) || { name: 'QB (Shotgun)', x: 0, y: -10, section: 'Offensive backfield' };
            } else if (player.position === 'RB') {
                position = getNextAvailableReceiverPosition() || resolveLocationName('Wide left', false) || { name: 'Wide left', x: -16.75, y: -3, section: 'Offensive line of scrimmage' };
            } else if (['OT', 'OG', 'C'].includes(player.position)) {
                position = resolveLocationName('Center', false) || { name: 'Center', x: 0, y: -3, section: 'Offensive line of scrimmage' };
            } else {
                position = getNextAvailableReceiverPosition() || resolveLocationName('Slot left', false) || { name: 'Slot left', x: -13, y: -3, section: 'Offensive line of scrimmage' };
            }
        }
        
        // Mark position as used to prevent stacking
        if (position) {
            usedPositions.add(position.name);
            const coordKey = `${position.x},${position.y}`;
            usedCoordinates.add(coordKey);
        }
        
        const x = ((position.x + 19.5) / 39) * canvasWidth;
        const y = (effectiveHeight / 2) - (position.y * 15);
        
        // CRITICAL: Only set position if this playerId is actually in selectedPlayers
        // AND verify the player is actually an offensive player (not defensive)
        // This prevents accidentally overwriting defensive player positions
        if (selectedPlayers.includes(playerId) && player) {
            // Double-check: verify this is actually an offensive position type
            const isOffensivePosition = ['QB', 'RB', 'WR', 'TE', 'OT', 'OG', 'C'].includes(player.position);
            if (isOffensivePosition) {
                playerPositions[playerId] = {
                    x: x,
                    y: y,
                    location: position.name,
                    section: position.section || 'Offensive line of scrimmage',
                    isOffsides: false
                };
            }
        }
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
    
    // Clear existing defensive positions ONLY - never touch offensive players
    // Explicitly verify each playerId is in selectedDefense AND is a defensive player before deleting
    selectedDefense.forEach(playerId => {
        const player = getPlayerById(playerId);
        // Double-check: only delete if this is actually a defensive player
        if (selectedDefense.includes(playerId) && player) {
            const isDefensivePosition = ['DE', 'DT', 'LB', 'MLB', 'CB', 'S'].includes(player.position);
            if (isDefensivePosition) {
                delete playerPositions[playerId];
            }
        }
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
    
    // Nickel/Dime positions for extra CBs: Wide left, Wide right, Slot left, Slot right (in that order)
    // These will be resolved from fieldlocations.json
    
    // Apply formation - assign ALL 11 players
    selectedDefense.forEach((playerId) => {
        const player = getPlayerById(playerId);
        if (!player) return;
        
        let position = null;
        
        // Check if this player is in the DL alignment
        const dlIndex = dlAlignment.indexOf(playerId);
        if (dlIndex >= 0 && dlIndex < formation.DL.length && formation.DL) {
            position = resolveFormationPosition(formation.DL[dlIndex], true); // Defensive - prefer Y > 0
        }
        // LBs get LB positions
        else if (['LB', 'MLB'].includes(player.position)) {
            if (formation.LB && lbIndex < formation.LB.length) {
                position = resolveFormationPosition(formation.LB[lbIndex], true); // Defensive - prefer Y > 0
                lbIndex++;
            } else {
                // Extra LB - put in a gap or shallow zone
                const extraLBPositions = [
                    'Left A gap (shallow)',
                    'Right A gap (shallow)',
                    'Left C gap (shallow)',
                    'Right C gap (shallow)'
                ];
                const extraIndex = lbIndex - (formation.LB ? formation.LB.length : 0);
                if (extraIndex < extraLBPositions.length) {
                    position = resolveLocationName(extraLBPositions[extraIndex], true); // Defensive - prefer Y > 0
                }
            }
        }
        // CBs get CB positions, then extra go to nickel spots
        else if (player.position === 'CB') {
            if (formation.CB && cbIndex < formation.CB.length) {
                position = resolveFormationPosition(formation.CB[cbIndex], true); // Defensive - prefer Y > 0
                cbIndex++;
            } else {
                // Extra CB (nickel/dime) - assign to slot positions
                const nickelDimeLocationNames = [
                    'Wide left',
                    'Wide right',
                    'Slot left',
                    'Slot right'
                ];
                if (dbIndex < nickelDimeLocationNames.length) {
                    position = resolveLocationName(nickelDimeLocationNames[dbIndex], true, 'Coverage'); // Defensive - prefer Y > 0, Coverage section
                    if (!position) {
                        // Fallback to second level if not found
                        position = resolveLocationName('Slot left', true, 'Coverage') || { name: 'Slot left', x: -13, y: 5.0, section: 'Coverage second level' };
                    }
                    dbIndex++;
                } else {
                    // Fallback
                    position = resolveLocationName('Slot left', true, 'Coverage') || { name: 'Slot left', x: -13, y: 5.0, section: 'Coverage second level' };
                }
            }
        }
        // Safeties get S positions, then extra go to nickel spots
        else if (player.position === 'S') {
            if (formation.S && sIndex < formation.S.length) {
                position = resolveFormationPosition(formation.S[sIndex], true); // Defensive - prefer Y > 0
                sIndex++;
            } else {
                // Extra S (big nickel/dime) - assign to slot positions
                const nickelDimeLocationNames = [
                    'Wide left',
                    'Wide right',
                    'Slot left',
                    'Slot right'
                ];
                if (dbIndex < nickelDimeLocationNames.length) {
                    position = resolveLocationName(nickelDimeLocationNames[dbIndex], true, 'Coverage'); // Defensive - prefer Y > 0, Coverage section
                    if (!position) {
                        // Fallback to second level if not found
                        position = resolveLocationName('Slot right', true, 'Coverage') || { name: 'Slot right', x: 13, y: 5.0, section: 'Coverage second level' };
                    }
                    dbIndex++;
                } else {
                    // Fallback
                    position = resolveLocationName('Slot right', true, 'Coverage') || { name: 'Slot right', x: 13, y: 5.0, section: 'Coverage second level' };
                }
            }
        }
        
        // If still no position assigned, use a default based on position type
        if (!position) {
            if (['DE', 'DT'].includes(player.position)) {
                position = resolveLocationName('0 technique', true) || { name: '0 technique', x: 0, y: 2.5, section: 'Defensive line of scrimmage' };
            } else if (['LB', 'MLB'].includes(player.position)) {
                position = resolveLocationName('Over Center (shallow)', true) || { name: 'Over Center (shallow)', x: 0, y: 6, section: 'Defensive backfield' };
            } else if (player.position === 'CB') {
                position = resolveLocationName('Slot left', true, 'Coverage') || { name: 'Slot left', x: -13, y: 5.0, section: 'Coverage second level' };
            } else if (player.position === 'S') {
                position = resolveLocationName('Slot right', true, 'Coverage') || { name: 'Slot right', x: 13, y: 5.0, section: 'Coverage second level' };
            } else {
                position = resolveLocationName('Over Center (shallow)', true) || { name: 'Over Center (shallow)', x: 0, y: 6, section: 'Defensive backfield' };
            }
        }
        
        const x = ((position.x + 19.5) / 39) * canvasWidth;
        const y = (effectiveHeight / 2) - (position.y * 15);
        
        // CRITICAL: Only set position if this playerId is actually in selectedDefense
        // AND verify the player is actually a defensive player (not offensive)
        // This prevents accidentally overwriting offensive player positions
        if (selectedDefense.includes(playerId) && player) {
            // Double-check: verify this is actually a defensive position type
            const isDefensivePosition = ['DE', 'DT', 'LB', 'MLB', 'CB', 'S'].includes(player.position);
            if (isDefensivePosition) {
                playerPositions[playerId] = {
                    x: x,
                    y: y,
                    location: position.name,
                    section: position.section || 'Defensive line of scrimmage',
                    isOffsides: false
                };
            }
        }
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
                    // Check if this is a box location (tight to tight, gaps, techs)
                    const isBox = isBoxLocation(location, section.Section);
                    if (isBox) {
                        // Dark red for box locations
                        ctx.fillStyle = 'rgba(139,0,0,0.2)'; // Dark red with transparency
                        ctx.strokeStyle = 'rgba(139,0,0,0.6)'; // Dark red stroke
                    } else {
                        // Grey for non-box locations
                        ctx.fillStyle = 'rgba(255,255,255,0.1)';
                        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
                    }
                    ctx.beginPath();
                    ctx.arc(x, y, 25, 0, Math.PI * 2);
                    ctx.fill();
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
            const percentileResult = calculateEffectivePercentile(player);
            const effectivePercentile = typeof percentileResult === 'object' ? percentileResult.effectivePercentile : percentileResult;
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
            const staminaPercent = player.stamina !== undefined ? player.stamina : 100;
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
        
        // Draw technique arrow for man coverage
        if (assignment.category === 'Man Coverage' && assignment.action) {
            let techDx = 0, techDy = 0;
            const techArrowLength = 10;
            
            if (assignment.action.includes('Deep technique')) {
                // Deep: arrow downfield (toward endzone for defense)
                techDy = -techArrowLength;
            } else if (assignment.action.includes('Inside technique')) {
                // Inside: arrow toward center of field
                const isOnLeft = pos.x < canvasWidth / 2;
                techDx = isOnLeft ? techArrowLength : -techArrowLength;
            } else if (assignment.action.includes('Outside technique')) {
                // Outside: arrow toward sideline
                const isOnLeft = pos.x < canvasWidth / 2;
                techDx = isOnLeft ? -techArrowLength : techArrowLength;
            } else if (assignment.action.includes('Trail technique')) {
                // Trail: arrow behind receiver (toward backfield for defense)
                techDy = techArrowLength;
            }
            
            if (techDx !== 0 || techDy !== 0) {
                // Draw small dark red arrow at defender position
                ctx.strokeStyle = '#8B0000'; // Dark red
                ctx.fillStyle = '#8B0000';
                ctx.lineWidth = 1.5;
                const techEndX = pos.x + techDx;
                const techEndY = pos.y + techDy;
                ctx.beginPath();
                ctx.moveTo(pos.x, pos.y);
                ctx.lineTo(techEndX, techEndY);
                ctx.stroke();
                
                // Draw arrowhead
                const angle = Math.atan2(techDy, techDx);
                const arrowHeadLength = 5;
                const arrowHeadAngle = Math.PI / 6;
                ctx.beginPath();
                ctx.moveTo(techEndX, techEndY);
                ctx.lineTo(techEndX - arrowHeadLength * Math.cos(angle - arrowHeadAngle),
                          techEndY - arrowHeadLength * Math.sin(angle - arrowHeadAngle));
                ctx.moveTo(techEndX, techEndY);
                ctx.lineTo(techEndX - arrowHeadLength * Math.cos(angle + arrowHeadAngle),
                          techEndY - arrowHeadLength * Math.sin(angle + arrowHeadAngle));
                ctx.stroke();
            }
        }
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
    } else if (action.includes('Rush')) {
        arrowColor = '#f44336'; // Red for rush
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
    
    // Set up clock management checkboxes (mutually exclusive)
    const hurryUpCheckbox = document.getElementById('hurryUpCheckbox');
    const milkClockCheckbox = document.getElementById('milkClockCheckbox');
    
    if (hurryUpCheckbox && milkClockCheckbox) {
        hurryUpCheckbox.addEventListener('change', () => {
            if (hurryUpCheckbox.checked) {
                milkClockCheckbox.checked = false;
            }
        });
        
        milkClockCheckbox.addEventListener('change', () => {
            if (milkClockCheckbox.checked) {
                hurryUpCheckbox.checked = false;
            }
        });
    }
}

// Build play data for LLM
function buildPlayData() {
    const coachingPlayerIdOffense = document.getElementById('coachingPlayerOffense')?.value;
    const coachingPointOffense = document.getElementById('coachingPointOffense')?.value;
    const coachingPlayerIdDefense = document.getElementById('coachingPlayerDefense')?.value;
    const coachingPointDefense = document.getElementById('coachingPointDefense')?.value;
    
    return {
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
}

// Execute play
async function copyLLMPrompt() {
    // Build the same prompt that would be sent to the LLM
    const playData = buildPlayData();
    if (!playData || !playData.offense || playData.offense.length === 0) {
        alert('Please set up a play first (personnel, formations, assignments)');
        return;
    }
    
    // Get the prompt content (same logic as callLLM)
    const fixedInstructions = `Analyze SCHEME: spatial (X/Y), blocking vs assignments, coverage vs routes.

SPATIAL: X left-/right+, Y off-/def+. Count blockers vs defenders at POA.

KEY CHECKS:

Numerical advantages at POA via X values; one player can swing -3 to +2 alone.

Late pursuit does not reduce advantage.

Player ratings don't cap scheme advantage (execution failures chances handled outside LLM) and theoretical assignments can't cure wrong physical position.

Evaluate: 40% alignment, 30% assignment, 20% positional mismatches, 10% player ratings.

Late or missed assignments invalidate coverage.

Identify routes into coverage voids or open windows.

Blitz w/o backfield protection = less success, more leverage.

Blocking mismatches: inferior vs elite = less success, more leverage.

What is the protection scheme? (6-man, 7-man, any slides. Can it handle the blitzers and what is the level of redundancy to handle lost blocks?)  Insufficient protection = high leverage and lower success

This is just the playcall and initial play state at the snap. Don't make assumptions that players will do nothing else when they are in position to make plays.
Entire OL may receive assignment like "IZR right or slide right". Doesn't mean that they all block the right A/B gaps, just generally determines rules for how they slide+climb against the defense.
Assume the pro-level offensive line will climb properly after play-side double teams with pro-level execution. Linebackers are not "unblocked" if there are double teams at the first level that can flow.

Bear front: hurts zone runs, helps gap runs.

Deep zones on play side = lower leverage; man coverage = higher leverage.

EXAMPLES:

+8 to +10: defense entirely out of position (e.g., open TD screen).

-8 to -10: unblocked rusher, routes into coverage, no quick throw.

-2 to 0: neutral/good scheme, even matchups.
-4 to -2: correct commitment that matches offensive playcall.

+2 to +6: wrong coverage/commit exploited.`;

    // Build user message (same as callLLM)
    const allPlayers = [];
    
    // Offensive players
    selectedPlayers.forEach((playerId) => {
        const player = getPlayerById(playerId);
        if (!player) return;
        const pos = playerPositions[playerId];
        if (!pos || !pos.location) return;
        
        const locCoords = getLocationCoords(pos.location);
        const assignment = assignments.offense[player.name] || {};
        const assignmentText = assignment.action ? `${assignment.category}: ${assignment.action}` : 'No assignment';
        const coords = locCoords ? ` [X:${locCoords.x.toFixed(1)}, Y:${locCoords.y.toFixed(1)}]` : '';
        const actualPlayer = getPlayerById(playerId);
        const actualPosition = actualPlayer ? actualPlayer.position : (player.position || 'Unknown');
        const isOLInSkillPosition = (actualPosition === 'OT' || actualPosition === 'OG' || actualPosition === 'C') && pos.location && (pos.location.includes('Wide') || pos.location.includes('Slot') || pos.location.includes('Seam') || pos.location.includes('Wing') || pos.location.includes('Tight') || pos.location.includes('Split') || pos.location.includes('Flanker') || pos.location.includes('Trips') || pos.location.includes('Max split'));
        const warning = isOLInSkillPosition ? ' ⚠️ OFFENSIVE LINEMAN IN SKILL POSITION!' : '';
        allPlayers.push({
            side: 'OFFENSE',
            name: player.name,
            position: actualPosition,
            location: pos.location,
            coords: locCoords,
            assignmentText: assignmentText,
            effectivePercentile: (() => {
                const result = calculateEffectivePercentile(player);
                return typeof result === 'object' ? result.effectivePercentile : result;
            })(),
            warning: warning
        });
    });
    
    // Defensive players
    selectedDefense.forEach((playerId) => {
        const player = getPlayerById(playerId);
        if (!player) return;
        const pos = playerPositions[playerId];
        if (!pos || !pos.location) return;
        
        const locCoords = getLocationCoords(pos.location);
        const assignment = assignments.defense[player.name] || {};
        const assignmentText = assignment.action ? `${assignment.category}: ${assignment.action}` : 'No assignment';
        const manTarget = (assignment.category === 'Man Coverage' && assignment.manCoverageTarget) ? ` (Man coverage on: ${assignment.manCoverageTarget})` : '';
        const coords = locCoords ? ` [X:${locCoords.x.toFixed(1)}, Y:${locCoords.y.toFixed(1)}]` : '';
        const actualPlayer = getPlayerById(playerId);
        const actualPosition = actualPlayer ? actualPlayer.position : (player.position || 'Unknown');
        const isDLInOffensivePosition = (actualPosition === 'DE' || actualPosition === 'DT') && pos.location && (pos.location.includes('Wide') || pos.location.includes('Slot') || pos.location.includes('Seam') || pos.location.includes('Wing') || pos.location.includes('Tight') || pos.location.includes('Split') || pos.location.includes('Flanker') || pos.location.includes('Trips') || pos.location.includes('Max split'));
        const warning = isDLInOffensivePosition ? ' ⚠️ DEFENSIVE LINEMAN IN OFFENSIVE SKILL POSITION!' : '';
        allPlayers.push({
            side: 'DEFENSE',
            name: player.name,
            position: actualPosition,
            location: pos.location,
            coords: locCoords,
            assignmentText: assignmentText + manTarget,
            effectivePercentile: (() => {
                const result = calculateEffectivePercentile(player);
                return typeof result === 'object' ? result.effectivePercentile : result;
            })(),
            warning: warning
        });
    });
    
    // Sort by X coordinate
    allPlayers.sort((a, b) => {
        const aX = a.coords ? a.coords.x : 0;
        const bX = b.coords ? b.coords.x : 0;
        return aX - bX;
    });
    
    let userMessageContent = `${gameState.down}${getDownSuffix(gameState.down)} & ${gameState.distance} @ ${gameState["opp-yardline"]}yd Q${gameState.quarter} ${gameState.time} ${gameState.score.home}-${gameState.score.away}

This is a professional simulator used in training by world-class coordinators. Evaluate like a coordinator grading a call with film-room brutality, not a scout grading players. Success rate is not guaranteed even with +10 - bungles are handled programmatically. Grade the SCHEME, as execution errors are handled programmatically. Do not hedge, commit to extreme values ruthlessly when warranted.

Pos,Initials,Align,X (yds),Y (yds),Rating,Assignment${allPlayers.map(p => {
        const coords = p.coords ? { x: p.coords.x, y: p.coords.y } : null;
        // Compress box X coords (OL, TE inline, DL, LB in gaps) by 0.375x for realistic spacing
        const isBoxPosition = ['OT', 'OG', 'C', 'DE', 'DT'].includes(p.position) || 
            (p.location && (p.location.includes('technique') || p.location.includes('gap') || 
             p.location.includes('Tight') || p.location.includes('Wing')));
        const xMultiplier = isBoxPosition ? 0.375 : 1.37;
        const x = coords ? (coords.x * xMultiplier).toFixed(2) : '0.00';
        // Compress Y based on position/location for realistic depths
        let y = '0.00';
        if (coords) {
            const loc = p.location || '';
            const pos = p.position;
            if (['OT', 'OG', 'C'].includes(pos)) {
                // OL at line of scrimmage
                y = '0.00';
            } else if (['DE', 'DT'].includes(pos) || loc.includes('technique')) {
                // DL 1 yard off LOS
                y = '1.00';
            } else if (['QB', 'RB'].includes(pos)) {
                // Backfield: max 5 yards
                y = (Math.max(coords.y, -5) * 0.5).toFixed(2);
            } else if (['LB', 'MLB'].includes(pos) || loc.includes('gap')) {
                // LB depth: 3-6 yards (shallow=3, deep=6)
                y = loc.includes('deep') ? '6.00' : '3.00';
            } else if (['S'].includes(pos) && coords.y > 10) {
                // Deep safeties: max 18 yards
                y = Math.min(coords.y * 0.9, 18).toFixed(2);
            } else if (loc.includes('press')) {
                y = '1.00';
            } else if (loc.includes('cushion')) {
                y = '11.00';
            } else if (['CB', 'S'].includes(pos) && coords.y > 0 && coords.y <= 10) {
                // Standard DB alignment: ~6 yards
                y = '6.00';
            } else {
                y = (coords.y * 1.37).toFixed(2);
            }
        }
        const assignment = `${p.assignmentText}${p.warning}`.replace(/[,\n]/g, ' ').trim();
        const initials = p.name.split(' ').map(n => n[0]).join('').toUpperCase();
        return `\n${p.position},${initials},${p.location},${x},${y},${p.effectivePercentile.toFixed(0)},${assignment}`;
    }).join('')}${playData.coachingPointOffense ? `\nOff: ${playData.coachingPointOffense.player.name} - "${playData.coachingPointOffense.point}"` : ''}${playData.coachingPointDefense ? `\nDef: ${playData.coachingPointDefense.player.name} - "${playData.coachingPointDefense.point}"` : ''}

OUTPUT: Brief rationale (POA, 1-3 matchups). JSON only:

{"play-type":"pass"|"run"|"RPO","offense-advantage":[-10 to 10],"risk-leverage":[0 to 10]}

Grade purely on scheme potential; commit fully to numeric advantage, ignoring execution variance. Near-automatic scoring or unblocked advantage = max/min values.`;
    
    const fullPrompt = `=== SYSTEM PROMPT ===\n${fixedInstructions}\n\n=== USER MESSAGE ===\n${userMessageContent}\n\n=== END PROMPT ===`;
    
    // Copy to clipboard
    navigator.clipboard.writeText(fullPrompt).then(() => {
        alert('LLM prompt copied to clipboard!');
    }).catch(err => {
        console.error('Failed to copy:', err);
        // Fallback: create textarea and copy
        const textarea = document.createElement('textarea');
        textarea.value = fullPrompt;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        alert('LLM prompt copied to clipboard!');
    });
}

function previewAssignments() {
    // Build the same data that would be sent to the LLM
    const playData = buildPlayData();
    if (!playData || !playData.offense || playData.offense.length === 0) {
        alert('No play data available. Please set up formations and assignments first.');
        return;
    }
    
    // Build players array for the preview
    const allPlayers = [...playData.offense, ...playData.defense];
    allPlayers.sort((a, b) => {
        const aX = a.coords ? a.coords.x : 0;
        const bX = b.coords ? b.coords.x : 0;
        return aX - bX;
    });
    
    const players = allPlayers.map(p => {
        const coords = p.coords ? { x: p.coords.x, y: p.coords.y } : null;
        // Compress box X coords
        const isBoxPosition = ['OT', 'OG', 'C', 'DE', 'DT'].includes(p.position) || 
            (p.location && (p.location.includes('technique') || p.location.includes('gap') || 
             p.location.includes('Tight') || p.location.includes('Wing')));
        const xMultiplier = isBoxPosition ? 0.375 : 1.37;
        const rawX = coords ? coords.x * xMultiplier : 0;
        
        // Compress Y based on position/location
        let rawY = 0;
        if (coords) {
            const loc = p.location || '';
            const pos = p.position;
            if (['OT', 'OG', 'C'].includes(pos)) {
                rawY = 0;
            } else if (['DE', 'DT'].includes(pos) || loc.includes('technique')) {
                rawY = 1;
            } else if (['QB', 'RB'].includes(pos)) {
                rawY = Math.max(coords.y, -5) * 0.5;
            } else if (['LB', 'MLB'].includes(pos) || loc.includes('gap')) {
                rawY = loc.includes('deep') ? 6 : 3;
            } else if (['S'].includes(pos) && coords.y > 10) {
                rawY = Math.min(coords.y * 0.9, 18);
            } else if (loc.includes('press')) {
                rawY = 1;
            } else if (loc.includes('cushion')) {
                rawY = 11;
            } else if (['CB', 'S'].includes(pos) && coords.y > 0 && coords.y <= 10) {
                rawY = 6;
            } else {
                rawY = coords.y * 1.37;
            }
        }
        
        const isOffense = ['QB', 'RB', 'WR', 'TE', 'OT', 'OG', 'C'].includes(p.position);
        const initials = p.name.split(' ').map(n => n[0]).join('').toUpperCase();
        const assignment = `${p.assignmentText}${p.warning || ''}`.replace(/[,\n]/g, ' ').trim();
        
        return {
            pos: p.position,
            name: initials,
            align: p.location,
            x: rawX,
            y: rawY,
            rating: Math.round(p.effectivePercentile),
            assign: assignment,
            side: isOffense ? 'offense' : 'defense'
        };
    });
    
    const previewData = {
        title: `${gameState.down}${getDownSuffix(gameState.down)} & ${gameState.distance} @ ${gameState["opp-yardline"]}yd Q${gameState.quarter} ${gameState.time}`,
        meta: `${gameState.score.home}-${gameState.score.away}`,
        playSetup: "",
        keyAnalysis: "",
        grade: null,
        gradeRationale: ""
    };
    
    // Open new window with play-analysis.html
    const previewWindow = window.open('play-analysis.html', '_blank');
    
    // Wait for window to load then inject data
    previewWindow.addEventListener('load', () => {
        previewWindow.PlayAnalysis.setPlayData(previewData);
        previewWindow.PlayAnalysis.setPlayers(players);
    });
}

async function executePlayOverride() {
    const overrideYardsInput = document.getElementById('overrideYards');
    const overrideTurnoverCheckbox = document.getElementById('overrideTurnover');
    
    if (!overrideYardsInput) {
        alert('Override yards input not found');
        return;
    }
    
    const yards = parseFloat(overrideYardsInput.value);
    if (isNaN(yards)) {
        alert('Please enter a valid number for yards');
        return;
    }
    
    const isTurnover = overrideTurnoverCheckbox && overrideTurnoverCheckbox.checked;
    
    // Build play data
    const playData = buildPlayData();
    
    // Create override result
    const result = {
        yards: yards,
        turnover: isTurnover,
        turnoverType: isTurnover ? 'Fumble' : null,
        outcomeType: yards >= 4 ? 'success' : yards < 0 ? 'havoc' : 'unsuccessful',
        description: `Manual override: ${yards > 0 ? '+' : ''}${yards} yards${isTurnover ? ' (TURNOVER)' : ''}`,
        playType: 'run', // Default, could be enhanced
        evalData: null // No LLM data for override
    };
    
    // Store play type for clock runoff
    result.playType = playData.playType || 'run';
    
    // Update game state
    updateGameState(result);
    
    // Update fatigue (use default evalData for fatigue calculation)
    updateFatigue(playData, result.playType);
    
    // Display results
    document.getElementById('llmOutput').textContent = 'Manual Override - No LLM analysis';
    
    // Display rationale
    const rationaleEl = document.getElementById('playRationale');
    if (rationaleEl) {
        rationaleEl.value = 'Manual override - no LLM rationale provided.';
    }
    
    // Display outcome type
    const outcomeTypeNames = {
        'havoc': 'Havoc Play',
        'explosive': 'Explosive Play',
        'success': 'Successful Play',
        'unsuccessful': 'Unsuccessful Play'
    };
    let outcomeTypeName = outcomeTypeNames[result.outcomeType] || result.outcomeType;
    
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
    
    // Display rate comparison (not available for override)
    const rateDetailsEl = document.getElementById('rateDetails');
    if (rateDetailsEl) {
        rateDetailsEl.textContent = 'Rate comparison unavailable (manual override)';
    }
    
    // Show results step
    document.getElementById('results').classList.remove('hidden');
    document.getElementById('step5').classList.add('hidden');
}

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
    const playData = buildPlayData();
    
    // Call LLM (placeholder - you'll need to implement actual API call)
    const llmOutput = await callLLM(playData);
    
    // Parse LLM output to get eval format
    const evalData = parseLLMOutput(llmOutput);
    
    // Run state machine
    const result = await runStateMachine(evalData, playData);
    
    // Store play type for clock runoff
    result.playType = playData.playType || 'run';
    
    // Update game state
    updateGameState(result);
    
    // Update fatigue
    updateFatigue(playData, result.playType);
    
    // Extract rationale from LLM output (everything before the JSON)
    const lines = llmOutput.split('\n');
    let rationale = '';
    let jsonStartIndex = -1;
    
    // Find where JSON starts (last line with {)
    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (line.startsWith('{') && (line.includes('play-type') || line.includes('offense-advantage'))) {
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
    let outcomeTypeName = outcomeTypeNames[result.outcomeType] || result.outcomeType;
    
    // For incomplete passes, append "(Incomplete)" to the outcome type
    if (result.playType === 'pass' && result.isComplete === false) {
        outcomeTypeName += ' (Incomplete)';
    }
    
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
    
    // Display trait adjustments
    const traitAdjustmentsEl = document.getElementById('traitAdjustments');
    const traitAdjustmentsBody = document.getElementById('traitAdjustmentsBody');
    if (traitAdjustmentsEl && traitAdjustmentsBody && traitAdjustments && traitAdjustments.length > 0) {
        traitAdjustmentsEl.style.display = 'block';
        traitAdjustmentsBody.innerHTML = '';
        traitAdjustments.forEach(adj => {
            const row = document.createElement('tr');
            const valueColor = adj.value > 0 ? '#4caf50' : adj.value < 0 ? '#f44336' : '#666';
            row.innerHTML = `
                <td style="padding: 8px; border: 1px solid #ddd;">${adj.playerName}</td>
                <td style="padding: 8px; border: 1px solid #ddd;">${adj.position}</td>
                <td style="padding: 8px; border: 1px solid #ddd;">${adj.description}</td>
                <td style="padding: 8px; border: 1px solid #ddd; text-align: right; color: ${valueColor}; font-weight: bold;">${adj.value > 0 ? '+' : ''}${adj.value}</td>
            `;
            traitAdjustmentsBody.appendChild(row);
        });
    } else if (traitAdjustmentsEl) {
        traitAdjustmentsEl.style.display = 'none';
    }
    
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
    
    // Reset trait adjustments for this play
    traitAdjustments = [];
    
    // Use the new prompt generator
    let fixedInstructions, userMessageContent;
    if (typeof generateFullPrompt === 'function') {
        const promptData = generateFullPrompt(playData);
        fixedInstructions = promptData.systemPrompt;
        userMessageContent = promptData.userMessage;
        
        // Collect trait adjustments from all players
        const allPlayers = buildPlayersForCSV(playData);
        allPlayers.forEach(p => {
            if (p.traitAdjustment) {
                traitAdjustments.push(p.traitAdjustment);
            }
        });
    } else {
        // Fallback - use FIXED_INSTRUCTIONS constant if available
        fixedInstructions = typeof FIXED_INSTRUCTIONS !== 'undefined' ? FIXED_INSTRUCTIONS : `Analyze SCHEME: spatial (X/Y), blocking vs assignments, coverage vs routes.

SPATIAL: X left-/right+, Y off-/def+. Count blockers vs defenders at POA.

KEY CHECKS:

Numerical advantages at POA via X values; one player can swing -3 to +2 alone.

Late pursuit does not reduce advantage.

Player ratings don't cap scheme advantage (execution failures chances handled outside LLM) and theoretical assignments can't cure wrong physical position.

Evaluate: 40% alignment, 30% assignment, 20% positional mismatches, 10% player ratings.

Late or missed assignments invalidate coverage.

Identify routes into coverage voids or open windows.

Blitz w/o backfield protection = less success, more leverage.

Blocking mismatches: inferior vs elite = less success, more leverage.

What is the protection scheme? (6-man, 7-man, any slides. Can it handle the blitzers and what is the level of redundancy to handle lost blocks?)  Insufficient protection = high leverage and lower success

Bear front: hurts zone runs, helps gap runs.

Deep zones on play side = lower leverage; man coverage = higher leverage.

EXAMPLES:

+8 to +10: defense entirely out of position (e.g., open TD screen).

-8 to -10: unblocked rusher, routes into coverage, no quick throw.

-4 to 0: neutral/good scheme, even matchups.

+2 to +5: wrong coverage/commit exploited.`;
        
        // Build user message using old method - simplified fallback
        if (typeof generateUserMessage === 'function' && typeof generatePlayerCSV === 'function' && typeof buildPlayersForCSV === 'function') {
            userMessageContent = generateUserMessage(playData, generatePlayerCSV(playData, buildPlayersForCSV(playData)));
        } else {
            // Ultimate fallback - build manually (this should rarely happen)
            userMessageContent = `${gameState.down}${getDownSuffix(gameState.down)} & ${gameState.distance} @ ${gameState["opp-yardline"]}yd Q${gameState.quarter} ${gameState.time} ${gameState.score.home}-${gameState.score.away}\n\n[Player data would go here]`;
        }
    }
    
    // OLD METHOD CODE REMOVED - using new modules instead
    // If we reach here without userMessageContent, something went wrong
    if (!userMessageContent) {
        console.error('Failed to generate user message content');
        userMessageContent = `${gameState.down}${getDownSuffix(gameState.down)} & ${gameState.distance} @ ${gameState["opp-yardline"]}yd Q${gameState.quarter} ${gameState.time} ${gameState.score.home}-${gameState.score.away}\n\nError generating prompt.`;
    }
    
    // Log the intended LLM output
    console.log('=== SYSTEM PROMPT ===');
    console.log(fixedInstructions);
    console.log('=== USER MESSAGE ===');
    console.log(userMessageContent);
    console.log('=== END PROMPT ===');
    
    // If we have API keys, make actual API calls (prefer Claude)
    if (claudeKey) {
        try {
            console.log('Calling Claude API...');
            const claudeResponse = await callClaude(fixedInstructions, userMessageContent, claudeKey);
            if (claudeResponse) {
                console.log('=== CLAUDE RESPONSE ===');
                console.log(claudeResponse);
                console.log('=== END CLAUDE RESPONSE ===');
                return claudeResponse;
            }
        } catch (error) {
            console.error('Error calling Claude API:', error);
            console.log('Falling back to OpenAI or mock output');
        }
    }
    
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
    return `Point of attack: Right side B gap. Key matchups: Left guard vs defensive tackle, slot receiver vs nickel corner.

{"play-type": "run", "offense-advantage": 0.0, "risk-leverage": 5.0}`;
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

async function callClaude(systemPrompt, userPrompt, apiKey) {
    // Start the play clock immediately when request begins
    startCacheTimer();
    
    try {
        // Build request body based on caching setting
        let requestBody;
        
        if (promptCacheEnabled) {
            // Use prompt caching with cache_control on system prompt
            requestBody = {
                model: 'claude-3-5-haiku-20241022',
                max_tokens: 4000,
                temperature: 0.2,
                system: [
                    {
                        type: 'text',
                        text: systemPrompt,
                        cache_control: { type: 'ephemeral' }
                    }
                ],
                messages: [
                    {
                        role: 'user',
                        content: userPrompt
                    }
                ]
            };
        } else {
            // Standard request without caching
            requestBody = {
                model: 'claude-3-5-haiku-20241022',
                max_tokens: 4000,
                temperature: 0.2,
                system: systemPrompt,
                messages: [
                    {
                        role: 'user',
                        content: userPrompt
                    }
                ]
            };
        }
        
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(`Claude API error: ${response.status} - ${JSON.stringify(errorData)}`);
        }
        
        const data = await response.json();
        
        // Log cache usage if caching is enabled
        if (promptCacheEnabled && data.usage) {
            const usage = data.usage;
            const cacheCreation = usage.cache_creation_input_tokens || 0;
            const cacheRead = usage.cache_read_input_tokens || 0;
            const regularInput = usage.input_tokens || 0;
            
            if (cacheCreation > 0) {
                console.log(`📝 CACHE WRITE: ${cacheCreation} tokens written to cache`);
                startCacheTimer(); // Start 5-minute countdown
            } else if (cacheRead > 0) {
                console.log(`✅ CACHE HIT: ${cacheRead} tokens read from cache (saved ~90% cost)`);
                refreshCacheTimer(); // Refresh the 5-minute window
            } else {
                console.log(`❌ CACHE MISS: No cache activity (${regularInput} regular input tokens)`);
            }
            
            console.log(`Token usage - Cache write: ${cacheCreation}, Cache read: ${cacheRead}, Regular: ${regularInput}, Output: ${usage.output_tokens || 0}`);
        }
        
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


function calculateRatesFromAdvantage(playType, offenseAdvantage, riskLeverage) {
    // Keep original success/unsuccessful ratio logic
    // Only change: explosive/havoc split based on offense-advantage
    
    // Original baseline rates
    const baselineSuccess = 40.0;
    const baselineExplosive = 12.0;
    const baselineHavoc = 12.0;
    
    // Map offense-advantage to success+explosive total (good outcomes) - UNCHANGED
    const goodOutcomesBase = 52.0 + (offenseAdvantage * 4.5);
    const goodOutcomes = Math.max(5, Math.min(95, goodOutcomesBase));
    
    // Risk-leverage affects total volatile pool size
    const riskFactor = riskLeverage / 10.0;
    
    // Play type adjustments
    const passExplosiveBoost = playType === 'pass' ? 3.0 : 0.0;
    const passHavocBoost = playType === 'pass' ? 1.0 : 0.0;
    
    // Total explosive+havoc pool (increases with risk)
    const baseVolatile = baselineExplosive + baselineHavoc; // 24%
    const volatilePool = baseVolatile + (riskFactor * 16.0) + passExplosiveBoost + passHavocBoost;
    
    // NEW: Split volatile pool based on offense-advantage
    // +10 = all explosive (offense wins big plays), -10 = all havoc (defense wins big plays)
    // Baseline 3% minimum for each
    const offenseFactor = (offenseAdvantage + 10) / 20.0; // 0 to 1
    
    const explosiveShare = 0.03 + (volatilePool - 6) * offenseFactor / 100 * 100; // min 3%
    const havocShare = 0.03 + (volatilePool - 6) * (1 - offenseFactor) / 100 * 100; // min 3%
    
    // Recalculate to ensure pool is split correctly
    const poolAfterBaseline = volatilePool - 6; // subtract 3% baseline each
    const explosiveRate = 3 + (poolAfterBaseline * offenseFactor);
    const havocRate = 3 + (poolAfterBaseline * (1 - offenseFactor));
    
    // Success rate: good outcomes minus explosive
    const successRate = Math.max(3, goodOutcomes - explosiveRate);
    
    return {
        "success-rate": Math.min(90, successRate),
        "explosive-rate": Math.max(3, Math.min(65, explosiveRate)),
        "havoc-rate": Math.max(3, Math.min(65, havocRate))
    };
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
            if (line.startsWith('{') && (line.includes('play-type') || line.includes('offense-advantage'))) {
                lastLine = line;
                break;
            }
        }
    }
    
    // Remove markdown code blocks if present
    lastLine = lastLine.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
    
    try {
        const parsed = JSON.parse(lastLine);
        
        // Validate and extract values
        const playType = (parsed["play-type"] || 'run').toLowerCase();
        const offenseAdvantage = typeof parsed["offense-advantage"] === 'number' ? parsed["offense-advantage"] : parseFloat(parsed["offense-advantage"]) || 0.0;
        const riskLeverage = typeof parsed["risk-leverage"] === 'number' ? parsed["risk-leverage"] : parseFloat(parsed["risk-leverage"]) || 5.0;
        
        // Clamp values
        const clampedAdvantage = Math.max(-10, Math.min(10, offenseAdvantage));
        const clampedLeverage = Math.max(0, Math.min(10, riskLeverage));
        
        // Calculate rates from advantage and leverage
        const rates = calculateRatesFromAdvantage(playType, clampedAdvantage, clampedLeverage);
        
        return {
            "play-type": playType,
            "success-rate": rates["success-rate"],
            "explosive-rate": rates["explosive-rate"],
            "havoc-rate": rates["havoc-rate"],
            "offense-advantage": clampedAdvantage,
            "risk-leverage": clampedLeverage
        };
    } catch (error) {
        console.error('Error parsing LLM output:', error);
        console.error('Last line was:', lastLine);
        console.error('Full output:', output);
        // Return default values
        const defaultRates = calculateRatesFromAdvantage('run', 0.0, 5.0);
        return {
            "play-type": "run",
            "success-rate": defaultRates["success-rate"],
            "explosive-rate": defaultRates["explosive-rate"],
            "havoc-rate": defaultRates["havoc-rate"],
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
    // Flea flicker is a pass play even though RB has a run assignment
    const rb = playData.offense.find(p => p.position === 'RB');
    const rbAssignment = rb ? (assignments.offense[rb.name] || '') : '';
    const isFleaFlicker = rbAssignment && rbAssignment.includes('Flea flicker');
    const playType = (isPass || isFleaFlicker) ? 'pass' : 'run';
    
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
        // Load havoc mapping from havoc.json
        const havocConfig = await loadOutcomeFile('outcomes/havoc.json');
        if (!havocConfig || !havocConfig[playType]) {
            console.error('Failed to load havoc config or play type not found');
            // Fallback to default
            outcomeFile = await loadOutcomeFile(playType === 'pass' ? 'outcomes/havoc-sack.json' : 'outcomes/havoc-tackle-for-loss.json');
        } else {
            // Roll 1-100 for specific havoc outcome based on play type
            const havocOutcomeRoll = Math.floor(Math.random() * 100) + 1;
            const outcomes = havocConfig[playType].outcomes;
            
            // Find which outcome to use based on cumulative probability
            let cumulativeProb = 0;
            let selectedOutcome = null;
            
            for (const outcome of outcomes) {
                cumulativeProb += outcome.probability;
                if (havocOutcomeRoll <= cumulativeProb) {
                    selectedOutcome = outcome;
                    break;
                }
            }
            
            // Fallback to first outcome if none selected (shouldn't happen)
            if (!selectedOutcome) {
                selectedOutcome = outcomes[0];
            }
            
            // Load the outcome file
            outcomeFile = await loadOutcomeFile(selectedOutcome.file);
            
            // Apply description modification if specified
            if (selectedOutcome["modify-description"] && outcomeFile) {
                outcomeFile = { ...outcomeFile };
                outcomeFile.description = selectedOutcome["modify-description"];
            }
        }
    } else if (outcomeRoll <= ranges.explosive) {
        outcomeType = 'explosive';
        if (playType === 'pass') {
            outcomeFile = await loadOutcomeFile('outcomes/explosive-pass.json');
        } else {
            outcomeFile = await loadOutcomeFile('outcomes/explosive-run.json');
        }
    } else if (outcomeRoll <= ranges.success) {
        outcomeType = 'success';
        if (playType === 'pass') {
            outcomeFile = await loadOutcomeFile('outcomes/successful-pass.json');
        } else {
            outcomeFile = await loadOutcomeFile('outcomes/successful-run.json');
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
            // Successful pass must have at least 1 yard
            yards = Math.max(1, yards);
        } else {
            // Incomplete pass - 0 yards
            yards = 0;
        }
    } else {
        // For runs or non-pass outcomes, calculate yards normally
        const yardsRoll = Math.floor(Math.random() * 100) + 1;
        yards = calculateYardsFromRoll(yardsRoll, outcomeFile);
        
    }
    
    // Round yards to 1 decimal place for display
    yards = Math.round(yards * 10) / 10;
    
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
        outcomeType, // This is the actual outcome type (success/unsuccessful/explosive/havoc)
        yards, 
        turnover,
        turnoverType: outcomeFile['turnover-type'],
        description: description,
        isComplete: isComplete,
        evalData,
        playType: playType,
        outcomeFileUsed: outcomeFile // Debug: track which file was actually used
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
    
    // Calculate minimum percentile needed to avoid negative yards
    // For mean + z*stdDev >= 0, we need z >= -mean/stdDev
    const minZForNonNegative = -mean / stdDev;
    let minPercentile = 0.01; // Default to 1st percentile
    
    if (minZForNonNegative > -3 && minZForNonNegative < 3) {
        // Use jstat to find percentile that gives us the minimum z-score
        // Add small safety margin (0.1 z-score units)
        const targetZ = minZForNonNegative + 0.1;
        minPercentile = jStat.normal.cdf(targetZ, 0, 1);
        // Clamp to reasonable range
        minPercentile = Math.max(0.01, Math.min(0.05, minPercentile));
    }
    
    // Map roll (1-100) to percentile range [minPercentile, 0.99]
    // This ensures the worst roll gives z-score that prevents negative yards
    const percentileRange = 0.99 - minPercentile;
    const percentile = minPercentile + ((roll - 1) / 99) * percentileRange;
    
    // Use inverse normal distribution (adjust for skewness)
    let z = inverseNormalCDF(percentile);
    
    if (skewness !== 0) {
        const skewAdjustment = skewness * (z * z - 1) / 6;
        z = z + skewAdjustment;
    }
    
    // Convert z-score to yards
    let yards = mean + (z * stdDev);
    
    // Round to nearest integer
    return Math.round(yards);
}

function inverseNormalCDF(p) {
    // Use jstat library for accurate inverse normal CDF
    // jstat.normal.inv(p, mean, std) - for standard normal, mean=0, std=1
    if (p <= 0 || p >= 1) {
        return p <= 0 ? -10 : 10;
    }
    return jStat.normal.inv(p, 0, 1);
}

function calculateClockRunoff(result) {
    // If timeout was called, runoff is fixed at timeout-runoff seconds
    if (gameState.timeoutCalled) {
        gameState.timeoutCalled = false; // Reset flag
        let baseRunoff = timingConfig?.["timeout-incomplete-runoff"] || 6;
        // Apply clock management modifiers
        const hurryUp = document.getElementById('hurryUpCheckbox')?.checked || false;
        const milkClock = document.getElementById('milkClockCheckbox')?.checked || false;
        if (hurryUp) baseRunoff -= 10;
        if (milkClock) baseRunoff += 10;
        return Math.max(0, baseRunoff); // Ensure non-negative
    }
    
    // Incomplete passes always get 6 second runoff
    if (result.playType === 'pass' && result.isComplete === false) {
        let baseRunoff = timingConfig?.["timeout-incomplete-runoff"] || 6;
        // Apply clock management modifiers
        const hurryUp = document.getElementById('hurryUpCheckbox')?.checked || false;
        const milkClock = document.getElementById('milkClockCheckbox')?.checked || false;
        if (hurryUp) baseRunoff -= 10;
        if (milkClock) baseRunoff += 10;
        return Math.max(0, baseRunoff); // Ensure non-negative
    }
    
    // Determine if winning or losing team has the ball
    const possession = gameState.possession || 'home';
    const homeScore = gameState.score.home || 0;
    const awayScore = gameState.score.away || 0;
    const isWinningTeam = (possession === 'home' && homeScore > awayScore) || 
                          (possession === 'away' && awayScore > homeScore);
    const isTied = homeScore === awayScore;
    
    // Use winning team numbers if tied
    const useWinningNumbers = isWinningTeam || isTied;
    
    // Get play type
    const playType = result.playType || 'run';
    
    // Get timing config (with defaults if not loaded)
    const config = timingConfig || {
        "winning-team": { "run": 44, "pass": 28 },
        "losing-team": { "run": 36, "pass": 19 }
    };
    
    // Calculate base runoff from timing.json
    let baseRunoff;
    if (useWinningNumbers) {
        baseRunoff = config["winning-team"][playType] || (playType === 'run' ? 44 : 28);
    } else {
        baseRunoff = config["losing-team"][playType] || (playType === 'run' ? 36 : 19);
    }
    
    // Apply clock management modifiers
    const hurryUp = document.getElementById('hurryUpCheckbox')?.checked || false;
    const milkClock = document.getElementById('milkClockCheckbox')?.checked || false;
    if (hurryUp) baseRunoff -= 10;
    if (milkClock) baseRunoff += 10;
    
    return Math.max(0, baseRunoff); // Ensure non-negative
}

function applyClockRunoff(seconds) {
    // Parse current time (MM:SS format)
    const [minutes, secs] = gameState.time.split(':').map(Number);
    let totalSeconds = minutes * 60 + secs;
    const beforeSeconds = totalSeconds;
    
    // Subtract runoff
    totalSeconds -= seconds;
    
    // Check for 2-minute warning (only in 2nd and 4th quarters)
    if ((gameState.quarter === 2 || gameState.quarter === 4) && 
        beforeSeconds > 120 && totalSeconds <= 120) {
        // 2-minute warning triggered - all players recover stamina
        recoverAllPlayersStamina();
        console.log('2-minute warning! All players recovered stamina');
    }
    
    // Handle quarter expiration
    if (totalSeconds <= 0) {
        // Advance to next quarter
        gameState.quarter += 1;
        
        // Reset clock to 15:00 for new quarter
        if (gameState.quarter <= 4) {
            gameState.time = "15:00";
        } else {
            // End of game (or overtime - handle later)
            gameState.time = "0:00";
        }
    } else {
        // Update time
        const newMinutes = Math.floor(totalSeconds / 60);
        const newSeconds = totalSeconds % 60;
        gameState.time = `${newMinutes.toString().padStart(2, '0')}:${newSeconds.toString().padStart(2, '0')}`;
    }
}

function updateGameState(result) {
    // Calculate and apply clock runoff
    if (!result.specialTeams) {
        const runoff = calculateClockRunoff(result);
        applyClockRunoff(runoff);
    }
    
    // Handle special teams results (punt, field goal)
    if (result.specialTeams) {
        if (result.specialTeams === 'punt') {
            // Punt: change possession, set opponent yardline
            changePossession();
            gameState["opp-yardline"] = result.newYardline;
            gameState.down = 1;
            gameState.distance = 10;
            updateRostersForPossession();
        } else if (result.specialTeams === 'field-goal-success') {
            // Field goal made: add 3 points, change possession
            const possession = gameState.possession || 'home';
            gameState.score[possession] += 3;
            changePossession();
            gameState["opp-yardline"] = 65; // Opponent gets ball at 65 after score
            gameState.down = 1;
            gameState.distance = 10;
            updateRostersForPossession();
        } else if (result.specialTeams === 'field-goal-miss') {
            // Field goal missed: change possession
            changePossession();
            gameState["opp-yardline"] = result.newYardline;
            gameState.down = 1;
            gameState.distance = 10;
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
    } else {
        // Did not get first down - update down and distance
        gameState.down += 1;
        gameState.distance -= result.yards;
        
        // Handle turnover on downs
        if (gameState.down > 4) {
            changePossession();
            gameState.down = 1;
            gameState.distance = 10;
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
        // Opponent gets ball at current yardline
        gameState["opp-yardline"] = 100 - gameState["opp-yardline"];
        updateRostersForPossession();
    }
    
    updateGameStateDisplay();
    saveGameState();
}

function changePossession() {
    gameState.possession = gameState.possession === 'home' ? 'away' : 'home';
    // All players recover stamina on change of possession
    recoverAllPlayersStamina();
}

function recoverAllPlayersStamina() {
    const amount = fatigueConfig?.["stoppage-recovery"] || 6;
    // Recover stamina for all players in all rosters
    ['home-offense', 'home-defense', 'away-offense', 'away-defense'].forEach(rosterKey => {
        if (rosters[rosterKey]) {
            rosters[rosterKey].forEach(player => {
                player.stamina = Math.min(100, (player.stamina || 100) + amount);
            });
        }
    });
    console.log(`All players recovered +${amount} stamina`);
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

function updateFatigue(playData, playType = 'run') {
    // Track who was on the field
    const playersOnField = new Set();
    [...playData.offense, ...playData.defense].forEach(player => {
        playersOnField.add(player.name);
    });
    
    // Use config values with fallbacks
    const config = fatigueConfig || {
        "baseline-fatigue": 2.5,
        "baseline-recovery": 2.25,
        "position-modifiers": {
            "always": {},
            "run": {},
            "pass": {}
        }
    };
    
    const baselineFatigue = config["baseline-fatigue"] || 2.5;
    const baselineRecovery = config["baseline-recovery"] || 2.25;
    const modifiers = config["position-modifiers"] || {};
    
    // Helper: apply modifiers based on position and play type
    function fatigueForPlayer(position, onField) {
        if (!onField) return -baselineRecovery; // negative = recover
        
        let fatigue = baselineFatigue;
        const pos = position || '';
        
        // Apply "always" modifiers (e.g., DE/DT)
        if (modifiers.always && modifiers.always[pos]) {
            fatigue += modifiers.always[pos];
        }
        
        // Apply play-type-specific modifiers
        if (playType === 'run' && modifiers.run && modifiers.run[pos]) {
            fatigue += modifiers.run[pos];
        } else if (playType === 'pass' && modifiers.pass && modifiers.pass[pos]) {
            fatigue += modifiers.pass[pos];
        }
        
        return fatigue;
    }
    
    // Update stamina for all rostered players (base rosters only, not aliases)
    Object.keys(rosters).forEach(rosterKey => {
        // Skip 'offense' and 'defense' as they are aliases to the base rosters
        if (rosterKey === 'offense' || rosterKey === 'defense') return;
        
        rosters[rosterKey].forEach(player => {
            if (player.stamina === undefined) return;
            
            const onField = playersOnField.has(player.name);
            const delta = fatigueForPlayer(player.position, onField);
            player.stamina = Math.max(0, Math.min(100, (player.stamina - delta)));
            // Track to 3 significant digits for storage
            player.stamina = Math.round(player.stamina * 1000) / 1000;
        });
    });
    
    // Save updated rosters
    saveRosters();
}

function calculateEffectivePercentile(player, assignment = null, playContext = null) {
    if (player.stamina === undefined || !player.percentile) {
        return { effectivePercentile: player.percentile || 50, traitAdjustment: null };
    }
    
    // Use config values with fallbacks
    const config = fatigueConfig || {
        "effectiveness-curve": {
            "high-stamina-threshold": 85,
            "high-stamina-multiplier": 0.99,
            "medium-stamina-threshold": 60,
            "medium-stamina-multiplier": 0.80,
            "min-multiplier": 0.20
        }
    };
    
    const curve = config["effectiveness-curve"] || {};
    const highThreshold = curve["high-stamina-threshold"] || 85;
    const highMultiplier = curve["high-stamina-multiplier"] || 0.99;
    const mediumThreshold = curve["medium-stamina-threshold"] || 60;
    const mediumMultiplier = curve["medium-stamina-multiplier"] || 0.80;
    const minMultiplier = curve["min-multiplier"] || 0.20;
    
    // Ensure stamina is between 0 and 100
    const stamina = Math.max(0, Math.min(100, player.stamina));
    let basePercentile = player.percentile;
    
    // Detect and apply trait adjustment BEFORE fatigue
    let traitAdjustment = null;
    if (assignment && typeof detectPlayerTrait === 'function') {
        // Get player location for context
        const playerId = Object.keys(playerPositions || {}).find(id => {
            const p = getPlayerById(id);
            return p && p.name === player.name;
        });
        const location = playerId ? (playerPositions[playerId]?.location || '') : '';
        const context = { ...playContext, location };
        
        traitAdjustment = detectPlayerTrait(player, assignment, context);
        if (traitAdjustment && traitAdjustment.value !== 0) {
            // Apply trait adjustment to base percentile (0-12 range)
            basePercentile = Math.max(0, Math.min(100, basePercentile + traitAdjustment.value));
        }
    }
    
    // Logarithmic fatigue curve using config values
    let multiplier = 1.0;
    
    if (stamina >= highThreshold) {
        multiplier = highMultiplier;
    } else if (stamina >= mediumThreshold) {
        // Linear interpolation between high threshold and medium threshold
        const range = highThreshold - mediumThreshold;
        const diff = highThreshold - stamina;
        multiplier = highMultiplier - (diff / range) * (highMultiplier - mediumMultiplier);
    } else {
        // Logarithmic drop-off below medium threshold
        // Using log base 10: multiplier = a * log(stamina) + b
        // At mediumThreshold: mediumMultiplier, at 0: 0.00
        const a = mediumMultiplier / Math.log10(mediumThreshold);
        multiplier = a * Math.log10(Math.max(stamina, 1));
    }
    
    // Calculate effective percentile
    let effectivePercentile = basePercentile * multiplier;
    
    // CRITICAL: Preserve player rankings - ensure a 30th percentile player can never
    // exceed a 70th percentile player, even with extreme fatigue differences.
    // Cap effective percentile to never exceed base percentile, and ensure minimum
    // effectiveness maintains relative rankings.
    const actualMultiplier = Math.max(minMultiplier, multiplier);
    effectivePercentile = basePercentile * actualMultiplier;
    
    // Additional safeguard: ensure effective never exceeds base (fatigue only reduces, never increases)
    // BUT: trait adjustments can increase it above original base, so we need to track the adjusted base
    const adjustedBase = traitAdjustment ? basePercentile : player.percentile;
    effectivePercentile = Math.min(effectivePercentile, adjustedBase);
    
    return { 
        effectivePercentile, 
        traitAdjustment: traitAdjustment ? {
            trait: traitAdjustment.trait,
            description: traitAdjustment.description,
            value: traitAdjustment.value,
            playerName: player.name,
            position: player.position
        } : null
    };
}

function updateGameStateDisplay() {
    const downNames = ['', '1st', '2nd', '3rd', '4th'];
    document.getElementById('down').textContent = downNames[gameState.down] || '1st';
    // Display distance and yardline - show decimals when present, but never round the stored values
    // The yardline and distance are updated with exact decimal values (e.g., 3.7 yards updates by exactly 3.7)
    document.getElementById('distance').textContent = gameState.distance;
    document.getElementById('yardline').textContent = gameState["opp-yardline"];
    
    // Use team names from teams.json if available
    const homeTeam = teams.home ? `${teams.home.city} ${teams.home.name}`.trim() : 'Home';
    const awayTeam = teams.away ? `${teams.away.city} ${teams.away.name}`.trim() : 'Away';
    const possession = gameState.possession || 'home';
    const possessionTeam = possession === 'home' ? homeTeam : awayTeam;
    
    // Update score with team names
    const scoreEl = document.getElementById('score');
    if (scoreEl) {
        scoreEl.innerHTML = `<span style="font-weight: ${possession === 'home' ? 'bold' : 'normal'}">${homeTeam} ${gameState.score.home}</span> - <span style="font-weight: ${possession === 'away' ? 'bold' : 'normal'}">${gameState.score.away} ${awayTeam}</span>`;
    }
    
    // Add possession indicator if element exists
    const possessionEl = document.getElementById('possession');
    if (possessionEl) {
        possessionEl.textContent = `Possession: ${possessionTeam}`;
    }
    
    document.getElementById('time').textContent = gameState.time;
}

function getPlayerById(playerId) {
    const [side, index] = playerId.split('-');
    return rosters[side][parseInt(index)];
}

function callTimeout(team) {
    // Check if team has timeouts remaining
    if (!gameState.timeouts || gameState.timeouts[team] <= 0) {
        alert(`${team === 'home' ? (teams.home?.name || 'Home') : (teams.away?.name || 'Away')} has no timeouts remaining!`);
        return;
    }
    
    // Decrement timeout count
    gameState.timeouts[team] -= 1;
    
    // Set timeout flag
    gameState.timeoutCalled = true;
    
    // All players recover stamina on timeout
    recoverAllPlayersStamina();
    
    // Return to personnel screen (step 1)
    renderStep(1);
    renderPersonnelSelection();
    updatePersonnelDisplay();
    updateGameStateDisplay();
    
    // Show confirmation
    const teamName = team === 'home' 
        ? `${teams.home?.city || ''} ${teams.home?.name || 'Home'}`.trim()
        : `${teams.away?.city || ''} ${teams.away?.name || 'Away'}`.trim();
    alert(`${teamName} called a timeout! (${gameState.timeouts[team]} remaining)`);
}

function resetPlay() {
    // Keep last selected players for next play
    lastSelectedPlayers = [...selectedPlayers];
    lastSelectedDefense = [...selectedDefense];
    selectedPlayers = [];
    selectedDefense = [];
    playerPositions = {};
    assignments = { offense: {}, defense: {} };
    
    // Reset clock management checkboxes
    const hurryUpCheckbox = document.getElementById('hurryUpCheckbox');
    const milkClockCheckbox = document.getElementById('milkClockCheckbox');
    if (hurryUpCheckbox) hurryUpCheckbox.checked = false;
    if (milkClockCheckbox) milkClockCheckbox.checked = false;
    
    // Show step 0 if 4th down, otherwise step 1
    if (gameState.down === 4) {
        renderStep(0);
    } else {
        renderStep(1);
        renderPersonnelSelection();
    }
    document.getElementById('results').classList.add('hidden');
    // Note: timeoutCalled flag is NOT reset here - it's reset in calculateClockRunoff
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

function toggleTraitAdjustments() {
    const content = document.getElementById('traitAdjustmentsContent');
    const toggle = document.getElementById('traitAdjustmentsToggle');
    if (content && toggle) {
        if (content.style.display === 'none') {
            content.style.display = 'block';
            toggle.textContent = '▲';
        } else {
            content.style.display = 'none';
            toggle.textContent = '▼';
        }
    }
}

// Initialize on load
init();

