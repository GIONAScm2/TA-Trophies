# TA-Trophies
A userscript that augments [TrueAchievements](https://www.trueachievements.com/) (TA) to be more useful for trophy hunters.

TA is renowned for its efficient solutions and walkthroughs that often eclipse anything you can find on trophy sites, so this userscript offers the best of both worlds by letting you view your trophy list/progress within the TA environment.
___
## Installation/Usage
0. Install a userscript manager browser extension (such as [Tampermonkey](https://www.tampermonkey.net/)).
1. Click [here](https://github.com/T-h0re/TA-Trophies/raw/main/TA-Trophies.user.js) to install the script.
2. (Optional) Make sure you're signed into [PSNP](https://psnprofiles.com/) if you wish to utilize progression-based features, like the automatic marking of achievements that you've completed the trophy counterparts of.

#### Mobile Compatibility
- **Android:** Most mobile browsers don't support extensions, so your options are limited. One such option is [Firefox Nightly](https://blog.mozilla.org/addons/2020/09/29/expanded-extension-support-in-firefox-for-android-nightly/).
- **Apple:** Safari should work.
___
## Features
#### ACHIEVEMENT LISTS:
- Info panel atop each list aggregates useful data, such as the number of online achievements
- Checkboxes to copy achievement names & descriptions to clipboard, perfect for creating checklists
  - Radio buttons to conveniently select all achievements or all online achievements
- Achievements are meaningfully formatted based on their trophy counterparts:
  - Xbox-exclusive achievements are shaded red
  - PS-exclusive achievements are added to the list and shaded blue
  - \*Completed achievements are shaded green
  - Matching achievements with slightly different criteria will have their criteria juxtaposed, with PS criteria emphasized with blue font
  - Online achievement names are emphasized with red font
- Dropdown list containing all stacks of the game (as per PSNP); selecting a stack reformats the list accordingly
    - `Update` button updates the formatting with the latest data synced to the PSNP list

\*Must be signed into PSNP to utilize this feature.
