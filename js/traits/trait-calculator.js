// Trait calculation and effective percentile
// Combines trait detection with percentile calculation including fatigue

/**
 * Calculates effective percentile for a player, applying trait adjustments and fatigue
 * @param {Object} player - Player object with percentile, stamina, and traits
 * @param {Object} assignment - Player's assignment (category, action)
 * @param {Object} playContext - Play context (playType, location)
 * @param {Object} fatigueConfig - Fatigue configuration
 * @param {Function} detectPlayerTrait - Function to detect applicable trait
 * @param {Object} playerPositions - Map of player positions for location lookup
 * @param {Function} getPlayerById - Function to get player by ID
 * @returns {Object} { effectivePercentile, traitAdjustment }
 */
function calculateEffectivePercentile(player, assignment = null, playContext = null, fatigueConfigParam = null, detectPlayerTrait = null, playerPositions = null, getPlayerById = null) {
    // Use provided config or global config or default
    // Check for global fatigueConfig variable (from app.js) if parameter is null
    let effectiveConfig = fatigueConfigParam;
    if (!effectiveConfig) {
        // Try to access global fatigueConfig (declared in app.js)
        // Use Function constructor to access global scope safely
        try {
            const getGlobalFatigueConfig = new Function('return typeof fatigueConfig !== "undefined" ? fatigueConfig : null');
            effectiveConfig = getGlobalFatigueConfig();
        } catch(e) {
            effectiveConfig = null;
        }
    }
    
    // Fall back to default if still null
    if (!effectiveConfig) {
        effectiveConfig = {
            "effectiveness-curve": {
                "high-stamina-threshold": 85,
                "high-stamina-multiplier": 0.99,
                "medium-stamina-threshold": 60,
                "medium-stamina-multiplier": 0.80,
                "min-multiplier": 0.20
            }
        };
    }
    
    const curve = effectiveConfig["effectiveness-curve"] || {};
    const highThreshold = curve["high-stamina-threshold"] || 85;
    const highMultiplier = curve["high-stamina-multiplier"] || 0.99;
    const mediumThreshold = curve["medium-stamina-threshold"] || 60;
    const mediumMultiplier = curve["medium-stamina-multiplier"] || 0.80;
    const minMultiplier = curve["min-multiplier"] || 0.20;
    
    // Ensure stamina is between 0 and 100
    const stamina = Math.max(0, Math.min(100, player.stamina));
    let basePercentile = player.percentile;
    
    // Detect and apply trait adjustment BEFORE fatigue
    let traitAdjustment = null;
    if (assignment && typeof detectPlayerTrait === 'function') {
        // Get player location for context
        const playerId = playerPositions ? Object.keys(playerPositions || {}).find(id => {
            const p = getPlayerById ? getPlayerById(id) : null;
            return p && p.name === player.name;
        }) : null;
        const location = playerId ? (playerPositions[playerId]?.location || '') : (playContext?.location || '');
        const context = { ...playContext, location };
        
        traitAdjustment = detectPlayerTrait(player, assignment, context);
        if (traitAdjustment && traitAdjustment.value !== 0) {
            // Apply trait adjustment to base percentile (0-12 range)
            basePercentile = Math.max(0, Math.min(100, basePercentile + traitAdjustment.value));
        }
    }
    
    // Logarithmic fatigue curve using config values
    let multiplier = 1.0;
    
    if (stamina >= highThreshold) {
        multiplier = highMultiplier;
    } else if (stamina >= mediumThreshold) {
        // Linear interpolation between high threshold and medium threshold
        const range = highThreshold - mediumThreshold;
        const diff = highThreshold - stamina;
        multiplier = highMultiplier - (diff / range) * (highMultiplier - mediumMultiplier);
    } else {
        // Logarithmic drop-off below medium threshold
        // Using log base 10: multiplier = a * log(stamina) + b
        // At mediumThreshold: mediumMultiplier, at 0: 0.00
        const a = mediumMultiplier / Math.log10(mediumThreshold);
        multiplier = a * Math.log10(Math.max(stamina, 1));
    }
    
    // Calculate effective percentile
    let effectivePercentile = basePercentile * multiplier;
    
    // CRITICAL: Preserve player rankings - ensure a 30th percentile player can never
    // exceed a 70th percentile player, even with extreme fatigue differences.
    // Cap effective percentile to never exceed base percentile, and ensure minimum
    // effectiveness maintains relative rankings.
    const actualMultiplier = Math.max(minMultiplier, multiplier);
    effectivePercentile = basePercentile * actualMultiplier;
    
    // Additional safeguard: ensure effective never exceeds base (fatigue only reduces, never increases)
    // BUT: trait adjustments can increase it above original base, so we need to track the adjusted base
    const adjustedBase = traitAdjustment ? basePercentile : player.percentile;
    effectivePercentile = Math.min(effectivePercentile, adjustedBase);
    
    return { 
        effectivePercentile, 
        traitAdjustment: traitAdjustment ? {
            trait: traitAdjustment.trait,
            description: traitAdjustment.description,
            value: traitAdjustment.value,
            playerName: player.name,
            position: player.position
        } : null
    };
}

