// Game state loading functions
// Handles loading game state and configuration files

/**
 * Loads game state from gamestate.json
 * @param {Function} loadJsonConfig - Function to load JSON config
 * @returns {Promise<Object>} Game state object
 */
async function loadGameState(loadJsonConfig) {
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
        const gameState = await loadJsonConfig('gamestate.json', defaultValue);
        // Initialize timeouts if missing
        if (!gameState.timeouts) {
            gameState.timeouts = { home: 3, away: 3 };
        }
        if (gameState.timeoutCalled === undefined) {
            gameState.timeoutCalled = false;
        }
        return gameState;
    } catch (error) {
        return defaultValue;
    }
}

/**
 * Loads baseline rates from eval-format.json
 * @param {Function} loadJsonConfig - Function to load JSON config
 * @returns {Promise<Object>} Baseline rates object
 */
async function loadBaselineRates(loadJsonConfig) {
    const defaultValue = {
        "successful-run": 0.45,
        "unsuccessful-run": 0.35,
        "successful-pass": 0.55,
        "unsuccessful-pass": 0.30,
        "explosive-run": 0.10,
        "explosive-pass": 0.15,
        "havoc": 0.15
    };
    return await loadJsonConfig('context/eval-format.json', defaultValue);
}

/**
 * Loads timing configuration from timing.json
 * @param {Function} loadJsonConfig - Function to load JSON config
 * @returns {Promise<Object>} Timing config object
 */
async function loadTiming(loadJsonConfig) {
    const defaultValue = {
        "play-clock": 40,
        "play-duration": 5,
        "between-plays": 40,
        "timeout-duration": 120,
        "quarter-break": 120,
        "half-time": 900
    };
    return await loadJsonConfig('outcomes/timing.json', defaultValue);
}

/**
 * Loads fatigue configuration from fatigue.json
 * @param {Function} loadJsonConfig - Function to load JSON config
 * @returns {Promise<Object>} Fatigue config object
 */
async function loadFatigue(loadJsonConfig) {
    const defaultValue = {
        "baseline-fatigue": 2.5,
        "baseline-recovery": 2.25,
        "position-modifiers": {
            "always": {},
            "run": {},
            "pass": {}
        },
        "effectiveness-curve": {
            "high-stamina-threshold": 85,
            "high-stamina-multiplier": 0.99,
            "medium-stamina-threshold": 60,
            "medium-stamina-multiplier": 0.80,
            "min-multiplier": 0.20
        }
    };
    return await loadJsonConfig('fatigue.json', defaultValue);
}

/**
 * Loads state machine from play-state-machine.json
 * @param {Function} loadJsonConfig - Function to load JSON config
 * @returns {Promise<Object>} State machine object
 */
async function loadStateMachine(loadJsonConfig) {
    const defaultValue = {};
    return await loadJsonConfig('play-state-machine.json', defaultValue);
}

