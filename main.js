import { WsProvider, ApiPromise } from 'https://cdn.jsdelivr.net/npm/@polkadot/api@10.2.2/+esm';
import { checkAddress } from 'https://cdn.jsdelivr.net/npm/@polkadot/util-crypto@10.2.2/+esm';
import { encodeAddress } from 'https://cdn.jsdelivr.net/npm/@polkadot/util-crypto@11.1.3/+esm';

let PREFIX = 42;
let UNIT = "UNIT";
let DECIMALS = 8;

let singletonApi;
let singletonProvider;

let loggedAccountData = {};

// Load up the api for the given provider uri
async function loadApi(providerUri) {
    // Singleton
    if (!providerUri && singletonApi) return singletonApi;
    // Just asking for the singleton, but don't have it
    if (!providerUri) {
        return null;
    }
    // Handle disconnects
    if (providerUri) {
        if (singletonApi) {
            await singletonApi.disconnect();
        } else if (singletonProvider) {
            await singletonProvider.disconnect();
        }
    }

    // Singleton Provider because it starts trying to connect here.
    singletonProvider = new WsProvider(providerUri);
    singletonApi = await ApiPromise.create({ provider: singletonProvider });

    await singletonApi.isReady;
    const chain = await singletonApi.rpc.system.properties();
    PREFIX = Number(chain.ss58Format.toString());
    UNIT = chain.tokenSymbol.toHuman();
    DECIMALS = chain.tokenDecimals.toJSON()[0];
    document.querySelectorAll(".unit").forEach(e => e.innerHTML = UNIT);
    return singletonApi;
}

// Connect to the wallet and blockchain
async function connect(event) {
    event.preventDefault();
    await loadApi(document.getElementById("provider").value);

    document.getElementById("balanceForm").style.display = "block";
    document.getElementById("copyToSpreadsheet").style.display = "block";
}

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

// Update the various derived values from fields
function triggerUpdates() {
    // Currently no derived values
}

// Balance to decimal UNIT
function toDecimalUnit(balance) {
    // Some basic formatting of the bigint
    balance = balance.toString();
    if (balance.length >= DECIMALS) {
        return `${BigInt(balance.slice(0, -DECIMALS)).toLocaleString()}.${balance.slice(-DECIMALS)}`;
    }

    return (Number(balance) / (10 ^ DECIMALS)).toLocaleString();
}

async function logBalance(lookupAddress, note = "") {
    const api = await loadApi();
    if (!api || !lookupAddress) {
        return;
    }
    if (!validateAddress(lookupAddress)) return;

    const resp = await api.query.system.account(lookupAddress);
    const account = encodeAddress(lookupAddress, PREFIX);
    const total = BigInt(resp.data.free.toJSON()) + BigInt(resp.data.reserved.toJSON());

    const balanceData = {
        decimal: toDecimalUnit(total),
        plancks: BigInt(total).toLocaleString(),
        free: resp.data.free.toHuman(),
        reserved: resp.data.reserved.toHuman(),
        note,
    };

    loggedAccountData[account] = balanceData;

    const msg = Object.entries(balanceData).map(([k, v]) => `${k}: ${v}`);

    addLog(["", ...msg], account);
}

// Check the address and add a error message if there is one
function validateAddress(address, element = null) {
    const check = checkAddress(address, PREFIX);
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
}

// Start this up with event listeners
function init() {
    const lookupAddressEl = document.getElementById("lookupAddress");
    const logNoteEl = document.getElementById("logNote");
    lookupAddressEl.addEventListener("input", () => {
        validateAddress(lookupAddressEl.value, lookupAddressEl);
    });
    document.getElementById("balanceForm").addEventListener("submit", (e) => {
        e.preventDefault();
        logBalance(lookupAddressEl.value, logNoteEl.value);
        lookupAddressEl.value = "";
        logNoteEl.value = "";
    });
    document.getElementById("connectButton").addEventListener("click", connect);
    document.getElementById("provider").addEventListener("input", () => {
        document.getElementById("balanceForm").style.display = "none";
        document.getElementById("copyToSpreadsheet").style.display = "none";
    });
    document.getElementById("copyToSpreadsheet").addEventListener("click", copyToSpreadsheet);

    document.getElementById("clearLog").addEventListener("click", () => {
        document.getElementById("log").innerHTML = "";
        loggedAccountData = {};
    });
    triggerUpdates();
}

init();
