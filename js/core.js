// Core global state and initialization
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

// Initialize
async function init() {
    try {
        console.log('Initializing application...');
        await loadGameState();
        await loadTeams();
        await loadRosters();
        await loadFieldLocations();
        await loadStateMachine();
        await loadBaselineRates();
        await loadTiming();
        
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

// Load timing configuration
async function loadTiming() {
    try {
        const response = await fetch('outcomes/timing.json');
        timingConfig = await response.json();
    } catch (error) {
        console.error('Error loading timing config:', error);
        // Default timing values
        timingConfig = {
            "timeout-incomplete-runoff": 6,
            "winning-team": {
                "run": 44,
                "pass": 28
            },
            "losing-team": {
                "run": 36,
                "pass": 19
            }
        };
    }
}

// Load data files
async function loadGameState() {
    try {
        const response = await fetch('gamestate.json');
        gameState = await response.json();
        // Initialize timeouts if missing
        if (!gameState.timeouts) {
            gameState.timeouts = { home: 3, away: 3 };
        }
        if (gameState.timeoutCalled === undefined) {
            gameState.timeoutCalled = false;
        }
    } catch (error) {
        console.error('Error loading game state:', error);
        // Default game state
        gameState = {
            possession: 'home',
            quarter: 1,
            down: 1,
            distance: 10,
            "opp-yardline": 65,
            score: {
                home: 0,
                away: 0
            },
            time: "15:00",
            timeouts: { home: 3, away: 3 },
            timeoutCalled: false,
            consecutiveUnsuccessfulPlays: 0
        };
    }
}

async function loadTeams() {
    try {
        const response = await fetch('rosters/teams.json');
        teams = await response.json();
        console.log('Teams loaded:', teams);
    } catch (error) {
        console.error('Error loading teams:', error);
        // Default teams if file not found
        teams = {
            home: { name: 'Home', city: '', record: '' },
            away: { name: 'Away', city: '', record: '' }
        };
    }
}

async function loadRosters() {
    try {
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
        rosters.defense = rosters['home-defense'];
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

function getPlayerById(playerId) {
    const [side, index] = playerId.split('-');
    return rosters[side][parseInt(index)];
}

function getDownSuffix(down) {
    if (down === 1) return 'st';
    if (down === 2) return 'nd';
    if (down === 3) return 'rd';
    return 'th';
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
    if (step === 1) {
        renderPersonnelSelection();
    } else if (step === 2) {
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

function nextStep() {
    if (currentStep < 5) {
        // Validation
        if (currentStep === 1) {
            if (selectedPlayers.length !== 11) {
                alert('Please select exactly 11 offensive players.');
                return;
            }
            if (selectedDefense.length !== 11) {
                alert('Please select exactly 11 defensive players.');
                return;
            }
        }
        renderStep(currentStep + 1);
    }
}

function previousStep() {
    if (currentStep > 0) {
        renderStep(currentStep - 1);
    }
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
    // Note: timeoutCalled flag is NOT reset here - it's reset in calculateClockRunoff
}

// Step indicator click handlers
document.addEventListener('DOMContentLoaded', () => {
    init();
    
    document.querySelectorAll('.step').forEach(step => {
        step.addEventListener('click', (e) => {
            const stepNum = parseInt(e.target.dataset.step);
            if (stepNum <= currentStep || stepNum === currentStep + 1) {
                renderStep(stepNum);
            }
        });
    });
});

