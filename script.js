// VERSION CHECK
const APP_VERSION = 7;
console.log(`SYSTEM VERSION ${APP_VERSION} LOADED`);

// Global State
let productsData = [];
let html5QrcodeScanner = null;
let isFlashOn = false;
let isLoading = false;

// ID da Planilha
const SHEET_ID = "1yaDHltfBgrRe2iLASRiokXcTpGQb1Uq2Vo3lQ3dVHlw";

// DOM Elements
const elements = {
    appVersion: document.getElementById('appVersion'), // New version element
    searchSection: document.getElementById('searchSection'),
    resultSection: document.getElementById('resultSection'),

    searchInput: document.getElementById('searchInput'),
    btnSearch: document.getElementById('btnSearch'),
    btnCamera: document.getElementById('btnCamera'),
    btnRefresh: document.getElementById('btnRefresh'),

    scannerModal: document.getElementById('scannerModal'),
    btnCloseScanner: document.getElementById('btnCloseScanner'),
    btnFlash: document.getElementById('btnFlash'),

    // Status / Errors
    errorState: document.getElementById('errorState'),
    errorMessage: document.getElementById('errorMessage'),

    // Product Display
    productName: document.getElementById('productName'),
    productEan: document.getElementById('productEan'),
    productPrice: document.getElementById('productPrice')
};

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // 1. Show Version
    if (elements.appVersion) elements.appVersion.innerText = `Build: v${APP_VERSION}`;

    // 2. Initial Data Load
    initDataLoad();

    // 3. Setup UI Events
    if (elements.btnSearch) {
        elements.btnSearch.addEventListener('click', performSearch);
    }

    if (elements.searchInput) {
        elements.searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') performSearch();
        });
    }

    if (elements.btnRefresh) {
        elements.btnRefresh.addEventListener('click', () => {
            showToast("Atualizando dados...", "info");
            initDataLoad(true);
        });
    }

    // Camera events
    if (elements.btnCamera) elements.btnCamera.addEventListener('click', startScanning);
    if (elements.btnCloseScanner) elements.btnCloseScanner.addEventListener('click', stopScanning);
    if (elements.btnFlash) elements.btnFlash.addEventListener('click', toggleFlash);
});

/**
 * Loads data from Sheet and stores in memory.
 * @param {boolean} forceRefresh - If true, shows toasts.
 */
function initDataLoad(forceRefresh = false) {
    if (isLoading) return;
    isLoading = true;

    // UI Feedback if forcing
    if (forceRefresh) showToast("Baixando planilha...", "info");

    fetchSheetData((data) => {
        productsData = data;
        isLoading = false;

        // Setup UI once data is ready
        if (elements.searchSection) elements.searchSection.classList.remove('hidden');

        if (forceRefresh) {
            showToast(`${productsData.length} produtos atualizados!`, "success");
            setTimeout(hideToast, 2000);
        } else {
            // Gentle notification on load
            console.log(`Loaded ${productsData.length} products.`);
        }

        // Auto-focus input
        if (elements.searchInput) elements.searchInput.focus();

    }, (errorMsg) => {
        isLoading = false;
        showToast(errorMsg, "error");
        // Even if error, show search section so user can retry or see UI
        if (elements.searchSection) elements.searchSection.classList.remove('hidden');
    });
}


/**
 * Main Search Function.
 * Uses local memory data. INSTANT.
 */
function performSearch() {
    if (!elements.searchInput) return;
    const query = elements.searchInput.value.trim();
    if (!query) return;

    // Check if data is loaded
    if (!productsData || productsData.length === 0) {
        showToast("Dados ainda não carregados. Tente atualizar.", "error");
        return;
    }

    // UI Updates: Clear previous
    elements.resultSection.classList.add('hidden');
    elements.errorState.classList.add('hidden');

    // Search logic runs locally
    // Try strict match first, then lenient
    let product = productsData.find(p => p.EAN === query);

    // If not found, try removing leading zeros if numeric
    if (!product && /^\d+$/.test(query)) {
        product = productsData.find(p => Number(p.EAN) === Number(query));
    }

    if (product) {
        displayProduct(product);
        hideToast();
        elements.searchInput.blur(); // Hide keyboard
    } else {
        showToast(`Produto não encontrado (${query})`, "error");
    }

    elements.searchInput.select();
}


/**
 * Fetches data from Google Sheet using JSONP.
 * Bypasses CORS and gets fresh data.
 * @param {Function} onSuccess - Run with data array
 * @param {Function} onError - Run with error message
 */
