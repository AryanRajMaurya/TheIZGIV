// Simple utility to generate vibrant colors from a string (hash) or image
// Optimized for IZGIV to provide extreme vibrancy and dynamic feel.

export const getColorsFromCover = async (imageUrl: string): Promise<{ primary: string; secondary: string; accent: string }> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = imageUrl;

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
         resolve(stringToColors(imageUrl));
         return;
      }
      
      canvas.width = 50;
      canvas.height = 50;
      
      ctx.drawImage(img, 0, 0, 50, 50);
      const imageData = ctx.getImageData(0, 0, 50, 50).data;
      
      let r = 0, g = 0, b = 0;
      let count = 0;

      // Sample pixels to get a more "vibrant" average rather than just a flat average
      for (let i = 0; i < imageData.length; i += 4) {
        const pr = imageData[i];
        const pg = imageData[i+1];
        const pb = imageData[i+2];
        
        // Boost vibrancy by ignoring dark/dull pixels
        const brightness = (pr * 299 + pg * 587 + pb * 114) / 1000;
        if (brightness > 30 && brightness < 220) {
          r += pr;
          g += pg;
          b += pb;
          count++;
        }
      }

      if (count > 0) {
        r = Math.floor(r / count);
        g = Math.floor(g / count);
        b = Math.floor(b / count);
      } else {
        // Fallback to center pixel if all pixels are too dark/bright
        r = imageData[imageData.length / 2];
        g = imageData[imageData.length / 2 + 1];
        b = imageData[imageData.length / 2 + 2];
      }
      
      const primary = `rgb(${r}, ${g}, ${b})`;
      // Create highly distinct secondary and accent colors
      const secondary = `rgb(${Math.floor(r * 0.6)}, ${Math.floor(g * 0.6)}, ${Math.floor(b * 0.6)})`;
      const accent = `rgb(${Math.min(255, r + 80)}, ${Math.min(255, g + 80)}, ${Math.min(255, b + 80)})`;
      
      resolve({ primary, secondary, accent });
    };

    img.onerror = () => {
      resolve(stringToColors(imageUrl));
    };
  });
};

const stringToColors = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const c = (hash & 0x00ffffff).toString(16).toUpperCase();
  const hex = "00000".substring(0, 6 - c.length) + c;
  
  return {
    primary: `#${hex}`,
    secondary: adjustBrightness(`#${hex}`, -60),
    accent: adjustBrightness(`#${hex}`, 60)
  };
};

function adjustBrightness(col: string, amt: number) {
    let usePound = false;
    if (col[0] == "#") {
        col = col.slice(1);
        usePound = true;
    }
    const num = parseInt(col,16);
    let r = (num >> 16) + amt;
    if (r > 255) r = 255;
    else if  (r < 0) r = 0;
    let b = ((num >> 8) & 0x00FF) + amt;
    if (b > 255) b = 255;
    else if  (b < 0) b = 0;
    let g = (num & 0x0000FF) + amt;
    if (g > 255) g = 255;
    else if (g < 0) g = 0;
    return (usePound?"#":"") + (g | (b << 8) | (r << 16)).toString(16).padStart(6, '0');
}
