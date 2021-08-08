// ==UserScript==
// @name         TA-Trophies
// @author       GIONAScm2 AKA 'hore'
// @namespace    ta.trophies
// @version      1.01
// @description  Script to make TA reflect your trophy list
// @downloadURL  https://onedrive.live.com/download?cid=C4E82F50479B0155&resid=C4E82F50479B0155%21387977&authkey=ABuMKIAkLRoqyRY
// @updateURL    https://onedrive.live.com/download?cid=C4E82F50479B0155&resid=C4E82F50479B0155%21387977&authkey=ABuMKIAkLRoqyRY
// @match        https://www.trueachievements.com/game/*
// @grant        GM_xmlhttpRequest
// @connect      https://psnprofiles.com/*
// @connect      https://www.google.com/*
// @require      https://code.jquery.com/jquery-3.6.0.slim.min.js
// @require      https://onedrive.live.com/download?cid=C4E82F50479B0155&resid=C4E82F50479B0155%21387985&authkey=ALjF8aH0SoTBuEY
// ==/UserScript==

// hide external console warnings via `-net::ERR_BLOCKED_BY_CLIENT -crbug -JWPlayer -fun-hooks` (in filter)

/// <reference path="./../TrophyFunctions.js" />        (enables IntelliSense for external module)
/* global Trophy, TAchievement, getTrophyNodeList, getCheevoNodeList, getStackNodeList, newElement, colorLog, fetchDoc, GameStack */          // whitelists external object names for ESLint

/** TODO:
 *      - Show any trophies that don't have cheevo counterparts, a la SMB
 *      - Put trophy name/desc next to (or below) cheevo name/desc if either of these fields vary. (SMB is a good example)
 *      - when comparing merits, try to ignore minor differences like a period.
 *      - handle non-English trophy lists by using default PSN/XBL order. To get XBL order, query the TA page using Fetch with {credentials: omit} header
 */



const _startTime = performance.now();
let _settings = {
    key: 'TA-Trophies_Settings',
    psnID: null,
    colors: {
        completed: 'hsl(120, 100%, 90%)', //green
        XBexclusive: 'hsl(350, 33%, 82%)', // red
        PSexclusive: 'hsl(220, 100%, 90%)' // blue
    },
    save() { localStorage.setItem(this.key, JSON.stringify(this)); },
    load() {
        const _hasSettings = localStorage.getItem(this.key) !== null;
        if (_hasSettings) {
            _settings = JSON.parse(localStorage.getItem(this.key))
            return true;
        }
        return false;
    },
    async init() {
        if (!this.load()) {
            const found = await this.getPSNID();
            if (found) {
                this.save();
                //alert(`PSN ID successfully fetched: ${this.psnID}`);
                return true;
            } else {
                alert('Failed to retrieve PSN ID. You must be logged in to PSNProfiles for this script to work.');
                return false;
            }
        } else {
            console.log(`${this.key} successfully loaded. Welcome back, ${_settings.psnID}`); // `this.psnID` returns null
            return true;
        }
    },
    async getPSNID() {
        const doc = await fetchCORS(`https://psnprofiles.com/`);
        const loggedIn = doc.querySelector('a.dropdown-toggle.cf > span');
        if (loggedIn) {
            this.psnID = loggedIn.textContent;
            return true;
        }
        else
            return false;
    }
};



const _gameTitle = document.querySelector('h1').textContent.substring(0, document.querySelector('h1').textContent.lastIndexOf(" ")); // Removes last word, "Achievements"
const urlQuery = `https://www.google.com/search?q=${encodeURI(_gameTitle + " site:psnprofiles.com/trophies/")}`;

(async () => {
    colorLog('**********START OF DEBUGGING**********', 'blue');

    if (!await _settings.init()) return; // don't run script unless user's PSN ID is retrieved

    await main();


    colorLog(`Executed in ${Math.round(performance.now() - _startTime)} ms`, "green");
    colorLog('**********END OF DEBUGGING**********', 'blue');
})();










/**
 * 
 * @param {TAchievement} c 
 * @param {Trophy} t 
 * @returns {boolean}
 */
function isSimilar(c, t) {
    // ignore case and full-stops
    let similar = false;
    if (c.name.toUpperCase() === t.name.toUpperCase() || c.desc.toUpperCase() === t.desc.toUpperCase()) {
        similar = true;
    }
    return similar;
}

/**
 * Returns an array containing the trophy list/URL of the current page, and any stacks.
 * @param {*} doc 
 * @returns 
 */
