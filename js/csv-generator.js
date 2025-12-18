// CSV generation for LLM prompt
// Generates the player CSV that goes into the LLM prompt
// Note: This module expects calculateEffectivePercentile to be available globally
// or passed as a parameter. For now, it's called from app.js context.

/**
 * Safely gets a global variable
 * @param {string} varName - Name of the global variable
 * @returns {*} The global variable value or null
 */
function getGlobal(varName) {
    try {
        const getter = new Function('return typeof ' + varName + ' !== "undefined" ? ' + varName + ' : null');
        return getter();
    } catch(e) {
        return null;
    }
}

/**
 * Generates CSV data for all players in the play
 * @param {Object} playData - Play data from buildPlayData()
 * @param {Array} allPlayers - Array of player objects with coords, assignments, etc.
 * @returns {string} CSV string
 */
function generatePlayerCSV(playData, allPlayers) {
    // Sort by X coordinate
    allPlayers.sort((a, b) => {
        const aX = a.coords ? a.coords.x : 0;
        const bX = b.coords ? b.coords.x : 0;
        return aX - bX;
    });
    
    const csvRows = allPlayers.map(p => {
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
        
        const assignment = `${p.assignmentText}${p.warning || ''}`.replace(/[,\n]/g, ' ').trim();
        const initials = p.name.split(' ').map(n => n[0]).join('').toUpperCase();
        
        // Get effective percentile - handle both old format (number) and new format (object)
        let effectivePercentile;
        if (typeof p.effectivePercentile === 'object' && p.effectivePercentile.effectivePercentile !== undefined) {
            effectivePercentile = p.effectivePercentile.effectivePercentile;
        } else {
            effectivePercentile = p.effectivePercentile || 50;
        }
        
        return `${p.position},${initials},${p.location},${x},${y},${effectivePercentile.toFixed(0)},${assignment}`;
    });
    
    return csvRows.join('\n');
}

/**
 * Builds all players array with proper data for CSV generation
 * @param {Object} playData - Play data from buildPlayData()
 * @returns {Array} Array of player objects ready for CSV
 */
function buildPlayersForCSV(playData) {
    // Safely access global variables
    const assignments = getGlobal('assignments') || { offense: {}, defense: {} };
    const selectedPlayers = getGlobal('selectedPlayers') || [];
    const selectedDefense = getGlobal('selectedDefense') || [];
    const playerPositions = getGlobal('playerPositions') || {};
    const fieldLocations = getGlobal('fieldLocations') || [];
    const getPlayerById = getGlobal('getPlayerById');
    const getLocationCoords = getGlobal('getLocationCoords');
    const calculateEffectivePercentile = getGlobal('calculateEffectivePercentile');
    
    if (!getPlayerById || !getLocationCoords || !calculateEffectivePercentile) {
        console.error('Required global functions not available: getPlayerById, getLocationCoords, calculateEffectivePercentile');
        return [];
    }
    
    const allPlayers = [];
    
    // Determine play type for trait detection
    const qb = playData.offense.find(p => p.position === 'QB');
    const qbAssignment = qb ? (assignments.offense[qb.name] || {}) : {};
    const isPass = qbAssignment && (
        qbAssignment.action?.includes('Boot') || 
        qbAssignment.action?.includes('drop') || 
        qbAssignment.action?.includes('Play action') ||
        qbAssignment.category === 'Pass'
    );
    const rb = playData.offense.find(p => p.position === 'RB');
    const rbAssignment = rb ? (assignments.offense[rb.name] || {}) : {};
    const isFleaFlicker = rbAssignment.action?.includes('Flea flicker');
    const playType = (isPass || isFleaFlicker) ? 'pass' : 'run';
    
    // Offensive players
    selectedPlayers.forEach((playerId) => {
        const player = getPlayerById(playerId);
        if (!player) return;
        const pos = playerPositions[playerId];
        if (!pos || !pos.location) return;
        
        const locCoords = getLocationCoords(pos.location, fieldLocations);
        const assignment = assignments.offense[player.name] || {};
        const assignmentText = assignment.action ? `${assignment.category}: ${assignment.action}` : 'No assignment';
        const coords = locCoords ? ` [X:${locCoords.x.toFixed(1)}, Y:${locCoords.y.toFixed(1)}]` : '';
        const actualPlayer = getPlayerById(playerId);
        const actualPosition = actualPlayer ? actualPlayer.position : (player.position || 'Unknown');
        const isOLInSkillPosition = (actualPosition === 'OT' || actualPosition === 'OG' || actualPosition === 'C') && pos.location && (pos.location.includes('Wide') || pos.location.includes('Slot') || pos.location.includes('Seam') || pos.location.includes('Wing') || pos.location.includes('Tight') || pos.location.includes('Split') || pos.location.includes('Flanker') || pos.location.includes('Trips') || pos.location.includes('Max split'));
        const warning = isOLInSkillPosition ? ' ⚠️ OFFENSIVE LINEMAN IN SKILL POSITION!' : '';
        
        // Calculate effective percentile with trait detection
        const playContext = { playType, location: pos.location };
        const percentileResult = calculateEffectivePercentile(player, assignment, playContext);
        
        allPlayers.push({
            side: 'OFFENSE',
            name: player.name,
            position: actualPosition,
            location: pos.location,
            coords: locCoords,
            assignmentText: assignmentText,
            effectivePercentile: percentileResult,
            warning: warning,
            traitAdjustment: percentileResult.traitAdjustment
        });
    });
    
    // Defensive players
    selectedDefense.forEach((playerId) => {
        const player = getPlayerById(playerId);
        if (!player) return;
        const pos = playerPositions[playerId];
        if (!pos || !pos.location) return;
        
        const locCoords = getLocationCoords(pos.location, fieldLocations);
        const assignment = assignments.defense[player.name] || {};
        const assignmentText = assignment.action ? `${assignment.category}: ${assignment.action}` : 'No assignment';
        const manTarget = (assignment.category === 'Man Coverage' && assignment.manCoverageTarget) ? ` (Man coverage on: ${assignment.manCoverageTarget})` : '';
        const coords = locCoords ? ` [X:${locCoords.x.toFixed(1)}, Y:${locCoords.y.toFixed(1)}]` : '';
        const actualPlayer = getPlayerById(playerId);
        const actualPosition = actualPlayer ? actualPlayer.position : (player.position || 'Unknown');
        const isDLInOffensivePosition = (actualPosition === 'DE' || actualPosition === 'DT') && pos.location && (pos.location.includes('Wide') || pos.location.includes('Slot') || pos.location.includes('Seam') || pos.location.includes('Wing') || pos.location.includes('Tight') || pos.location.includes('Split') || pos.location.includes('Flanker') || pos.location.includes('Trips') || pos.location.includes('Max split'));
        const warning = isDLInOffensivePosition ? ' ⚠️ DEFENSIVE LINEMAN IN OFFENSIVE SKILL POSITION!' : '';
        
        // Calculate effective percentile with trait detection
        const playContext = { playType, location: pos.location };
        const percentileResult = calculateEffectivePercentile(player, assignment, playContext);
        
        allPlayers.push({
            side: 'DEFENSE',
            name: player.name,
            position: actualPosition,
            location: pos.location,
            coords: locCoords,
            assignmentText: assignmentText + manTarget,
            effectivePercentile: percentileResult,
            warning: warning,
            traitAdjustment: percentileResult.traitAdjustment
        });
    });
    
    return allPlayers;
}

