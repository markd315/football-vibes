/**
 * Shared rate calculation logic for both browser and Node.js
 */

function calculateRatesFromAdvantage(playType, offenseAdvantage, riskLeverage) {
    // Keep original success/unsuccessful ratio logic
    // Only change: explosive/havoc split based on offense-advantage

    // Original baseline rates
    const baselineExplosive = playType === 'pass' ? 6.0 : 3.0;
    const baselineHavoc = playType === 'pass' ? 5.0 : 3.0;

    // Map offense-advantage to success+explosive total (good outcomes) - UNCHANGED
    const goodOutcomesBase = 52.0 + (offenseAdvantage * 4.5);
    const goodOutcomes = Math.max(5, Math.min(95, goodOutcomesBase));

    // Total explosive+havoc pool (increases with risk)
    const baseVolatile = baselineExplosive + baselineHavoc;
    const volatilePool = baseVolatile + (riskLeverage * 2.4);

    // Baseline 3% minimum for each
    const offenseFactor = (offenseAdvantage + 10) / 20.0;

    // Recalculate to ensure pool is split correctly
    const poolAfterBaseline = volatilePool - 6;
    const explosiveRate = 3 + (poolAfterBaseline * offenseFactor);
    const havocRate = 3 + (poolAfterBaseline * (1 - offenseFactor));

    // Success rate: good outcomes minus explosive
    const successRate = Math.max(3, goodOutcomes - explosiveRate);

    return {
        "success-rate": Math.min(90, successRate),
        "explosive-rate": Math.max(3, Math.min(65, explosiveRate)),
        "havoc-rate": Math.max(3, Math.min(65, havocRate))
    };
}

// Export for Node.js if applicable
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { calculateRatesFromAdvantage };
}
