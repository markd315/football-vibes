// Team selection UI functions
// Handles team selection interface and previews

/**
 * Populates team selection dropdowns
 * @param {Array} availableTeams - Array of available team objects
 * @param {Function} updateTeamPreview - Function to update team preview
 */
function populateTeamSelectors(availableTeams, updateTeamPreview) {
    const homeSelect = document.getElementById('homeTeamSelect');
    const awaySelect = document.getElementById('awayTeamSelect');
    
    availableTeams.forEach(team => {
        const displayName = team.city ? `${team.city} ${team.name}` : team.name;
        const recordStr = team.record ? ` (${team.record})` : '';
        
        homeSelect.innerHTML += `<option value="${team.id}">${displayName}${recordStr}</option>`;
        awaySelect.innerHTML += `<option value="${team.id}">${displayName}${recordStr}</option>`;
    });
    
    homeSelect.addEventListener('change', () => updateTeamPreview('home'));
    awaySelect.addEventListener('change', () => updateTeamPreview('away'));
}

/**
 * Updates team preview when selection changes
 * @param {string} side - 'home' or 'away'
 * @param {Array} availableTeams - Array of available team objects
 * @param {Function} categorizeOffense - Function to categorize offensive players
 * @param {Function} categorizeDefense - Function to categorize defensive players
 * @param {Function} calcWeightedEval - Function to calculate weighted evaluation
 * @param {Function} tierAvg - Function to calculate tier average
 * @param {Function} checkStartGameButton - Function to check if start game button should be enabled
 */
async function updateTeamPreview(side, availableTeams, categorizeOffense, categorizeDefense, 
                                calcWeightedEval, tierAvg, checkStartGameButton) {
    const select = document.getElementById(`${side}TeamSelect`);
    const preview = document.getElementById(`${side}TeamPreview`);
    const teamId = select.value;
    
    if (!teamId) {
        preview.innerHTML = '';
        if (checkStartGameButton) checkStartGameButton();
        return;
    }
    
    const team = availableTeams.find(t => t.id === teamId);
    if (!team) return;
    
    // Load roster to show preview
    try {
        const offenseResp = await fetch(`rosters/${team.offenseFile}`);
        const defenseResp = await fetch(`rosters/${team.defenseFile}`);
        
        if (offenseResp.ok && defenseResp.ok) {
            const offense = await offenseResp.json();
            const defense = await defenseResp.json();
            
            const offCat = categorizeOffense(offense);
            const defCat = categorizeDefense(defense);
            const offEval = calcWeightedEval(offCat);
            const defEval = calcWeightedEval(defCat);
            const overall = (offEval + defEval) / 2;
            
            preview.innerHTML = `
                <div style="font-size: 1.2em; font-weight: bold; margin-bottom: 10px;">
                    ${team.city ? team.city + ' ' : ''}${team.name}
                </div>
                <div style="font-size: 1.1em; margin-bottom: 8px;">Overall: <strong>${overall.toFixed(1)}</strong></div>
                <div style="font-size: 0.85em; color: #666;">
                    <div><strong>Offense:</strong> ${offEval.toFixed(1)} weighted</div>
                    <div style="margin-left: 10px; font-size: 0.9em;">
                        Starters: ${tierAvg(offCat.starters).toFixed(0)} | Subs: ${tierAvg(offCat.subs).toFixed(0)} | Backup: ${tierAvg(offCat.backups).toFixed(0)} | Depth: ${tierAvg(offCat.depth).toFixed(0)}
                    </div>
                    <div style="margin-top: 5px;"><strong>Defense:</strong> ${defEval.toFixed(1)} weighted</div>
                    <div style="margin-left: 10px; font-size: 0.9em;">
                        Starters: ${tierAvg(defCat.starters).toFixed(0)} | Subs: ${tierAvg(defCat.subs).toFixed(0)} | Backup: ${tierAvg(defCat.backups).toFixed(0)} | Depth: ${tierAvg(defCat.depth).toFixed(0)}
                    </div>
                </div>
            `;
        }
    } catch (e) {
        preview.innerHTML = '<div style="color: #c00;">Error loading roster</div>';
    }
    
    if (checkStartGameButton) checkStartGameButton();
}

/**
 * Checks if start game button should be enabled
 * @returns {boolean} True if both teams are selected
 */
function checkStartGameButton() {
    const homeSelect = document.getElementById('homeTeamSelect');
    const awaySelect = document.getElementById('awayTeamSelect');
    const startButton = document.getElementById('startGameButton');
    
    if (homeSelect && awaySelect && startButton) {
        const bothSelected = homeSelect.value && awaySelect.value && homeSelect.value !== awaySelect.value;
        startButton.disabled = !bothSelected;
    }
}

