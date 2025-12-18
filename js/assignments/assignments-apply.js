// Assignment application functions
// Applies playcalls to players and updates their assignments

/**
 * Applies an offensive playcall to all selected players
 * @param {string} playcallName - Name of the playcall
 * @param {Object} offensivePlaycalls - Offensive playcall definitions
 * @param {Array} selectedPlayers - Array of offensive player IDs
 * @param {Object} playerPositions - Map of player positions
 * @param {Function} getPlayerById - Function to get player by ID
 * @param {Function} updateAssignment - Function to update player assignment
 * @param {Function} updateManCoverageSelector - Function to update man coverage selector
 * @param {Function} renderPlaycallDiagram - Function to render playcall diagram
 */
function applyOffensivePlaycall(playcallName, offensivePlaycalls, selectedPlayers, playerPositions, 
                                getPlayerById, updateAssignment, updateManCoverageSelector, renderPlaycallDiagram) {
    const playcall = offensivePlaycalls[playcallName];
    if (!playcall) return;
    
    // Group players by position for easier lookup
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
            updateAssignment(player, 'offense', assignment.category, assignment.action, assignments, renderField, renderPlayerMarkers);
            
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
    if (renderPlaycallDiagram) renderPlaycallDiagram();
}

/**
 * Applies a defensive playcall to all selected defensive players
 * @param {string} playcallName - Name of the playcall
 * @param {Object} defensivePlaycalls - Defensive playcall definitions
 * @param {Array} selectedDefense - Array of defensive player IDs
 * @param {Array} selectedPlayers - Array of offensive player IDs (for man coverage)
 * @param {Object} playerPositions - Map of player positions
 * @param {Array} fieldLocations - Field location data
 * @param {Function} getPlayerById - Function to get player by ID
 * @param {Function} getLocationCoords - Function to get location coordinates
 * @param {Function} updateAssignment - Function to update player assignment
 * @param {Function} assignManCoverage - Function to assign man coverage
 * @param {Function} applyBracketPlaycall - Function to apply Quarters Match playcall
 * @param {Function} renderDefensePlaycallDiagram - Function to render defensive playcall diagram
 */
