// Playcall data definitions
// Contains offensive and defensive playcall templates

const offensivePlaycalls = {
    'IZR left': {
        'QB': { category: 'Run', action: 'Handoff' },
        'RB': { category: 'Run', action: 'IZR left' },
        'OT': { category: 'Run Block', action: 'Zone inside left' },
        'OG': { category: 'Run Block', action: 'Zone inside left' },
        'C': { category: 'Run Block', action: 'Zone inside left' },
        'WR': { category: 'Block', action: 'Block' },
        'TE': { category: 'Block', action: 'Block' }
    },
    'IZR right': {
        'QB': { category: 'Run', action: 'Handoff' },
        'RB': { category: 'Run', action: 'IZR right' },
        'OT': { category: 'Run Block', action: 'Zone inside right' },
        'OG': { category: 'Run Block', action: 'Zone inside right' },
        'C': { category: 'Run Block', action: 'Zone inside right' },
        'WR': { category: 'Block', action: 'Block' },
        'TE': { category: 'Block', action: 'Block' }
    },
    'OZR left': {
        'QB': { category: 'Run', action: 'Handoff' },
        'RB': { category: 'Run', action: 'OZR left' },
        'OT': { category: 'Run Block', action: 'Zone outside left' },
        'OG': { category: 'Run Block', action: 'Zone outside left' },
        'C': { category: 'Run Block', action: 'Zone outside left' },
        'WR': { category: 'Block', action: 'Block' },
        'TE': { category: 'Block', action: 'Block' }
    },
    'OZR right': {
        'QB': { category: 'Run', action: 'Handoff' },
        'RB': { category: 'Run', action: 'OZR right' },
        'OT': { category: 'Run Block', action: 'Zone outside right' },
        'OG': { category: 'Run Block', action: 'Zone outside right' },
        'C': { category: 'Run Block', action: 'Zone outside right' },
        'WR': { category: 'Block', action: 'Block' },
        'TE': { category: 'Block', action: 'Block' }
    },
    'Power left': {
        'QB': { category: 'Run', action: 'Handoff' },
        'RB': { category: 'Run', action: 'Left B gap' },
        'OT': { category: 'Run Block', action: 'Gap left B' },
        'OG': { category: 'Run Block', action: 'Gap left A' },
        'C': { category: 'Run Block', action: 'Gap left A' },
        'WR': { category: 'Block', action: 'Block' },
        'TE': { category: 'Run Block', action: 'Gap left C' }
    },
    'Power right': {
        'QB': { category: 'Run', action: 'Handoff' },
        'RB': { category: 'Run', action: 'Right B gap' },
        'OT': { category: 'Run Block', action: 'Gap right B' },
        'OG': { category: 'Run Block', action: 'Gap right A' },
        'C': { category: 'Run Block', action: 'Gap right A' },
        'WR': { category: 'Block', action: 'Block' },
        'TE': { category: 'Run Block', action: 'Gap right C' }
    },
    'Counter left': {
        'QB': { category: 'Run', action: 'Handoff' },
        'RB': { category: 'Run', action: 'Left C gap' },
        'OT': { category: 'Run Block', action: 'Gap left B' },
        'OG': { category: 'Run Block', action: 'Gap left A' },
        'C': { category: 'Run Block', action: 'Gap left A' },
        'WR': { category: 'Block', action: 'Block' },
        'TE': { category: 'Run Block', action: 'Gap left C' }
    },
    'Counter right': {
        'QB': { category: 'Run', action: 'Handoff' },
        'RB': { category: 'Run', action: 'Right C gap' },
        'OT': { category: 'Run Block', action: 'Gap right B' },
        'OG': { category: 'Run Block', action: 'Gap right A' },
        'C': { category: 'Run Block', action: 'Gap right A' },
        'WR': { category: 'Block', action: 'Block' },
        'TE': { category: 'Run Block', action: 'Gap right C' }
    },
    'Duo': {
        'QB': { category: 'Run', action: 'Handoff' },
        'RB': { category: 'Run', action: 'Left A gap' },
        'OT': { category: 'Run Block', action: 'Combo' },
        'OG': { category: 'Run Block', action: 'Combo' },
        'C': { category: 'Run Block', action: 'Zone inside left' },
        'WR': { category: 'Block', action: 'Block' },
        'TE': { category: 'Block', action: 'Block' }
    },
    'Iso': {
        'QB': { category: 'Run', action: 'Handoff' },
        'RB': { category: 'Run', action: 'Left A gap' },
        'OT': { category: 'Run Block', action: 'Zone inside left' },
        'OG': { category: 'Run Block', action: 'Zone inside left' },
        'C': { category: 'Run Block', action: 'Zone inside left' },
        'WR': { category: 'Block', action: 'Block' },
        'TE': { category: 'Block', action: 'Block' }
    },
    'Shallow Cross': {
        'QB': { category: 'Pass', action: '3 step drop' },
        'RB': { category: 'Protect', action: 'Block right' },
        'WR': { category: 'Route', action: '2 Slant' },
        'TE': { category: 'Route', action: '6 Shallow dig' },
        'OT': { category: 'Pass Block', action: 'Outside priority' },
        'OG': { category: 'Pass Block', action: 'Inside priority' },
        'C': { category: 'Pass Block', action: 'Inside priority' }
    },
    'Dagger': {
        'QB': { category: 'Pass', action: '5 step drop' },
        'RB': { category: 'Protect', action: 'Block left' },
        'WR': { category: 'Route', action: '6 Shallow dig' },
        'TE': { category: 'Route', action: '8 Post' },
        'OT': { category: 'Pass Block', action: 'Outside priority' },
        'OG': { category: 'Pass Block', action: 'Inside priority' },
        'C': { category: 'Pass Block', action: 'Inside priority' }
    },
    'Flood': {
        'QB': { category: 'Pass', action: '5 step drop' },
        'RB': { category: 'Protect', action: 'Block right' },
        'WR': { category: 'Route', action: '7 Corner' },
        'TE': { category: 'Route', action: '1 Flat' },
        'OT': { category: 'Pass Block', action: 'Outside priority' },
        'OG': { category: 'Pass Block', action: 'Inside priority' },
        'C': { category: 'Pass Block', action: 'Inside priority' }
    },
    'Levels': {
        'QB': { category: 'Pass', action: '3 step drop' },
        'RB': { category: 'Route', action: '1 Flat' },
        'WR': { category: 'Route', action: '6 Shallow dig' },
        'TE': { category: 'Route', action: 'Deep dig' },
        'OT': { category: 'Pass Block', action: 'Inside priority' },
        'OG': { category: 'Pass Block', action: 'Inside priority' },
        'C': { category: 'Pass Block', action: 'Inside priority' }
    },
    'Sail': {
        'QB': { category: 'Pass', action: '5 step drop' },
        'RB': { category: 'Route', action: '1 Flat' },
        'WR': { category: 'Route', action: '7 Corner' },
        'TE': { category: 'Route', action: '5 Out' },
        'OT': { category: 'Pass Block', action: 'Outside priority' },
        'OG': { category: 'Pass Block', action: 'Inside priority' },
        'C': { category: 'Pass Block', action: 'Inside priority' }
    },
    'Four Verticals': {
        'QB': { category: 'Pass', action: '7 step drop' },
        'RB': { category: 'Protect', action: 'Block left' },
        'WR': { category: 'Route', action: '9 Go/Fly/Fade' },
        'TE': { category: 'Route', action: '9 Go/Fly/Fade' },
        'OT': { category: 'Pass Block', action: 'Outside priority' },
        'OG': { category: 'Pass Block', action: 'Inside priority' },
        'C': { category: 'Pass Block', action: 'Inside priority' }
    },
    'Curl flats': {
        'QB': { category: 'Pass', action: '3 step drop' },
        'RB': { category: 'Route', action: '1 Flat' },
        'WR': { category: 'Route', action: '4 Curl/Hook' },
        'TE': { category: 'Route', action: '4 Curl/Hook' },
        'OT': { category: 'Pass Block', action: 'Inside priority' },
        'OG': { category: 'Pass Block', action: 'Inside priority' },
        'C': { category: 'Pass Block', action: 'Inside priority' }
    },
    'Mesh': {
        'QB': { category: 'Pass', action: '3 step drop' },
        'RB': { category: 'Route', action: '1 Flat' },
        'WR': { category: 'Route', action: '2 Slant' },
        'TE': { category: 'Route', action: '2 Slant' },
        'OT': { category: 'Pass Block', action: 'Inside priority' },
        'OG': { category: 'Pass Block', action: 'Inside priority' },
        'C': { category: 'Pass Block', action: 'Inside priority' }
    },
    'Drive': {
        'QB': { category: 'Pass', action: '3 step drop' },
        'RB': { category: 'Route', action: '1 Flat' },
        'WR': { category: 'Route', action: '6 Shallow dig' },
        'TE': { category: 'Route', action: '6 Shallow dig' },
        'OT': { category: 'Pass Block', action: 'Inside priority' },
        'OG': { category: 'Pass Block', action: 'Inside priority' },
        'C': { category: 'Pass Block', action: 'Inside priority' }
    },
    'Ohio': {
        'QB': { category: 'Pass', action: '5 step drop' },
        'RB': { category: 'Route', action: 'Wheel' },
        'WR': { category: 'Route', action: '8 Post' },
        'TE': { category: 'Route', action: '7 Corner' },
        'OT': { category: 'Pass Block', action: 'Outside priority' },
        'OG': { category: 'Pass Block', action: 'Inside priority' },
        'C': { category: 'Pass Block', action: 'Inside priority' }
    },
    'QB Sneak': {
        'QB': { category: 'Run', action: 'Sneak' },
        'RB': { category: 'Run', action: 'Left A gap' },
        'OT': { category: 'Run Block', action: 'Zone inside left' },
        'OG': { category: 'Run Block', action: 'Zone inside left' },
        'C': { category: 'Run Block', action: 'Zone inside left' },
        'WR': { category: 'Block', action: 'Block' },
        'TE': { category: 'Block', action: 'Block' }
    },
    '4 Verticals': {
        'QB': { category: 'Pass', action: '5 step drop' },
        'RB': { category: 'Route', action: '1 Flat' },
        'WR': { category: 'Route', action: '9 Go/Fly/Fade' },
        'TE': { category: 'Route', action: '9 Go/Fly/Fade' },
        'OT': { category: 'Pass Block', action: 'Outside priority' },
        'OG': { category: 'Pass Block', action: 'Inside priority' },
        'C': { category: 'Pass Block', action: 'Inside priority' }
    },
    'Y-Cross': {
        'QB': { category: 'Pass', action: '5 step drop' },
        'RB': { category: 'Route', action: '1 Flat' },
        'WR': { category: 'Route', action: '4 Curl/Hook' },
        'TE': { category: 'Route', action: 'Deep dig' },
        'OT': { category: 'Pass Block', action: 'Outside priority' },
        'OG': { category: 'Pass Block', action: 'Inside priority' },
        'C': { category: 'Pass Block', action: 'Inside priority' }
    },
    'Mesh': {
        'QB': { category: 'Pass', action: '3 step drop' },
        'RB': { category: 'Route', action: '1 Flat' },
        'WR': { category: 'Route', action: '2 Slant' },
        'TE': { category: 'Route', action: '2 Slant' },
        'OT': { category: 'Pass Block', action: 'Inside priority' },
        'OG': { category: 'Pass Block', action: 'Inside priority' },
        'C': { category: 'Pass Block', action: 'Inside priority' }
    },
    'Drive': {
        'QB': { category: 'Pass', action: '3 step drop' },
        'RB': { category: 'Route', action: '1 Flat' },
        'WR': { category: 'Route', action: '6 Shallow dig' },
        'TE': { category: 'Route', action: '6 Shallow dig' },
        'OT': { category: 'Pass Block', action: 'Inside priority' },
        'OG': { category: 'Pass Block', action: 'Inside priority' },
        'C': { category: 'Pass Block', action: 'Inside priority' }
    },
    'Ohio': {
        'QB': { category: 'Pass', action: '5 step drop' },
        'RB': { category: 'Route', action: 'Wheel' },
        'WR': { category: 'Route', action: '8 Post' },
        'TE': { category: 'Route', action: '7 Corner' },
        'OT': { category: 'Pass Block', action: 'Outside priority' },
        'OG': { category: 'Pass Block', action: 'Inside priority' },
        'C': { category: 'Pass Block', action: 'Inside priority' }
    },
    'QB Sneak': {
        'QB': { category: 'Run', action: 'Sneak' },
        'RB': { category: 'Run', action: 'Left A gap' },
        'OT': { category: 'Run Block', action: 'Zone inside left' },
        'OG': { category: 'Run Block', action: 'Zone inside left' },
        'C': { category: 'Run Block', action: 'Zone inside left' },
        'WR': { category: 'Block', action: 'Block' },
        'TE': { category: 'Block', action: 'Block' }
    },
    'Toss left': {
        'QB': { category: 'Run', action: 'Toss left' },
        'RB': { category: 'Run', action: 'OZR left' },
        'OT': { category: 'Run Block', action: 'Zone outside left' },
        'OG': { category: 'Run Block', action: 'Zone outside left' },
        'C': { category: 'Run Block', action: 'Zone outside left' },
        'WR': { category: 'Block', action: 'Block' },
        'TE': { category: 'Block', action: 'Block' }
    },
    'Toss right': {
        'QB': { category: 'Run', action: 'Toss right' },
        'RB': { category: 'Run', action: 'OZR right' },
        'OT': { category: 'Run Block', action: 'Zone outside right' },
        'OG': { category: 'Run Block', action: 'Zone outside right' },
        'C': { category: 'Run Block', action: 'Zone outside right' },
        'WR': { category: 'Block', action: 'Block' },
        'TE': { category: 'Block', action: 'Block' }
    },
    'Flea flicker': {
        'QB': { category: 'Pass', action: 'Play action pass' },
        'RB': { category: 'Run', action: 'Flea flicker' },
        'WR': { category: 'Route', action: '9 Go/Fly/Fade' },
        'TE': { category: 'Route', action: '9 Go/Fly/Fade' },
        'OT': { category: 'Pass Block', action: 'Outside priority' },
        'OG': { category: 'Pass Block', action: 'Inside priority' },
        'C': { category: 'Pass Block', action: 'Inside priority' }
    },
    'Reverse left': {
        'QB': { category: 'Run', action: 'Handoff' },
        'RB': { category: 'Run', action: 'IZR left' },
        'WR': { category: 'Block', action: 'Jet Motion' },
        'TE': { category: 'Block', action: 'Block' },
        'OT': { category: 'Run Block', action: 'Zone outside left' },
        'OG': { category: 'Run Block', action: 'Zone outside left' },
        'C': { category: 'Run Block', action: 'Zone outside left' }
    },
    'Reverse right': {
        'QB': { category: 'Run', action: 'Handoff' },
        'RB': { category: 'Run', action: 'IZR right' },
        'WR': { category: 'Block', action: 'Jet Motion' },
        'TE': { category: 'Block', action: 'Block' },
        'OT': { category: 'Run Block', action: 'Zone outside right' },
        'OG': { category: 'Run Block', action: 'Zone outside right' },
        'C': { category: 'Run Block', action: 'Zone outside right' }
    },
    'Speed option left': {
        'QB': { category: 'Run', action: 'Speed option left' },
        'RB': { category: 'Run', action: 'OZR left' },
        'WR': { category: 'Block', action: 'Block' },
        'TE': { category: 'Block', action: 'Block' },
        'OT': { category: 'Run Block', action: 'Zone outside left' },
        'OG': { category: 'Run Block', action: 'Zone outside left' },
        'C': { category: 'Run Block', action: 'Zone outside left' }
    },
    'Speed option right': {
        'QB': { category: 'Run', action: 'Speed option right' },
        'RB': { category: 'Run', action: 'OZR right' },
        'WR': { category: 'Block', action: 'Block' },
        'TE': { category: 'Block', action: 'Block' },
        'OT': { category: 'Run Block', action: 'Zone outside right' },
        'OG': { category: 'Run Block', action: 'Zone outside right' },
        'C': { category: 'Run Block', action: 'Zone outside right' }
    },
    'Jet sweep left': {
        'QB': { category: 'Run', action: 'Handoff' },
        'RB': { category: 'Run', action: 'Sweep' },
        'WR': { category: 'Block', action: 'Jet Motion' },
        'TE': { category: 'Block', action: 'Block' },
        'OT': { category: 'Run Block', action: 'Zone outside left' },
        'OG': { category: 'Run Block', action: 'Pull' },
        'C': { category: 'Run Block', action: 'Zone outside left' }
    },
    'Jet sweep right': {
        'QB': { category: 'Run', action: 'Handoff' },
        'RB': { category: 'Run', action: 'Sweep' },
        'WR': { category: 'Block', action: 'Jet Motion' },
        'TE': { category: 'Block', action: 'Block' },
        'OT': { category: 'Run Block', action: 'Zone outside right' },
        'OG': { category: 'Run Block', action: 'Pull' },
        'C': { category: 'Run Block', action: 'Zone outside right' }
    }
};

