// Statistical test suite for state machine
// Run with: node test-state-machine.js

const fs = require('fs');
const path = require('path');

// Load state machine and outcome files
const stateMachine = JSON.parse(fs.readFileSync('play-state-machine.json', 'utf8'));
const outcomeFiles = {};

function loadOutcomeFile(filePath) {
    if (outcomeFiles[filePath]) {
        return outcomeFiles[filePath];
    }
    try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        outcomeFiles[filePath] = data;
        return data;
    } catch (error) {
        console.error(`Error loading ${filePath}:`, error);
        return null;
    }
}

function inverseNormalCDF(p) {
    if (p <= 0 || p >= 1) {
        return p <= 0 ? -10 : 10;
    }
    const a = 8 * (Math.PI - 3) / (3 * Math.PI * (4 - Math.PI));
    const sign = p < 0.5 ? -1 : 1;
    const pAdjusted = p < 0.5 ? p : 1 - p;
    const ln = Math.log(1 / (pAdjusted * pAdjusted));
    const sqrt = Math.sqrt(ln);
    return sign * Math.sqrt(-2 * Math.log(pAdjusted)) * 
           (sqrt - (a * sqrt + 1) / (a * sqrt + 2));
}

function calculateYardsFromRoll(roll, outcomeFile) {
    const mean = outcomeFile['average-yards-gained'] || 0;
    const stdDev = outcomeFile['standard-deviation'] || 1;
    const skewness = outcomeFile['skewness'] || 0;
    
    const percentile = (roll - 1) / 99;
    let z = inverseNormalCDF(percentile);
    
    if (skewness !== 0) {
        const skewAdjustment = skewness * (z * z - 1) / 6;
        z = z + skewAdjustment;
    }
    
    let yards = mean + (z * stdDev);
    return Math.round(yards);
}

function simulatePlay(evalData, playType, forceOutcome = null) {
    // playType: 'run' or 'pass'
    // forceOutcome: 'success', 'unsuccessful', 'explosive', 'havoc', or null for random
    
    const successRate = evalData['success-rate'] || 45.0;
    const havocRate = evalData['havoc-rate'] || 11.0;
    const explosiveRate = evalData['explosive-rate'] || 13.0;
    const unsuccessfulRate = 100 - successRate - havocRate - explosiveRate;
    
    const ranges = {
        havoc: havocRate,
        explosive: havocRate + explosiveRate,
        success: havocRate + explosiveRate + successRate,
        unsuccessful: 100
    };
    
    let outcomeType;
    let outcomeFile;
    
    if (forceOutcome) {
        outcomeType = forceOutcome;
    } else {
        const outcomeRoll = Math.floor(Math.random() * 100) + 1;
        if (outcomeRoll <= ranges.havoc) {
            outcomeType = 'havoc';
        } else if (outcomeRoll <= ranges.explosive) {
            outcomeType = 'explosive';
        } else if (outcomeRoll <= ranges.success) {
            outcomeType = 'success';
        } else {
            outcomeType = 'unsuccessful';
        }
    }
    
    // Determine outcome file based on type
    if (outcomeType === 'havoc') {
        const havocOutcomes = stateMachine['havoc-outcomes'] || {};
        const havocOutcomeRoll = Math.floor(Math.random() * 100) + 1;
        if (havocOutcomeRoll <= havocOutcomes.sack) {
            outcomeFile = loadOutcomeFile('outcomes/havoc-sack.json');
        } else if (havocOutcomeRoll <= havocOutcomes.sack + havocOutcomes.turnover) {
            outcomeFile = loadOutcomeFile('outcomes/havoc-turnover.json');
        } else if (havocOutcomeRoll <= havocOutcomes.sack + havocOutcomes.turnover + havocOutcomes['tackle-for-loss']) {
            outcomeFile = loadOutcomeFile('outcomes/havoc-tackle-for-loss.json');
        } else {
            outcomeFile = loadOutcomeFile('outcomes/havoc-run.json');
        }
    } else if (outcomeType === 'explosive') {
        if (playType === 'pass') {
            outcomeFile = loadOutcomeFile('outcomes/explosive-pass.json');
        } else {
            outcomeFile = loadOutcomeFile('outcomes/explosive-run.json');
        }
    } else if (outcomeType === 'success') {
        if (playType === 'pass') {
            outcomeFile = loadOutcomeFile('outcomes/successful-pass.json');
        } else {
            outcomeFile = loadOutcomeFile('outcomes/successful-run.json');
        }
    } else {
        if (playType === 'pass') {
            outcomeFile = loadOutcomeFile('outcomes/unsuccessful-pass.json');
        } else {
            outcomeFile = loadOutcomeFile('outcomes/unsuccessful-run.json');
        }
    }
    
    if (!outcomeFile) {
        return { outcomeType, yards: 0, turnover: false };
    }
    
    // For passes, check completion percentage first
    let yards = 0;
    let isComplete = true;
    
    if (playType === 'pass' && outcomeFile['completion-percentage'] !== undefined) {
        // Roll for completion
        const completionRoll = Math.floor(Math.random() * 100) + 1;
        isComplete = completionRoll <= outcomeFile['completion-percentage'];
        
        if (isComplete) {
            // Calculate yards from distribution
            const yardsRoll = Math.floor(Math.random() * 100) + 1;
            yards = calculateYardsFromRoll(yardsRoll, outcomeFile);
        } else {
            // Incomplete pass - 0 yards
            yards = 0;
        }
    } else {
        // For runs or non-pass outcomes, calculate yards normally
        const yardsRoll = Math.floor(Math.random() * 100) + 1;
        yards = calculateYardsFromRoll(yardsRoll, outcomeFile);
    }
    
    const turnoverRoll = Math.floor(Math.random() * 100) + 1;
    const turnover = turnoverRoll <= (outcomeFile['turnover-probability'] || 0);
    
    return { outcomeType, yards, turnover, outcomeFile, isComplete };
}