function applyDefensivePlaycall(playcallName, defensivePlaycalls, selectedDefense, selectedPlayers, 
                                playerPositions, fieldLocations, assignments, getPlayerById, getLocationCoords,
                                updateAssignment, assignManCoverage, applyBracketPlaycall, renderField, renderPlayerMarkers, renderDefensePlaycallDiagram) {
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
        applyBracketPlaycall(playcallName, selectedDefense, playerPositions, fieldLocations, 
                            getPlayerById, getLocationCoords, updateAssignment, getDefaultGapFromLocation);
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
                            action = action.replace(/ L$/, isLeft ? ' L' : ' R');
                            action = action.replace(/ R$/, isLeft ? ' L' : ' R');
                        }
                    }
                }
                updateAssignment(player, 'defense', assignment.category, action, assignments, renderField, renderPlayerMarkers);
            }
        });
        
        if (renderDefensePlaycallDiagram) renderDefensePlaycallDiagram();
        return;
    }
    
    // Get eligible offensive players for man coverage
    const eligibleOffense = selectedPlayers.map(id => {
        const p = getPlayerById(id);
        return p && ['WR', 'TE', 'RB'].includes(p.position) ? p : null;
    }).filter(p => p);
    
    // Apply coverage based on cover number
    selectedDefense.forEach((playerId) => {
        const player = getPlayerById(playerId);
        if (!player) return;
        
        if (coverNumber === 0) {
            // Cover 0: All man coverage
            if (player.position === 'CB' || player.position === 'S') {
                assignManCoverage(player, eligibleOffense, 'Inside technique man', selectedPlayers, playerPositions, getPlayerById, getLocationCoords, updateAssignment, assignments);
            }
        } else if (coverNumber === 1) {
            // Cover 1: One deep safety, rest man
            if (player.position === 'S') {
                // Deep safety gets deep middle zone
                updateAssignment(player, 'defense', 'Zone Deep', 'Deep middle 1/3', assignments, renderField, renderPlayerMarkers);
            } else if (player.position === 'CB' || player.position === 'LB' || player.position === 'MLB') {
                assignManCoverage(player, eligibleOffense, 'Inside technique man', selectedPlayers, playerPositions, getPlayerById, getLocationCoords, updateAssignment, assignments);
            }
        } else if (coverNumber === 2) {
            // Cover 2: Two deep safeties, rest zone/man
            if (player.position === 'S') {
                const pos = playerPositions[playerId];
                const coords = pos ? getLocationCoords(pos.location) : null;
                const isLeft = coords ? coords.x < 0 : false;
                updateAssignment(player, 'defense', 'Zone Deep', isLeft ? 'Deep left (cov2)' : 'Deep right (cov2)', assignments, renderField, renderPlayerMarkers);
            } else if (isCover2Man) {
                // Cover 2 man: CBs and LBs in man
                if (player.position === 'CB' || player.position === 'LB' || player.position === 'MLB') {
                    assignManCoverage(player, eligibleOffense, 'Inside technique man', selectedPlayers, playerPositions, getPlayerById, getLocationCoords, updateAssignment, assignments);
                }
            } else {
                // Cover 2 zone: CBs and LBs in zone
                if (player.position === 'CB') {
                    updateAssignment(player, 'defense', 'Zone Short', 'Flat L', assignments, renderField, renderPlayerMarkers);
                } else if (player.position === 'LB' || player.position === 'MLB') {
                    updateAssignment(player, 'defense', 'Zone Short', 'Curl/Hook L', assignments, renderField, renderPlayerMarkers);
                }
            }
        } else if (coverNumber === 3) {
            // Cover 3: Three deep zones, LBs in hook zones
            if (player.position === 'CB') {
                const pos = playerPositions[playerId];
                const coords = pos ? getLocationCoords(pos.location) : null;
                const isLeft = coords ? coords.x < 0 : false;
                updateAssignment(player, 'defense', 'Zone Deep', isLeft ? 'Deep left (cov3)' : 'Deep right (cov3)', assignments, renderField, renderPlayerMarkers);
            } else if (player.position === 'S') {
                updateAssignment(player, 'defense', 'Zone Deep', 'Deep middle 1/3', assignments, renderField, renderPlayerMarkers);
            } else if (player.position === 'LB' || player.position === 'MLB') {
                const pos = playerPositions[playerId];
                const coords = pos ? getLocationCoords(pos.location) : null;
                const isLeft = coords ? coords.x < 0 : false;
                updateAssignment(player, 'defense', 'Zone Short', isLeft ? 'Hook L' : 'Hook R', assignments, renderField, renderPlayerMarkers);
            }
        } else if (coverNumber === 4) {
            // Cover 4: Four deep zones
            if (player.position === 'CB') {
                const pos = playerPositions[playerId];
                const coords = pos ? getLocationCoords(pos.location) : null;
                const isLeft = coords ? coords.x < 0 : false;
                updateAssignment(player, 'defense', 'Zone Deep', isLeft ? 'Deep far left (cov4)' : 'Deep far right (cov4)', assignments, renderField, renderPlayerMarkers);
            } else if (player.position === 'S') {
                updateAssignment(player, 'defense', 'Zone Deep', 'Deep middle 1/3', assignments, renderField, renderPlayerMarkers);
            } else if (player.position === 'LB' || player.position === 'MLB') {
                const pos = playerPositions[playerId];
                const coords = pos ? getLocationCoords(pos.location) : null;
                const isLeft = coords ? coords.x < 0 : false;
                updateAssignment(player, 'defense', 'Zone Short', isLeft ? 'Hook L' : 'Hook R', assignments, renderField, renderPlayerMarkers);
            }
        }
    });
    
    if (renderDefensePlaycallDiagram) renderDefensePlaycallDiagram();
}

/**
 * Applies Quarters Match playcall (bracket coverage)
 * @param {string} playcallName - Name of the playcall ('Quarters Match 3x1' or 'Quarters Match 2x2')
 * @param {Array} selectedDefense - Array of defensive player IDs
 * @param {Object} playerPositions - Map of player positions
 * @param {Array} fieldLocations - Field location data
 * @param {Function} getPlayerById - Function to get player by ID
 * @param {Function} getLocationCoords - Function to get location coordinates
 * @param {Function} updateAssignment - Function to update player assignment
 * @param {Function} getDefaultGapFromLocation - Function to get default gap from location
 */
