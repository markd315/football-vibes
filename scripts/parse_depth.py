#!/usr/bin/env python3
"""
ESPN NFL Depth Chart Parser & Roster Generator/Updater for Football Vibes

Features:
- Parses ESPN Depth Chart HTML or text files for Offense & Defense
- Maintains existing player stats (height, weight, jersey, traits, percentiles)
- Adds new players (e.g. draft picks outside training window) with herded percentile grades:
  - 1st Round: ~55-60 percentile
  - 2nd-3rd Round: ~45-54 percentile
  - 4th-5th Round: ~35-44 percentile
  - 6th-7th Round / UDFA: ~25-34 percentile
- Updates public/rosters/<team>-offense.json and public/rosters/<team>-defense.json

Usage:
  python scripts/parse_depth.py --team jax --file path/to/content.md --update
"""

import os
import re
import json
import argparse

TEAM_MAP = {
    'jax': 'jaguars',
    'lar': 'rams',
    'buf': 'bills',
    'kc': 'chiefs',
    'phi': 'eagles',
    'den': 'broncos',
    'ne': 'patriots',
    'hou': 'texans',
    'det': 'lions',
    'gb': 'packers',
    'sea': 'seahawks',
    'pit': 'steelers'
}

POSITION_MAP = {
    # Offense
    'QB': 'QB',
    'RB': 'RB',
    'FB': 'RB',
    'WR': 'WR',
    'TE': 'TE',
    'LT': 'OT',
    'RT': 'OT',
    'OT': 'OT',
    'LG': 'OG',
    'RG': 'OG',
    'OG': 'OG',
    'C': 'C',
    # Defense
    'LDE': 'DE',
    'RDE': 'DE',
    'DE': 'DE',
    'EDGE': 'DE',
    'LDT': 'DT',
    'RDT': 'DT',
    'DT': 'DT',
    'NT': 'DT',
    'WLB': 'LB',
    'MLB': 'LB',
    'SLB': 'LB',
    'ILB': 'LB',
    'OLB': 'LB',
    'LB': 'LB',
    'LCB': 'CB',
    'RCB': 'CB',
    'NB': 'CB',
    'CB': 'CB',
    'SS': 'S',
    'FS': 'S',
    'S': 'S'
}

DEFAULT_TRAITS = {
    'QB': {'pocket-passer': 1},
    'RB': {'speed-back': 1},
    'WR': {'route-runner': 1},
    'TE': {'blocker': 1},
    'OT': {'pass-protection': 1},
    'OG': {'zone-blocker': 1},
    'C': {'zone-blocker': 1},
    'DE': {'qb-predator': 1},
    'DT': {'gap-stuffer': 1},
    'LB': {'tackler': 1},
    'CB': {'lockdown-cb': 1},
    'S': {'ball-hawk': 1}
}

def parse_depth_chart_content(html):
    blocks = html.split('<div class="Table__Title"')
    result = {'offense': [], 'defense': []}

    for b in blocks[1:]:
        title_m = re.search(r'>([^<]+)</div>', b)
        title = title_m.group(1).strip() if title_m else ''

        cat = 'offense'
        if any(k in title.lower() for k in ['defense', '4-3', '3-4', 'nickel', 'd']):
            cat = 'defense'
        elif 'special' in title.lower():
            continue

        pos_matches = re.findall(r'data-testid="statCell">([A-Z0-9]+)(?:<!-- -->|\s*<span)', b)
        if not pos_matches:
            pos_matches = re.findall(r'<td class="Table__TD"><span class="" data-testid="statCell">([A-Z0-9]+)', b)
        
        scroller_m = re.search(r'<div class="Table__Scroller"[^>]*>', b)
        if not scroller_m:
            continue

        scroller_html = b[scroller_m.end():]
        tbody_match = re.search(r'<tbody[^>]*>(.*?)</tbody>', scroller_html, re.DOTALL)
        tbody_content = tbody_match.group(1) if tbody_match else scroller_html

        row_matches = re.findall(r'<tr[^>]*>(.*?)</tr>', tbody_content, re.DOTALL)

        for row_idx, row_html in enumerate(row_matches):
            if row_idx >= len(pos_matches):
                continue
            pos_raw = pos_matches[row_idx]
            norm_pos = POSITION_MAP.get(pos_raw, "WR" if cat == 'offense' else "CB")

            td_matches = re.findall(r'<td[^>]*>(.*?)</td>', row_html, re.DOTALL)
            for depth_idx, td_html in enumerate(td_matches):
                p_match = re.search(r'href="https://www.espn.com/nfl/player/_/id/\d+/[^"]+">([^<]+)</a>', td_html)
                if p_match:
                    p_name = p_match.group(1).strip()
                    inj_match = re.search(r'DepthChart__injuryMeta">([^<]*)</span>', td_html)
                    inj = inj_match.group(1).strip() if inj_match else ""
                    
                    result[cat].append({
                        'name': p_name,
                        'position_raw': pos_raw,
                        'position': norm_pos,
                        'depth': depth_idx + 1,
                        'injury': inj
                    })

    return result

