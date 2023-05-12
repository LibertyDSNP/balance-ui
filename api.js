import { WsProvider, ApiPromise } from 'https://cdn.jsdelivr.net/npm/@polkadot/api@10.2.2/+esm';


let singletonApi;
let singletonProvider;
let PREFIX = 42;
let UNIT = "UNIT";
let DECIMALS = 8;

export function getDecimals() { return DECIMALS; }
export function getUnit() { return UNIT; }
export function getPrefix() { return PREFIX; }

// Load up the api for the given provider uri
export async function loadApi(providerUri) {
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
    let provider = document.getElementById("provider").value;
    if (provider === "custom") {
        provider = document.getElementById("providerCustom").value;
    }
    await loadApi(provider);

    toggleConnectedVisibility(true, provider);
}

// Reset
async function disconnect(event) {
    event.preventDefault();
    const api = await loadApi();
    await api.disconnect();
    toggleConnectedVisibility(false);
}

function customProviderToggle(value = null) {
    value = value ?? document.getElementById("provider").value;
    const customContainer = document.getElementById("providerCustomContainer");
    customContainer.style.display = value === "custom" ? "block" : "none";
}

function toggleConnectedVisibility(isConnected, provider = "...") {
    document.getElementById("currentProvider").innerHTML = provider;
    document.querySelectorAll(".showConnected").forEach(e => e.style.display = isConnected ? "block" : "none");
    document.querySelectorAll(".hideConnected").forEach(e => e.style.display = isConnected ? "none" : "block");
}

export function initConnection() {
    document.getElementById("connectButton").addEventListener("click", connect);
    document.getElementById("provider").addEventListener("input", (e) => {
        toggleConnectedVisibility(false);
        customProviderToggle(e.target.value);
    });
    document.getElementById("disconnectButton").addEventListener("click", disconnect);
    customProviderToggle();
}

let relayBlockNumberCache = [0, null];
export async function getCurrentRelayChainBlockNumber() {
    const [cacheTime, cachedNumber] = relayBlockNumberCache;
    if ((cacheTime + 60_000) > Date.now()) {
        return cachedNumber;
    }
    const relayEndpoint = {
        42: "wss://rococo-rpc.polkadot.io",
        90: "wss://rpc.polkadot.io",
    };

    const api = await ApiPromise.create({ provider: new WsProvider(relayEndpoint[PREFIX]) });
    await api.isReady;
    const blockData = await api.rpc.chain.getBlock();
    const result = await blockData.block.header.number.toNumber();
    relayBlockNumberCache = [Date.now(), result];
    return result;
}