// Assignment helper functions
// Utility functions for assignment calculations and mappings

/**
 * Maps DL techniques to gaps
 * @param {string} technique - Technique number (e.g., "3", "2i", "5")
 * @param {boolean} isLeft - Whether player is on left side
 * @returns {string} Gap assignment (e.g., "Left A gap", "Right B gap")
 */
function getGapFromTechnique(technique, isLeft) {
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

/**
 * Gets default gap assignment from player's technique location
 * @param {string} location - Location name (e.g., "Left 5 technique")
 * @param {Object} player - Player object
 * @param {Object} playerPositions - Map of player positions
 * @param {Function} getPlayerById - Function to get player by ID
 * @param {Function} getGapFromTechnique - Function to map technique to gap
 * @returns {string|null} Gap assignment or null
 */
function getDefaultGapFromLocation(location, player, playerPositions, getPlayerById, getGapFromTechnique) {
    if (!['DE', 'DT'].includes(player.position)) return null;
    
    // Extract technique and left/right from location name
    let techMatch = location.match(/(left|right)\s+(\d+i?)\s+technique/i);
    let isLeft = null;
    
    if (techMatch) {
        isLeft = techMatch[1].toLowerCase() === 'left';
        const technique = techMatch[2];
        const gap = getGapFromTechnique(technique, isLeft);
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
        const container = document.getElementById('fieldContainer');
        const canvasWidth = container ? container.offsetWidth : 1000;
        isLeft = playerPos.x < (canvasWidth / 2);
        return getGapFromTechnique(technique, isLeft);
    }
    
    // Fallback to old format (just number)
    techMatch = location.match(/^(\d+i?)$/);
    if (techMatch) {
        const technique = techMatch[1];
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
}

/**
 * Assigns man coverage to a defender
 * @param {Object} defender - Defender player object
 * @param {Array} eligibleOffense - Array of eligible offensive players
 * @param {string} action - Man coverage action (default: 'Inside technique man')
 * @param {Array} selectedPlayers - Array of offensive player IDs
 * @param {Object} playerPositions - Map of player positions
 * @param {Function} getPlayerById - Function to get player by ID
 * @param {Function} getLocationCoords - Function to get location coordinates
 * @param {Function} updateAssignment - Function to update assignment
 * @param {Object} assignments - Assignments object
 * @returns {boolean} True if assignment was made
 */
function assignManCoverage(defender, eligibleOffense, action = 'Inside technique man',
                           selectedPlayers, playerPositions, getPlayerById, getLocationCoords,
                           updateAssignment, assignments) {
    // Find defender's position
    const defenderId = Object.keys(playerPositions).find(id => {
        const p = getPlayerById(id);
        return p && p.name === defender.name;
    });
    
    if (!defenderId) return false;
    
    const defenderPos = playerPositions[defenderId];
    if (!defenderPos || !defenderPos.location) return false;
    
    const defenderCoords = getLocationCoords(defenderPos.location);
    if (!defenderCoords) return false;
    
    // Calculate distance helper
    function calculateDistance(coord1, coord2) {
        return Math.sqrt(Math.pow(coord1.x - coord2.x, 2) + Math.pow(coord1.y - coord2.y, 2));
    }
    
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
        nearestTarget.covered = true;
        return true;
    }
    return false;
}

