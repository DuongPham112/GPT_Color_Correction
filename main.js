const upload = document.getElementById('upload');
const applyLUT = document.getElementById('applyLUT');
const download = document.getElementById('download');
const canvas = document.getElementById('canvas');
const correctionMode = document.getElementById('correctionMode');
const comparisonWrapper = document.querySelector('.comparison-wrapper');
const comparisonSlider = document.querySelector('.comparison-slider');
const comparisonContainer = document.querySelector('.comparison-container');
const ctx = canvas.getContext('2d');

let originalImage = new Image();
let lutImage = new Image();
let originalImageData = null;
let correctedImageData = null;
let isDragging = false;
let startX = 0;
let sliderLeft = 0;
let colorPresets = [];

lutImage.src = 'lut.png';

// Các tham số cho từng chế độ correction
const correctionModes = {
    normal: { brightness: 1.0, contrast: 1.0, saturation: 1.0 },
    vivid: { brightness: 1.1, contrast: 1.2, saturation: 1.3 },
    soft: { brightness: 0.95, contrast: 0.9, saturation: 0.85 }
};

const lutFiles = {
    normal: 'luts/lut_normal.png',
    vivid: 'luts/lut_vivid.png',
    soft: 'luts/lut_soft.png',
    cool: 'luts/lut_cool.png'
};

// Load preset từ file JSON
fetch('color-presets.json')
  .then(res => res.json())
  .then(data => {
    colorPresets = data;
    const select = document.getElementById('correctionMode');
    select.innerHTML = '';
    colorPresets.forEach(preset => {
      const option = document.createElement('option');
      option.value = preset.id;
      option.textContent = preset.name;
      select.appendChild(option);
    });
  });

function getPresetById(id) {
  return colorPresets.find(p => p.id === id) || colorPresets[0];
}

function updateContainerSize(width, height) {
    // Tính toán kích thước mới dựa trên tỷ lệ ảnh
    const maxWidth = Math.min(window.innerWidth - 60, 1000); // 60px cho padding
    const aspectRatio = height / width;
    let newWidth = width;
    let newHeight = height;

    // Nếu ảnh rộng hơn maxWidth, điều chỉnh kích thước
    if (width > maxWidth) {
        newWidth = maxWidth;
        newHeight = maxWidth * aspectRatio;
    }

    // Cập nhật kích thước container
    comparisonContainer.style.width = `${newWidth}px`;
    comparisonWrapper.style.paddingBottom = `${aspectRatio * 100}%`;
}

upload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = function(event) {
        originalImage.onload = function() {
            // Cập nhật kích thước canvas
            canvas.width = originalImage.width;
            canvas.height = originalImage.height;
            
            // Cập nhật kích thước container
            updateContainerSize(originalImage.width, originalImage.height);
            
            // Vẽ ảnh gốc
            ctx.drawImage(originalImage, 0, 0);
            originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        };
        originalImage.src = event.target.result;
    };
    reader.readAsDataURL(file);
});

function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    let max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; }
    else {
        let d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return [h, s, l];
}

function hslToRgb(h, s, l) {
    let r, g, b;
    if (s === 0) { r = g = b = l; }
    else {
        function hue2rgb(p, q, t) {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        }
        let q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        let p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }
    return [r * 255, g * 255, b * 255];
}

function colorCorrect(imageData, params) {
    const data = imageData.data;
    const {brightness = 1, contrast = 1, saturation = 1, hue = 0, colorBalance, curves} = params;
    // Color balance threshold
    const shadowT = 85, highlightT = 170;
    for (let i = 0; i < data.length; i += 4) {
        // Brightness
        data[i] *= brightness;
        data[i+1] *= brightness;
        data[i+2] *= brightness;
        // Contrast
        data[i] = (data[i] - 128) * contrast + 128;
        data[i+1] = (data[i+1] - 128) * contrast + 128;
        data[i+2] = (data[i+2] - 128) * contrast + 128;
        // Saturation & Hue
        let [h, s, l] = rgbToHsl(data[i], data[i+1], data[i+2]);
        s *= saturation;
        h += hue/360;
        if (h > 1) h -= 1; if (h < 0) h += 1;
        let [r, g, b] = hslToRgb(h, s, l);
        data[i] = r;
        data[i+1] = g;
        data[i+2] = b;
        // Color Balance
        if (colorBalance) {
            const lum = 0.299*r + 0.587*g + 0.114*b;
            let cb = {r:0,g:0,b:0};
            if (lum < shadowT) cb = colorBalance.shadows;
            else if (lum > highlightT) cb = colorBalance.highlights;
            else cb = colorBalance.midtones;
            data[i] = Math.min(255, Math.max(0, data[i] + (cb.r||0)));
            data[i+1] = Math.min(255, Math.max(0, data[i+1] + (cb.g||0)));
            data[i+2] = Math.min(255, Math.max(0, data[i+2] + (cb.b||0)));
        }
        // Curves (gamma)
        if (curves) {
            data[i] = 255 * Math.pow(data[i]/255, 1/(curves.r||1));
            data[i+1] = 255 * Math.pow(data[i+1]/255, 1/(curves.g||1));
            data[i+2] = 255 * Math.pow(data[i+2]/255, 1/(curves.b||1));
        }
    }
    return imageData;
}

