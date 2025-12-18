// Personnel categorization and evaluation rules
// Categorizes players into tiers and calculates weighted evaluations

const EVAL_WEIGHTS = { starters: 1.0, subs: 0.35, backups: 0.05, depth: 0.01 };

/**
 * Calculates average percentile for a group of players
 * @param {Array} players - Array of player objects
 * @returns {number} Average percentile
 */
function calcAvgPercentile(players) {
    return players.length ? players.reduce((s, p) => s + p.percentile, 0) / players.length : 0;
}

/**
 * Categorizes offensive players into tiers
 * @param {Array} players - Array of offensive player objects
 * @returns {Object} Categorized players by tier
 */
function categorizeOffense(players) {
    const byPos = {};
    players.forEach(p => { byPos[p.position] = byPos[p.position] || []; byPos[p.position].push(p); });
    for (const pos in byPos) byPos[pos].sort((a, b) => b.percentile - a.percentile);
    
    const starters = [], subs = [], backups = [], depth = [];
    if (byPos['QB']?.[0]) starters.push(byPos['QB'][0]);
    if (byPos['RB']?.[0]) starters.push(byPos['RB'][0]);
    for (let i = 0; i < 3 && byPos['WR']?.[i]; i++) starters.push(byPos['WR'][i]);
    if (byPos['TE']?.[0]) starters.push(byPos['TE'][0]);
    for (let i = 0; i < 2 && byPos['OT']?.[i]; i++) starters.push(byPos['OT'][i]);
    for (let i = 0; i < 2 && byPos['OG']?.[i]; i++) starters.push(byPos['OG'][i]);
    if (byPos['C']?.[0]) starters.push(byPos['C'][0]);
    
    if (byPos['RB']?.[1]) subs.push(byPos['RB'][1]);
    if (byPos['WR']?.[3]) subs.push(byPos['WR'][3]);
    if (byPos['WR']?.[4]) subs.push(byPos['WR'][4]);
    if (byPos['TE']?.[1]) subs.push(byPos['TE'][1]);
    
    const used = { QB: 1, RB: 2, WR: 5, TE: 2, OT: 2, OG: 2, C: 1 };
    for (const pos in byPos) {
        const idx = used[pos] || 0;
        if (byPos[pos][idx]) { backups.push(byPos[pos][idx]); used[pos] = idx + 1; }
    }
    for (const pos in byPos) {
        const idx = used[pos] || 0;
        for (let i = idx; i < byPos[pos].length; i++) depth.push(byPos[pos][i]);
    }
    return { starters, subs, backups, depth };
}

/**
 * Categorizes defensive players into tiers
 * @param {Array} players - Array of defensive player objects
 * @returns {Object} Categorized players by tier
 */
function categorizeDefense(players) {
    const byPos = {};
    players.forEach(p => { byPos[p.position] = byPos[p.position] || []; byPos[p.position].push(p); });
    for (const pos in byPos) byPos[pos].sort((a, b) => b.percentile - a.percentile);
    
    const starters = [], subs = [], backups = [], depth = [];
    const allDBs = [...(byPos['CB'] || []), ...(byPos['S'] || [])].sort((a, b) => b.percentile - a.percentile);
    
    for (let i = 0; i < 4 && byPos['DE']?.[i]; i++) starters.push(byPos['DE'][i]);
    for (let i = 0; i < 2 && byPos['DT']?.[i]; i++) starters.push(byPos['DT'][i]);
    if (byPos['MLB']?.[0]) starters.push(byPos['MLB'][0]);
    for (let i = 0; i < 2 && byPos['LB']?.[i]; i++) starters.push(byPos['LB'][i]);
    for (let i = 0; i < 5 && allDBs[i]; i++) starters.push(allDBs[i]);
    
    if (byPos['LB']?.[2]) subs.push(byPos['LB'][2]);
    if (allDBs[5]) subs.push(allDBs[5]);
    
    const used = { DE: 4, DT: 2, MLB: 1, LB: 3 };
    const usedDBs = new Set(allDBs.slice(0, 6).map(p => p.name));
    for (const pos of ['DE', 'DT', 'MLB', 'LB']) {
        const idx = used[pos] || 0;
        if (byPos[pos]?.[idx]) { backups.push(byPos[pos][idx]); used[pos] = idx + 1; }
    }
    for (const pos of ['CB', 'S']) {
        const rem = (byPos[pos] || []).filter(p => !usedDBs.has(p.name));
        if (rem[0]) { backups.push(rem[0]); usedDBs.add(rem[0].name); }
    }
    for (const pos of ['DE', 'DT', 'MLB', 'LB']) {
        const idx = used[pos] || 0;
        for (let i = idx; i < (byPos[pos]?.length || 0); i++) depth.push(byPos[pos][i]);
    }
    for (const pos of ['CB', 'S']) {
        depth.push(...(byPos[pos] || []).filter(p => !usedDBs.has(p.name)));
    }
    return { starters, subs, backups, depth };
}

/**
 * Calculates weighted evaluation from categorized players
 * @param {Object} categories - Categorized players object
 * @returns {number} Weighted evaluation score
 */
function calcWeightedEval(categories) {
    let totalWeight = 0, weightedSum = 0;
    for (const [tier, players] of Object.entries(categories)) {
        const w = EVAL_WEIGHTS[tier];
        for (const p of players) { weightedSum += p.percentile * w; totalWeight += w; }
    }
    return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

/**
 * Calculates average percentile for a tier
 * @param {Array} players - Array of player objects
 * @returns {number} Average percentile
 */
function tierAvg(players) {
    return players.length ? players.reduce((s, p) => s + p.percentile, 0) / players.length : 0;
}

