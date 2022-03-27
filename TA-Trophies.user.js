// ==UserScript==
// @name         TA-Trophies
// @author       GIONAScm2
// @namespace    https://github.com/GIONAScm2/TA-Trophies
// @version      1.01
// @description  Script that brings trophies to the TA environment.
// @downloadURL  https://github.com/GIONAScm2/TA-Trophies/raw/main/TA-Trophies.user.js
// @updateURL    https://github.com/GIONAScm2/TA-Trophies/raw/main/TA-Trophies.user.js
// @match        https://www.trueachievements.com/game/*
// @match        https://www.truetrophies.com/game/*
// @connect      psnprofiles.com
// @connect      google.com
// @require      https://github.com/GIONAScm2/TA-Trophies/raw/main/TrophyFunctions.js
// @grant        GM_xmlhttpRequest
// @grant        GM.setValue
// @grant        GM.getValue
// @grant        GM.deleteValue
// ==/UserScript==

/// <reference path="TrophyFunctions.js"/>     // Enables IntelliSense
/* global Game, Trophy, TrophyList, newElement, colorLog, Game, CopyCheckbox */   // whitelists external object names for ESLint

// hide external console warnings via `-net::ERR_BLOCKED_BY_CLIENT -crbug -JWPlayer -fun-hooks` (in filter)


