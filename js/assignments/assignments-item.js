// Assignment item UI creation
// Creates the UI elements for player assignments

/**
 * Creates an assignment item UI element for a player
 * @param {Object} player - Player object
 * @param {string} side - 'offense' or 'defense'
 * @param {string} location - Player's location on field
 * @param {Object} offensiveAssignments - Offensive assignment definitions
 * @param {Object} defensiveAssignments - Defensive assignment definitions
 * @param {Array} selectedPlayers - Array of offensive player IDs (for man coverage)
 * @param {Function} getPlayerById - Function to get player by ID
 * @param {Function} populateActions - Function to populate action dropdown
 * @param {Function} updateAssignment - Function to update assignment
 * @param {Function} updateManCoverageSelector - Function to update man coverage selector
 * @param {Function} getDefaultGapFromLocation - Function to get default gap from location
 * @param {Object} assignments - Assignments object
 * @returns {HTMLElement} Assignment item element
 */
function createAssignmentItem(player, side, location, offensiveAssignments, defensiveAssignments,
                             selectedPlayers, getPlayerById, populateActions, updateAssignment,
                             updateManCoverageSelector, getDefaultGapFromLocation, assignments) {
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
    
    const playerAssignments = side === 'offense' ? offensiveAssignments : defensiveAssignments;
    const positionAssignments = playerAssignments[player.position] || {};
    
    // Populate categories
    Object.keys(positionAssignments).forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        categorySelect.appendChild(option);
    });
    
    // Pre-populate with most likely action
    const defaultCategory = Object.keys(positionAssignments)[0];
    if (defaultCategory) {
        categorySelect.value = defaultCategory;
        populateActions(actionSelect, positionAssignments[defaultCategory]);
        actionSelect.disabled = false;
        
        // For DL players, try to pre-populate gap from technique
        let defaultAction = positionAssignments[defaultCategory][0];
        if (['DE', 'DT'].includes(player.position) && defaultCategory === 'Rush') {
            const defaultGap = getDefaultGapFromLocation ? getDefaultGapFromLocation(location, player) : null;
            if (defaultGap && defaultGap !== 'Contain' && positionAssignments[defaultCategory].includes(defaultGap)) {
                defaultAction = defaultGap;
            } else if (defaultAction === 'Contain' && positionAssignments[defaultCategory].length > 1) {
                defaultAction = positionAssignments[defaultCategory].find(action => action !== 'Contain') || defaultAction;
            }
        }
        
        if (defaultAction) {
            actionSelect.value = defaultAction;
            updateAssignment(player, side, defaultCategory, defaultAction, assignments, renderField, renderPlayerMarkers);
        }
    }
    
    categorySelect.addEventListener('change', (e) => {
        const category = e.target.value;
        actionSelect.innerHTML = '<option value="">Select action...</option>';
        actionSelect.disabled = !category;
        
        if (category && positionAssignments[category]) {
            populateActions(actionSelect, positionAssignments[category]);
            if (positionAssignments[category].length > 0) {
                actionSelect.value = positionAssignments[category][0];
                updateAssignment(player, side, category, positionAssignments[category][0], assignments, renderField, renderPlayerMarkers);
                updateManCoverageSelector(item, player, side, category, positionAssignments[category][0]);
            }
        } else {
            updateManCoverageSelector(item, player, side, '', '');
        }
    });
    
    actionSelect.addEventListener('change', (e) => {
        updateAssignment(player, side, categorySelect.value, e.target.value, assignments, renderField, renderPlayerMarkers);
        updateManCoverageSelector(item, player, side, categorySelect.value, e.target.value);
    });
    
    // Man coverage selector (only for defensive players in man coverage)
    const manCoverageSelect = document.createElement('select');
    manCoverageSelect.style.cssText = 'padding: 4px; border-radius: 3px; border: 1px solid #ddd; font-size: 0.8em; margin-top: 3px; display: none; width: 100%;';
    manCoverageSelect.innerHTML = '<option value="">Covering...</option>';
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
                assignments[side][player.name] = {
                    category: 'Man Coverage',
                    action: 'Inside technique man',
                    manCoverageTarget: e.target.value
                };
            }
            updateAssignment(player, side, 'Man Coverage', assignments[side][player.name].action, assignments, renderField, renderPlayerMarkers);
        }
    });
    
    item.appendChild(categorySelect);
    item.appendChild(actionSelect);
    item.appendChild(manCoverageSelect);
    
    return item;
}

/**
 * Updates man coverage selector visibility
 * @param {HTMLElement} item - Assignment item element
 * @param {Object} player - Player object
 * @param {string} side - 'offense' or 'defense'
 * @param {string} category - Assignment category
 * @param {string} action - Assignment action
 * @param {Array} selectedPlayers - Array of offensive player IDs
 * @param {Function} getPlayerById - Function to get player by ID
 * @param {Object} assignments - Assignments object
 */
function updateManCoverageSelector(item, player, side, category, action, selectedPlayers, getPlayerById, assignments) {
    const safeId = `manCoverage-${player.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const manCoverageSelect = item.querySelector(`#${safeId}`) || 
                              item.querySelector(`select[data-player-name="${player.name}"]`);
    if (!manCoverageSelect) return;
    
    // Show selector only for defensive players in man coverage
    if (side === 'defense' && category === 'Man Coverage' && 
        (action === 'Inside technique man' || action === 'Outside technique man' || action === 'Inside match man' || action === 'Outside match man')) {
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
        
        // Set the selected value if manCoverageTarget exists
        const assignment = assignments[side] && assignments[side][player.name];
        if (assignment && assignment.manCoverageTarget) {
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

/**
 * Populates action dropdown with actions
 * @param {HTMLElement} select - Select element
 * @param {Array} actions - Array of action strings
 */
function populateActions(select, actions) {
    actions.forEach(action => {
        const option = document.createElement('option');
        option.value = action;
        option.textContent = action;
        select.appendChild(option);
    });
}

/**
 * Updates a player's assignment
 * @param {Object} player - Player object
 * @param {string} side - 'offense' or 'defense'
 * @param {string} category - Assignment category
 * @param {string} action - Assignment action
 * @param {Object} assignments - Assignments object
 * @param {Function} renderField - Function to render field
 * @param {Function} renderPlayerMarkers - Function to render player markers
 * @param {Function} renderAssignmentArrows - Function to render assignment arrows
 * @param {Function} renderPlaycallDiagram - Function to render offensive playcall diagram
 * @param {Function} renderDefensePlaycallDiagram - Function to render defensive playcall diagram
 */
function updateAssignment(player, side, category, action, assignments, renderField, renderPlayerMarkers,
                         renderAssignmentArrows, renderPlaycallDiagram, renderDefensePlaycallDiagram) {
    if (!assignments[side]) assignments[side] = {};
    // Preserve man coverage target if it exists
    const existingAssignment = assignments[side][player.name];
    assignments[side][player.name] = {
        category: category,
        action: action,
        manCoverageTarget: existingAssignment?.manCoverageTarget || null
    };
    // Re-render field to show arrows
    if (renderField) renderField();
    if (renderPlayerMarkers) renderPlayerMarkers();
    if (renderAssignmentArrows) renderAssignmentArrows();
    // Update playcall diagrams
    if (side === 'offense' && renderPlaycallDiagram) {
        renderPlaycallDiagram();
    } else if (side === 'defense' && renderDefensePlaycallDiagram) {
        renderDefensePlaycallDiagram();
    }
}

