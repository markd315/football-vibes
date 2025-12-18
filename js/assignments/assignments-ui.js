// Assignments UI rendering and interaction
// Handles rendering assignment dropdowns and UI updates

/**
 * Renders assignment UI for all selected players
 * @param {Array} selectedPlayers - Array of offensive player IDs
 * @param {Array} selectedDefense - Array of defensive player IDs
 * @param {Object} playerPositions - Map of player positions
 * @param {Function} getPlayerById - Function to get player by ID
 * @param {Object} offensivePlaycalls - Offensive playcall definitions
 * @param {Object} defensivePlaycalls - Defensive playcall definitions
 * @param {Function} createAssignmentItem - Function to create assignment item UI
 * @param {Function} renderPlaycallDiagram - Function to render offensive playcall diagram
 * @param {Function} renderDefensePlaycallDiagram - Function to render defensive playcall diagram
 */
function renderAssignments(selectedPlayers, selectedDefense, playerPositions, getPlayerById, 
                          offensivePlaycalls, defensivePlaycalls, createAssignmentItem,
                          renderPlaycallDiagram, renderDefensePlaycallDiagram) {
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
    }
    
    if (defensivePlaycallSelect) {
        defensivePlaycallSelect.innerHTML = '<option value="">Select a playcall...</option>';
        Object.keys(defensivePlaycalls).forEach(playcall => {
            const option = document.createElement('option');
            option.value = playcall;
            option.textContent = playcall;
            defensivePlaycallSelect.appendChild(option);
        });
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
    selectedDefense.forEach((playerId) => {
        const player = getPlayerById(playerId);
        if (!player) return;
        
        const location = playerPositions[playerId]?.location || 'Not placed';
        const item = createAssignmentItem(player, 'defense', location);
        
        // Group by position: DL (DE, DT), LBs (LB, MLB), Secondary (CB, S)
        if (['DE', 'DT'].includes(player.position)) {
            if (defenseLineAssignments) {
                defenseLineAssignments.appendChild(item);
            }
        } else if (['LB', 'MLB'].includes(player.position)) {
            if (defenseLBAssignments) {
                defenseLBAssignments.appendChild(item);
            }
        } else if (['CB', 'S'].includes(player.position)) {
            if (defenseSecondaryAssignments) {
                defenseSecondaryAssignments.appendChild(item);
            }
        }
        
        window.assignmentItems.defense[player.name] = { item, playerId, player };
    });
    
    // Render playcall diagrams
    if (renderPlaycallDiagram) renderPlaycallDiagram();
    if (renderDefensePlaycallDiagram) renderDefensePlaycallDiagram();
}