const defensivePlaycalls = {
    'Cover 2': {
        'CB': { category: 'Zone Short', action: 'Flat L' },
        'S': { category: 'Zone Deep', action: 'Deep left (cov2)' },
        'LB': { category: 'Zone Short', action: 'Curl/Hook L' },
        'MLB': { category: 'Zone Short', action: 'Hole' },
        'Nickel': { category: 'Zone Short', action: 'Curl/Hook L' }
    },
    'Cover 2 man': {
        'CB': { category: 'Man Coverage', action: 'Inside technique man' },
        'S': { category: 'Zone Deep', action: 'Deep left (cov2)' },
        'LB': { category: 'Man Coverage', action: 'Inside technique man' },
        'MLB': { category: 'Man Coverage', action: 'Inside technique man' }
    },
    'Tampa 2': {
        'CB': { category: 'Zone Short', action: 'Flat L' },
        'S': { category: 'Zone Deep', action: 'Deep left (cov2)' },
        'LB': { category: 'Zone Short', action: 'Curl/Hook L' },
        'MLB': { category: 'Zone Short', action: 'Deep hole/Tampa' }
    },
    'Cover 1 (man)': {
        'CB': { category: 'Man Coverage', action: 'Inside technique man' },
        'S': { category: 'Zone Deep', action: 'Deep middle 1/3' },
        'LB': { category: 'Man Coverage', action: 'Inside technique man' },
        'MLB': { category: 'Man Coverage', action: 'Inside technique man' }
    },
    'Cover 1 (force)': {
        'CB': { category: 'Man Coverage', action: 'Inside technique man' },
        'S': { category: 'Zone Deep', action: 'Deep middle 1/3' },
        'LB': { category: 'Man Coverage', action: 'Inside technique man' },
        'MLB': { category: 'Man Coverage', action: 'Inside technique man' }
    },
    'Cover 3': {
        'CB': { category: 'Zone Deep', action: 'Deep left (cov3)' },
        'S': { category: 'Zone Deep', action: 'Deep middle 1/3' },
        'LB': { category: 'Zone Short', action: 'Hook L' },
        'MLB': { category: 'Zone Short', action: 'Hook R' }
    },
    'Cover 4 (spot drop)': {
        'CB': { category: 'Zone Deep', action: 'Deep far left (cov4)' },
        'S': { category: 'Zone Deep', action: 'Deep middle 1/3' },
        'LB': { category: 'Zone Short', action: 'Hook L' },
        'MLB': { category: 'Zone Short', action: 'Hook R' }
    },
    'Cover 0 (LB blitz)': {
        'CB': { category: 'Man Coverage', action: 'Inside technique man' },
        'S': { category: 'Man Coverage', action: 'Inside technique man' },
        'LB': { category: 'Rush', action: 'Left A gap' },
        'MLB': { category: 'Rush', action: 'Right A gap' }
    },
    'Cover 0 (CB blitz)': {
        'CB': { category: 'Rush', action: 'Left C gap' },
        'S': { category: 'Man Coverage', action: 'Inside technique man' },
        'LB': { category: 'Man Coverage', action: 'Inside technique man' },
        'MLB': { category: 'Man Coverage', action: 'Inside technique man' }
    },
    'Quarters Match 3x1': 'bracket-3x1',
    'Quarters Match 2x2': 'bracket-2x2'
};