function simulateThreeConsecutivePlays(evalData, playType, forceOutcomes) {
    // forceOutcomes: array of 3 outcomes ['success', 'unsuccessful', 'success']
    let down = 1;
    let distance = 10;
    let firstDownAchieved = false;
    
    for (let i = 0; i < 3; i++) {
        const result = simulatePlay(evalData, playType, forceOutcomes[i]);
        
        if (result.turnover) {
            // Turnover ends the drive
            break;
        }
        
        distance -= result.yards;
        down += 1;
        
        if (result.yards >= distance) {
            firstDownAchieved = true;
            break;
        }
        
        if (down > 4) {
            // 4th down failed
            break;
        }
    }
    
    return firstDownAchieved;
}

function runTest(testName, evalData, playType, forceOutcomes, targetMin, targetMax, iterations = 300000) {
    console.log(`\n${testName}`);
    console.log(`Running ${iterations} iterations...`);
    
    let firstDowns = 0;
    
    for (let i = 0; i < iterations; i++) {
        if (simulateThreeConsecutivePlays(evalData, playType, forceOutcomes)) {
            firstDowns++;
        }
    }
    
    const rate = (firstDowns / iterations) * 100;
    const inRange = rate >= targetMin && rate <= targetMax;
    const status = inRange ? '✓ PASS' : '✗ FAIL';
    
    console.log(`First down rate: ${rate.toFixed(2)}%`);
    console.log(`Target range: ${targetMin}% - ${targetMax}%`);
    console.log(`Status: ${status}`);
    
    return { rate, inRange, firstDowns, iterations };
}

// Default eval data (can be adjusted)
const defaultEvalData = {
    'success-rate': 45.0,
    'havoc-rate': 11.0,
    'explosive-rate': 13.0
};

console.log('='.repeat(60));
console.log('State Machine Statistical Test Suite');
console.log('='.repeat(60));

// Test 1: 3 consecutive unsuccessful rushing plays -> 10-15% first down rate
const test1 = runTest(
    'Test 1: 3 consecutive unsuccessful rushing plays',
    defaultEvalData,
    'run',
    ['unsuccessful', 'unsuccessful', 'unsuccessful'],
    10, 15
);

// Test 2: 3 consecutive unsuccessful passing plays -> 15-20% first down rate
const test2 = runTest(
    'Test 2: 3 consecutive unsuccessful passing plays',
    defaultEvalData,
    'pass',
    ['unsuccessful', 'unsuccessful', 'unsuccessful'],
    15, 20
);

// Test 3: 3 consecutive successful passing plays -> 75-80% first down rate
const test3 = runTest(
    'Test 3: 3 consecutive successful passing plays',
    defaultEvalData,
    'pass',
    ['success', 'success', 'success'],
    80, 85
);

// Test 4: 3 consecutive successful rushing plays -> 80-85% first down rate
const test4 = runTest(
    'Test 4: 3 consecutive successful rushing plays',
    defaultEvalData,
    'run',
    ['success', 'success', 'success'],
    85, 90
);

