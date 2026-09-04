#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Teams that need nerfs (based on team-eval analysis)
const NERFS = {
    'steelers': 12   // 56.8 -> 50.0 target
};

function applyNerf(roster, nerfPct) {
    return roster.map(player => {
        const newPercentile = Math.max(5, Math.round(player.percentile * (1 - nerfPct / 100)));
        return { ...player, percentile: newPercentile };
    });
}

const rostersDir = path.join(__dirname, 'rosters');

for (const [team, nerfPct] of Object.entries(NERFS)) {
    const offFile = path.join(rostersDir, `${team}-offense.json`);
    const defFile = path.join(rostersDir, `${team}-defense.json`);
    
    if (fs.existsSync(offFile)) {
        const roster = JSON.parse(fs.readFileSync(offFile, 'utf8'));
        const nerfed = applyNerf(roster, nerfPct);
        fs.writeFileSync(offFile, JSON.stringify(nerfed, null, 2));
        console.log(`Applied ${nerfPct}% nerf to ${team} offense`);
    }
    
    if (fs.existsSync(defFile)) {
        const roster = JSON.parse(fs.readFileSync(defFile, 'utf8'));
        const nerfed = applyNerf(roster, nerfPct);
        fs.writeFileSync(defFile, JSON.stringify(nerfed, null, 2));
        console.log(`Applied ${nerfPct}% nerf to ${team} defense`);
    }
}

console.log('\nDone! Run team-eval.js to verify changes.');

