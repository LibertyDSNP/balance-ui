import { checkAddress } from 'https://cdn.jsdelivr.net/npm/@polkadot/util-crypto@10.2.2/+esm';
import { encodeAddress } from 'https://cdn.jsdelivr.net/npm/@polkadot/util-crypto@11.1.3/+esm';
import { loadApi, initConnection, getCurrentRelayChainBlockNumber, getDecimals, getPrefix, getUnit } from './api.js';

let loggedAccountData = {};

// Simple display of a new log
function addLog(msg, prefix) {
    prefix = prefix ? prefix + ": " : "";
    if (typeof msg === "string") {
        msg = [msg];
    }

    const li = document.createElement("li");
    const ul = document.createElement("ul");

    let head = msg.shift();
    li.innerHTML = `${(new Date()).toLocaleString()} - ${prefix}${head}`;

    while (head = msg.shift()) {
        const liHead = document.createElement("li");
        liHead.innerHTML = head;
        ul.append(liHead);
    }

    li.append(ul);

    document.getElementById("log").prepend(li);
}

// Balance to decimal UNIT
function toDecimalUnit(balance) {
    const DECIMALS = getDecimals();
    // Some basic formatting of the bigint
    balance = balance.toString();
    if (balance.length >= DECIMALS) {
        return `${BigInt(balance.slice(0, -DECIMALS)).toLocaleString()}.${balance.slice(-DECIMALS)}`;
    }

    return balance > 0 ? (Number(balance) / (10 ^ DECIMALS)).toLocaleString() : "0";
}

function displaySchedule(schedule, relayBlockNumber) {
    if (schedule.periodCount > 1) {
        const unsupported = document.createElement("span");
        unsupported.innerHTML = "Unsupported per period value";
        return unsupported;
    }
    const template = document.querySelector('#schedule-template');
    const scheduleEl = template.content.cloneNode(true);
    scheduleEl.querySelector(".balanceResultTokens").innerHTML = toDecimalUnit(schedule.perPeriod.toString()) + " " + getUnit();
    const unlockRelayBlock = (schedule.start.toNumber() + schedule.period.toNumber());
    scheduleEl.querySelector(".unlockRelayBlock").innerHTML = unlockRelayBlock.toLocaleString();

    const untilUnlock = (unlockRelayBlock - relayBlockNumber) * 6 * 1000;
    const unlockEstimate = new Date(Date.now() + untilUnlock);
    scheduleEl.querySelector(".estimatedUnlock").innerHTML = unlockEstimate.toLocaleString();

    return scheduleEl;
}

function sortSchedule(a, b) {
    return Math.sign((a.start.toNumber() + a.period.toNumber()), (b.start.toNumber() + b.period.toNumber()));
}

async function updateResults(account, balanceData) {
    const api = await loadApi();

    const resultSchedule = document.getElementById("timeReleaseSchedule");
    resultSchedule.innerHTML = "Loading...";

    document.getElementById("resultAddress").innerHTML = account;
    document.getElementById("resultBalanceTokens").innerHTML = balanceData.decimal + " " + getUnit();
    document.getElementById("resultBalancePlancks").innerHTML = balanceData.plancks;
    document.getElementById("resultReserved").innerHTML = balanceData.reserved;
    document.getElementById("currentResults").style.display = "block";

    // Look up the timeRelease Pallet information for the address
    const schedules = await api.query.timeRelease.releaseSchedules(account);

    if (schedules.length === 0) {
        resultSchedule.innerHTML = "None";
    } else {
        const relayBlockNumber = await getCurrentRelayChainBlockNumber();
        const ul = document.createElement("ul");

        const isUnlocked = s => (s.periodCount.toNumber() === 1 && (s.start.toNumber() + s.period.toNumber() < relayBlockNumber));

        const unlockedSum = schedules
            .filter(isUnlocked)
            .reduce((sum, s) => (sum + BigInt(s.perPeriod.toString())), 0n)

        if (unlockedSum > 0n) {
            const unlockLi = document.createElement("li");
            unlockLi.innerHTML = `<b>Ready to Claim:</b> ${toDecimalUnit(unlockedSum)} ${getUnit()}`;
            ul.append(unlockLi);
        }

        schedules.filter(s => !isUnlocked(s)).sort(sortSchedule).forEach(s => {
            const li = document.createElement("li");
            li.append(displaySchedule(s, relayBlockNumber));
            ul.append(li);
        });
        resultSchedule.innerHTML = "";
        resultSchedule.append(ul);
    }
}

async function logBalance(lookupAddress) {
    const api = await loadApi();
    document.getElementById("currentResults").style.display = "none";
    if (!api || !lookupAddress) {
        return;
    }
    if (!validateAddress(lookupAddress)) return;

    const resp = await api.query.system.account(lookupAddress);
    const account = encodeAddress(lookupAddress, getPrefix());
    const total = BigInt(resp.data.free.toJSON()) + BigInt(resp.data.reserved.toJSON());

    const balanceData = {
        decimal: toDecimalUnit(total),
        plancks: BigInt(total).toLocaleString(),
        free: resp.data.free.toHuman(),
        reserved: resp.data.reserved.toHuman(),
    };

    await updateResults(account, balanceData);

    loggedAccountData[account] = balanceData;

    const msg = Object.entries(balanceData).map(([k, v]) => `${k}: ${v}`);

    addLog(["", ...msg], account);
}

// Check the address and add a error message if there is one
function validateAddress(address, element = null) {
    let addressEncoded = null;
    try {
        addressEncoded = encodeAddress(address, getPrefix());
    } catch (_e) { }
    const check = checkAddress(addressEncoded || address, getPrefix());
    const isValid = check[0];
    if (element) {
        if (isValid) element.setCustomValidity("");
        else element.setCustomValidity(`Invalid: ${check[1] || "unknown"}`);
    }
    return isValid;
}

// Simple function to allow getting data out into a spreadsheet paste-able form
function copyToSpreadsheet() {
    let first = true;
    const list = Object.entries(loggedAccountData).flatMap(([k, v]) => {
        const row = [k, ...Object.values(v)];
        if (first) {
            first = false;
            const header = ["address", ...Object.keys(v)];
            return [header, row]
        }
        return [row];
    });
    navigator.clipboard.writeText(list.map(x => x.join("\t")).join("\n"));
    document.getElementById("copyToSpreadsheet").innerHTML = "Copied!";
    setTimeout(() => { document.getElementById("copyToSpreadsheet").innerHTML = "Copy to Spreadsheet"; }, 2000);
}

// Start this up with event listeners
function init() {
    const lookupAddressEl = document.getElementById("lookupAddress");
    lookupAddressEl.addEventListener("input", () => {
        validateAddress(lookupAddressEl.value, lookupAddressEl);
    });
    document.getElementById("balanceForm").addEventListener("submit", (e) => {
        e.preventDefault();
        logBalance(lookupAddressEl.value);
        lookupAddressEl.value = "";
    });
    document.getElementById("copyToSpreadsheet").addEventListener("click", copyToSpreadsheet);

    document.getElementById("clearLog").addEventListener("click", () => {
        document.getElementById("log").innerHTML = "";
        loggedAccountData = {};
    });
    initConnection();
}

init();
