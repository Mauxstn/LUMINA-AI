// API Configuration
const API_URL = 'http://localhost:3001';

// Helper function to show error message
function showError(element, message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'text-red-500 text-sm mt-2';
    errorDiv.textContent = message;
    element.parentNode.insertBefore(errorDiv, element.nextSibling);
    
    // Remove error after 5 seconds
    setTimeout(() => {
        errorDiv.remove();
    }, 5000);
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Initialize file upload handlers
    initFileUpload('wm', 'Watermark entfernen...');
    initFileUpload('bg', 'Hintergrund wird entfernt...');
    
    // Initialize download handlers
    initDownloadButtons();
});

/**
 * Initialize file upload functionality for a specific type (wm or bg)
 * @param {string} type - The type of processing ('wm' or 'bg')
 * @param {string} processingText - Text to show during processing
 */
function initFileUpload(type, processingText) {
    const fileInput = document.getElementById(`${type}-file`);
    const processBtn = document.getElementById(`${type}-process`);
    const loadingDiv = document.getElementById(`${type}-loading`);
    const previewDiv = document.getElementById(`${type}-preview`);
    const originalImg = document.getElementById(`${type}-original`);
    const resultImg = document.getElementById(`${type}-result`);
    const downloadBtn = document.getElementById(`${type}-download`);
    
    let currentFile = null;
    let processedImageUrl = null;

    // Handle file selection
    fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            currentFile = e.target.files[0];
            processBtn.disabled = false;
            
            // Show preview
            const reader = new FileReader();
            reader.onload = (event) => {
                originalImg.src = event.target.result;
            };
            reader.readAsDataURL(currentFile);
        }
    });

    // Handle process button click
    processBtn.addEventListener('click', async () => {
        if (!currentFile) return;
        
        // Show loading state
        processBtn.disabled = true;
        loadingDiv.classList.remove('hidden');
        previewDiv.classList.remove('hidden');
        
        try {
            const formData = new FormData();
            formData.append('image', currentFile);
            
            const response = await fetch(`${API_URL}/api/upload`, {
                method: 'POST',
                body: formData,
                // Don't set Content-Type header - let the browser set it with the boundary
            });
            
            if (!response.ok) {
                const error = await response.text();
                throw new Error(error || 'Failed to process image');
            }
            
            const data = await response.json();
            
            if (data.success) {
                // Show the result image
                resultImg.src = `${API_URL}${data.result}`;
                downloadBtn.href = `${API_URL}${data.result}`;
                downloadBtn.download = `processed-${currentFile.name}`;
                downloadBtn.classList.remove('hidden');
            } else {
                throw new Error(data.error || 'Failed to process image');
            }
        } catch (error) {
            console.error('Error:', error);
            showError(processBtn, error.message || 'An error occurred while processing the image');
        } finally {
            // Hide loading state
            loadingDiv.classList.add('hidden');
            processBtn.disabled = false;
        }
        loadingDiv.classList.remove('hidden');
        processBtn.disabled = true;
        
        try {
            // Create form data
            const formData = new FormData();
            formData.append('image', currentFile);
            formData.append('type', type === 'wm' ? 'watermark' : 'background');
            
            // Send to API
            const response = await fetch(`${API_URL}/upload`, {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                throw new Error('Server error during image processing');
            }
            
            const data = await response.json();
            
            // Show result
            resultImg.src = data.result;
            processedImageUrl = data.result;
            previewDiv.classList.remove('hidden');
            
        } catch (error) {
            console.error('Error:', error);
            alert('Ein Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.');
        } finally {
            loadingDiv.classList.add('hidden');
        }
    });
    
    // Handle download
    if (downloadBtn) {
        downloadBtn.addEventListener('click', () => {
            if (processedImageUrl) {
                const link = document.createElement('a');
                link.href = processedImageUrl;
                link.download = `nexus-ai-${type}-${Date.now()}.png`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
        });
    }
}

/**
 * Initialize download buttons
 */
function initDownloadButtons() {
    // This is handled in the initFileUpload function
}

// Add drag and drop functionality
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    document.body.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

// Highlight drop area when item is dragged over it
['dragenter', 'dragover'].forEach(eventName => {
    document.querySelectorAll('.drop-zone').forEach(dropZone => {
        dropZone.addEventListener(eventName, highlight, false);
    });
});

['dragleave', 'drop'].forEach(eventName => {
    document.querySelectorAll('.drop-zone').forEach(dropZone => {
        dropZone.addEventListener(eventName, unhighlight, false);
    });
});

function highlight(e) {
    e.currentTarget.classList.add('border-cyan-400');
    e.currentTarget.classList.add('bg-white/10');
}

function unhighlight(e) {
    e.currentTarget.classList.remove('border-cyan-400');
    e.currentTarget.classList.remove('bg-white/10');
}

// Handle dropped files
['drop'].forEach(eventName => {
    document.querySelectorAll('.drop-zone').forEach(dropZone => {
        dropZone.addEventListener(eventName, handleDrop, false);
    });
});

function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    const type = e.currentTarget.getAttribute('data-type');
    
    if (files.length > 0) {
        const fileInput = document.getElementById(`${type}-file`);
        fileInput.files = files;
        
        // Trigger change event
        const event = new Event('change');
        fileInput.dispatchEvent(event);
    }
}
