#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Weighting configuration
const WEIGHTS = {
    starters: 1.0,     // 100%
    subs: 0.35,        // 35%
    backups: 0.05,     // 5%
    depth: 0.01        // 1%
};

// Load all roster files recursively, excluding allstar folder
function loadRosters(dir, rosters = {}) {
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
            // Skip allstar folder
            if (file.toLowerCase() === 'allstar') continue;
            loadRosters(fullPath, rosters);
        } else if (file.endsWith('.json') && file !== 'teams.json') {
            try {
                const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
                if (Array.isArray(data) && data.length > 0 && data[0].percentile !== undefined) {
                    const key = path.relative(path.join(__dirname, 'rosters'), fullPath);
                    rosters[key] = data;
                }
            } catch (e) {
                // Skip non-roster JSON files
            }
        }
    }
    return rosters;
}

// Categorize players by tier for offense
function categorizeOffense(players) {
    const byPosition = {};
    players.forEach(p => {
        const pos = p.position;
        if (!byPosition[pos]) byPosition[pos] = [];
        byPosition[pos].push(p);
    });
    
    // Sort each position by percentile descending
    for (const pos in byPosition) {
        byPosition[pos].sort((a, b) => b.percentile - a.percentile);
    }
    
    const starters = [];
    const subs = [];
    const backups = [];
    const depth = [];
    
    // Starters: 11 players (QB1, RB1, WR1-3, TE1, OT1-2, OG1-2, C1)
    if (byPosition['QB']?.[0]) starters.push(byPosition['QB'][0]);
    if (byPosition['RB']?.[0]) starters.push(byPosition['RB'][0]);
    for (let i = 0; i < 3 && byPosition['WR']?.[i]; i++) starters.push(byPosition['WR'][i]);
    if (byPosition['TE']?.[0]) starters.push(byPosition['TE'][0]);
    for (let i = 0; i < 2 && byPosition['OT']?.[i]; i++) starters.push(byPosition['OT'][i]);
    for (let i = 0; i < 2 && byPosition['OG']?.[i]; i++) starters.push(byPosition['OG'][i]);
    if (byPosition['C']?.[0]) starters.push(byPosition['C'][0]);
    
    // Subs: 2nd RB, 4th+5th WR, 2nd TE
    if (byPosition['RB']?.[1]) subs.push(byPosition['RB'][1]);
    if (byPosition['WR']?.[3]) subs.push(byPosition['WR'][3]);
    if (byPosition['WR']?.[4]) subs.push(byPosition['WR'][4]);
    if (byPosition['TE']?.[1]) subs.push(byPosition['TE'][1]);
    
    // Track used indices
    const used = {
        QB: 1, RB: 2, WR: 5, TE: 2, OT: 2, OG: 2, C: 1
    };
    
    // Backups: next man up at each position not already counted
    for (const pos in byPosition) {
        const startIdx = used[pos] || 0;
        if (byPosition[pos][startIdx]) {
            backups.push(byPosition[pos][startIdx]);
            used[pos] = startIdx + 1;
        }
    }
    
    // Depth: everyone else
    for (const pos in byPosition) {
        const startIdx = used[pos] || 0;
        for (let i = startIdx; i < byPosition[pos].length; i++) {
            depth.push(byPosition[pos][i]);
        }
    }
    
    return { starters, subs, backups, depth };
}

// Categorize players by tier for defense
function categorizeDefense(players) {
    const byPosition = {};
    players.forEach(p => {
        const pos = p.position;
        if (!byPosition[pos]) byPosition[pos] = [];
        byPosition[pos].push(p);
    });
    
    // Sort each position by percentile descending
    for (const pos in byPosition) {
        byPosition[pos].sort((a, b) => b.percentile - a.percentile);
    }
    
    const starters = [];
    const subs = [];
    const backups = [];
    const depth = [];
    
    // Collect all DBs (CB + S) for nickel calculation
    const allDBs = [...(byPosition['CB'] || []), ...(byPosition['S'] || [])];
    allDBs.sort((a, b) => b.percentile - a.percentile);
    
    // Starters: 11 + nickel personnel
    // Base 4-3: DE1-4, DT1-2, MLB1, LB1-2, CB1-2, S1-2
    // But nickel adds 6th DB to starters
    for (let i = 0; i < 4 && byPosition['DE']?.[i]; i++) starters.push(byPosition['DE'][i]);
    for (let i = 0; i < 2 && byPosition['DT']?.[i]; i++) starters.push(byPosition['DT'][i]);
    if (byPosition['MLB']?.[0]) starters.push(byPosition['MLB'][0]);
    for (let i = 0; i < 2 && byPosition['LB']?.[i]; i++) starters.push(byPosition['LB'][i]);
    // Top 5 DBs are starters (nickel)
    for (let i = 0; i < 5 && allDBs[i]; i++) starters.push(allDBs[i]);
    
    // Subs: 3rd LB, 6th best DB overall
    if (byPosition['LB']?.[2]) subs.push(byPosition['LB'][2]);
    if (allDBs[5]) subs.push(allDBs[5]);
    
    // Track used indices
    const used = {
        DE: 4, DT: 2, MLB: 1, LB: 3
    };
    // For DBs, we used top 6
    const usedDBSet = new Set(allDBs.slice(0, 6).map(p => p.name));
    
    // Backups: next man up at each position not already counted
    for (const pos of ['DE', 'DT', 'MLB', 'LB']) {
        const startIdx = used[pos] || 0;
        if (byPosition[pos]?.[startIdx]) {
            backups.push(byPosition[pos][startIdx]);
            used[pos] = startIdx + 1;
        }
    }
    // Next CB and S not in top 6 DBs
    for (const pos of ['CB', 'S']) {
        const remaining = (byPosition[pos] || []).filter(p => !usedDBSet.has(p.name));
        if (remaining[0]) {
            backups.push(remaining[0]);
            usedDBSet.add(remaining[0].name);
        }
    }
    
    // Depth: everyone else
    for (const pos of ['DE', 'DT', 'MLB', 'LB']) {
        const startIdx = used[pos] || 0;
        for (let i = startIdx; i < (byPosition[pos]?.length || 0); i++) {
            depth.push(byPosition[pos][i]);
        }
    }
    for (const pos of ['CB', 'S']) {
        const remaining = (byPosition[pos] || []).filter(p => !usedDBSet.has(p.name));
        depth.push(...remaining);
    }
    
    return { starters, subs, backups, depth };
}