function applyCorrection(imageData, mode) {
    const params = correctionModes[mode];
    const data = imageData.data;
    
    for (let i = 0; i < data.length; i += 4) {
        // Áp dụng brightness
        data[i] *= params.brightness;     // R
        data[i + 1] *= params.brightness; // G
        data[i + 2] *= params.brightness; // B
        
        // Áp dụng contrast
        const factor = (259 * (params.contrast + 255)) / (255 * (259 - params.contrast));
        data[i] = factor * (data[i] - 128) + 128;
        data[i + 1] = factor * (data[i + 1] - 128) + 128;
        data[i + 2] = factor * (data[i + 2] - 128) + 128;
        
        // Áp dụng saturation
        const gray = 0.2989 * data[i] + 0.5870 * data[i + 1] + 0.1140 * data[i + 2];
        data[i] = gray + (data[i] - gray) * params.saturation;
        data[i + 1] = gray + (data[i + 1] - gray) * params.saturation;
        data[i + 2] = gray + (data[i + 2] - gray) * params.saturation;
    }
    
    return imageData;
}

function updateComparison(e) {
    if (!originalImageData || !correctedImageData) return;
    
    const rect = comparisonWrapper.getBoundingClientRect();
    const x = e ? e.clientX - rect.left : rect.width / 2;
    const position = Math.max(0, Math.min(x, rect.width));
    const percentage = (position / rect.width) * 100;
    
    comparisonSlider.style.left = `${percentage}%`;
    
    const width = canvas.width;
    const splitPoint = Math.floor((percentage / 100) * width);
    
    // Vẽ ảnh gốc bên trái
    ctx.putImageData(originalImageData, 0, 0);
    
    // Vẽ ảnh đã chỉnh sửa bên phải
    const correctedCtx = document.createElement('canvas').getContext('2d');
    correctedCtx.canvas.width = canvas.width;
    correctedCtx.canvas.height = canvas.height;
    correctedCtx.putImageData(correctedImageData, 0, 0);
    
    // Vẽ phần ảnh đã chỉnh sửa
    ctx.drawImage(correctedCtx.canvas, splitPoint, 0, width - splitPoint, canvas.height, splitPoint, 0, width - splitPoint, canvas.height);
}

function onMouseDown(e) {
    isDragging = true;
    startX = e.clientX;
    sliderLeft = comparisonSlider.offsetLeft;
    comparisonWrapper.style.cursor = 'grabbing';
}

function onMouseMove(e) {
    if (!isDragging) return;
    updateComparison(e);
}

function onMouseUp() {
    isDragging = false;
    comparisonWrapper.style.cursor = 'ew-resize';
}

comparisonWrapper.addEventListener('mousedown', onMouseDown);
document.addEventListener('mousemove', onMouseMove);
document.addEventListener('mouseup', onMouseUp);

// Xử lý resize window
window.addEventListener('resize', () => {
    if (originalImage.complete) {
        updateContainerSize(originalImage.width, originalImage.height);
    }
});

applyLUT.addEventListener('click', () => {
    if (!originalImage.src) return;
    const preset = getPresetById(correctionMode.value);

    // Vẽ lại ảnh gốc
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(originalImage, 0, 0);

    // Lấy dữ liệu ảnh gốc
    let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Apply color correction
    imageData = colorCorrect(imageData, preset);
    ctx.putImageData(imageData, 0, 0);

    correctedImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    updateComparison();
});

download.addEventListener('click', () => {
    if (!correctedImageData) return;
    // Tạo canvas tạm để xuất ảnh after
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.putImageData(correctedImageData, 0, 0);
    const link = document.createElement('a');
    link.download = 'corrected_image.png';
    link.href = tempCanvas.toDataURL('image/png');
    link.click();
});
