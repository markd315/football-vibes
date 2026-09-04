#!/usr/bin/env python3
"""
Win Total & Division Difficulty Calibration Script for Football Vibes

Calibrates all 32 NFL team rosters using Vegas Win Totals + Custom Fine-Tuning:
- NFC West: +1.0 win bonus (difficulty)
- NFC South: -1.0 win penalty
- Linear scale: 12.5 wins -> 55.0 rating | 5.5 wins -> 45.0 rating (Slope = 1.42857 pts/win)
- Explicit User Fine-Tuning:
  - Ravens: 51.50
  - Broncos: +0.5 boost (51.22)
  - Chargers: +0.5 boost (47.95)
  - Jaguars: +0.5 boost (51.18, Top 10 Offense & Defense)
  - Cowboys: -0.5 reduction (50.23)
  - Giants: -0.5 reduction (47.94)
  - Commanders: -0.5 reduction (47.33)
- Seahawks: Defense superior to Offense
"""

import os
import json

WEIGHTS = {
    'starters': 1.0,
    'subs': 0.35,
    'backups': 0.05,
    'depth': 0.01
}

BASE_WIN_TOTALS = {
    # AFC East
    'bills': 10.5,
    'patriots': 9.5,
    'jets': 5.5,
    'dolphins': 4.5,
    # AFC North
    'ravens': 11.5,
    'bengals': 10.5,
    'steelers': 8.5,
    'browns': 6.5,
    # AFC South
    'texans': 9.5,
    'jaguars': 9.5,
    'colts': 8.5,
    'titans': 6.5,
    # AFC West
    'chiefs': 10.5,
    'broncos': 9.5,
    'chargers': 7.5,
    'raiders': 5.5,
    # NFC East
    'eagles': 10.5,
    'cowboys': 9.5,
    'commanders': 7.5,
    'giants': 7.5,
    # NFC North
    'lions': 10.5,
    'bears': 9.5,
    'packers': 9.5,
    'vikings': 7.5,
    # NFC South (-1.0 win penalty)
    'buccaneers': 8.5 - 1.0,
    'falcons': 7.5 - 1.0,
    'saints': 7.5 - 1.0,
    'panthers': 6.5 - 1.0,
    # NFC West (+1.0 win bonus)
    'rams': 11.5 + 1.0,
    'seahawks': 10.5 + 1.0,
    '49ers': 10.5 + 1.0,
    'cardinals': 4.5 + 1.0
}

def get_base_target_overall(adj_wins):
    return 45.0 + (adj_wins - 5.5) * (55.0 - 45.0) / (12.5 - 5.5)

CUSTOM_TARGET_OVERALLS = {
    'ravens': 51.50,
    'broncos': 51.22,
    'chargers': 47.95,
    'jaguars': 51.18,
    'cowboys': 50.23,
    'giants': 47.94,
    'commanders': 47.33
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

    print("Applying fine-tuned team adjustments...")

    results = []

    for team_id, wins in BASE_WIN_TOTALS.items():
        info = teams_data[team_id]
        target_overall = CUSTOM_TARGET_OVERALLS.get(team_id, get_base_target_overall(wins))
        
        off_file = os.path.join(rosters_dir, info['roster'])
        def_file = os.path.join(rosters_dir, info['defense'])

        with open(off_file, 'r', encoding='utf-8') as f:
            off_roster = json.load(f)
        with open(def_file, 'r', encoding='utf-8') as f:
            def_roster = json.load(f)

        cur_off, cur_def, cur_overall = eval_team(off_roster, def_roster)

        if team_id == 'seahawks':
            target_def = 57.0
            target_off = (target_overall * 2) - target_def
            
            off_mult = target_off / cur_off if cur_off > 0 else 1.0
            def_mult = target_def / cur_def if cur_def > 0 else 1.0

            for _ in range(6):
                t_off = apply_blanket_adjustment(off_roster, off_mult)
                t_def = apply_blanket_adjustment(def_roster, def_mult)
                o_avg, d_avg, _ = eval_team(t_off, t_def)
                if abs(o_avg - target_off) < 0.02: break
                if o_avg > 0: off_mult *= (target_off / o_avg)
                if d_avg > 0: def_mult *= (target_def / d_avg)

            final_off = apply_blanket_adjustment(off_roster, off_mult)
            final_def = apply_blanket_adjustment(def_roster, def_mult)

        elif team_id == 'jaguars':
            target_off = target_overall
            target_def = target_overall

            off_mult = target_off / cur_off if cur_off > 0 else 1.0
            def_mult = target_def / cur_def if cur_def > 0 else 1.0

            for _ in range(6):
                t_off = apply_blanket_adjustment(off_roster, off_mult)
                t_def = apply_blanket_adjustment(def_roster, def_mult)
                o_avg, d_avg, _ = eval_team(t_off, t_def)
                if abs(o_avg - target_off) < 0.02: break
                if o_avg > 0: off_mult *= (target_off / o_avg)
                if d_avg > 0: def_mult *= (target_def / d_avg)

            final_off = apply_blanket_adjustment(off_roster, off_mult)
            final_def = apply_blanket_adjustment(def_roster, def_mult)

        else:
            mult = target_overall / cur_overall if cur_overall > 0 else 1.0
            for _ in range(6):
                t_off = apply_blanket_adjustment(off_roster, mult)
                t_def = apply_blanket_adjustment(def_roster, mult)
                _, _, t_overall = eval_team(t_off, t_def)
                if abs(t_overall - target_overall) < 0.02: break
                if t_overall > 0: mult *= (target_overall / t_overall)

            final_off = apply_blanket_adjustment(off_roster, mult)
            final_def = apply_blanket_adjustment(def_roster, mult)

        with open(off_file, 'w', encoding='utf-8') as f:
            json.dump(final_off, f, indent=2)
        with open(def_file, 'w', encoding='utf-8') as f:
            json.dump(final_def, f, indent=2)

        off_avg, def_avg, final_overall = eval_team(final_off, final_def)
        results.append({
            'team_id': team_id,
            'name': info['name'],
            'city': info['city'],
            'wins': wins,
            'off_avg': off_avg,
            'def_avg': def_avg,
            'overall': final_overall
        })

    results.sort(key=lambda x: x['overall'], reverse=True)

    print("\n==========================================================================================")
    print(" UPDATED FINE-TUNED TEAM RANKINGS")
    print("==========================================================================================")
    print(f"{'Rank':<6}{'Team':<25}{'Adj Wins':<10}{'Offense':<10}{'Defense':<10}{'Overall':<10}")
    print("-" * 75)
    for i, t in enumerate(results, 1):
        full_name = f"{t['city']} {t['name']}"
        print(f"{i:<6}{full_name:<25}{t['wins']:<10.1f}{t['off_avg']:<10.2f}{t['def_avg']:<10.2f}{t['overall']:<10.2f}")

if __name__ == '__main__':
    main()
