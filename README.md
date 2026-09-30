# BTR Calc

Calculators for **Butler Tech Robotics** (FRC 144 and FRC 325), built on the WestCoast Products parts list.

**Open it:** https://butlertechrobotics.github.io/btr-calc/

It runs in any browser with no install and no account.

## What's in it

- **Gearbox.** Pick a motor (Kraken X60, Kraken X44, NEO Vortex), then stack gear, belt and chain stages using real WCP parts. The parts offered always fit the shaft they sit on, so a SplineXS pinion only shows up on a Kraken, and a 1/2" hex gear only on a 1/2" hex shaft. You get:
  - total reduction, free speed, stall torque, and torque at your current limit
  - wheel surface speed, elevator/winch speed and pull, or arm holding torque
  - a to-scale plate layout: shafts, gears, belts, chains, the motor, and the plate outline
  - collision checks: a part hitting another shaft, two parts in the same plane overlapping, a belt or chain rubbing a shaft, holes too close together
  - a hole table (X/Y for every shaft and the spacing between them)
  - a **plate DXF** in inches to cut on the laser or router: bearing holes, the motor pilot and bolt holes, and a plate outline
  - a **parts list** with WCP part numbers, links and prices (CSV download)
  - **Copy share link** puts the whole design in a link you can paste in Teams
- **Chain.** Two sprockets and a target centre distance → chain length in links and the exact centre distance for each even (or half-link) option, with wrap angle checks.
- **Belt.** Two pulleys and a target centre distance → the WCP belts that land closest, with the exact centre distance and teeth in mesh for each.
- **Gears.** Centre distance for a 20 DP pair (or 10/32 DP), including WCP's profile-shifted pinions that space like a bigger gear.
- **WCP parts.** Search every gear, pulley, belt, sprocket, chain part and bearing the calculators use.

## How the numbers are worked out

- Gears: centre distance = (teeth A + teeth B) / (2 × DP), plus the adder you set (0.003" by default). Profile-shifted pinions use the tooth count they're shifted to.
- Chain: the length counts the links wrapped around each sprocket plus the two straight spans, using the real wrap angles. It matches the usual ANSI formula to within a small fraction of a link.
- Belts: the exact pitch-line length around both pulleys (tangent spans plus the arcs on each pulley), solved backwards for the centre distance.
- Motors: straight-line DC motor model from the manufacturer's free speed, stall torque and currents, with 97% per gear stage, 98% per belt and 97% per chain stage.

`tools/test-core.mjs` checks all of this (run `node tools/test-core.mjs`).

## Where the data comes from

`wcp-parts.json` was built by reading the individual WCP product pages on 2026-09-30 (`tools/wcp-raw/` has what was read; `tools/build_parts.py` turns it into the JSON). Motor specs are from WCP's Kraken X60 and X44 docs and REV's NEO Vortex page; the source link is in the file. Prices are what WCP's configurator showed that day, so check the cart before ordering.

To add or fix a part, edit the matching file in `tools/wcp-raw/` and run `python3 tools/build_parts.py`. Other BTR apps can load the parts list from https://butlertechrobotics.github.io/btr-calc/wcp-parts.json.

## Feedback

Click **Feedback** in the app. It opens the team Google Form with your note filled in; press **Submit** there.
