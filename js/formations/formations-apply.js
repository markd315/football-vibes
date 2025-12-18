// Formation application functions
// Applies formations to place players on the field

/**
 * Applies an offensive formation to selected players
 * @param {string} formationName - Name of the formation
 * @param {Object} offensiveFormations - Offensive formation definitions
 * @param {Array} selectedPlayers - Array of offensive player IDs
 * @param {Object} playerPositions - Map of player positions
 * @param {Array} fieldLocations - Field location data
 * @param {Function} getPlayerById - Function to get player by ID
 * @param {Function} resolveFormationPosition - Function to resolve formation position
 * @param {Function} resolveLocationName - Function to resolve location name
 * @param {Function} renderField - Function to render field
 * @param {Function} renderPlayerMarkers - Function to render player markers
 */
function applyOffensiveFormation(formationName, offensiveFormations, selectedPlayers, playerPositions,
                                 fieldLocations, getPlayerById, resolveFormationPosition, resolveLocationName,
                                 renderField, renderPlayerMarkers) {
    const formation = offensiveFormations[formationName];
    if (!formation) return;
    
    const container = document.getElementById('fieldContainer');
    if (!container) return;
    const canvasWidth = container.offsetWidth;
    const canvasHeight = container.offsetHeight;
    const effectiveHeight = canvasHeight * 0.97;
    
    // Clear existing offensive positions ONLY - never touch defensive players
    selectedPlayers.forEach(playerId => {
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
    const usedPositions = new Set();
    const usedCoordinates = new Set();
    
    // Priority list for WR/receiver positions (excluding Max split)
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
                const posName = typeof pos === 'string' ? pos : (pos?.name || '');
                return posName && !posName.toLowerCase().includes('max split');
            })
            : allFormationSpots;
        
        for (const posEntry of filteredFormation) {
            const pos = resolveFormationPosition(posEntry, false, null, fieldLocations, resolveLocationName);
            if (pos && pos.name && !usedPositions.has(pos.name) && !usedCoordinates.has(`${pos.x},${pos.y}`)) {
                return pos;
            }
        }
        
        // Then try priority list
        for (const locName of receiverPriorityList) {
            const pos = resolveLocationName(locName, false);
            if (pos && pos.name && !usedPositions.has(pos.name) && !usedCoordinates.has(`${pos.x},${pos.y}`)) {
                return pos;
            }
        }
        
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
            position = resolveFormationPosition(formation.QB, false, null, fieldLocations, resolveLocationName);
        }
        // RB gets RB position if available, otherwise can go to receiver spot
        else if (player.position === 'RB') {
            if (formation.RB && rbIndex === 0) {
                position = resolveFormationPosition(formation.RB, false, null, fieldLocations, resolveLocationName);
                rbIndex++;
            } else {
                position = getNextAvailableReceiverPosition();
            }
        }
        // OL gets OL positions
        else if (['OT', 'OG', 'C'].includes(player.position) && formation.OL) {
            if (olIndex < formation.OL.length) {
                position = resolveFormationPosition(formation.OL[olIndex], false, null, fieldLocations, resolveLocationName);
                olIndex++;
            }
        }
        // TE gets TE positions, or receiver spot if no TE spots
        else if (player.position === 'TE') {
            if (formation.TE && teIndex < formation.TE.length) {
                position = resolveFormationPosition(formation.TE[teIndex], false, null, fieldLocations, resolveLocationName);
                teIndex++;
            } else {
                position = getNextAvailableReceiverPosition();
            }
        }
        // WR gets WR positions (filter out Max split)
        else if (player.position === 'WR') {
            position = getNextAvailableReceiverPosition(true);
        }
        
        // If still no position assigned, use a default
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
        
        // Mark position as used
        if (position) {
            usedPositions.add(position.name);
            const coordKey = `${position.x},${position.y}`;
            usedCoordinates.add(coordKey);
        }
        
        const x = ((position.x + 19.5) / 39) * canvasWidth;
        const y = (effectiveHeight / 2) - (position.y * 15);
        
        if (selectedPlayers.includes(playerId) && player) {
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
    
    if (renderField) renderField();
    if (renderPlayerMarkers) renderPlayerMarkers();
}

/**
 * Applies a defensive formation to selected defensive players
 * @param {string} formationName - Name of the formation
 * @param {Object} defensiveFormations - Defensive formation definitions
 * @param {Array} selectedDefense - Array of defensive player IDs
 * @param {Object} playerPositions - Map of player positions
 * @param {Array} fieldLocations - Field location data
 * @param {Function} getPlayerById - Function to get player by ID
 * @param {Function} resolveFormationPosition - Function to resolve formation position
 * @param {Function} resolveLocationName - Function to resolve location name
 * @param {Function} renderField - Function to render field
 * @param {Function} renderPlayerMarkers - Function to render player markers
 */
