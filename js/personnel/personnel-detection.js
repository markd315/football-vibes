// Personnel detection functions
// Detects offensive and defensive personnel groupings

/**
 * Detects offensive personnel grouping
 * @param {Array} selectedPlayers - Array of player IDs
 * @param {Function} getPlayerById - Function to get player by ID
 * @returns {string} Personnel description
 */
function detectOffensivePersonnel(selectedPlayers, getPlayerById) {
    if (selectedPlayers.length === 0) return 'No players selected';
    
    const players = selectedPlayers.map(id => getPlayerById(id)).filter(p => p);
    const qb = players.filter(p => p.position === 'QB').length;
    const rb = players.filter(p => p.position === 'RB').length;
    const te = players.filter(p => p.position === 'TE').length;
    const wr = players.filter(p => p.position === 'WR').length;
    const ol = players.filter(p => ['OT', 'OG', 'C'].includes(p.position)).length;
    
    // Check for extra linemen (>5)
    const hasExtraLinemen = ol > 5;
    const asterisk = hasExtraLinemen ? '*' : '';
    
    // Wildcat if no QB
    if (qb === 0) {
        return hasExtraLinemen ? `WILDCAT* (${ol} linemen)` : 'WILDCAT';
    }
    
    // Personnel format: (RB)(TE)(WR) with asterisk for extra linemen
    // Support: 00, 01, 10, 11, 12, 13, 21, 22 + asterisk versions
    
    if (rb === 0 && te === 0 && wr === 5) {
        return `00${asterisk} Personnel (0 RB, 0 TE, 5 WR${hasExtraLinemen ? `, ${ol} linemen` : ''})`;
    } else if (rb === 0 && te === 1 && wr === 4) {
        return `01${asterisk} Personnel (0 RB, 1 TE, 4 WR${hasExtraLinemen ? `, ${ol} linemen` : ''})`;
    } else if (rb === 1 && te === 0 && wr === 4) {
        return `10${asterisk} Personnel (1 RB, 0 TE, 4 WR${hasExtraLinemen ? `, ${ol} linemen` : ''})`;
    } else if (rb === 1 && te === 1 && wr === 3) {
        return `11${asterisk} Personnel (1 RB, 1 TE, 3 WR${hasExtraLinemen ? `, ${ol} linemen` : ''})`;
    } else if (rb === 1 && te === 2 && wr === 2) {
        return `12${asterisk} Personnel (1 RB, 2 TE, 2 WR${hasExtraLinemen ? `, ${ol} linemen` : ''})`;
    } else if (rb === 1 && te === 3) {
        return `13${asterisk} Personnel (1 RB, 3 TE${hasExtraLinemen ? `, ${ol} linemen` : ''})`;
    } else if (rb === 2 && te === 1 && wr === 2) {
        return `21${asterisk} Personnel (2 RB, 1 TE, 2 WR${hasExtraLinemen ? `, ${ol} linemen` : ''})`;
    } else if (rb === 2 && te === 2 && wr === 1) {
        return `22${asterisk} Personnel (2 RB, 2 TE, 1 WR${hasExtraLinemen ? `, ${ol} linemen` : ''})`;
    } else {
        // Custom format - show all positions
        const parts = [];
        if (rb > 0) parts.push(`${rb} RB`);
        if (te > 0) parts.push(`${te} TE`);
        if (wr > 0) parts.push(`${wr} WR`);
        if (hasExtraLinemen) parts.push(`${ol} OL`);
        return `${rb}${te}${wr}${asterisk} Personnel (${parts.join(', ')})`;
    }
}

/**
 * Detects defensive personnel grouping
 * @param {Array} selectedDefense - Array of defensive player IDs
 * @param {Function} getPlayerById - Function to get player by ID
 * @returns {string} Personnel description
 */
function detectDefensivePersonnel(selectedDefense, getPlayerById) {
    if (selectedDefense.length === 0) return 'No players selected';
    
    const players = selectedDefense.map(id => getPlayerById(id)).filter(p => p);
    const cb = players.filter(p => p.position === 'CB').length;
    const s = players.filter(p => p.position === 'S').length;
    const db = cb + s;
    const lb = players.filter(p => p.position === 'LB' || p.position === 'MLB').length;
    const dl = players.filter(p => ['DE', 'DT'].includes(p.position)).length;
    
    // Defensive personnel based on number and type of DBs
    if (db === 4) {
        return 'Base (4 DB)';
    } else if (db === 5) {
        // Distinguish between Nickel (3CB/2S) and Big Nickel (3S/2CB)
        if (s === 3 && cb === 2) {
            return 'Big Nickel (3 S, 2 CB)';
        } else if (cb === 3 && s === 2) {
            return 'Nickel (3 CB, 2 S)';
        } else {
            return `Nickel (5 DB: ${cb} CB, ${s} S)`;
        }
    } else if (db === 6) {
        return 'Dime (6 DB)';
    } else if (db === 7) {
        return 'Quarter (7 DB)';
    } else if (db >= 8) {
        return 'Quarter+ (8+ DB)';
    } else if (db === 3) {
        return '3 DB (Rare)';
    } else {
        return `${db} DB (${cb} CB, ${s} S), ${lb} LB, ${dl} DL`;
    }
}

