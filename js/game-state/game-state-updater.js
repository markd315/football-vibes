// Game state update functions
// Handles updating game state after plays and possession changes

/**
 * Updates rosters for current possession
 * @param {Object} gameState - Current game state
 * @param {Object} rosters - Rosters object with home/away offense/defense
 */
function updateRostersForPossession(gameState, rosters) {
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

/**
 * Changes possession to the other team
 * @param {Object} gameState - Current game state
 * @param {Object} rosters - Rosters object
 * @param {Function} updateRostersForPossession - Function to update rosters
 */
function changePossession(gameState, rosters, updateRostersForPossession) {
    gameState.possession = gameState.possession === 'home' ? 'away' : 'home';
    updateRostersForPossession(gameState, rosters);
}

/**
 * Saves game state to gamestate.json
 * @param {Object} gameState - Current game state
 * @returns {Promise<void>}
 */
async function saveGameState(gameState) {
    try {
        const response = await fetch('gamestate.json', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(gameState, null, 2)
        });
        if (!response.ok) {
            console.error('Failed to save game state');
        }
    } catch (error) {
        console.error('Error saving game state:', error);
    }
}

