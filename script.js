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
    elements.btnFlash.classList.remove('hidden'); // Show flash by default
    isFlashOn = false;
    updateFlashButton();

    if (!html5QrcodeScanner) {
        html5QrcodeScanner = new Html5Qrcode("reader");
    }

    // Simplified Mobile Strategy: Try Rear -> Fallback to Any
    // Removing HD constraints to ensure compatibility

    const startCamera = (constraints) => {
        return html5QrcodeScanner.start(constraints, scannerConfig, onScanSuccess);
    };

    const scannerConfig = {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0
    };

    // 1. Try Rear Camera (Standard environment)
    startCamera({ facingMode: "environment" })
        .then(() => {
            setupCameraExtras();
        })
        .catch(errEnv => {
            console.warn("Rear camera failed, trying generic...", errEnv);

            // 2. Try Any Camera (User/Front/Default)
            startCamera({ facingMode: "user" })
                .then(() => {
                    setupCameraExtras();
                    showToast("Câmera alternativa ativada.", "info");
                })
                .catch(errAny => {
                    console.error("All cameras failed", errAny);
                    // Show DETAILED error for debugging
                    showToast(`Erro Câmera: ${errAny.name} - ${errAny.message}`, "error");
                    elements.scannerModal.classList.add('hidden');
                });
        });
}

function setupCameraExtras() {
    // slight delay to allow camera to initialize before checking caps
    setTimeout(() => {
        checkFlashCapability();
        applyFocusConstraint();
    }, 500);
}

function applyFocusConstraint() {
    try {
        const track = html5QrcodeScanner.getRunningTrack();
        if (track) {
            const capabilities = track.getCapabilities();
            // Try to enable continuous focus if supported
            // "continuous" or "single-shot"
            // modern browsers use 'focusMode'
            if (capabilities.focusMode) {
                // Try applying advanced constraints safely
                track.applyConstraints({
                    advanced: [{ focusMode: "continuous" }]
                }).catch(e => console.log("Focus constraint rejected", e));
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

        // Log capability but don't hide button (trust user to try it)
        if (capabilities.torch) {
            console.log("Torch supported");
        }
    } catch (e) {
        console.log("Flash capability check failed", e);
    }
}

function toggleFlash() {
    if (!html5QrcodeScanner) {
        showToast("Scanner não inicializado.", "error");
        return;
    }

    try {
        const track = html5QrcodeScanner.getRunningTrack();
        if (!track) {
            showToast("Erro: Câmera não detectada (Track null).", "error");
            return;
        }

        const caps = track.getCapabilities();
        if (!caps.torch) {
            showToast("Aviso: Seu celular diz que não tem flash.", "error");
            // We try anyway, just in case
        }

        isFlashOn = !isFlashOn;

        track.applyConstraints({
            advanced: [{ torch: isFlashOn }]
        }).then(() => {
            updateFlashButton();
            // Optional: confirm if it worked
            showToast(isFlashOn ? "Flash Ligado" : "Flash Desligado", "info");
        }).catch(err => {
            console.error("Flash toggle failed", err);
            isFlashOn = !isFlashOn; // Revert state
            showToast(`Erro ao ativar flash: ${err.name} - ${err.message}`, "error");
        });

    } catch (e) {
        showToast(`Erro fatal no flash: ${e.message}`, "error");
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

    // Safely stop or hide
    if (html5QrcodeScanner) {
        try {
            html5QrcodeScanner.stop().then(() => {
                elements.scannerModal.classList.add('hidden');
                html5QrcodeScanner.clear();
            }).catch(err => {
                console.warn("Stop failed (scanner possibly not running)", err);
                elements.scannerModal.classList.add('hidden');
            });
        } catch (e) {
            console.warn("Stop exception", e);
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
