// Global State
let productsData = [];
let html5QrcodeScanner = null;
let isFlashOn = false; // State for Flash

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
    btnFlash: document.getElementById('btnFlash'), // New Flash Button

    // Status / Errors
    errorState: document.getElementById('errorState'),
    errorMessage: document.getElementById('errorMessage'),

    // Product Display
    productName: document.getElementById('productName'),
    productEan: document.getElementById('productEan'),
    productPrice: document.getElementById('productPrice'),

    btnViewImage: document.getElementById('btnViewImage')
};

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Show Search Setup Immediately
    elements.searchSection.classList.remove('hidden');

    elements.btnSearch.addEventListener('click', performSearch);
    elements.searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') performSearch();
    });

    // Camera events
    elements.btnCamera.addEventListener('click', startScanning);
    elements.btnCloseScanner.addEventListener('click', stopScanning);
    elements.btnFlash.addEventListener('click', toggleFlash);

    // Auto-focus input
    elements.searchInput.focus();
});

/**
 * Main Search Function.
 * Triggers a fresh data fetch from Google Sheets every time.
 */
function performSearch() {
    const query = elements.searchInput.value.trim();
    if (!query) return;

    // UI Updates: Loading state
    elements.resultSection.classList.add('hidden');
    elements.errorState.classList.add('hidden');

    showToast("Buscando dados atualizados...", "info"); // Show loading toast

    // Fetch fresh data
    fetchSheetData((data) => {
        // Search logic runs AFTER data is loaded
        const product = data.find(p => p.EAN === query);

        if (product) {
            displayProduct(product);
            hideToast();
        } else {
            showToast("Produto não encontrado.", "error");
        }

        // Select input for next scan
        elements.searchInput.select();
    });
}


/**
 * Fetches data from Google Sheet using JSONP.
 * Bypasses CORS and gets fresh data on every call.
 * @param {Function} callback - Function to run with valid data array
 */
function fetchSheetData(callback) {
    const callbackName = 'googleSheetCallback_' + Date.now(); // Unique callback ID
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=responseHandler:${callbackName}`;

    // Define global callback
    window[callbackName] = function (json) {
        // Clean up
        document.body.removeChild(document.getElementById(callbackName));
        delete window[callbackName];

        if (!json || !json.table || !json.table.rows) {
            showToast("Erro ao ler planilha.", "error");
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

        callback(freshData);
    };

    // Inject Script
    const script = document.createElement('script');
    script.id = callbackName;
    script.src = url;
    script.onerror = function () {
        showToast("Erro de conexão.", "error");
        document.body.removeChild(script);
    };
    document.body.appendChild(script);
}

function displayProduct(product) {
    elements.productName.innerText = product.NOME || "Sem Nome";
    elements.productEan.innerText = `EAN: ${product.EAN}`;

    let price = product.VENDA || 0;
    if (typeof price === 'string') {
        price = price.replace('R$', '').replace(',', '.').trim();
    }
    const formatter = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 });
    elements.productPrice.innerText = formatter.format(price);

    // Update Image Link (Google Search)
    const query = `${product.NOME} ${product.EAN}`;
    const searchUrl = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`;

    if (elements.btnViewImage) elements.btnViewImage.href = searchUrl;

    elements.resultSection.classList.remove('hidden');
}

// --- Camera Logic ---
function startScanning() {
    elements.scannerModal.classList.remove('hidden');
    elements.btnFlash.classList.add('hidden'); // Hide flash initially
    isFlashOn = false;
    updateFlashButton();

    if (!html5QrcodeScanner) {
        html5QrcodeScanner = new Html5Qrcode("reader");
    }
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    html5QrcodeScanner.start(
        { facingMode: "environment" },
        config,
        onScanSuccess
    ).then(() => {
        // Check for Flash capabilities
        checkFlashCapability();
    }).catch(err => {
        showToast("Erro na câmera.", "error");
        stopScanning();
    });
}

function checkFlashCapability() {
    try {
        const track = html5QrcodeScanner.getRunningTrackCameraCapabilities();
        // Some devices report 'torch' in capabilities
        if (track && track.torchFeature && track.torchFeature.isSupported()) {
            elements.btnFlash.classList.remove('hidden');
        } else {
            // Fallback attempt: just try to show it anyway if we can't detect
            // or keep hidden. Better to hide if unsure to avoid confusion.
            // Actually most browsers don't expose torchFeature easily in this Lib wrapper
            // We can access the video track directly if we could.

            // Html5Qrcode exposes getRunningTrack()
            const videoTrack = html5QrcodeScanner.getRunningTrack();
            const capabilities = videoTrack.getCapabilities();

            if (capabilities.torch) {
                elements.btnFlash.classList.remove('hidden');
            }
        }
    } catch (e) {
        console.log("Could not check flash capability", e);
    }
}

function toggleFlash() {
    if (!html5QrcodeScanner) return;

    isFlashOn = !isFlashOn;

    html5QrcodeScanner.applyVideoConstraints({
        advanced: [{ torch: isFlashOn }]
    }).then(() => {
        updateFlashButton();
    }).catch(err => {
        console.error("Flash toggle failed", err);
        isFlashOn = !isFlashOn; // Revert state
    });
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
    // Turn off flash before stopping
    if (isFlashOn) {
        try {
            html5QrcodeScanner.applyVideoConstraints({ advanced: [{ torch: false }] });
        } catch (e) { }
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
    elements.errorMessage.innerText = msg;
    elements.errorState.classList.remove('hidden');

    if (type === "info") {
        elements.errorState.style.background = "var(--primary)";
        elements.errorState.querySelector('i').className = "fa-solid fa-sync fa-spin";
    } else {
        elements.errorState.style.background = "var(--error)";
        elements.errorState.querySelector('i').className = "fa-solid fa-triangle-exclamation";
    }

    if (type === "error") {
        setTimeout(() => elements.errorState.classList.add('hidden'), 3000);
    }
}
function hideToast() {
    elements.errorState.classList.add('hidden');
}

