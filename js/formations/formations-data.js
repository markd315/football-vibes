// Formation data definitions
// Contains offensive and defensive formation templates

const offensiveFormations = {
    'Gun Spread': {
        QB: 'QB (Shotgun)',
        RB: 'Behind QB (Shotgun)',
        WR: [
            'Wide left',
            'Wide right',
            'Slot left'
        ],
        TE: [],
        OL: [
            'Left Tackle',
            'Left Guard',
            'Center',
            'Right Guard',
            'Right Tackle'
        ]
    },
    'Gun Trips': {
        QB: 'QB (Shotgun)',
        RB: 'Behind QB (Shotgun)',
        WR: [
            'Wide right',
            'Flanker left',
            'Wide left',
            'Slot left'
        ],
        TE: [],
        OL: [
            'Left Tackle',
            'Left Guard',
            'Center',
            'Right Guard',
            'Right Tackle'
        ]
    },
    'Gun Bunch': {
        QB: 'QB (Shotgun)',
        RB: 'Behind QB (Shotgun)',
        WR: [
            'Wide right',
            'Seam left',
            'Slot left'
        ],
        TE: [
            'Wing left'
        ],
        OL: [
            'Left Tackle',
            'Left Guard',
            'Center',
            'Right Guard',
            'Right Tackle'
        ]
    },
    'Gun Empty': {
        QB: 'QB (Shotgun)',
        RB: null,
        WR: [
            'Wide left',
            'Wide left',
            'Wide right',
            'Wide right',
            'Slot left'
        ],
        TE: [],
        OL: [
            'Left Tackle',
            'Left Guard',
            'Center',
            'Right Guard',
            'Right Tackle'
        ]
    },
    'Pistol': {
        QB: 'QB (Pistol)',
        RB: 'Behind QB (Shotgun)',
        WR: [
            'Wide left',
            'Wide right',
            'Slot left'
        ],
        TE: [],
        OL: [
            'Left Tackle',
            'Left Guard',
            'Center',
            'Right Guard',
            'Right Tackle'
        ]
    },
    'I-Formation': {
        QB: 'QB (Under center)',
        RB: 'Behind QB (I-formation)',
        WR: [
            'Wide left',
            'Wide right'
        ],
        TE: [
            'Tight left'
        ],
        OL: [
            'Left Tackle',
            'Left Guard',
            'Center',
            'Right Guard',
            'Right Tackle'
        ]
    },
    'Pro Set': {
        QB: 'QB (Under center)',
        RB: 'T-left (Shotgun)',
        WR: [
            'Wide left',
            'Wide right'
        ],
        TE: [
            'Tight left'
        ],
        OL: [
            'Left Tackle',
            'Left Guard',
            'Center',
            'Right Guard',
            'Right Tackle'
        ]
    },
    'Wing T': {
        QB: 'QB (Under center)',
        RB: 'Behind QB (I-formation)',
        WR: [
            'Wide left',
            'Wide right'
        ],
        TE: [
            'Wing left',
            'Tight right'
        ],
        OL: [
            'Left Tackle',
            'Left Guard',
            'Center',
            'Right Guard',
            'Right Tackle'
        ]
    },
    'Gun (2 TE)': {
        QB: 'QB (Shotgun)',
        RB: 'Behind QB (Shotgun)',
        WR: [
            'Wide left',
            'Wide right'
        ],
        TE: [
            'Tight left',
            'Tight right'
        ],
        OL: [
            'Left Tackle',
            'Left Guard',
            'Center',
            'Right Guard',
            'Right Tackle'
        ]
    },
    'Pistol (2 TE)': {
        QB: 'QB (Pistol)',
        RB: 'Behind QB (Shotgun)',
        WR: [
            'Wide left',
            'Wide right'
        ],
        TE: [
            'Tight left',
            'Tight right'
        ],
        OL: [
            'Left Tackle',
            'Left Guard',
            'Center',
            'Right Guard',
            'Right Tackle'
        ]
    },
    'I-Form (2 TE)': {
        QB: 'QB (Under center)',
        RB: 'Behind QB (I-formation)',
        WR: [
            'Wide left',
            'Wide right'
        ],
        TE: [
            'Tight left',
            'Tight right'
        ],
        OL: [
            'Left Tackle',
            'Left Guard',
            'Center',
            'Right Guard',
            'Right Tackle'
        ]
    },
    'I-Form (2 RB, 2 TE)': {
        QB: 'QB (Under center)',
        RB: 'Behind QB (I-formation)',
        WR: [
            'Wide left',
            'Wide right'
        ],
        TE: [
            'Tight left',
            'Tight right'
        ],
        OL: [
            'Left Tackle',
            'Left Guard',
            'Center',
            'Right Guard',
            'Right Tackle'
        ]
    },
    'Gun 3x1 (2 TE)': {
        QB: 'QB (Shotgun)',
        RB: 'Behind QB (Shotgun)',
        WR: [
            'Wide left',
            'Wide right',
            'Slot right'
        ],
        TE: [
            'Tight right',
            'Wing right'
        ],
        OL: [
            'Left Tackle',
            'Left Guard',
            'Center',
            'Right Guard',
            'Right Tackle'
        ]
    },
    'Gun 3x1 (2 TE) Flip': {
        QB: 'QB (Shotgun)',
        RB: 'Behind QB (Shotgun)',
        WR: [
            'Wide right',
            'Wide left',
            'Slot left'
        ],
        TE: [
            'Tight left',
            'Wing left'
        ],
        OL: [
            'Left Tackle',
            'Left Guard',
            'Center',
            'Right Guard',
            'Right Tackle'
        ]
    },
    'Ace': {
        QB: 'QB (Under center)',
        RB: 'T-right (Shotgun)',
        WR: [
            'Wide left',
            'Wide right',
            'Slot left'
        ],
        TE: [
            'Tight right'
        ],
        OL: [
            'Left Tackle',
            'Left Guard',
            'Center',
            'Right Guard',
            'Right Tackle'
        ]
    },
    'Wildcat': {
        QB: null,
        RB: 'QB (Shotgun)',
        WR: [
            'Wide left',
            'Wide right',
            'Slot left'
        ],
        TE: [
            'Tight right'
        ],
        OL: [
            'Left Tackle',
            'Left Guard',
            'Center',
            'Right Guard',
            'Right Tackle'
        ]
    }
};

