// Trait detection and adjustment logic
// Based on context-skills: player skills by position

/**
 * Detects which trait applies for a player based on their assignment and play context
 * Returns the trait name and adjustment value, or null if no trait applies
 */
function detectPlayerTrait(player, assignment, playContext) {
    if (!player || !player["traits-from-baseline-percentile"]) {
        return null;
    }
    
    const traits = player["traits-from-baseline-percentile"];
    const position = player.position;
    const assignmentAction = assignment?.action || '';
    const assignmentCategory = assignment?.category || '';
    const playType = playContext?.playType || 'run';
    
    // QB traits
    if (position === 'QB') {
        // Escape artist: boots
        if (assignmentAction.includes('Boot')) {
            const value = traits['escape-artist'] || 0;
            if (value !== 0) return { trait: 'escape-artist', value, description: 'Escape Artist' };
        }
        // Pocket passer: 5-7 step drops
        if (assignmentAction.includes('5 step drop') || assignmentAction.includes('7 step drop')) {
            const value = traits['pocket-passer'] || 0;
            if (value !== 0) return { trait: 'pocket-passer', value, description: 'Pocket Passer' };
        }
        // Option threat: option plays
        if (assignmentAction.includes('option') || assignmentAction.includes('Zone read')) {
            const value = traits['option-threat'] || 0;
            if (value !== 0) return { trait: 'option-threat', value, description: 'Option Threat' };
        }
    }
    
    // RB traits
    if (position === 'RB') {
        // Blocker: protect assignments
        if (assignmentCategory === 'Protect') {
            const value = traits['blocker'] || 0;
            if (value !== 0) return { trait: 'blocker', value, description: 'Blocker' };
        }
        // Route runner: route assignments
        if (assignmentCategory === 'Route') {
            const value = traits['route-runner'] || 0;
            if (value !== 0) return { trait: 'route-runner', value, description: 'Route Runner' };
        }
        // Speed back: outside zone runs
        if (assignmentAction.includes('OZR') || assignmentAction.includes('Sweep')) {
            const value = traits['speed-back'] || 0;
            if (value !== 0) return { trait: 'speed-back', value, description: 'Speed Back' };
        }
        // Power back: gap runs
        if (assignmentAction.includes('gap') || assignmentAction.includes('Iso') || assignmentAction.includes('Duo')) {
            const value = traits['power-back'] || 0;
            if (value !== 0) return { trait: 'power-back', value, description: 'Power Back' };
        }
    }
    
    // WR traits
    if (position === 'WR') {
        // Deep threat: deep dig, 7-9 routes, fade
        const deepRoutes = ['Deep dig', '7 Corner', '8 Post', '9 Go/Fly/Fade', 'Fade', 'Post-corner', 'Skinny post'];
        if (deepRoutes.some(route => assignmentAction.includes(route))) {
            const value = traits['deep-threat'] || 0;
            if (value !== 0) return { trait: 'deep-threat', value, description: 'Deep Threat' };
        }
        // Quick game: other routes
        if (assignmentCategory === 'Route' && !deepRoutes.some(route => assignmentAction.includes(route))) {
            const value = traits['quick-game'] || 0;
            if (value !== 0) return { trait: 'quick-game', value, description: 'Quick Game' };
        }
        // Blocker: block assignments
        if (assignmentCategory === 'Block') {
            const value = traits['blocker'] || 0;
            if (value !== 0) return { trait: 'blocker', value, description: 'Blocker' };
        }
    }
    
    // TE traits
    if (position === 'TE') {
        // Run blocker: run block assignments
        if (assignmentCategory === 'Run Block') {
            const value = traits['run-blocker'] || 0;
            if (value !== 0) return { trait: 'run-blocker', value, description: 'Run Blocker' };
        }
        // Protection: pass block assignments
        if (assignmentCategory === 'Pass Block') {
            const value = traits['protection'] || 0;
            if (value !== 0) return { trait: 'protection', value, description: 'Protection' };
        }
        // Pass catcher: route assignments
        if (assignmentCategory === 'Route') {
            const value = traits['pass-catcher'] || 0;
            if (value !== 0) return { trait: 'pass-catcher', value, description: 'Pass Catcher' };
        }
    }
    
    // OL traits
    if (['OT', 'OG', 'C'].includes(position)) {
        // Zone blocker: zone blocking assignments
        if (assignmentAction.includes('Zone')) {
            const value = traits['zone-blocker'] || 0;
            if (value !== 0) return { trait: 'zone-blocker', value, description: 'Zone Blocker' };
        }
        // Gap blocker: gap blocking assignments
        if (assignmentAction.includes('Gap') || assignmentAction.includes('Combo')) {
            const value = traits['gap-blocker'] || 0;
            if (value !== 0) return { trait: 'gap-blocker', value, description: 'Gap Blocker' };
        }
        // Hammer: power/gap run assignments
        if (assignmentAction.includes('Gap') || assignmentAction.includes('Iso') || assignmentAction.includes('Duo')) {
            const value = traits['hammer'] || 0;
            if (value !== 0) return { trait: 'hammer', value, description: 'Hammer' };
        }
        // Pass protection: pass block assignments
        if (assignmentCategory === 'Pass Block') {
            const value = traits['pass-protection'] || 0;
            if (value !== 0) return { trait: 'pass-protection', value, description: 'Pass Protection' };
        }
    }
    
    // Defense traits - based on opponent's play type and assignments
    if (['DE', 'DT'].includes(position)) {
        // QB predator: pass plays
        if (playType === 'pass') {
            const value = traits['qb-predator'] || 0;
            if (value !== 0) return { trait: 'qb-predator', value, description: 'QB Predator' };
        }
        // Gap stuffer: run plays
        if (playType === 'run') {
            const value = traits['gap-stuffer'] || 0;
            if (value !== 0) return { trait: 'gap-stuffer', value, description: 'Gap Stuffer' };
        }
        // Contain: contain assignments
        if (assignmentAction.includes('Contain')) {
            const value = traits['contain'] || 0;
            if (value !== 0) return { trait: 'contain', value, description: 'Contain' };
        }
    }
    
    if (['LB', 'MLB'].includes(position)) {
        // Blitz threat: rush assignments
        if (assignmentCategory === 'Rush') {
            const value = traits['blitz-threat'] || 0;
            if (value !== 0) return { trait: 'blitz-threat', value, description: 'Blitz Threat' };
        }
        // Gap stuffer: run plays
        if (playType === 'run') {
            const value = traits['gap-stuffer'] || 0;
            if (value !== 0) return { trait: 'gap-stuffer', value, description: 'Gap Stuffer' };
        }
        // Zone coverage: zone assignments
        if (assignmentCategory.includes('Zone')) {
            const value = traits['zone-coverage'] || 0;
            if (value !== 0) return { trait: 'zone-coverage', value, description: 'Zone Coverage' };
        }
        // Man coverage: man assignments
        if (assignmentCategory === 'Man Coverage') {
            const value = traits['man-coverage'] || 0;
            if (value !== 0) return { trait: 'man-coverage', value, description: 'Man Coverage' };
        }
    }
    
    if (position === 'CB' || position === 'S') {
        // Run-fitter: run plays
        if (playType === 'run') {
            const value = traits['run-fitter'] || 0;
            if (value !== 0) return { trait: 'run-fitter', value, description: 'Run-Fitter' };
        }
        // Zone coverage: zone assignments (for quarters match: deep+cap are zone, trail+meg are man)
        const assignmentActionLower = assignmentAction.toLowerCase();
        if (assignmentCategory.includes('Zone') || assignmentActionLower.includes('deep') || assignmentActionLower.includes('cap')) {
            const value = traits['zone-coverage'] || 0;
            if (value !== 0) return { trait: 'zone-coverage', value, description: 'Zone Coverage' };
        }
        // Man coverage: man assignments (for quarters match: trail+meg are man)
        if (assignmentCategory === 'Man Coverage' || assignmentActionLower.includes('trail') || assignmentActionLower.includes('meg')) {
            const value = traits['man-coverage'] || 0;
            if (value !== 0) return { trait: 'man-coverage', value, description: 'Man Coverage' };
        }
        // Presser: press alignment
        const location = playContext?.location || '';
        if (location.includes('press')) {
            const value = traits['presser'] || 0;
            if (value !== 0) return { trait: 'presser', value, description: 'Presser' };
        }
    }
    
    return null;
}