// Calculate weighted average
function calcWeightedAvg(categories) {
    let totalWeight = 0;
    let weightedSum = 0;
    
    for (const [tier, players] of Object.entries(categories)) {
        const weight = WEIGHTS[tier];
        for (const p of players) {
            weightedSum += p.percentile * weight;
            totalWeight += weight;
        }
    }
    
    return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

// Calculate tier average
function tierAvg(players) {
    if (players.length === 0) return 0;
    return players.reduce((sum, p) => sum + p.percentile, 0) / players.length;
}

// Main
const rostersDir = path.join(__dirname, 'rosters');
const rosters = loadRosters(rostersDir);
const teamsData = JSON.parse(fs.readFileSync(path.join(rostersDir, 'teams.json'), 'utf8'));

console.log('='.repeat(80));
console.log('TEAM EVALUATION - Weighted Percentile Averages');
console.log('='.repeat(80));
console.log(`Weights: Starters=${WEIGHTS.starters*100}%, Subs=${WEIGHTS.subs*100}%, Backups=${WEIGHTS.backups*100}%, Depth=${WEIGHTS.depth*100}%`);
console.log('');

// Group by team
const teamResults = [];

for (const [teamId, teamInfo] of Object.entries(teamsData)) {
    const offFile = teamInfo.roster;
    const defFile = teamInfo.defense;
    const offKey = Object.keys(rosters).find(k => k.includes(offFile));
    const defKey = Object.keys(rosters).find(k => k.includes(defFile));
    
    if (!offKey || !defKey) continue;
    
    const offPlayers = rosters[offKey];
    const defPlayers = rosters[defKey];
    const offCat = categorizeOffense(offPlayers);
    const defCat = categorizeDefense(defPlayers);
    const offAvg = calcWeightedAvg(offCat);
    const defAvg = calcWeightedAvg(defCat);
    const overall = (offAvg + defAvg) / 2;
    
    const record = teamInfo.record || '0-0';
    const [wins, losses] = record.split('-').map(Number);
    const winPct = wins / (wins + losses);
    const targetEval = 42 + (winPct * 14);
    
    teamResults.push({
        teamId,
        name: teamInfo.name,
        city: teamInfo.city,
        record,
        wins,
        offCat,
        defCat,
        offAvg,
        defAvg,
        overall,
        targetEval,
        diff: overall - targetEval
    });
}

// Sort by wins descending
teamResults.sort((a, b) => b.wins - a.wins);

// Summary table
console.log('SUMMARY TABLE');
console.log('-'.repeat(100));
console.log('Team'.padEnd(12) + 'Record'.padEnd(8) + 'Off'.padEnd(7) + 'Def'.padEnd(7) + 'Overall'.padEnd(9) + 'Target'.padEnd(9) + 'Diff'.padEnd(8) + 'Starters'.padEnd(10) + 'Subs'.padEnd(8) + 'Backup'.padEnd(8) + 'Depth');
console.log('-'.repeat(100));
for (const r of teamResults) {
    const diffStr = (r.diff >= 0 ? '+' : '') + r.diff.toFixed(1);
    const starterAvg = (tierAvg(r.offCat.starters) + tierAvg(r.defCat.starters)) / 2;
    const subAvg = (tierAvg(r.offCat.subs) + tierAvg(r.defCat.subs)) / 2;
    const backupAvg = (tierAvg(r.offCat.backups) + tierAvg(r.defCat.backups)) / 2;
    const depthAvg = (tierAvg(r.offCat.depth) + tierAvg(r.defCat.depth)) / 2;
    console.log(r.name.padEnd(12) + r.record.padEnd(8) + r.offAvg.toFixed(1).padEnd(7) + r.defAvg.toFixed(1).padEnd(7) + r.overall.toFixed(1).padEnd(9) + r.targetEval.toFixed(1).padEnd(9) + diffStr.padEnd(8) + starterAvg.toFixed(1).padEnd(10) + subAvg.toFixed(1).padEnd(8) + backupAvg.toFixed(1).padEnd(8) + depthAvg.toFixed(1));
}
console.log('');

// Nerf recommendations
console.log('='.repeat(100));
console.log('NERF/BUFF RECOMMENDATIONS (teams needing adjustment > 2%)');
console.log('-'.repeat(100));
for (const r of teamResults) {
    if (Math.abs(r.diff) > 2) {
        const nerfPct = Math.ceil(r.diff);
        console.log(`${r.name.padEnd(12)} needs ${r.diff > 0 ? 'NERF' : 'BUFF'} of ~${Math.abs(nerfPct)}% (current: ${r.overall.toFixed(1)}, target: ${r.targetEval.toFixed(1)})`);
    }
}
console.log('');

// Detailed breakdown per team
for (const r of teamResults) {
    console.log('='.repeat(80));
    console.log(`${r.city} ${r.name} (${r.record}) - Overall: ${r.overall.toFixed(1)} | Target: ${r.targetEval.toFixed(1)} | Diff: ${(r.diff >= 0 ? '+' : '') + r.diff.toFixed(1)}`);
    console.log('='.repeat(80));
    
    // Offense breakdown
    console.log(`\n  OFFENSE (Weighted Avg: ${r.offAvg.toFixed(1)})`);
    console.log(`    Starters (${r.offCat.starters.length}) Avg: ${tierAvg(r.offCat.starters).toFixed(1)}`);
    console.log(`      ${r.offCat.starters.map(p => `${p.name}(${p.percentile.toFixed(0)})`).join(', ')}`);
    console.log(`    Subs (${r.offCat.subs.length}) Avg: ${tierAvg(r.offCat.subs).toFixed(1)}`);
    console.log(`      ${r.offCat.subs.map(p => `${p.name}(${p.percentile.toFixed(0)})`).join(', ') || 'None'}`);
    console.log(`    Backups (${r.offCat.backups.length}) Avg: ${tierAvg(r.offCat.backups).toFixed(1)}`);
    console.log(`      ${r.offCat.backups.map(p => `${p.name}(${p.percentile.toFixed(0)})`).join(', ') || 'None'}`);
    console.log(`    Depth (${r.offCat.depth.length}) Avg: ${tierAvg(r.offCat.depth).toFixed(1)}`);
    console.log(`      ${r.offCat.depth.map(p => `${p.name}(${p.percentile.toFixed(0)})`).join(', ') || 'None'}`);
    
    // Defense breakdown
    console.log(`\n  DEFENSE (Weighted Avg: ${r.defAvg.toFixed(1)})`);
    console.log(`    Starters (${r.defCat.starters.length}) Avg: ${tierAvg(r.defCat.starters).toFixed(1)}`);
    console.log(`      ${r.defCat.starters.map(p => `${p.name}(${p.percentile.toFixed(0)})`).join(', ')}`);
    console.log(`    Subs (${r.defCat.subs.length}) Avg: ${tierAvg(r.defCat.subs).toFixed(1)}`);
    console.log(`      ${r.defCat.subs.map(p => `${p.name}(${p.percentile.toFixed(0)})`).join(', ') || 'None'}`);
    console.log(`    Backups (${r.defCat.backups.length}) Avg: ${tierAvg(r.defCat.backups).toFixed(1)}`);
    console.log(`      ${r.defCat.backups.map(p => `${p.name}(${p.percentile.toFixed(0)})`).join(', ') || 'None'}`);
    console.log(`    Depth (${r.defCat.depth.length}) Avg: ${tierAvg(r.defCat.depth).toFixed(1)}`);
    console.log(`      ${r.defCat.depth.map(p => `${p.name}(${p.percentile.toFixed(0)})`).join(', ') || 'None'}`);
    console.log('');
}

// Global averages
const offenseAvgs = teamResults.map(t => t.offAvg);
const defenseAvgs = teamResults.map(t => t.defAvg);
const allAvgs = teamResults.map(t => t.overall);

console.log('='.repeat(80));
console.log('GLOBAL AVERAGES');
console.log('='.repeat(80));
if (offenseAvgs.length > 0) {
    console.log(`Offense Average: ${(offenseAvgs.reduce((a, b) => a + b, 0) / offenseAvgs.length).toFixed(2)}`);
}
if (defenseAvgs.length > 0) {
    console.log(`Defense Average: ${(defenseAvgs.reduce((a, b) => a + b, 0) / defenseAvgs.length).toFixed(2)}`);
}
if (allAvgs.length > 0) {
    console.log(`Overall Average: ${(allAvgs.reduce((a, b) => a + b, 0) / allAvgs.length).toFixed(2)}`);
}

