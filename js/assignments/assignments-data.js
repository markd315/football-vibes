// Assignment data definitions
// Contains all assignment categories and actions for offensive and defensive players

const offensiveAssignments = {
    'QB': {
        'Pass': ['5 step drop', 'Boot right', 'Boot left', 'Play action pass', '3 step drop', '7 step drop'],
        'Run': ['QB draw', 'Zone read left', 'Zone read right', 'Speed option left', 'Speed option right', 'Toss left', 'Toss right', 'Sneak', 'Handoff']
    },
    'RB': {
        'Protect': ['Block left', 'Block right', 'Leak/delay left', 'Leak/delay right'],
        'Run': ['IZR left', 'IZR right', 'OZR left', 'OZR right', 'Left A gap', 'Left B gap', 'Right A gap', 'Right B gap', 'Left C gap', 'Right C gap', 'Flea flicker', 'Sweep'],
        'Route': ['Wheel', 'Tunnel screen', '1 Flat', 'Short hitch', 'Flat left', 'Flat right', 'Angle']
    },
    'WR': {
        'Block': ['Block', 'Jet Motion', 'Jet motion option'],
        'Route': ['1 Flat', 'Short hitch', '2 Slant', 'Slant-and-go', '3 Comeback', '4 Curl/Hook', '5 Out', 'Out-and-up', 'Deep out', '6 Shallow dig', 'Drag', '7 Corner', '8 Post', 'Skinny post', 'Post-corner', '9 Go/Fly/Fade', 'Deep dig', 'Whip route', 'Chip+Delay', 'Screen']
    },
    'TE': {
        'Block': ['Block', 'Jet Motion', 'Jet motion option'],
        'Pass Block': ['Inside priority', 'Outside priority', 'Slide left', 'Slide right'],
        'Run Block': ['Zone inside left', 'Zone inside right', 'Zone outside left', 'Zone outside right', 'Gap left A', 'Gap left B', 'Gap left C', 'Gap right A', 'Gap right B', 'Gap right C', 'Pull', 'Seal edge', 'Combo'],
        'Route': ['1 Flat', 'Short hitch', '2 Slant', 'Slant-and-go', '3 Comeback', '4 Curl/Hook', '5 Out', 'Out-and-up', 'Deep out', '6 Shallow dig', 'Drag', '7 Corner', '8 Post', 'Skinny post', 'Post-corner', '9 Go/Fly/Fade', 'Deep dig', 'Whip route', 'Chip+Delay']
    },
    'OT': {
        'Pass Block': ['Inside priority', 'Outside priority', 'Slide left', 'Slide right'],
        'Run Block': ['Zone inside left', 'Zone inside right', 'Zone outside left', 'Zone outside right', 'Gap left A', 'Gap left B', 'Gap left C', 'Gap right A', 'Gap right B', 'Gap right C', 'Pull', 'Seal edge', 'Combo']
    },
    'OG': {
        'Pass Block': ['Inside priority', 'Outside priority', 'Slide left', 'Slide right'],
        'Run Block': ['Zone inside left', 'Zone inside right', 'Zone outside left', 'Zone outside right', 'Gap left A', 'Gap left B', 'Gap left C', 'Gap right A', 'Gap right B', 'Gap right C', 'Pull', 'Seal edge', 'Combo']
    },
    'C': {
        'Pass Block': ['Inside priority', 'Outside priority', 'Slide left', 'Slide right'],
        'Run Block': ['Zone inside left', 'Zone inside right', 'Zone outside left', 'Zone outside right', 'Gap left A', 'Gap left B', 'Gap left C', 'Gap right A', 'Gap right B', 'Gap right C', 'Pull', 'Seal edge', 'Combo']
    }
};

// All defensive assignment options available to all positions
const allDefensiveCategories = {
    'Man Coverage': ['Inside technique man', 'Deep technique man', 'Outside technique man', 'Trail technique man', 'Inside match man', 'Outside match man'],
    'Quarters Match': ['LOCK+MEG', 'TRAIL+APEX', 'CAP+DEEP', 'CUT+CROSSER'],
    'Zone Deep': ['Deep middle 1/3', 'Deep left (cov2)', 'Deep right (cov2)', 'Deep left (cov3)', 'Deep right (cov3)', 'Deep far left (cov4)', 'Deep far right (cov4)', 'Deep seam left (cov4)', 'Deep seam right (cov4)', 'Deep left/right seam+fit shallow'],
    'Zone Short': ['Robber', 'Flat/Out L', 'Flat/Out R', 'Curl/Flat L', 'Curl/Flat R', 'Curl/Hook L', 'Curl/Hook R', 'Curl/Hole L', 'Curl/Hole R', 'Flat L', 'Flat R', 'Out L', 'Out R', 'Curl L', 'Curl R', 'Hook L', 'Hook R', 'Hole', 'Deep hole/Tampa', 'Spy'],
    'Rush': ['Left A gap', 'Right A gap', 'Left B gap', 'Right B gap', 'Left C gap', 'Right C gap', 'Contain'],
    'Spy': ['Spy']
};

// All defensive positions get all options
const defensiveAssignments = {
    'CB': allDefensiveCategories,
    'S': allDefensiveCategories,
    'LB': allDefensiveCategories,
    'MLB': allDefensiveCategories,
    'DE': allDefensiveCategories,
    'DT': allDefensiveCategories
};

