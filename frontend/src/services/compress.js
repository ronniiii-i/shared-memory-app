/**
 * VibeVault — Image Compression Service
 * Uses browser-image-compression to convert and optimize images to lightweight WebP files.
 */

import imageCompression from 'browser-image-compression';

/**
 * Compress an image file to WebP before uploading
 * @param {File} file - Original image file
 * @param {Object} customOptions - Optional custom compression settings
 * @returns {Promise<File>} Compressed File object
 */
export async function compressImage(file, customOptions = {}) {
  // If already WebP or very small, skip heavy processing if desired, but browser-image-compression handles it well.
  const defaultOptions = {
    maxSizeMB: 1,                 // Max file size in MB
    maxWidthOrHeight: 1920,       // Max dimensions
    useWebWorker: true,           // Offload to web worker for UI smoothness
    fileType: 'image/webp',       // Convert to WebP format
    initialQuality: 0.82,
  };

  const options = { ...defaultOptions, ...customOptions };

  try {
    const compressedBlob = await imageCompression(file, options);
    // Return as File object preserving original filename with .webp extension
    const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
    return new File([compressedBlob], `${baseName}.webp`, {
      type: 'image/webp',
      lastModified: Date.now(),
    });
  } catch (error) {
    console.warn('Image compression failed, falling back to original file:', error);
    return file;
  }
}
