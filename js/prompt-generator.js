// Prompt generation for LLM
// Generates the full prompt (system + user message) for LLM calls

const FIXED_INSTRUCTIONS = `Analyze SCHEME: spatial (X/Y), blocking vs assignments, coverage vs routes.

SPATIAL: X left-/right+, Y off-/def+. Count blockers vs defenders at POA.

KEY CHECKS:

Numerical advantages at POA via X values; one player can swing -3 to +2 alone.

Late pursuit does not reduce advantage.

Player ratings don't cap scheme advantage (execution failures chances handled outside LLM) and theoretical assignments can't cure wrong physical position.

Evaluate: 40% alignment, 30% assignment, 20% positional mismatches, 10% player ratings.

Late or missed assignments invalidate coverage.

Identify routes into coverage voids or open windows.

Blitz w/o backfield protection = less success, more leverage.

Blocking mismatches: inferior vs elite = less success, more leverage.

What is the protection scheme? (6-man, 7-man, any slides. Can it handle the blitzers and what is the level of redundancy to handle lost blocks?)  Insufficient protection = high leverage and lower success

This is just the playcall and initial play state at the snap. Don't make assumptions that players will do nothing else when they are in position to make plays.
Entire OL may receive assignment like "IZR right or slide right". Doesn't mean that they all block the right A/B gaps, just generally determines rules for how they slide+climb against the defense.
Assume the pro-level offensive line will climb properly after play-side double teams with pro-level execution. Linebackers are not "unblocked" if there are double teams at the first level that can flow.

Bear front: hurts zone runs, helps gap runs.

Deep zones on play side = lower leverage; man coverage = higher leverage.

EXAMPLES:

+8 to +10: defense entirely out of position (e.g., open TD screen).

-8 to -10: unblocked rusher, routes into coverage, no quick throw.
-2 to 0: neutral/good scheme, even matchups.
-4 to -2: correct commitment that matches offensive playcall.

+2 to +6: wrong coverage/commit exploited.`;

/**
 * Generates the user message content for the LLM prompt
 * @param {Object} playData - Play data from buildPlayData()
 * @param {string} csvData - CSV string from generatePlayerCSV
 * @returns {string} User message content
 */
function generateUserMessage(playData, csvData) {
    const situation = `${gameState.down}${getDownSuffix(gameState.down)} & ${gameState.distance} @ ${gameState["opp-yardline"]}yd Q${gameState.quarter} ${gameState.time} ${gameState.score.home}-${gameState.score.away}`;
    
    const coachingPoints = [];
    if (playData.coachingPointOffense) {
        coachingPoints.push(`Off: ${playData.coachingPointOffense.player.name} - "${playData.coachingPointOffense.point}"`);
    }
    if (playData.coachingPointDefense) {
        coachingPoints.push(`Def: ${playData.coachingPointDefense.player.name} - "${playData.coachingPointDefense.point}"`);
    }
    const coachingText = coachingPoints.length > 0 ? '\n' + coachingPoints.join('\n') : '';
    
    return `${situation}

This is a professional simulator used in training by world-class coordinators. Evaluate like a coordinator grading a call with film-room brutality, not a scout grading players. Success rate is not guaranteed even with +10 - bungles are handled programmatically. Grade the SCHEME, as execution errors are handled programmatically. Do not hedge, commit to extreme values ruthlessly when warranted.

Pos,Initials,Align,X (yds),Y (yds),Rating,Assignment${csvData}${coachingText}

OUTPUT: Brief rationale (POA, 1-3 matchups). JSON only:

{"play-type":"pass"|"run"|"RPO","offense-advantage":[-10 to 10],"risk-leverage":[0 to 10]}

Grade purely on scheme potential; commit fully to numeric advantage, ignoring execution variance. Near-automatic scoring or unblocked advantage = max/min values.`;
}

/**
 * Generates the full prompt (system + user message)
 * @param {Object} playData - Play data from buildPlayData()
 * @returns {string} Full prompt string
 */
function generateFullPrompt(playData) {
    const allPlayers = buildPlayersForCSV(playData);
    const csvData = generatePlayerCSV(playData, allPlayers);
    const userMessage = generateUserMessage(playData, csvData);
    
    return {
        systemPrompt: FIXED_INSTRUCTIONS,
        userMessage: userMessage,
        fullPrompt: `=== SYSTEM PROMPT ===\n${FIXED_INSTRUCTIONS}\n\n=== USER MESSAGE ===\n${userMessage}\n\n=== END PROMPT ===`
    };
}