const defensiveFormations = {
    '4-3 Even (2-high)': {
        DL: [
            'Left 5 technique',
            'Left 2i technique',
            'Right 2i technique',
            'Right 5 technique'
        ],
        LB: [
            'Left B gap (shallow)',
            'Over Center (shallow)',
            'Right B gap (shallow)'
        ],
        CB: [
            'Seam left',
            'Seam right'
        ],
        S: [
            'Deep left',
            'Deep right'
        ]
    },
    '4-3 Even (1-high)': {
        DL: [
            'Left 5 technique',
            'Left 2i technique',
            'Right 2i technique',
            'Right 5 technique'
        ],
        LB: [
            'Left B gap (shallow)',
            'Over Center (shallow)',
            'Right B gap (shallow)'
        ],
        CB: [
            'Seam left',
            'Seam right'
        ],
        S: [
            'Deep middle 1/3',
            'Right B gap (deep)'
        ]
    },
    '4-3 Bear (2-high)': {
        DL: [
            'Left 5 technique',
            'Left 1 technique',
            'Right 3 technique',
            'Right 5 technique'
        ],
        LB: [
            'Left B gap (shallow)',
            'Over Center (shallow)',
            'Right B gap (shallow)'
        ],
        CB: [
            'Seam left',
            'Seam right'
        ],
        S: [
            'Deep left',
            'Deep right'
        ]
    },
    '4-3 Bear (1-high)': {
        DL: [
            'Left 5 technique',
            'Left 1 technique',
            'Right 3 technique',
            'Right 5 technique'
        ],
        LB: [
            'Left B gap (shallow)',
            'Over Center (shallow)',
            'Right B gap (shallow)'
        ],
        CB: [
            'Seam left',
            'Seam right'
        ],
        S: [
            'Deep middle 1/3',
            'Right B gap (deep)'
        ]
    },
    '4-3 Over (2-high)': {
        DL: [
            'Left 5 technique',
            'Left 3 technique',
            'Right 1 technique',
            'Right 5 technique'
        ],
        LB: [
            'Left B gap (shallow)',
            'Over Center (shallow)',
            'Right B gap (shallow)'
        ],
        CB: [
            'Seam left',
            'Seam right'
        ],
        S: [
            'Deep left',
            'Deep right'
        ]
    },
    '4-3 Over (1-high)': {
        DL: [
            'Left 5 technique',
            'Left 3 technique',
            'Right 1 technique',
            'Right 5 technique'
        ],
        LB: [
            'Left B gap (shallow)',
            'Over Center (shallow)',
            'Right B gap (shallow)'
        ],
        CB: [
            'Seam left',
            'Seam right'
        ],
        S: [
            'Deep middle 1/3',
            'Right B gap (deep)'
        ]
    },
    '4-3 Under (2-high)': {
        DL: [
            'Left 4i technique',
            '0 technique',
            'Right 3 technique',
            'Right 5 technique'
        ],
        LB: [
            'Left B gap (shallow)',
            'Over Center (shallow)',
            'Right B gap (shallow)'
        ],
        CB: [
            'Seam left',
            'Seam right'
        ],
        S: [
            'Deep left',
            'Deep right'
        ]
    },
    '4-3 Under (1-high)': {
        DL: [
            'Left 4i technique',
            '0 technique',
            'Right 3 technique',
            'Right 5 technique'
        ],
        LB: [
            'Left B gap (shallow)',
            'Over Center (shallow)',
            'Right B gap (shallow)'
        ],
        CB: [
            'Seam left',
            'Seam right'
        ],
        S: [
            'Deep middle 1/3',
            'Right B gap (deep)'
        ]
    },
    '3-4 Under (2-high)': {
        DL: [
            'Left 4i technique',
            '0 technique',
            'Right 5 technique'
        ],
        LB: [
            'Left C gap (shallow)',
            'Left B gap (shallow)',
            'Right B gap (shallow)',
            'Right C gap (shallow)'
        ],
        CB: [
            'Seam left',
            'Seam right'
        ],
        S: [
            'Deep left',
            'Deep right'
        ]
    },
    '3-4 Under (1-high)': {
        DL: [
            'Left 4i technique',
            '0 technique',
            'Right 5 technique'
        ],
        LB: [
            'Left C gap (shallow)',
            'Left B gap (shallow)',
            'Right B gap (shallow)',
            'Right C gap (shallow)'
        ],
        CB: [
            'Seam left',
            'Seam right'
        ],
        S: [
            'Deep middle 1/3',
            'Right B gap (deep)'
        ]
    },
    '3-4 Okie (2-high)': {
        DL: [
            'Left 7 technique',
            '0 technique',
            'Right 7 technique'
        ],
        LB: [
            'Left C gap (shallow)',
            'Left B gap (shallow)',
            'Right B gap (shallow)',
            'Right C gap (shallow)'
        ],
        CB: [
            'Seam left',
            'Seam right'
        ],
        S: [
            'Deep left',
            'Deep right'
        ]
    },
    '3-4 Okie (1-high)': {
        DL: [
            'Left 7 technique',
            '0 technique',
            'Right 7 technique'
        ],
        LB: [
            'Left C gap (shallow)',
            'Left B gap (shallow)',
            'Right B gap (shallow)',
            'Right C gap (shallow)'
        ],
        CB: [
            'Seam left',
            'Seam right'
        ],
        S: [
            'Deep middle 1/3',
            'Right B gap (deep)'
        ]
    },
    '3-4 Bear (2-high)': {
        DL: [
            'Left 3 technique',
            '0 technique',
            { name: 'Right 3 technique', x: 5, y: 2.5 }
        ],
        LB: [
            'Left C gap (shallow)',
            'Left B gap (shallow)',
            'Right B gap (shallow)',
            'Right C gap (shallow)'
        ],
        CB: [
            'Seam left',
            'Seam right'
        ],
        S: [
            'Deep left',
            'Deep right'
        ]
    },
    '3-4 Bear (1-high)': {
        DL: [
            'Left 3 technique',
            '0 technique',
            { name: 'Right 3 technique', x: 5, y: 2.5 }
        ],
        LB: [
            'Left C gap (shallow)',
            'Left B gap (shallow)',
            'Right B gap (shallow)',
            'Right C gap (shallow)'
        ],
        CB: [
            'Seam left',
            'Seam right'
        ],
        S: [
            'Deep middle 1/3',
            'Right B gap (deep)'
        ]
    },
    '3-4 Tite (2-high)': {
        DL: [
            'Left 4i technique',
            '0 technique',
            'Right 4i technique'
        ],
        LB: [
            'Left C gap (shallow)',
            'Left B gap (shallow)',
            'Right B gap (shallow)',
            'Right C gap (shallow)'
        ],
        CB: [
            'Seam left',
            'Seam right'
        ],
        S: [
            'Deep left',
            'Deep right'
        ]
    },
    '3-4 Tite (1-high)': {
        DL: [
            'Left 4i technique',
            '0 technique',
            'Right 4i technique'
        ],
        LB: [
            'Left C gap (shallow)',
            'Left B gap (shallow)',
            'Right B gap (shallow)',
            'Right C gap (shallow)'
        ],
        CB: [
            'Seam left',
            'Seam right'
        ],
        S: [
            'Deep middle 1/3',
            'Right B gap (deep)'
        ]
    }
};