def get_draft_percentile(depth, draft_round=None):
    if draft_round == 1:
        return 58
    elif draft_round in [2, 3]:
        return 48
    elif draft_round in [4, 5]:
        return 38
    elif draft_round in [6, 7]:
        return 28
    
    # Herded percentile based on depth
    if depth == 1:
        return 55
    elif depth == 2:
        return 38
    else:
        return 26

def load_existing_roster(filepath):
    if os.path.exists(filepath):
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return {p['name']: p for p in data}
    return {}

def build_roster_json(depth_list, existing_dict, category):
    new_roster = []
    seen = set()

    for p in depth_list:
        name = p['name']
        if name in seen:
            continue
        seen.add(name)

        pos = p['position']

        if name in existing_dict:
            # Preserve existing player data
            player_obj = dict(existing_dict[name])
            player_obj['position'] = pos
        else:
            # Create new player
            percentile = get_draft_percentile(p['depth'])
            player_obj = {
                "name": name,
                "position": pos,
                "jersey": 0,
                "height": "6'1",
                "weight": "205",
                "stamina": 100,
                "percentile": percentile,
                "traits-from-baseline-percentile": DEFAULT_TRAITS.get(pos, {}),
                "health": 100 if p['injury'] != 'IR' else 0
            }

        new_roster.append(player_obj)

    return new_roster

def main():
    parser = argparse.ArgumentParser(description="ESPN Depth Chart Parser & Roster Generator")
    parser.add_argument('--team', type=str, default='jax', help='Team code (e.g. jax, lar, buf)')
    parser.add_argument('--file', type=str, required=True, help='Path to ESPN HTML/markdown file')
    parser.add_argument('--update', action='store_true', help='Write changes to public/rosters/')
    args = parser.parse_args()

    team_code = args.team.lower()
    team_slug = TEAM_MAP.get(team_code, team_code)

    with open(args.file, 'r', encoding='utf-8') as f:
        html = f.read()

    depth_data = parse_depth_chart_content(html)

    print(f"\n==========================================")
    print(f" Parsed Depth Chart: {team_slug.upper()} ({team_code.upper()})")
    print(f"==========================================")

    print(f"Offense Players Found: {len(depth_data['offense'])}")
    print(f"Defense Players Found: {len(depth_data['defense'])}")

    off_path = os.path.join('public', 'rosters', f'{team_slug}-offense.json')
    def_path = os.path.join('public', 'rosters', f'{team_slug}-defense.json')

    existing_off = load_existing_roster(off_path)
    existing_def = load_existing_roster(def_path)

    new_offense = build_roster_json(depth_data['offense'], existing_off, 'offense')
    new_defense = build_roster_json(depth_data['defense'], existing_def, 'defense')

    if args.update:
        os.makedirs(os.path.dirname(off_path), exist_ok=True)
        with open(off_path, 'w', encoding='utf-8') as f:
            json.dump(new_offense, f, indent=2)
        print(f"Updated {off_path} ({len(new_offense)} players)")

        with open(def_path, 'w', encoding='utf-8') as f:
            json.dump(new_defense, f, indent=2)
        print(f"Updated {def_path} ({len(new_defense)} players)")
    else:
        print("\n--- SAMPLE OFFENSE (First 5) ---")
        print(json.dumps(new_offense[:5], indent=2))
        print("\n--- SAMPLE DEFENSE (First 5) ---")
        print(json.dumps(new_defense[:5], indent=2))

if __name__ == '__main__':
    main()