(async () => {
    class Settings {
        static #key = 'TA-Trophies';
        static data = {
            psnID: null,
            colors: {
                completed: 'hsl(120, 100%, 95%)',  // Grey
                onlyXB: 'hsl(349, 33%, 90%)', // Red
                onlyPS: 'hsl(220, 100%, 95%)' // Blue
            },
            /** @type {Assoc[]} */
            associations: []
        }

        /** Loads/creates user settings */
        static async init() {
            let status = `${GM_info.script.name} (v${GM_info.script.version}) is running`;
            const storedSettings = await GM.getValue(this.#key);

            if (storedSettings) {
                // Load PSN ID
                if ('psnID' in storedSettings) this.data.psnID = storedSettings.psnID || '';
                // Load associations
                if ('associations' in storedSettings) this.data.associations = storedSettings.associations;

                await this.save();
            }
            status += Settings.psnID ? ` (PSN ID: ${Settings.psnID})` : ' with limited functionality';
            console.log(status);
        }

        static async delete() {
            await GM.deleteValue(this.#key);
        }

        /** Parses a PSN response and, if user is logged into PSNP, sets their `psnID` accordingly.
         * @param {Response} res - PSNP response (GM_xmlhttpRequest)
         * @returns {Promise<void>} */
        static async updatePsnID(res) {
            const doc = new DOMParser().parseFromString(res.responseText, "text/html");
            const loggedIn = doc.querySelector('a.dropdown-toggle.cf > span');
            if (loggedIn) {
                this.data.psnID = loggedIn.textContent;
                await this.save();
            }
        }

        static async save() { await GM.setValue(this.#key, this.data); }


        static get psnID() { return this.data.psnID }
        static get colors() { return this.data.colors }
    }

    class Achievement {
        /** @param {HTMLLIElement} li */
        constructor(li) {
            /** @type {HTMLLIElement} */
            this.el = li;
            /** Unique identifier across all of TA. Default XBL order is chronological. */
            this.id = +li.querySelector('a').getAttribute('href')?.split('/')[1].substring(1);
            this.name = li.querySelector('a').textContent.trim();
            this.desc = li.querySelector('p').lastChild.textContent.trim();
            this.isOnline = (() => {
                let isOnline = false;
                const flagBar = this.el.querySelector('div.info i');
                if (flagBar) {
                    flagBar.dispatchEvent(new Event('mouseover'));
                    if (this.el.querySelector('i[title*="Online Game Mode"]')) {
                        isOnline = true;
                    }
                }
                return isOnline;
            })();
        }

        /**
         * Places a new description next to existing one. If reference text is passed,
         * `addition` is added immediately after it, and `this.desc` is changed accordingly.
         * @param {string} addition 
         * @param {string} ref 
         */
        alterDesc(addition, ref = null) {
            let desc = this.desc;
            if (ref) {
                desc = desc.replace(ref, `${ref} <b style="color:blue;">(${addition})</b>`);
                this.el.querySelector('p').innerHTML = desc;
            }
        }

        /** @type {HTMLInputElement} */
        get cb() { return this.el.querySelector('input.copyCheck'); }
    }

    class Assoc {
        /** Represents an association between an achievement list and one or more trophy lists.
         * @param {Response | Assoc} obj - Response or stripped Assoc in need of restoration
         * @param {number} idAL - ID of achievement list; necessary if `obj` is a Response */
        constructor(obj, idAL = null) {
            /** ID of currently-selected trophy list. 
             * @type {number} */
            this.selectedID = obj.selectedID ? obj.selectedID : 0;
            /** ID that uniquely identifies an achievement list; derived from the smallest achievement ID from the list. 
             * @type {number} */
            this.idAL = obj.idAL ? obj.idAL : idAL;
            /** @type {{name: string, url: string, id: number, stack: string, platformArray: string[], trophies: Trophy[]}[]} */
            this.lists = obj.lists ? obj.lists : this.createLists(obj);
        }

        /** Parses a response and returns an array of all trophy lists from the page; only
         * the first element is populated with trophies.
         * @param {Response} resTL Response of fetched trophy list */
        createLists(resTL) {
            const doc = new DOMParser().parseFromString(resTL.responseText, "text/html");
            const tl = new TrophyList(doc);

            const mainList = {
                name: doc.querySelector('#banner > div.banner-overlay > div > div.title-bar.flex.v-align > div.grow > h3').lastChild.textContent,
                id: +resTL.finalUrl.split('/')[4].split('-')[0],
                stack: abbreviateStack(doc.querySelector(`tr > th[colspan='2']`)),
                url: resTL.finalUrl,
                platformArray: [...doc.querySelectorAll('div.box td > div.platforms > span')].map(span => span.textContent),
                trophies: Trophy.getTrophies({ omitDLC: false, doc: doc })
            };
            this.selectedID = mainList.id;

            // Wrap each Game with an initialized trophies property
            let lists = tl.stacks.map(el => new Game(el));
            lists.forEach(l => l.trophies = []);

            // Refine lists' stack type
            lists = [mainList, ...lists];
            if (lists.some(l => l.stack !== '')) lists.filter(l => l.stack === '').forEach(s => s.stack = 'WW');

            return lists;
        }

        /** Updates own lists with data from passed lists.
         * @param {{name: string, url: string, id: number, stack: string, platformArray: string[], trophies: Trophy[]}[]} lists */
        updateLists(lists) {
            lists.forEach(newList => {
                const storedList = this.lists.find(l => l.id === newList.id);
                if (!storedList) {
                    this.lists.push(newList);
                }
                else {
                    if (newList.trophies.length && !storedList.trophies.length) {
                        storedList.trophies = newList.trophies;
                    }
                    else if (newList.trophies.length) {
                        // Update stored trophies
                        storedList.trophies.forEach(st => {
                            const nt = newList.trophies.find(t => t.id === st.id);
                            st.isCompleted = nt.isCompleted;
                        });
                        // stored.trophies[stored.trophies.findIndex(t => t.idAL === assoc.idAL)] = stored;
                    }
                    storedList.name = newList.name;
                    storedList.url = newList.url;
                    storedList.stack = newList.stack;
                }
            });
        }

        /** Returns trophy list belonging to the given ID (or URL to be parsed into one), otherwise undefined.
         * @param {string | number} key */
        getTrophyList(key = this.selectedID) {
            if (typeof key === 'string') key = +key.split('/')[4].split('-')[0];

            return this.lists.find(l => l.id === key);
        }


        /** Predicate that tests whether a given list ID (or URL to be parsed into one)
         * exists and is populated with trophies.
         * @param {string | number} key */
        hasTrophyData(key) {
            if (typeof key === 'string') key = +key.split('/')[4].split('-')[0];

            const list = this.lists.find(l => l.id === key && l.trophies.length);
            return !!list;
        }

        /** Returns trophy array of a given list ID (or URL to be parsed into one),
         * or an empty array if list doesn't exist (or has no trophies).
         * @param {string | number} key */
        getTrophyData(key) {
            if (typeof key === 'string') key = +key.split('/')[4].split('-')[0];

            return this.hasTrophyData(key) ? this.lists.find(l => l.id === key).trophies : [];
        }

    }


    /******************************************************************************************************************************
                                                               START OF SCRIPT
    ******************************************************************************************************************************/
    const start = performance.now();
    var
        /** @type {Assoc} */                assoc,
        /** @type {Achievement[]} */        achievements,
        /** @type {Trophy[]} */             trophies,
        /** @type {HTMLDivElement} */       infoPanel,
        /** @type {CopyCheckbox} */         checkboxes;

    // await Settings.delete();
    await Settings.init();

    if (location.href.includes('.com/game')) {
        await viewingAchievements();
    }
    else if (location.href.includes('.com/a') || location.href.includes('.com/t')) {
        return;
    }
    colorLog(`**********END OF DEBUGGING (${Math.round(performance.now() - start)}ms)**********`, 'blue');
    /******************************************************************************************************************************
                                                             VIEWING ACHIEVEMENTS
    ******************************************************************************************************************************/
    async function viewingAchievements() {
        achievements = getAchievements();
        await loadOrCreateAssoc();
        console.log('Assoc with trophy list: ', assoc.getTrophyList().url);

        // Setting up DOM
        buildInfoPanel();
        achievements.forEach(a => {
            // Transforming each achievement name from a text node into a nested element so that the checkboxes don't fall victim to TA's justified spacing
            a.el.querySelector('a.title').replaceChildren(newElement('span', {}, newElement('span', { class: 'titleAnchor' }, a.name)));
        });
        checkboxes = new CopyCheckbox(...achievements);

        populateDropdown();
        diff();
    }





    function getAchievements(doc = document) { return [...doc.querySelectorAll('ul.ach-panels > li')].map(el => new Achievement(el)); }

    async function loadOrCreateAssoc() {
        const idAL = achievements.sort((a, b) => a.id - b.id)[0].id;
        assoc = Settings.data.associations.find(assoc => assoc.idAL === idAL);

        // Fetches, loads, and saves trophy data
        if (!assoc) {
            const game = document.querySelector('li.tab_green.selected em').textContent;
            let urlTL = await FirstGoogleResultURL(`${game} site:psnprofiles.com/trophies/`);
            const res = await fetchCORS(urlTL);
            if (!Settings.psnID) {
                await Settings.updatePsnID(res);
            }

            assoc = new Assoc(res, idAL);
            Settings.data.associations.push(assoc);
            await Settings.save();
        }
        // Unpacking stored assoc to restore its methods
        else assoc = new Assoc(assoc);

        trophies = assoc.getTrophyData(assoc.selectedID);
    }

    /** Creates and appends an info panel that provides statistical overview of achievement list. */
    function buildInfoPanel() {
        infoPanel = newElement('div', { id: 'outer' },
            newElement('div', { id: 'inner', style: `border-style:groove; background-color:#EBF5FB; padding:10px; display:inline-flex; flex-flow:column nowrap;` },
                // Rows
                newElement('div', { class: 'row' },
                    // Columns
                    newElement('div', {},
                        newElement('span', {}, 'Select: ')
                    ),
                    newElement('div', {},
                        newElement('input', { type: 'radio', name: 'TATselected', id: 'checkNone', checked: '', style: `margin-left:0 !important;` }),
                        newElement('span', {}, 'None'),
                        newElement('input', { type: 'radio', name: 'TATselected', id: 'checkOnline' }),
                        newElement('span', { style: `color:red;` }, `Online (${achievements.filter(a => a.isOnline).length})`),
                        newElement('input', { type: 'radio', name: 'TATselected', id: 'checkAll' }),
                        newElement('span', {}, 'All')
                    )
                ),
                newElement('div', { class: 'row' },
                    newElement('select', { id: 'dropdownStacks' }),
                    newElement('a', {
                        href: 'javascript:void(0);',
                        id: 'updateList',
                        title: 'Re-fetch your trophy list to get updated completion info',
                        style: `background:#64a75c; color: #fff; font-weight:500; text-transform:none; font-family:'Roboto', Arial, Verdana, sans-serif;` +
                            `text-align:center; padding:4px 8px 4px 8px; border-radius: 2px; white-space:nowrap; margin-right: 20px; font-size:14px; display:inline-flex; align-items: center; `,
                    }, 'Update')
                ),
            )
        );


        //Style
        infoPanel.querySelectorAll('#inner div.row').forEach(row => row.style.cssText += `display:flex; flex-wrap:nowrap; margin-top:10px;`);
        infoPanel.querySelectorAll('#inner > div > div:first-child').forEach(col1 => col1.style.cssText += `flex: 0 1 auto; width:70px;`);
        infoPanel.querySelectorAll('#inner > div > div+div').forEach(col2 => col2.style.cssText += `flex: 1 1 auto;`);
        infoPanel.querySelectorAll('#inner > div:first-child input').forEach(radio => radio.style.cssText += `margin-left:20px; margin-right:5px;`);

        // Event handlers
        infoPanel.querySelector('#checkNone').addEventListener('change', function () {
            if (this.checked) getAchievements().forEach(a => { if (a.cb.checked) a.cb.click(); });
        });
        infoPanel.querySelector('#checkOnline').addEventListener('change', function () {
            if (this.checked) {
                getAchievements().forEach(a => {
                    if (a.isOnline && !a.cb.checked || !a.isOnline && a.cb.checked)
                        a.cb.click();
                });
            }
        });
        infoPanel.querySelector('#checkAll').addEventListener('change', function () {
            if (this.checked) getAchievements().forEach(a => { if (!a.cb.checked) a.cb.click(); });
        });
        infoPanel.querySelector('#dropdownStacks').addEventListener('change', async function () {
            await updateList();
        });
        var onCooldown = false;
        infoPanel.querySelector('#updateList').addEventListener('click', async function () {
            if (!onCooldown) {
                await updateList(true);
            }
        });

        document.querySelector('div.gh-btn.gh').after(infoPanel);

        async function updateList(forceUpdate = false) {
            onCooldown = true;
            const url = infoPanel.querySelector('#dropdownStacks').value.split('/').slice(0, 5).join('/');
            let list = assoc.getTrophyList(url);

            if (!list?.trophies?.length || forceUpdate) {
                const res = await fetchCORS(url);
                if (!Settings.psnID) {
                    await Settings.updatePsnID(res);
                }
                const lists = assoc.createLists(res);
                assoc.updateLists(lists);
                list = assoc.getTrophyList(lists[0].id);
            }
            else onCooldown = false;

            assoc.selectedID = list.id;
            Settings.data.associations[Settings.data.associations.findIndex(as => as.idAL === assoc.idAL)] = assoc;
            await Settings.save();

            trophies = list.trophies;
            diff();
        }
    }


    /** Cross-origin fetch
     * @param {string} url 
     * @returns {Promise<Response>} */
    async function fetchCORS(url) {
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: "GET",
                url: url,
                onload: (res) => {
                    if (res.readyState === 4) {
                        resolve(res);
                    }
                }
            })
        });
    }

    /** Performs a Google search for the query and returns the first result's URL
     * @param {string} query 
     * @returns {Promise<string>} */
    async function FirstGoogleResultURL(query) {
        let url = `https://www.google.com/search?q=${encodeURI(query)}`;
        let res = await fetchCORS(url);
        const doc = new DOMParser().parseFromString(res.responseText, "text/html");
        return `${doc.querySelector('#rso a').getAttribute('href')}`;
    }



    /** Populates dropdown input. Requires `assoc` to already be populated with lists. */
    function populateDropdown() {
        const stacks = assoc.lists;
        const dropdown = infoPanel.querySelector('#dropdownStacks');
        const suffix = Settings.psnID ? `/${Settings.psnID}` : '';

        stacks.forEach((s) => {
            const stackType = s.stack === '' ? '' : `(${s.stack}) `;
            const opt = newElement('option', { value: `${s.url}${suffix}` }, `${s.name} ${stackType}(${s.platformArray.join('/')})`);
            dropdown.appendChild(opt);
        });
        const url = assoc.getTrophyList(assoc.selectedID).url;
        dropdown.value = `${url}${suffix}`;
        if (stacks.length === 1) dropdown.setAttribute('disabled', '');
    }

    /** Visually alters achievement list in relation to user's trophy list  */
    function diff() {
        let matches = trophies.filter(t => t.a),
            onlyPS,
            onlyXB;
        // Trying to efficiently match achievements to trophies. Benchmark: 28s to parse Elite Dangerous.
        if (!matches.length) matches = getMatchingTrophies();

        onlyPS = trophies.filter(t => !matches.some(m => m.id === t.id));
        onlyXB = achievements.filter(a => !matches.some(m => m.a.id === a.id));

        // Reset any existing formatting
        achievements.forEach(a => { a.el.style.backgroundColor = ''; });
        for (let li of document.getElementsByClassName('onlyPS')) li.remove();

        // Completed 'achievements' are shaded green
        let completed = matches.filter(m => m.isCompleted);
        completed.forEach(m => achievements.find(a => a.id === m.a.id).el.style.backgroundColor = Settings.colors.completed);
        // console.log('completed:' + completed.length);

        // PS-exclusive 'achievements' are rendered and shaded blue
        onlyPS.forEach(t => {
            /** @type {HTMLElement} */
            const li = achievements[0].el.cloneNode(true);
            li.querySelectorAll('li > div').forEach(div => div.remove());
            li.querySelector('span.titleAnchor').textContent = t.name;
            li.querySelector('li > a').removeAttribute('href');
            li.querySelector('li > a').removeAttribute('data-af');
            li.querySelector('li > p').replaceWith(newElement('p', {}, t.desc))
            li.querySelector('li > span').appendChild(newElement('img', { src: t.image, style: `width:64px; height:64px;` }));
            li.style.backgroundColor = Settings.colors.onlyPS;
            li.classList.add('onlyPS');
            li.setAttribute('id', `PS_${t.id}`);

            document.querySelector('ul.ach-panels > li').before(li);
            t.el = li;
            checkboxes.addMembers(t);
        });

        // Online achievement names are red
        achievements.filter(a => a.isOnline).forEach(a => a.el.querySelector('a').style.color = 'red');

        // XB-exclusives are shaded red
        onlyXB.forEach(a => { a.el.style.backgroundColor = Settings.colors.onlyXB; });
    }

    /** Compares the currently-loaded trophies and achievements, and returns an array
     * of all trophies that have an achievement counterpart. These counterparts get attached
     * to `trophy.el`. Also highlights any discrepancies when a match's numeric criteria are at odds. */
    function getMatchingTrophies() {
        // Deep copies of the trophy/achievement lists (but DOM element is stripped)
        const tc = JSON.parse(JSON.stringify(trophies))
            , ac = JSON.parse(JSON.stringify(achievements));
        /** @type {Trophy[]} */
        let matches = [];
        let debugString = `T:A - [0]: ${tc.length}:${ac.length}`;

        // 1: EXACT MATCHES
        const exactMatches = tc.filter(t => {
            t.a = ac.find(a => a.desc.toLowerCase() === t.desc.toLowerCase() && a.name.toLowerCase() === t.name.toLowerCase());
            return t.a;
        });
        matches = [...matches, ...exactMatches];
        spliceShortest(exactMatches);
        debugString += ` [1] exact: ${tc.length}:${ac.length}`;

        // 2: DESC MATCHES
        const descMatches = tc.filter(t => {
            t.a = ac.find(a => a.desc.toLowerCase() === t.desc.toLowerCase());
            return t.a;
        });
        matches = [...matches, ...descMatches];
        spliceShortest(descMatches);
        debugString += ` [2] exactDesc: ${tc.length}:${ac.length}`;

        // 3: NAME MATCHES WITH NO NUMERICAL DISCREPANCIES
        const nameMatches = tc.filter(t => {
            const ach = ac.find(a => a.name.toLowerCase() === t.name.toLowerCase());
            if (ach) {
                t.a = ach;
                if (/\d/.test(ach.desc)) {
                    let numsA = ach.desc.match(/\b\d[\d,.]*\b/g)?.map(s => Number(s.replace(',', ''))),
                        numsT = t.desc.match(/\b\d[\d,.]*\b/g)?.map(s => Number(s.replace(',', '')));
                    numsA?.forEach((num, i) => {
                        if (numsT[i] && !isNaN(num) && (num !== numsT[i])) {
                            // colorLog(`Mismatch: ${ach.name} (${t.name})\n${ach.desc} (${t.desc}) [${num} v. ${numsT[i]}]`, 'red');
                            t.a = ach;
                            achievements.find(a => a.id === ach.id).alterDesc(numsT[i], num);
                        }
                    });
                }
            }
            return t.a;
        });
        matches = [...matches, ...nameMatches];
        spliceShortest(nameMatches);
        debugString += ` [3] exactName: ${tc.length}:${ac.length}`;

        // 4: Same as above, but for the outliers - not just name matches
        const fuzzyMatches = tc.filter(t => {
            const ach = ac.find(a => similarity(a.desc, t.desc) >= 0.8 || similarity(a.name, t.name) >= 0.9);
            if (ach) {
                t.a = ach;
                if (/\d/.test(ach.desc)) {
                    let numsA = ach.desc.match(/\b\d[\d,.]*\b/g)?.map(s => Number(s.replace(',', ''))),
                        numsT = t.desc.match(/\b\d[\d,.]*\b/g)?.map(s => Number(s.replace(',', '')));
                    numsA?.forEach((num, i) => {
                        if (numsT[i] && !isNaN(num) && (num !== numsT[i])) {
                            // colorLog(`Mismatch: ${ach.name} (${t.name})\n${ach.desc} (${t.desc}) [${num} v. ${numsT[i]}]`, 'red');
                            t.a = ach;
                            achievements.find(a => a.id === ach.id).alterDesc(numsT[i], num);
                        }
                    });
                }
            }
            return t.a;
        });
        matches = [...matches, ...fuzzyMatches];
        spliceShortest(fuzzyMatches);
        debugString += ` [4] fuzzyMatch: ${tc.length}:${ac.length}`;
        console.log(debugString);

        return matches;

        /** Removes matched trophies/achievements from arrays to speed up subsequent comparisons. */
        function spliceShortest(matchArray) {
            matchArray.forEach(m => {
                tc.splice(tc.findIndex(t => t.id === m.id), 1);
                ac.splice(ac.findIndex(a => a.id === m.a.id), 1);
            });
        }
        // // (Old code for forced matching for foreign lists)
        // // Trophy list IS similar, but not in English. Also, some cheevo lists have a pseudo-plat
        // if (same === 0 && (trophies.length === achievements.length || trophies.length === achievements.length + 1)) {
        //     achievements.forEach((c, i) => {
        //         if (trophies[i].completed && document.getElementById(c.bodyID)) {
        //             document.getElementById(c.bodyID).style.backgroundColor = Settings.colors.completed;
        //             same++;
        //         }
        //     })
        // }
    }

    function similarity(s1, s2) {
        var longer = s1;
        var shorter = s2;
        if (s1.length < s2.length) {
            longer = s2;
            shorter = s1;
        }
        var longerLength = longer.length;
        if (longerLength == 0) {
            return 1.0;
        }
        return (longerLength - editDistance(longer, shorter)) / parseFloat(longerLength);
    }

    function editDistance(s1, s2) {
        s1 = s1.toLowerCase();
        s2 = s2.toLowerCase();

        var costs = new Array();
        for (var i = 0; i <= s1.length; i++) {
            var lastValue = i;
            for (var j = 0; j <= s2.length; j++) {
                if (i == 0)
                    costs[j] = j;
                else {
                    if (j > 0) {
                        var newValue = costs[j - 1];
                        if (s1.charAt(i - 1) != s2.charAt(j - 1))
                            newValue = Math.min(Math.min(newValue, lastValue),
                                costs[j]) + 1;
                        costs[j - 1] = lastValue;
                        lastValue = newValue;
                    }
                }
            }
            if (i > 0)
                costs[s2.length] = lastValue;
        }
        return costs[s2.length];
    }

    /** Returns the official PSNP abbreviation of a verbose stack type `text`
 * @param {string} text */
    function abbreviateStack(text) {
        switch (text) {
            case 'North American': return 'NA';
            case 'European': return 'EU';
            case 'Asian': return 'AS';
            case 'Japanese': return 'JP';
            case 'Chinese': return 'CN';
            case 'Korean': return 'KR';
            case 'German': return 'GER';
            case 'Australian': return 'AU';
            case 'Russian': return 'RU';
            case 'Western': return 'WE';
            case 'United Kingdom': return 'UK';
            case 'French': return 'FR';
            case 'Spanish': return 'ES';
            // Non-regions:
            case 'Digital': return 'DG';
            case 'Physical': return 'PH';
            case 'Rereleased': return 'RR';
            case 'Original': return 'OR';
            default: return '';
        }
    }
})();