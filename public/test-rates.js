#!/usr/bin/env node

// Test the new explosive/havoc rate calculation

const { calculateRatesFromAdvantage } = require('./rate-logic.js');


console.log('='.repeat(80));
console.log('EXPLOSIVE/HAVOC RATE TEST - 100 sample plays');
console.log('='.repeat(80));
console.log('');

// Test key scenarios
const scenarios = [
    { name: 'Max Offense (+10), Max Leverage (10)', adv: 10, lev: 10 },
    { name: 'Max Defense (-10), Max Leverage (10)', adv: -10, lev: 10 },
    { name: 'Neutral (0), Max Leverage (10)', adv: 0, lev: 10 },
    { name: 'Max Offense (+10), No Leverage (0)', adv: 10, lev: 0 },
    { name: 'Max Defense (-10), No Leverage (0)', adv: -10, lev: 0 },
    { name: 'Neutral (0), No Leverage (0)', adv: 0, lev: 0 },
    { name: 'Neutral (0), Mid Leverage (5)', adv: 0, lev: 5 },
    { name: 'Slight Offense (+3), Mid Leverage (5)', adv: 3, lev: 5 },
    { name: 'Slight Defense (-3), Mid Leverage (5)', adv: -3, lev: 5 },
];

console.log('KEY SCENARIOS (run play type):');
console.log('-'.repeat(80));
console.log('Scenario'.padEnd(45) + 'Expl'.padEnd(8) + 'Havoc'.padEnd(8) + 'Success'.padEnd(10) + 'Unsucc');
console.log('-'.repeat(80));

for (const s of scenarios) {
    const rates = calculateRatesFromAdvantage('run', s.adv, s.lev);
    const unsucc = 100 - rates['success-rate'] - rates['explosive-rate'] - rates['havoc-rate'];
    console.log(
        s.name.padEnd(45) +
        rates['explosive-rate'].toFixed(1).padEnd(8) +
        rates['havoc-rate'].toFixed(1).padEnd(8) +
        rates['success-rate'].toFixed(1).padEnd(10) +
        unsucc.toFixed(1)
    );
}

console.log('');
console.log('='.repeat(80));
console.log('SIMULATION: 100 plays with random advantage (-10 to +10) and leverage (0 to 10)');
console.log('='.repeat(80));

let totalExplosive = 0, totalHavoc = 0, totalSuccess = 0;
const results = [];

for (let i = 0; i < 100; i++) {
    const adv = Math.floor(Math.random() * 21) - 10; // -10 to +10
    const lev = Math.floor(Math.random() * 11); // 0 to 10
    const playType = Math.random() > 0.5 ? 'pass' : 'run';

    const rates = calculateRatesFromAdvantage(playType, adv, lev);
    const roll = Math.random() * 100;

    let outcome;
    if (roll < rates['havoc-rate']) {
        outcome = 'havoc';
        totalHavoc++;
    } else if (roll < rates['havoc-rate'] + rates['explosive-rate']) {
        outcome = 'explosive';
        totalExplosive++;
    } else if (roll < rates['havoc-rate'] + rates['explosive-rate'] + rates['success-rate']) {
        outcome = 'success';
        totalSuccess++;
    } else {
        outcome = 'unsuccessful';
    }

    results.push({ adv, lev, playType, outcome, rates });
}

console.log('');
console.log('OUTCOME DISTRIBUTION:');
console.log(`  Explosive: ${totalExplosive}`);
console.log(`  Havoc: ${totalHavoc}`);
console.log(`  Success: ${totalSuccess}`);
console.log(`  Unsuccessful: ${100 - totalExplosive - totalHavoc - totalSuccess}`);

// Group by advantage ranges
console.log('');
console.log('BY ADVANTAGE RANGE:');
const advGroups = {
    'Offense favored (+5 to +10)': results.filter(r => r.adv >= 5),
    'Slight offense (+1 to +4)': results.filter(r => r.adv >= 1 && r.adv <= 4),
    'Neutral (-1 to +1)': results.filter(r => r.adv >= -1 && r.adv <= 1),
    'Slight defense (-4 to -2)': results.filter(r => r.adv >= -4 && r.adv <= -2),
    'Defense favored (-10 to -5)': results.filter(r => r.adv <= -5),
};

for (const [name, group] of Object.entries(advGroups)) {
    if (group.length === 0) continue;
    const expl = group.filter(r => r.outcome === 'explosive').length;
    const hav = group.filter(r => r.outcome === 'havoc').length;
    console.log(`  ${name}: ${group.length} plays - Explosive: ${expl}, Havoc: ${hav}`);
}

console.log('');
console.log('VERIFICATION - Expected at extremes with max leverage:');
console.log('  Max offense (+10, lev 10): explosive ~63%, havoc ~3%');
const maxOff = calculateRatesFromAdvantage('run', 10, 10);
console.log(`  Actual: explosive ${maxOff['explosive-rate'].toFixed(1)}%, havoc ${maxOff['havoc-rate'].toFixed(1)}%`);

console.log('  Max defense (-10, lev 10): explosive ~3%, havoc ~63%');
const maxDef = calculateRatesFromAdvantage('run', -10, 10);
console.log(`  Actual: explosive ${maxDef['explosive-rate'].toFixed(1)}%, havoc ${maxDef['havoc-rate'].toFixed(1)}%`);