function getTrophyLists(doc) {
    const lists = [];
    // collect all trophy lists
    return lists;
}
/** @param {document} doc */
async function diff(doc) {
    const cheevos = nodesToCheevoArray(getCheevoNodeList(await fetchDoc(document.URL, { credentials: 'omit' }))); // fetches cheevos in default XBL order
    const trophies = nodesToTrophyArray(getTrophyNodeList(doc));
    // console.log(cheevos);
    // console.log(trophies);

    // Reset colors    
    let online = 0;
    cheevos.forEach((c) => {
        c.body = document.getElementById(c.bodyID);
        if (c.body) { // if element exists, reset color
            c.body.style.backgroundColor = '';

            // Working with online cheevos
            const flagBar = c.body.querySelector('div.info i');
            flagBar.dispatchEvent(new Event('mouseover'));
            if (c.body.querySelector('i[title*="Online Game Mode"]')) {
                online++;
                c.markAsOnline();
            }
        }

    });
    console.log(``);
    const elOnline = newElement('div', { style: `font-weight:bold; color:red;` }, `${online} online trophies`);
    appendToTop(elOnline);

    // these corrections must be applied to the cheevos
    const PSexclusives = trophies.filter(({ name: name1, desc: desc1 }) => !cheevos.some(({ name: name2, desc: desc2 }) => desc2 === desc1 || name2 === name1));
    //
    const XBexclusives = cheevos.filter(({ name: name1, desc: desc1 }) => !trophies.some(({ name: name2, desc: desc2 }) => desc2 === desc1 && name2 === name1));

    // console.log(PSexclusives);
    // console.log(XBexclusives);

    let same = 0, XBexclusive = 0, PSexclusive = 0, completed = 0;
    cheevos.forEach((c) => {
        for (let j = 0; j < trophies.length; j++) {
            const t = trophies[j];
            // if (c.name === _trophies[i].name || c.description === _trophies[i].description) {
            if (isSimilar(c, t) && document.getElementById(c.bodyID)) {
                same++;
                if (t.completed) {
                    document.getElementById(c.bodyID).style.backgroundColor = _settings.colors.completed;
                    completed++;
                }
                break;
            }
            else if (j === trophies.length - 1 && document.getElementById(c.bodyID)) {
                document.getElementById(c.bodyID).style.backgroundColor = _settings.colors.XBexclusive;
                XBexclusive++;
            }
        }
    })
    //...
    // Trophy list IS similar, but not in English. Also, some cheevo lists have a pseudo-plat
    if (same === 0 && (trophies.length === cheevos.length || trophies.length === cheevos.length + 1)) {
        cheevos.forEach((c, i) => {
            if (trophies[i].completed && document.getElementById(c.bodyID)) {
                document.getElementById(c.bodyID).style.backgroundColor = _settings.colors.completed;
                same++;
            }
        })
    }


    // console.log(same + " same");
    // console.log(XBexclusive + " XBexclusive");
    // console.log(completed);
}


async function main() {
    let doc = await fetchCORS(urlQuery);
    let urlTrophies = `${doc.querySelector('#rso a').getAttribute('href')}/${_settings.psnID}?order=psn`; // first Google result
    doc = await fetchCORS(urlTrophies);

    diff(doc);

    const stacks = [];
    let stackNodes = getStackNodeList(doc);
    if (stackNodes) {
        // parse first stack, then click it and parse the rest. then re-parse them all to add any WW stack tags.
        const pivotStack = new GameStack(stackNodes[0]);
        stacks.push(pivotStack);
        doc = await fetchCORS(pivotStack.url);
        stackNodes = getStackNodeList(doc);
        for (let i = 0; i < stackNodes.length; i++) {
            let s = new GameStack(stackNodes[i]);
            stacks.push(s);
        }
        stacks.forEach((s) => { if (s.stack === null) s.stack = 'WW' });
        // DROPDOWN
        const dropdown = enableDropdown();
        stacks.forEach((s) => {
            const opt = newElement('option', { value: `${s.url}/${_settings.psnID}?order=psn` }, `${s.name} (${s.platformString}) (${s.stack})`);
            dropdown.appendChild(opt);
        });
        dropdown.value = urlTrophies;
    }

}


function appendToTop(el) {
    const anchor = document.querySelector('#frm > div.page.ta.limit > div.main.middle > main > div.gh-btn.gh');
    anchor.parentNode.insertBefore(el, anchor.nextSibling);
}
function enableDropdown() {
    const dropdown = newElement('select', { id: `tat-dropdown` });
    appendToTop(dropdown);
    dropdown.addEventListener('change', async () => {
        diff(await fetchCORS(dropdown.value));
    });
    return dropdown;
}
/** @param {NodeListOf<HTMLLIElement>} cheevoNodes  */
function nodesToCheevoArray(cheevoNodes) {
    const arr = [];
    for (let i = 0; i < cheevoNodes.length; i++) {
        const cheevo = new TAchievement(cheevoNodes[i]);
        arr.push(cheevo);
    }
    return arr;
}
/** @param {NodeListOf<HTMLTableRowElement>} trophyNodes  */
function nodesToTrophyArray(trophyNodes) {
    const arr = [];
    for (let i = 0; i < trophyNodes.length; i++) {
        const t = new Trophy(trophyNodes[i]);
        arr.push(t);
    }
    return arr;
}
/**
 * 
 * @param {string} url 
 * @returns {document}
 */
async function fetchCORS(url) {
    return new Promise((resolve) => {
        GM_xmlhttpRequest({
            method: "GET",
            url: url,
            onload: (res) => {
                if (res.readyState === 4) {
                    var parser = new DOMParser();
                    resolve(parser.parseFromString(res.responseText, "text/html"));
                }
            }
        })
    });
}

// function enableCustomLists() {
//     const _textInputURL = newElement('div', {},
//         'Reference a particular PSNP list: ',
//         newElement('input', { 'type': 'text', 'id': 'psnpURL' }),
//         newElement('button', { 'id': 'psnpGO', 'padding-left': '5px', 'type': 'button' }, 'GO'));
//     const anchor = document.querySelector('#frm > div.page.ta.limit > div.main.middle > main > div.gh-btn.gh');
//     anchor.parentNode.insertBefore(_textInputURL, anchor.nextSibling);
//     document.querySelector('#psnpGO').addEventListener('click', async () => {
//         const url = document.querySelector('#psnpURL').value;
//         main(url);
//     });
// }