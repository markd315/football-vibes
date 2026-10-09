// Prompt generation for LLM
// Generates the full prompt (system + user message) for LLM calls

const FIXED_INSTRUCTIONS = `Analyze SCHEME: spatial (X/Y), blocking vs assignments, coverage vs routes.

SPATIAL: X left-/right+, Y off-/def+. Count blockers vs defenders at POA.

KEY CHECKS:

Numerical advantages at POA via X values; one player can swing -3 to +2 alone. Overwhelming box numbers (+1 to +2 blockers) dominate; player ratings cannot negate numerical superiority.

STUNTS & SLANTS vs DIRECT RUSH:
Compare alignment (Align, X) to rush gap assignment. When a DL's rush gap differs from alignment (e.g., DE at 5-tech rushing A gap, DT at 0-tech rushing B gap), this is a STUNT/SLANT, NOT a direct gap rusher.
Stunters must cross gaps post-snap. A multi-gap stunt into zone flow (e.g., 5-tech crashing across into A-gap vs zone left) gets washed down or sealed by zone blocks, surrendering gap integrity at the POA. Do not treat stunts as direct unblocked penetration.

PERSONNEL & BODY-TYPE MISMATCHES:
Heavy/Jumbo (6+ OL, multi-TE) vs Light subpackages (Dime, Big Dime, Nickel, 3-down fronts): An OL in a skill spot (⚠️ OFFENSIVE LINEMAN IN SKILL POSITION) is an intentional Jumbo/Heavy package, NOT an artifact.
- FOR RUN OR RPO: Running heavy personnel into a 3-down Dime/light box carries massive natural schematic advantage (+6 to +8+); DBs cannot fit inside run gaps or withstand 300+ lb blockers.
- FOR DROPBACK PASS: Heavy personnel limits route runners and plays into Dime's coverage strength; this +6 to +8+ mismatch advantage ONLY applies to run/RPO calls, never pure dropback pass concepts.

Late pursuit does not reduce advantage. Secondary defenders playing deep (Y >= 6-13 yds) are pass coverage and cannot fit interior runs at the line.

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

CRITICAL AUDIT RULES (FILM-ROOM RIGOR - NO HALLUCINATIONS):
1. NEVER confuse assigned rush gap with pre-snap alignment:
   - A defender assigned to "Rush: Left A gap" who is aligned at 5-tech (X=-1.69) or 4i-tech is STUNTING. They are NOT "aligned directly in the A gap" and saying "(no stunt needed)" is completely FALSE. They must travel laterally across multiple gaps at snap.
   - When a DL stunts across multiple gaps into the direction of a zone run, the zone flow washes them out, surrendering gap integrity and creating huge running lanes.
2. NEVER invert blocker-to-defender ratios:
   - Always calculate: (Blockers at POA) MINUS (Defenders at POA).
   - If 4 or 5 offensive blockers face 2 defensive linemen, the OFFENSE HAS NUMERICAL SUPERIORITY (+2 or +3 blockers). It is NEVER a "2-to-1 defensive stack" or "defensive superiority"!
3. BOX COUNT MATH:
   - Count actual box defenders (DL and LBs within 6 yards of LOS, X between -4.5 and +4.5).
   - Defenders with Y >= 6.0 yards (e.g., safeties at 13.5 yds, off-ball corners) are NOT in the box. A 3-down front with 2 LBs is a 5-man box, NOT 8-in-the-box.
4. DIRECTION OF ZONE BLOCKS:
   - Read the exact assignment text. When OL assignments say "Zone inside left", the entire line steps and blocks to the LEFT. Backside linemen do NOT block right.
5. HEAVY MISMATCH ON RUN/RPO:
   - 6+ OL / Multi-TE vs 3-down Dime/light box carries automatic +6 to +8+ advantage on RUN/RPO plays. DBs cannot fit inside run gaps against 300+ lb linemen. On pure dropback pass plays, this advantage does not apply.
6. DYNAMIC RB ZONE READS (BANG / BEND / BOUNCE) vs SCRIPTED STUNTS:
   - Zone runs are NOT rigid tracks into a fixed gap. In Inside Zone (IZR), the RB dynamically reads defensive flow post-snap:
     * BANG: Hits the designed front-side gap (e.g. play-side B-gap) if open.
     * BOUNCE: If a defender flashes helmet in the front-side gap or pinches inside (e.g. DE crashing inside on an ET stunt), the RB dynamically bounces outside to the vacated edge (C/D gap).
     * BEND (CUTBACK): If the defense over-pursues or slants hard to the play-side POA, the RB cuts back behind the climbing double teams into the backside A-gap (behind the linebacker's face).
   - Stunts are PRE-DETERMINED, SCRIPTED PATHS fired ~300ms post-snap. Stunting linemen are locked into their track and cannot dynamically read/react. Meanwhile, the pro RB dynamically reads the vacated grass. Stunts directly surrender bounce and bend/cutback lanes to the offense! Never assume a zone runner blindly runs into a stunter.

EXAMPLES:

+8 to +10: defense entirely out of position (e.g., open TD screen) or run/RPO with heavy personnel vs light box with overwhelming POA numbers.

-8 to -10: unblocked rusher, routes into coverage, no quick throw.
-2 to 0: neutral/good scheme, even matchups.
-4 to -2: correct commitment that matches offensive playcall.

+2 to +6: wrong coverage/commit exploited.`;

