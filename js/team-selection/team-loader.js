// Team loading functions
// Handles loading team data and rosters

/**
 * Loads available teams from teams.json
 * @returns {Promise<Array>} Array of team objects
 */
async function loadAvailableTeams() {
    try {
        const response = await fetch('rosters/teams.json?_=' + Date.now()); // Cache bust
        if (response.ok) {
            const teamsData = await response.json();
            const availableTeams = [];
            // Load all teams from teams.json
            for (const [id, team] of Object.entries(teamsData)) {
                availableTeams.push({
                    id: id,
                    name: team.name,
                    city: team.city || '',
                    record: team.record || '',
                    offenseFile: team.roster || `${id}-offense.json`,
                    defenseFile: team.defense || `${id}-defense.json`
                });
            }
            return availableTeams;
        } else {
            console.error('Failed to load teams.json:', response.status);
            return getDefaultTeams();
        }
    } catch (error) {
        console.error('Error loading available teams:', error);
        return getDefaultTeams();
    }
}

/**
 * Returns default teams if loading fails
 * @returns {Array} Default team array
 */
function getDefaultTeams() {
    return [
        { id: 'rams', name: 'Rams', city: 'Los Angeles', record: '', offenseFile: 'rams-offense.json', defenseFile: 'rams-defense.json' },
        { id: 'jaguars', name: 'Jaguars', city: 'Jacksonville', record: '', offenseFile: 'jaguars-offense.json', defenseFile: 'jaguars-defense.json' }
    ];
}

/**
 * Loads selected team rosters
 * @param {Object} homeTeam - Home team object
 * @param {Object} awayTeam - Away team object
 * @returns {Promise<Object>} Object with loaded rosters
 */
async function loadSelectedRosters(homeTeam, awayTeam) {
    const homeOffenseResp = await fetch(`rosters/${homeTeam.offenseFile}`);
    const homeDefenseResp = await fetch(`rosters/${homeTeam.defenseFile}`);
    const awayOffenseResp = await fetch(`rosters/${awayTeam.offenseFile}`);
    const awayDefenseResp = await fetch(`rosters/${awayTeam.defenseFile}`);
    
    const rosters = {
        'home-offense': await homeOffenseResp.json(),
        'home-defense': await homeDefenseResp.json(),
        'away-offense': await awayOffenseResp.json(),
        'away-defense': await awayDefenseResp.json()
    };
    
    return rosters;
}

/**
 * Loads JSON configuration file
 * @param {string} path - Path to JSON file
 * @param {*} defaultValue - Default value if loading fails
 * @returns {Promise<*>} Loaded data or default value
 */
async function loadJsonConfig(path, defaultValue = null) {
    try {
        const response = await fetch(path);
        if (response.ok) {
            return await response.json();
        }
    } catch (error) {
        console.error(`Error loading ${path}:`, error);
    }
    return defaultValue;
}