function applyDefensiveFormation(formationName, defensiveFormations, selectedDefense, playerPositions,
                                  fieldLocations, getPlayerById, resolveFormationPosition, resolveLocationName,
                                  renderField, renderPlayerMarkers) {
    const formation = defensiveFormations[formationName];
    if (!formation) return;
    
    const container = document.getElementById('fieldContainer');
    if (!container) return;
    const canvasWidth = container.offsetWidth;
    const canvasHeight = container.offsetHeight;
    const effectiveHeight = canvasHeight * 0.97;
    
    // Clear existing defensive positions ONLY
    selectedDefense.forEach(playerId => {
        const player = getPlayerById(playerId);
        if (selectedDefense.includes(playerId) && player) {
            const isDefensivePosition = ['DE', 'DT', 'LB', 'MLB', 'CB', 'S'].includes(player.position);
            if (isDefensivePosition) {
                delete playerPositions[playerId];
            }
        }
    });
    
    // Build DL alignment pattern: DE -> DT(s) -> DE
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
    
    const dlAlignment = [];
    if (des.length >= 2 && dts.length >= 1) {
        dlAlignment.push(des[0]);
        dts.forEach(dt => dlAlignment.push(dt));
        dlAlignment.push(des[1]);
        for (let i = 2; i < des.length; i++) {
            dlAlignment.push(des[i]);
        }
    } else if (des.length >= 1 && dts.length >= 1) {
        dlAlignment.push(des[0]);
        dts.forEach(dt => dlAlignment.push(dt));
        otherLinePlayers.slice(0, formation.DL.length - dlAlignment.length).forEach(id => dlAlignment.push(id));
    } else if (des.length >= 2) {
        dlAlignment.push(des[0]);
        otherLinePlayers.slice(0, formation.DL.length - 2).forEach(id => dlAlignment.push(id));
        dlAlignment.push(des[1]);
    } else {
        [...des, ...dts, ...otherLinePlayers].slice(0, formation.DL.length).forEach(id => dlAlignment.push(id));
    }
    
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
    
    let lbIndex = 0;
    let cbIndex = 0;
    let sIndex = 0;
    let dbIndex = 0;
    
    // Apply formation - assign ALL 11 players
    selectedDefense.forEach((playerId) => {
        const player = getPlayerById(playerId);
        if (!player) return;
        
        let position = null;
        
        // Check if this player is in the DL alignment
        const dlIndex = dlAlignment.indexOf(playerId);
        if (dlIndex >= 0 && dlIndex < formation.DL.length && formation.DL) {
            position = resolveFormationPosition(formation.DL[dlIndex], true, null, fieldLocations, resolveLocationName);
        }
        // LBs get LB positions
        else if (['LB', 'MLB'].includes(player.position)) {
            if (formation.LB && lbIndex < formation.LB.length) {
                position = resolveFormationPosition(formation.LB[lbIndex], true, null, fieldLocations, resolveLocationName);
                lbIndex++;
            } else {
                const extraLBPositions = [
                    'Left A gap (shallow)',
                    'Right A gap (shallow)',
                    'Left C gap (shallow)',
                    'Right C gap (shallow)'
                ];
                const extraIndex = lbIndex - (formation.LB ? formation.LB.length : 0);
                if (extraIndex < extraLBPositions.length) {
                    position = resolveLocationName(extraLBPositions[extraIndex], true);
                }
            }
        }
        // CBs get CB positions, then extra go to nickel spots
        else if (player.position === 'CB') {
            if (formation.CB && cbIndex < formation.CB.length) {
                position = resolveFormationPosition(formation.CB[cbIndex], true, null, fieldLocations, resolveLocationName);
                cbIndex++;
            } else {
                const nickelDimeLocationNames = [
                    'Wide left',
                    'Wide right',
                    'Slot left',
                    'Slot right'
                ];
                if (dbIndex < nickelDimeLocationNames.length) {
                    position = resolveLocationName(nickelDimeLocationNames[dbIndex], true, 'Coverage');
                    if (!position) {
                        position = resolveLocationName('Slot left', true, 'Coverage') || { name: 'Slot left', x: -13, y: 5.0, section: 'Coverage second level' };
                    }
                    dbIndex++;
                } else {
                    position = resolveLocationName('Slot left', true, 'Coverage') || { name: 'Slot left', x: -13, y: 5.0, section: 'Coverage second level' };
                }
            }
        }
        // Safeties get S positions, then extra go to nickel spots
        else if (player.position === 'S') {
            if (formation.S && sIndex < formation.S.length) {
                position = resolveFormationPosition(formation.S[sIndex], true, null, fieldLocations, resolveLocationName);
                sIndex++;
            } else {
                const nickelDimeLocationNames = [
                    'Wide left',
                    'Wide right',
                    'Slot left',
                    'Slot right'
                ];
                if (dbIndex < nickelDimeLocationNames.length) {
                    position = resolveLocationName(nickelDimeLocationNames[dbIndex], true, 'Coverage');
                    if (!position) {
                        position = resolveLocationName('Slot right', true, 'Coverage') || { name: 'Slot right', x: 13, y: 5.0, section: 'Coverage second level' };
                    }
                    dbIndex++;
                } else {
                    position = resolveLocationName('Slot right', true, 'Coverage') || { name: 'Slot right', x: 13, y: 5.0, section: 'Coverage second level' };
                }
            }
        }
        
        // If still no position assigned, use a default
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
        
        if (selectedDefense.includes(playerId) && player) {
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
    
    if (renderField) renderField();
    if (renderPlayerMarkers) renderPlayerMarkers();
}