function fetchSheetData(onSuccess, onError) {
    const callbackName = 'googleSheetCallback_' + Math.floor(Math.random() * 1000000);
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=responseHandler:${callbackName}`;

    let timeoutId = setTimeout(() => {
        if (window[callbackName]) {
            delete window[callbackName];
            onError("Tempo limite excedido. Verifique sua internet.");
            cleanupScript(callbackName);
        }
    }, 15000); // 15s Timeout for initial load

    // Define global callback
    window[callbackName] = function (json) {
        clearTimeout(timeoutId);
        delete window[callbackName];
        cleanupScript(callbackName);

        if (!json || !json.table || !json.table.rows) {
            onError("Formato inválido recebido do Google.");
            return;
        }

        const rows = json.table.rows;
        const freshData = rows.map(row => {
            const cells = row.c;
            if (!cells) return null;

            return {
                NOME: cells[0] ? String(cells[0].v).trim() : "",
                EAN: cells[1] ? String(cells[1].v).trim() : "",
                VENDA: cells[2] ? cells[2].v : 0
            };
        }).filter(item => item !== null && item.EAN !== "");

        onSuccess(freshData);
    };

    // Inject Script
    const script = document.createElement('script');
    script.id = callbackName;
    script.src = url;
    script.onerror = function () {
        clearTimeout(timeoutId);
        delete window[callbackName];
        cleanupScript(callbackName);
        onError("Falha na conexão com o Google. Verifique a internet.");
    };
    document.body.appendChild(script);
}

function cleanupScript(id) {
    const el = document.getElementById(id);
    if (el) document.body.removeChild(el);
}

function displayProduct(product) {
    try {
        if (elements.productName) elements.productName.innerText = product.NOME || "Sem Nome";
        if (elements.productEan) elements.productEan.innerText = `EAN: ${product.EAN}`;

        let price = product.VENDA || 0;
        if (typeof price === 'string') {
            price = price.replace('R$', '').replace(',', '.').trim();
        }
        const formatter = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 });
        if (elements.productPrice) elements.productPrice.innerText = formatter.format(price);

        elements.resultSection.classList.remove('hidden');
    } catch (e) {
        console.error("Erro ao exibir produto", e);
        showToast("Erro ao exibir dados do produto.", "error");
    }
}

// --- Camera Logic ---
function startScanning() {
    // 1. Basic UI Setup
    elements.scannerModal.classList.remove('hidden');
    elements.btnFlash.classList.remove('hidden');
    isFlashOn = false;
    updateFlashButton();

    // Clear previous errors/content
    const readerDiv = document.getElementById('reader');
    if (readerDiv) readerDiv.innerHTML = "";

    // 2. Security Check (HTTP vs HTTPS)
    const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.protocol === 'file:';
    const isSecure = location.protocol === 'https:';

    if (!isSecure && !isLocal) {
        if (readerDiv) {
            readerDiv.innerHTML = '<div style="color:white; padding:20px; text-align:center;">' +
                '<i class="fa-solid fa-lock-open" style="font-size:40px; color:#ef4444; margin-bottom:15px;"></i><br>' +
                '<h3>Câmera Bloqueada</h3>' +
                '<p>O navegador bloqueou a câmera por segurança.<br>Você está usando HTTP inseguro.</p>' +
                '<p style="font-size:0.8rem; color:#ccc;">Use HTTPS ou Localhost.</p></div>';
        }
        return;
    }

    // Give the modal time to render/animate
    setTimeout(() => {
        if (!html5QrcodeScanner) {
            html5QrcodeScanner = new Html5Qrcode("reader", true);
        }

        // Attempt 1: Standard Config
        const config = { fps: 10, aspectRatio: 1.0 };

        // Helper to try starting with fallback
        const tryStart = (useStrictConfig) => {
            const constraints = useStrictConfig ? { facingMode: "environment" } : undefined;
            const currentConfig = useStrictConfig ? config : { fps: 10 }; // Relax config

            html5QrcodeScanner.start(
                constraints, // use vague constraints on retry
                currentConfig,
                onScanSuccess
            ).then(() => {
                setupCameraExtras();
            }).catch(err => {
                console.error("Camera connection error:", err);

                // If it was the strict attempt and failed specifically with NotReadable or Overconstrained
                if (useStrictConfig && (err.name === "NotReadableError" || err.name === "OverconstrainedError")) {
                    console.log("Retrying with relaxed constraints...");
                    tryStart(false); // Retry with minimal config
                    return;
                }

                // Final Error Handling
                if (readerDiv) {
                    readerDiv.innerHTML = '<div style="color:white; padding:20px; text-align:center;">' +
                        '<i class="fa-solid fa-triangle-exclamation" style="font-size:40px; color:#ef4444; margin-bottom:15px;"></i><br>' +
                        '<h3>Erro na Câmera</h3>' +
                        `<p>${err.name || 'Erro'}: Não foi possível acessar a câmera.</p>` +
                        '<p style="font-size:0.8rem; margin-top:10px;">Verifique se deu permissão e se nenhum outro app está usando a câmera.</p>' +
                        '<button onclick="location.reload()" style="margin-top:20px; padding:10px 20px; border-radius:8px; border:none; background:white; color:black; cursor:pointer;">Recarregar App</button></div>';
                }
                showToast(`Erro Câmera: ${err.name}`, "error");
            });
        };

        // Start with strict config
        tryStart(true);

    }, 300); // 300ms delay for UI transition
}

function setupCameraExtras() {
    setTimeout(() => {
        checkFlashCapability();
        applyFocusConstraint();
    }, 500);
}

function applyFocusConstraint() {
    try {
        const constraints = {
            focusMode: "continuous"
        };
        html5QrcodeScanner.applyVideoConstraints({
            advanced: [constraints]
        }).catch(e => console.log("Focus constraint rejected", e));
    } catch (e) {
        console.log("Focus constraints apply failed", e);
    }
}

function checkFlashCapability() {
    try {
        const capabilities = html5QrcodeScanner.getRunningTrackCameraCapabilities();
        if (capabilities && capabilities.torch) {
            console.log("Torch supported (Library confirmed)");
        }
    } catch (e) {
        console.log("Flash capability check failed", e);
    }
}

function toggleFlash() {
    if (!html5QrcodeScanner) {
        return;
    }
    try {
        isFlashOn = !isFlashOn;
        html5QrcodeScanner.applyVideoConstraints({
            advanced: [{ torch: isFlashOn }]
        }).then(() => {
            updateFlashButton();
        }).catch(err => {
            console.warn("Flash toggle failed", err);
            isFlashOn = !isFlashOn;
            showToast(`Erro Flash: ${err.name || err}`, "error");
            updateFlashButton();
        });
    } catch (e) {
        showToast(`Erro Fatal Flash: ${e.message}`, "error");
    }
}

function updateFlashButton() {
    if (isFlashOn) {
        elements.btnFlash.classList.add('active');
        elements.btnFlash.innerHTML = '<i class="fa-solid fa-bolt"></i>';
    } else {
        elements.btnFlash.classList.remove('active');
        elements.btnFlash.innerHTML = '<i class="fa-solid fa-bolt"></i>';
    }
}

function stopScanning() {
    if (isFlashOn) {
        try { html5QrcodeScanner.applyVideoConstraints({ advanced: [{ torch: false }] }); } catch (e) { }
    }
    if (html5QrcodeScanner) {
        try {
            html5QrcodeScanner.stop().then(() => {
                elements.scannerModal.classList.add('hidden');
                html5QrcodeScanner.clear();
            }).catch(err => {
                elements.scannerModal.classList.add('hidden');
            });
        } catch (e) {
            elements.scannerModal.classList.add('hidden');
        }
    } else {
        elements.scannerModal.classList.add('hidden');
    }
}

function onScanSuccess(decodedText) {
    elements.searchInput.value = decodedText;
    stopScanning();
    performSearch();
}

// UI Helpers
function showToast(msg, type = "error") {
    if (!elements.errorState) return;
    if (elements.errorMessage) elements.errorMessage.innerText = msg;
    elements.errorState.classList.remove('hidden');

    const icon = elements.errorState.querySelector('i');

    if (type === "info" || type === "success") {
        elements.errorState.style.background = type === "success" ? "var(--success)" : "var(--primary)";
        if (icon) icon.className = type === "success" ? "fa-solid fa-check" : "fa-solid fa-sync fa-spin";
    } else {
        elements.errorState.style.background = "var(--error)";
        if (icon) icon.className = "fa-solid fa-triangle-exclamation";
        setTimeout(() => elements.errorState.classList.add('hidden'), 3000);
    }
}

function hideToast() {
    if (elements.errorState) elements.errorState.classList.add('hidden');
}
