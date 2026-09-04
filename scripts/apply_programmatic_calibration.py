#!/usr/bin/env python3
"""
Programmatic Roster Adjustment Script for Football Vibes

Applies programmatic blanket percentage adjustments to player percentiles for each team.
- Exactly 16 teams > 50.0 overall
- Exactly 16 teams < 50.0 overall
- Max ~55.0 overall led by Seahawks, Rams, and Lions
- Severe programmatic nerfs to Dolphins & Jets (< 47.0)
- Programmatic adjustments for Saints, Steelers, Packers (49.0 - 51.0 range)
"""

import os
import json

WEIGHTS = {
    'starters': 1.0,
    'subs': 0.35,
    'backups': 0.05,
    'depth': 0.01
}

def load_rosters(rosters_dir):
    rosters = {}
    for root, dirs, files in os.walk(rosters_dir):
        if 'allstar' in root.lower():
            continue
        for file in files:
            if file.endswith('.json') and file != 'teams.json':
                filepath = os.path.join(root, file)
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        if isinstance(data, list) and len(data) > 0 and 'percentile' in data[0]:
                            rel_key = os.path.relpath(filepath, rosters_dir)
                            rosters[rel_key] = data
                except Exception:
                    pass
    return rosters

def categorize_offense(players):
    by_pos = {}
    for p in players:
        pos = p['position']
        by_pos.setdefault(pos, []).append(p)
    
    for pos in by_pos:
        by_pos[pos].sort(key=lambda x: x['percentile'], reverse=True)
        
    starters, subs, backups, depth = [], [], [], []
    
    if by_pos.get('QB', [])[0:1]: starters.append(by_pos['QB'][0])
    if by_pos.get('RB', [])[0:1]: starters.append(by_pos['RB'][0])
    starters.extend(by_pos.get('WR', [])[0:3])
    if by_pos.get('TE', [])[0:1]: starters.append(by_pos['TE'][0])
    starters.extend(by_pos.get('OT', [])[0:2])
    starters.extend(by_pos.get('OG', [])[0:2])
    if by_pos.get('C', [])[0:1]: starters.append(by_pos['C'][0])
    
    if by_pos.get('RB', [])[1:2]: subs.append(by_pos['RB'][1])
    subs.extend(by_pos.get('WR', [])[3:5])
    if by_pos.get('TE', [])[1:2]: subs.append(by_pos['TE'][1])
    
    used = {'QB': 1, 'RB': 2, 'WR': 5, 'TE': 2, 'OT': 2, 'OG': 2, 'C': 1}
    
    for pos, plist in by_pos.items():
        st_idx = used.get(pos, 0)
        if len(plist) > st_idx:
            backups.append(plist[st_idx])
            used[pos] = st_idx + 1
            
    for pos, plist in by_pos.items():
        st_idx = used.get(pos, 0)
        depth.extend(plist[st_idx:])
        
    return {'starters': starters, 'subs': subs, 'backups': backups, 'depth': depth}

def categorize_defense(players):
    by_pos = {}
    for p in players:
        pos = p['position']
        by_pos.setdefault(pos, []).append(p)
        
    for pos in by_pos:
        by_pos[pos].sort(key=lambda x: x['percentile'], reverse=True)
        
    starters, subs, backups, depth = [], [], [], []
    
    all_dbs = by_pos.get('CB', []) + by_pos.get('S', [])
    all_dbs.sort(key=lambda x: x['percentile'], reverse=True)
    
    starters.extend(by_pos.get('DE', [])[0:4])
    starters.extend(by_pos.get('DT', [])[0:2])
    if by_pos.get('MLB', [])[0:1]: starters.append(by_pos['MLB'][0])
    starters.extend(by_pos.get('LB', [])[0:2])
    starters.extend(all_dbs[0:5])
    
    if by_pos.get('LB', [])[2:3]: subs.append(by_pos['LB'][2])
    if len(all_dbs) > 5: subs.append(all_dbs[5])
    
    used = {'DE': 4, 'DT': 2, 'MLB': 1, 'LB': 3}
    used_db_names = set(p['name'] for p in all_dbs[:6])
    
    for pos in ['DE', 'DT', 'MLB', 'LB']:
        st_idx = used.get(pos, 0)
        plist = by_pos.get(pos, [])
        if len(plist) > st_idx:
            backups.append(plist[st_idx])
            used[pos] = st_idx + 1
            
    for pos in ['CB', 'S']:
        rem = [p for p in by_pos.get(pos, []) if p['name'] not in used_db_names]
        if rem:
            backups.append(rem[0])
            used_db_names.add(rem[0]['name'])
            
    for pos in ['DE', 'DT', 'MLB', 'LB']:
        st_idx = used.get(pos, 0)
        plist = by_pos.get(pos, [])
        depth.extend(plist[st_idx:])
        
    for pos in ['CB', 'S']:
        rem = [p for p in by_pos.get(pos, []) if p['name'] not in used_db_names]
        depth.extend(rem)
        
    return {'starters': starters, 'subs': subs, 'backups': backups, 'depth': depth}

def calc_weighted_avg(cat_dict):
    tot_w = 0
    w_sum = 0
    for tier, plist in cat_dict.items():
        w = WEIGHTS[tier]
        for p in plist:
            w_sum += p['percentile'] * w
            tot_w += w
    return w_sum / tot_w if tot_w > 0 else 0