// Test 5: Global pass average at baseline rates -> 6.3-6.8 yards
function runGlobalAverageTest(testName, evalData, playType, targetMin, targetMax, iterations = 300000) {
    console.log(`\n${testName}`);
    console.log(`Running ${iterations} iterations...`);
    
    let totalYards = 0;
    let totalPlays = 0;
    
    for (let i = 0; i < iterations; i++) {
        const result = simulatePlay(evalData, playType, null);
        totalYards += result.yards;
        totalPlays++;
    }
    
    const avgYards = totalYards / totalPlays;
    const inRange = avgYards >= targetMin && avgYards <= targetMax;
    const status = inRange ? '✓ PASS' : '✗ FAIL';
    
    console.log(`Average yards: ${avgYards.toFixed(2)}`);
    console.log(`Target range: ${targetMin} - ${targetMax} yards`);
    console.log(`Status: ${status}`);
    
    return { avgYards, inRange, totalYards, totalPlays };
}

// Load baseline rates from eval-format.json
const baselineRates = JSON.parse(fs.readFileSync('context/eval-format.json', 'utf8'));

// Test 5: Global pass average
const test5 = runGlobalAverageTest(
    'Test 5: Global pass average at baseline rates',
    baselineRates,
    'pass',
    6.3, 6.8
);

// Test 6: Global run average
const test6 = runGlobalAverageTest(
    'Test 6: Global run average at baseline rates',
    baselineRates,
    'run',
    4.1, 4.5
);

// Test 7: Global pass average by outcome type
function runOutcomeAverageTest(testName, evalData, playType, outcomeType, iterations = 300000) {
    console.log(`\n${testName}`);
    console.log(`Running ${iterations} iterations...`);
    
    let totalYards = 0;
    let totalPlays = 0;
    
    for (let i = 0; i < iterations; i++) {
        const result = simulatePlay(evalData, playType, outcomeType);
        totalYards += result.yards;
        totalPlays++;
    }
    
    const avgYards = totalYards / totalPlays;
    
    console.log(`Average yards for ${outcomeType} ${playType}: ${avgYards.toFixed(2)}`);
    
    return { avgYards, totalYards, totalPlays };
}

// Test individual outcome averages for passes
console.log('\n' + '='.repeat(60));
console.log('Pass Outcome Averages (300k iterations each)');
console.log('='.repeat(60));
const passSuccess = runOutcomeAverageTest('Pass Success Average', baselineRates, 'pass', 'success');
const passUnsuccess = runOutcomeAverageTest('Pass Unsuccessful Average', baselineRates, 'pass', 'unsuccessful');
const passHavoc = runOutcomeAverageTest('Pass Havoc Average', baselineRates, 'pass', 'havoc');
const passExplosive = runOutcomeAverageTest('Pass Explosive Average', baselineRates, 'pass', 'explosive');

// Test individual outcome averages for runs
console.log('\n' + '='.repeat(60));
console.log('Run Outcome Averages (300k iterations each)');
console.log('='.repeat(60));
const runSuccess = runOutcomeAverageTest('Run Success Average', baselineRates, 'run', 'success');
const runUnsuccess = runOutcomeAverageTest('Run Unsuccessful Average', baselineRates, 'run', 'unsuccessful');
const runHavoc = runOutcomeAverageTest('Run Havoc Average', baselineRates, 'run', 'havoc');
const runExplosive = runOutcomeAverageTest('Run Explosive Average', baselineRates, 'run', 'explosive');

console.log('\n' + '='.repeat(60));
console.log('Test Summary');
console.log('='.repeat(60));
console.log(`Test 1: ${test1.inRange ? 'PASS' : 'FAIL'} (${test1.rate.toFixed(2)}%)`);
console.log(`Test 2: ${test2.inRange ? 'PASS' : 'FAIL'} (${test2.rate.toFixed(2)}%)`);
console.log(`Test 3: ${test3.inRange ? 'PASS' : 'FAIL'} (${test3.rate.toFixed(2)}%)`);
console.log(`Test 4: ${test4.inRange ? 'PASS' : 'FAIL'} (${test4.rate.toFixed(2)}%)`);
console.log(`Test 5: ${test5.inRange ? 'PASS' : 'FAIL'} (${test5.avgYards.toFixed(2)} yards)`);
console.log(`Test 6: ${test6.inRange ? 'PASS' : 'FAIL'} (${test6.avgYards.toFixed(2)} yards)`);

const allPassed = test1.inRange && test2.inRange && test3.inRange && test4.inRange && test5.inRange && test6.inRange;
console.log(`\nOverall: ${allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);

