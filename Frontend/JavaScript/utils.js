// --- Utility Functions ---
export function showToast(message, isError = true) {
    const toast = document.getElementById('messageToast');
    if (!toast) { console.error('Toast element not found! Message:', message); alert(message); return; }
    toast.textContent = message;
    toast.style.backgroundColor = isError ? '#e74c3c' : '#27ae60';
    toast.style.color = '#ffffff';
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 5000);
}

// Corrected setLoading to handle different default texts better
export function setLoading(button, isLoading, loadingText = 'Processing...', defaultText = null) {
    if (!button) return;
    const originalText = defaultText || button.dataset.defaultText || button.textContent; // Use provided default or stored/current text
    if (isLoading) {
        if (!button.dataset.defaultText) { // Store original only once
            button.dataset.defaultText = button.textContent;
        }
        button.classList.add('loading');
        button.disabled = true;
        button.textContent = loadingText;
    } else {
        button.classList.remove('loading');
        button.disabled = false;
        button.textContent = originalText; // Restore correct text
        delete button.dataset.defaultText; // Clean up
    }
}

export function showError(elementId, message) {
    const errorElement = document.getElementById(elementId);
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.style.display = 'block';
        errorElement.className = 'error-message';
    }
}

export function hideError(elementId) {
    const errorElement = document.getElementById(elementId);
    if (errorElement) {
        errorElement.style.display = 'none';
        errorElement.textContent = '';
    }
}