function applyBracketPlaycall(playcallName, selectedDefense, playerPositions, fieldLocations,
                              getPlayerById, getLocationCoords, updateAssignment, getDefaultGapFromLocation) {
    const is3x1 = playcallName.includes('3x1');
    
    // Get all defensive players with their positions
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
            const defaultGap = getDefaultGapFromLocation ? getDefaultGapFromLocation(location, player) : null;
            if (defaultGap) {
                updateAssignment(player, 'defense', 'Rush', defaultGap, assignments, renderField, renderPlayerMarkers);
            }
        }
    });
    
    // Helper to assign 3-over-2 bracket to a side
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
        updateAssignment(capPlayer.player, 'defense', 'Quarters Match', 'CAP+DEEP', assignments, renderField, renderPlayerMarkers);
        assigned.push(capPlayer);
        
        // Remaining for MEG and TRAIL
        const remaining = coveragePlayers.filter(p => p !== capPlayer);
        
        // Sort by width (absolute X, descending = widest first)
        const byWidth = [...remaining].sort((a, b) => Math.abs(b.xCoord) - Math.abs(a.xCoord));
        
        // MEG = widest (usually outside CB)
        const megPlayer = byWidth[0];
        updateAssignment(megPlayer.player, 'defense', 'Quarters Match', 'LOCK+MEG', assignments, renderField, renderPlayerMarkers);
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
            updateAssignment(trailPlayer.player, 'defense', 'Quarters Match', 'TRAIL+APEX', assignments, renderField, renderPlayerMarkers);
            assigned.push(trailPlayer);
        }
        
        return assigned;
    }
    
    // Helper to assign 4-over-3 bracket (3x1 strong side)
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
            updateAssignment(capPlayer.player, 'defense', 'Quarters Match', 'CAP+DEEP', assignments, renderField, renderPlayerMarkers);
            assigned.push(capPlayer);
        }
        
        const remaining = coveragePlayers.filter(p => !assigned.includes(p));
        const byWidth = [...remaining].sort((a, b) => Math.abs(b.xCoord) - Math.abs(a.xCoord));
        
        // MEG = widest
        if (byWidth.length > 0) {
            const megPlayer = byWidth[0];
            updateAssignment(megPlayer.player, 'defense', 'Quarters Match', 'LOCK+MEG', assignments, renderField, renderPlayerMarkers);
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
            updateAssignment(trailPlayer.player, 'defense', 'Quarters Match', 'TRAIL+APEX', assignments, renderField, renderPlayerMarkers);
            assigned.push(trailPlayer);
        }
        
        // CUT+CROSSER = find an LB from this side that's not yet assigned
        const cutCandidates = coveragePlayers.filter(p => 
            !assigned.includes(p) && 
            (p.player.position === 'LB' || p.player.position === 'MLB')
        );
        
        if (cutCandidates.length > 0) {
            cutCandidates.sort((a, b) => Math.abs(a.xCoord) - Math.abs(b.xCoord));
            updateAssignment(cutCandidates[0].player, 'defense', 'Quarters Match', 'CUT+CROSSER', assignments, renderField, renderPlayerMarkers);
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
            updateAssignment(capPlayer.player, 'defense', 'Quarters Match', 'CAP+DEEP', assignments, renderField, renderPlayerMarkers);
            assigned.push(capPlayer);
        }
        
        // MEG = the CB
        const remaining = coveragePlayers.filter(p => !assigned.includes(p));
        if (remaining.length > 0) {
            const megPlayer = remaining[0];
            updateAssignment(megPlayer.player, 'defense', 'Quarters Match', 'LOCK+MEG', assignments, renderField, renderPlayerMarkers);
            assigned.push(megPlayer);
        }
        
        return assigned;
    }
    
    let allAssigned = [];
    
    if (is3x1) {
        // 3x1: Strong side (assume right for now) gets 4-over-3, weak side gets 2-over-1
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
            const defaultGap = getDefaultGapFromLocation ? getDefaultGapFromLocation(location, player) : null;
            if (defaultGap) {
                updateAssignment(player, 'defense', 'Rush', defaultGap, assignments, renderField, renderPlayerMarkers);
            } else {
                // Default to A gap blitz
                const side = playersWithPos.find(p => p.player.name === player.name)?.xCoord < 0 ? 'Left' : 'Right';
                updateAssignment(player, 'defense', 'Rush', `${side} A gap`, assignments, renderField, renderPlayerMarkers);
            }
        }
    });
}