def eval_team(off_players, def_players):
    off_cat = categorize_offense(off_players)
    def_cat = categorize_defense(def_players)
    off_avg = calc_weighted_avg(off_cat)
    def_avg = calc_weighted_avg(def_cat)
    return off_avg, def_avg, (off_avg + def_avg) / 2.0

def apply_blanket_adjustment(roster, multiplier):
    """
    Applies programmatic blanket percentage adjustment across all players on roster.
    """
    adjusted = []
    for player in roster:
        new_p = max(10, min(95, round(player['percentile'] * multiplier)))
        adjusted.append({**player, 'percentile': new_p})
    return adjusted

def main():
    rosters_dir = r"c:\Users\markd\PycharmProjects\football-vibes-2\public\rosters"
    teams_path = os.path.join(rosters_dir, 'teams.json')
    with open(teams_path, 'r', encoding='utf-8') as f:
        teams_data = json.load(f)

    # Exactly 16 teams > 50.0 (ranks 1-16) and 16 teams <= 50.0 (ranks 17-32)
    TARGET_OVERALLS = {
        'seahawks': 55.3,
        'rams': 55.1,
        'lions': 55.0,
        'chiefs': 53.5,
        'ravens': 53.0,
        'eagles': 52.5,
        'bills': 52.2,
        'bengals': 52.0,
        'texans': 51.8,
        'chargers': 51.5,
        '49ers': 51.2,
        'packers': 50.8,
        'steelers': 50.5,
        'saints': 50.3,
        'jaguars': 50.2,
        'falcons': 50.5,   # Rank 16 (> 50.0)
        'cowboys': 49.8,   # Rank 17 (< 50.0)
        'bears': 49.6,
        'colts': 49.2,
        'buccaneers': 48.9,
        'broncos': 48.6,
        'commanders': 48.3,
        'cardinals': 48.0,
        'titans': 47.7,
        'browns': 47.4,
        'raiders': 47.1,
        'vikings': 46.8,
        'panthers': 46.5,
        'giants': 46.2,
        'patriots': 45.9,
        'dolphins': 45.5,  # Severe nerf (< 47.0)
        'jets': 45.0       # Severe nerf (< 47.0)
    }

    results = []

    for team_id, target in TARGET_OVERALLS.items():
        info = teams_data[team_id]
        off_file = os.path.join(rosters_dir, info['roster'])
        def_file = os.path.join(rosters_dir, info['defense'])

        with open(off_file, 'r', encoding='utf-8') as f:
            off_roster = json.load(f)
        with open(def_file, 'r', encoding='utf-8') as f:
            def_roster = json.load(f)

        _, _, current_overall = eval_team(off_roster, def_roster)
        if current_overall <= 0:
            continue

        multiplier = target / current_overall

        for _ in range(5):
            test_off = apply_blanket_adjustment(off_roster, multiplier)
            test_def = apply_blanket_adjustment(def_roster, multiplier)
            _, _, test_overall = eval_team(test_off, test_def)
            if abs(test_overall - target) < 0.02:
                break
            if test_overall > 0:
                multiplier *= (target / test_overall)

        final_off = apply_blanket_adjustment(off_roster, multiplier)
        final_def = apply_blanket_adjustment(def_roster, multiplier)

        with open(off_file, 'w', encoding='utf-8') as f:
            json.dump(final_off, f, indent=2)
        with open(def_file, 'w', encoding='utf-8') as f:
            json.dump(final_def, f, indent=2)

        off_avg, def_avg, final_overall = eval_team(final_off, final_def)
        pct_adjustment_str = f"{(multiplier - 1.0) * 100:+.1f}%"

        results.append({
            'team_id': team_id,
            'name': info['name'],
            'city': info['city'],
            'off_avg': off_avg,
            'def_avg': def_avg,
            'overall': final_overall,
            'blanket_adj': pct_adjustment_str
        })

    results.sort(key=lambda x: x['overall'], reverse=True)

    print("\n==========================================")
    print(" PROGRAMMATIC TEAM EVALUATION SUMMARY")
    print("==========================================")
    print(f"Total Teams Evaluated: {len(results)}")
    print(f"MAX Rating: {results[0]['overall']:.2f} ({results[0]['city']} {results[0]['name']})")
    print(f"MIN Rating: {results[-1]['overall']:.2f} ({results[-1]['city']} {results[-1]['name']})")

    above_50 = [t for t in results if t['overall'] > 50.0]
    below_50 = [t for t in results if t['overall'] <= 50.0]
    print(f"Teams > 50.0: {len(above_50)} | Teams <= 50.0: {len(below_50)}")

    print("\n--- ALL 32 TEAMS RANKED ---")
    print(f"{'Rank':<6}{'Team':<25}{'Offense':<10}{'Defense':<10}{'Overall':<10}{'Blanket Adj':<12}")
    print("-" * 73)
    for i, t in enumerate(results, 1):
        full_name = f"{t['city']} {t['name']}"
        print(f"{i:<6}{full_name:<25}{t['off_avg']:<10.2f}{t['def_avg']:<10.2f}{t['overall']:<10.2f}{t['blanket_adj']:<12}")

if __name__ == '__main__':
    main()
