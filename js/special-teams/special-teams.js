// Special teams execution functions
// Handles punts, field goals, and special teams results

/**
 * Executes a punt play
 * @param {Object} gameState - Current game state
 * @param {Function} showSpecialTeamsResult - Function to display result
 * @param {Function} updateGameState - Function to update game state
 * @param {Function} resetPlay - Function to reset play state
 */
async function executePunt(gameState, showSpecialTeamsResult, updateGameState, resetPlay) {
    // Simple punt: 40-50 yard average with some variance
    const baseDistance = 45;
    const variance = (Math.random() - 0.5) * 10; // -5 to +5 yards
    const distance = Math.round(baseDistance + variance);
    
    // Calculate new yardline (opponent's perspective)
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

/**
 * Executes a field goal attempt
 * @param {Object} gameState - Current game state
 * @param {Function} showSpecialTeamsResult - Function to display result
 * @param {Function} updateGameState - Function to update game state
 * @param {Function} resetPlay - Function to reset play state
 */
async function executeFieldGoal(gameState, showSpecialTeamsResult, updateGameState, resetPlay) {
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

/**
 * Shows special teams result in the UI
 * @param {Object} result - Result object with specialTeams, description, etc.
 */
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