/**
 * Builds pre-snap scheme audit to ground the LLM with deterministic spatial and personnel facts
 * @param {Array} allPlayers - Array of player objects ready for CSV
 * @returns {string} Scheme audit text
 */
function buildSchemeAudit(allPlayers) {
    if (!allPlayers || !allPlayers.length) return '';

    const offense = allPlayers.filter(p => p.side === 'OFFENSE');
    const defense = allPlayers.filter(p => p.side === 'DEFENSE');

    const ol = offense.filter(p => ['OT', 'OG', 'C'].includes(p.position));
    const te = offense.filter(p => p.position === 'TE');
    const rb = offense.filter(p => p.position === 'RB');
    const wr = offense.filter(p => p.position === 'WR');

    const dl = defense.filter(p => ['DE', 'DT', 'NT'].includes(p.position));
    const lb = defense.filter(p => ['LB', 'MLB', 'ILB', 'OLB'].includes(p.position));
    const db = defense.filter(p => ['CB', 'S', 'FS', 'SS', 'NB'].includes(p.position));

    const heavyBlockers = ol.length + te.length;

    const rbPlayer = rb[0];
    const rbAction = rbPlayer ? (rbPlayer.assignmentText || '') : '';
    const qbPlayer = offense.find(p => p.position === 'QB');
    const qbAction = qbPlayer ? (qbPlayer.assignmentText || '') : '';
    const isRun = rbAction.includes('IZR') || rbAction.includes('OZR') || rbAction.includes('Toss') || rbAction.includes('Run:') || qbAction.includes('Handoff') || qbAction.includes('Toss');
    const isLeft = rbAction.toLowerCase().includes('left') || qbAction.toLowerCase().includes('left');
    const isRight = rbAction.toLowerCase().includes('right') || qbAction.toLowerCase().includes('right');

    const auditLines = [];

    // 1. Personnel Audit
    const offDesc = `${ol.length} OL, ${te.length} TE, ${rb.length} RB, ${wr.length} WR${ol.length >= 6 ? ' (Heavy/Jumbo: ' + heavyBlockers + ' heavy blockers)' : ''}`;
    const defDesc = `${dl.length} DL, ${lb.length} LB, ${db.length} DB${db.length >= 6 ? ' (Dime/Big Dime: 6 DBs)' : (db.length === 5 ? ' (Nickel: 5 DBs)' : '')}`;
    auditLines.push(`- Personnel: Offense [${offDesc}] vs Defense [${defDesc}]`);

    // 2. Box Count Audit
    const boxDefenders = defense.filter(p => {
        if (['DE', 'DT', 'NT'].includes(p.position)) return true;
        const y = p.coords ? p.coords.y : 0;
        const x = p.coords ? Math.abs(p.coords.x) : 0;
        if (['LB', 'MLB', 'ILB', 'OLB'].includes(p.position) && y <= 6.0) return true;
        if (['CB', 'S', 'NB'].includes(p.position) && y <= 4.0 && x <= 4.0) return true;
        return false;
    });
    const deepSafeties = defense.filter(p => ['S', 'FS', 'SS'].includes(p.position) && p.coords && p.coords.y >= 10);
    const deepSafetyNote = deepSafeties.length > 0 ? ` (${deepSafeties.length} safeties deep >= 10 yds are NOT in the box)` : '';
    auditLines.push(`- Box Count: ${heavyBlockers} heavy blockers vs ${boxDefenders.length} box defenders${deepSafetyNote}`);

    // 3. Run POA Audit
    if (isRun) {
        const runSide = isLeft ? 'Left' : (isRight ? 'Right' : 'Interior');
        let poaBlockers = [];
        let poaDefenders = [];
        if (isLeft) {
            poaBlockers = offense.filter(p => ['OT', 'OG', 'C', 'TE'].includes(p.position) && p.coords && p.coords.x <= 0.5);
            poaDefenders = defense.filter(p => ['DE', 'DT', 'NT', 'LB'].includes(p.position) && p.coords && p.coords.x <= 0.5 && p.coords.y <= 6.0);
        } else if (isRight) {
            poaBlockers = offense.filter(p => ['OT', 'OG', 'C', 'TE'].includes(p.position) && p.coords && p.coords.x >= -0.5);
            poaDefenders = defense.filter(p => ['DE', 'DT', 'NT', 'LB'].includes(p.position) && p.coords && p.coords.x >= -0.5 && p.coords.y <= 6.0);
        } else {
            poaBlockers = offense.filter(p => ['OT', 'OG', 'C'].includes(p.position));
            poaDefenders = defense.filter(p => ['DT', 'NT', 'LB'].includes(p.position) && p.coords && Math.abs(p.coords.x) <= 2.0);
        }
        const diff = poaBlockers.length - poaDefenders.length;
        const diffText = diff > 0 ? `Offense +${diff} advantage at POA` : (diff < 0 ? `Defense +${Math.abs(diff)} advantage at POA` : `Even numbers at POA`);
        auditLines.push(`- Point of Attack (${runSide}): ${poaBlockers.length} blockers vs ${poaDefenders.length} defenders at POA (${diffText}). Do NOT invert this ratio!`);
    }

    // 4. Stunt Audit
    const stunts = [];
    defense.forEach(p => {
        if (p.warning && p.warning.includes('STUNT')) {
            stunts.push(`${p.name} (${p.location}): ${p.warning.replace('[STUNT:', '').replace(']', '').trim()}`);
        }
    });
    if (stunts.length > 0) {
        auditLines.push(`- DL Stunts Detected: ${stunts.join('; ')}. DL is STUNTING across gaps, NOT aligned directly in rush gaps! Stunts are rigid and get washed down.`);
        if (isRun) {
            auditLines.push(`- RB Zone Dynamics: Defensive stunts are locked into rigid scripted tracks (~300ms reaction). The RB dynamically reads post-snap to Bang (designed gap), Bounce outside (if stunter pinches inside), or Bend (cutback behind stunter into vacated backside A-gap). Stunts surrender immediate bounce and bend lanes.`);
        }
    } else {
        auditLines.push(`- DL Movement: Direct gap rushes (no stunts detected).`);
    }

    return `\nPRE-SNAP SCHEME AUDIT:\n${auditLines.join('\n')}\n`;
}

/**
 * Generates the user message content for the LLM prompt
 * @param {Object} playData - Play data from buildPlayData()
 * @param {string} csvData - CSV string from generatePlayerCSV
 * @param {Array} [allPlayers] - Optional pre-built players array
 * @returns {string} User message content
 */
function generateUserMessage(playData, csvData, allPlayers) {
    if (!allPlayers && typeof buildPlayersForCSV === 'function') {
        allPlayers = buildPlayersForCSV(playData);
    }
    const auditText = allPlayers ? buildSchemeAudit(allPlayers) : '';
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
${auditText}
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
    const userMessage = generateUserMessage(playData, csvData, allPlayers);
    
    return {
        systemPrompt: FIXED_INSTRUCTIONS,
        userMessage: userMessage,
        fullPrompt: `=== SYSTEM PROMPT ===\n${FIXED_INSTRUCTIONS}\n\n=== USER MESSAGE ===\n${userMessage}\n\n=== END PROMPT ===`
    };
}