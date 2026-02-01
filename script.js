// Global State
let productsData = [];
let html5QrcodeScanner = null;
let isFlashOn = false;

// ID da Planilha
const SHEET_ID = "1yaDHltfBgrRe2iLASRiokXcTpGQb1Uq2Vo3lQ3dVHlw";

// DOM Elements
const elements = {
    searchSection: document.getElementById('searchSection'),
    resultSection: document.getElementById('resultSection'),

    searchInput: document.getElementById('searchInput'),
    btnSearch: document.getElementById('btnSearch'),
    btnCamera: document.getElementById('btnCamera'),

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
    // Show Search Setup Immediately
    elements.searchSection.classList.remove('hidden');

    if (elements.btnSearch) {
        elements.btnSearch.addEventListener('click', performSearch);
    }

    if (elements.searchInput) {
        elements.searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') performSearch();
        });
    }

    // Camera events
    if (elements.btnCamera) elements.btnCamera.addEventListener('click', startScanning);
    if (elements.btnCloseScanner) elements.btnCloseScanner.addEventListener('click', stopScanning);
    if (elements.btnFlash) elements.btnFlash.addEventListener('click', toggleFlash);

    // Auto-focus input
    if (elements.searchInput) elements.searchInput.focus();
});

/**
 * Main Search Function.
 * Triggers a fresh data fetch from Google Sheets every time.
 */
function performSearch() {
    if (!elements.searchInput) return;
    const query = elements.searchInput.value.trim();
    if (!query) return;

    // UI Updates: Loading state
    elements.resultSection.classList.add('hidden');
    elements.errorState.classList.add('hidden');

    showToast("Buscando dados...", "info"); // Show loading toast

    // Fetch fresh data
    fetchSheetData((data) => {
        if (!data || data.length === 0) {
            showToast("Planilha vazia ou erro de leitura.", "error");
            return;
        }

        // Search logic runs AFTER data is loaded
        // Try strict match first, then lenient
        let product = data.find(p => p.EAN === query);

        // If not found, try removing leading zeros if numeric
        if (!product && /^\d+$/.test(query)) {
            product = data.find(p => Number(p.EAN) === Number(query));
        }

        if (product) {
            displayProduct(product);
            hideToast();
        } else {
            showToast(`Produto não encontrado (${query})`, "error");
        }

        elements.searchInput.select();
    }, (errorMsg) => {
        showToast(errorMsg, "error");
    });
}


/**
 * Fetches data from Google Sheet using JSONP.
 * Bypasses CORS and gets fresh data on every call.
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
    }, 10000); // 10s Timeout

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
        onError("Falha na conexão com o Google.");
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
    elements.scannerModal.classList.remove('hidden');
    elements.btnFlash.classList.add('hidden');
    isFlashOn = false;
    updateFlashButton();

    if (!html5QrcodeScanner) {
        html5QrcodeScanner = new Html5Qrcode("reader");
    }

    // Increased scan area and FPS
    const config = {
        fps: 15, // Higher FPS for faster focus/detection
        qrbox: { width: 280, height: 280 },
        aspectRatio: 1.0
    };

    const constraints = {
        facingMode: "environment",
        focusMode: "continuous", // Attempt to force continuous focus
        advanced: [{ focusMode: "continuous" }]
    };

    html5QrcodeScanner.start(
        constraints,
        config,
        onScanSuccess
    ).then(() => {
        // slight delay to allow camera to initialize before checking caps
        setTimeout(checkFlashCapability, 500);

        // Attempt to apply focus track constraint directly if possible
        applyFocusConstraint();
    }).catch(err => {
        showToast("Erro ao abrir câmera: " + err, "error");
        stopScanning();
    });
}

function applyFocusConstraint() {
    try {
        const track = html5QrcodeScanner.getRunningTrack();
        if (track) {
            const capabilities = track.getCapabilities();
            if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
                track.applyConstraints({
                    advanced: [{ focusMode: 'continuous' }]
                });
            }
        }
    } catch (e) {
        console.log("Focus constraints apply failed", e);
    }
}

function checkFlashCapability() {
    try {
        const track = html5QrcodeScanner.getRunningTrack();
        const capabilities = track.getCapabilities();

        // Check for Torch/Flash
        if (capabilities.torch) {
            elements.btnFlash.classList.remove('hidden');
        }
    } catch (e) {
        console.log("Flash capability check failed", e);
    }
}

function toggleFlash() {
    if (!html5QrcodeScanner) return;

    isFlashOn = !isFlashOn;

    const track = html5QrcodeScanner.getRunningTrack();

    if (track) {
        track.applyConstraints({
            advanced: [{ torch: isFlashOn }]
        }).then(() => {
            updateFlashButton();
        }).catch(err => {
            console.error("Flash toggle failed", err);
            isFlashOn = !isFlashOn; // Revert
            showToast("Não foi possível ativar o flash", "error");
        });
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
        html5QrcodeScanner.stop().then(() => {
            elements.scannerModal.classList.add('hidden');
            html5QrcodeScanner.clear();
        }).catch(() => elements.scannerModal.classList.add('hidden'));
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

    // Set Message
    if (elements.errorMessage) elements.errorMessage.innerText = msg;
    elements.errorState.classList.remove('hidden');

    const icon = elements.errorState.querySelector('i');

    if (type === "info") {
        elements.errorState.style.background = "var(--primary)";
        if (icon) icon.className = "fa-solid fa-sync fa-spin";
    } else {
        elements.errorState.style.background = "var(--error)";
        if (icon) icon.className = "fa-solid fa-triangle-exclamation";
        // Auto hide errors after 3s
        setTimeout(() => elements.errorState.classList.add('hidden'), 3000);
    }
}

function hideToast() {
    if (elements.errorState) elements.errorState.classList.add('hidden');
}
